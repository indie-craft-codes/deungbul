// [boards] 순위표 (묶음 8): 이름 붙은 순위표 여럿을 한 창(메뉴의 '순위표' 탭)으로 보인다. 순위표마다 기간(상시·날·주·달·레이팅 시즌)이 있고 경계를 넘으면 비운다
// (지난 기간의 1~3등은 남겨 보인다). 내 순위와 위아래 몇 줄, 휴면 빼기(active), 동점은 먼저 닿은 사람이 위.
//   게임의 순위표   g.boards.define({ id, name, period, fmt }) 뒤에 g.boards.submit(id, p, 값, 'max' | 'set' | 'add'). 저장 키(pid)가 있는 사람만 오른다
//   틀의 순위표     전투력(rank 모듈을 함께 고르면 'power': 순위의 줄을 그대로 읽는다), 레이팅(ranked 모듈: 사다리마다 'rating:<사다리>', RD가 높은 사람은 빠진다)
//   다른 시스템의 판  g.boards.adopt({ tab, rows, to, prev }): 줄을 가진 시스템이 정렬한 것을 읽기만 한다
// 저장: 월드의 boards 칸 (게임이 define한 순위표의 줄과 기간 열쇠, 지난 기간의 1~3등). 명령 board, 답 { t: 'board', tabs, s }.
// Board는 정렬·자르기·찾기만 하는 작은 판이다: 모듈 없이도 쓴다 (전투력 순위 rank.ts가 줄을 이 판에 둔다).
import { SEASON, seasonAt, type BoardFmt, type BoardPeriod, type BoardRow, type BoardTab, type BoardView } from '../../../shared/defs';
import { NAME_MAX } from '../../../shared/world';
import type { Ent } from '../entity';
import type { Game } from '../game';

/** 정렬하고 자르는 줄들: 사람은 저장 키(pid)로 가른다 */
export class Board<R extends { pid: string; name: string }> {
  rows: R[] = [];
  constructor(private readonly cmp: (a: R, b: R) => number, private readonly keep: number) {}
  /** 정렬하고 keep줄로 자른다 (같은 값은 넣은 차례를 지킨다: Array.sort는 안정 정렬) */
  sort(): void { this.rows.sort(this.cmp); this.rows.length = Math.min(this.rows.length, this.keep); }
  find(pid: string): R | undefined { return pid ? this.rows.find((r) => r.pid === pid) : undefined; }
  indexOf(pid: string): number { return pid ? this.rows.findIndex((r) => r.pid === pid) : -1; }
}

/** 순위표의 한 사람 */
export interface BoardEntry { pid: string; name: string; v: number; x?: string }
/** 게임이 정하는 순위표 */
export interface BoardDef {
  /** 영문으로 시작하는 32자 이내 */
  id: string;
  /** 이름의 문장 키 (i18n ui, 없으면 id 그대로) */
  name: string;
  /** 기간 (기본 상시) */
  period?: BoardPeriod;
  /** 화면이 값을 적는 모양 (기본 수) */
  fmt?: BoardFmt;
  /** 작은 값이 위 (기본: 큰 값이 위) */
  asc?: boolean;
  /** 남기는 줄 수 (기본 1000), 보이는 줄 수 (기본 50) */
  keep?: number; show?: number;
}
/** 다른 시스템이 가진 순위표 (읽기만 한다) */
export interface AdoptedBoard {
  tab: BoardTab;
  /** 정렬한 줄 (휴면은 이미 뺀 것) */
  rows(): BoardEntry[];
  /** 다음 초기화 (UTC ms, 상시면 0) */
  to?(): number;
  /** 지난 기간의 1~3등 */
  prev?(): BoardRow[];
}
interface Own { def: BoardDef; key: string; board: Board<BoardEntry & { at: number }>; prev: BoardRow[] }

const SHOW = 50, KEEP = 1000, AROUND = 2;

export class Boards {
  private readonly own = new Map<string, Own>();
  private readonly adopted = new Map<string, AdoptedBoard>();
  /** 순위표의 차례 (define·adopt한 차례: 첫째가 기본 탭) */
  private readonly order: string[] = [];
  /** 레이팅 시즌의 열쇠와 끝 (ranked 모듈이 건다): 기간 'season'의 순위표가 따른다 */
  season: () => { key: string; to: number } | null = () => (SEASON ? (({ key, to }) => ({ key, to }))(seasonAt(SEASON, this.g.now(), this.g.time.cal)) : null);
  private acc = 0;

  constructor(private g: Game) {
    g.commands.set('board', (p, m) => this.send(p, typeof m.id === 'string' ? m.id : undefined));
    g.worldSaves.push({ name: 'boards', save: () => this.save(), load: (raw) => this.load(raw) });
    g.ticks.push((dt) => { this.acc += dt; if (this.acc >= 5) { this.acc = 0; for (const b of this.own.values()) this.roll(b); } });
    g.on('playerRenamed', (p) => { for (const b of this.own.values()) { const r = b.board.find(p.pid); if (r) { r.name = p.name; g.saveDirty = true; } } });
    // 전투력 순위 (rank 모듈): 그 줄을 그대로 읽는 한 판
    g.ready.push(() => {
      if (!g.has('rank') || this.adopted.has('power')) return;
      this.adopt({ tab: { id: 'power', name: 'boardPower', period: 'ever', fmt: 'power' }, rows: () => g.rank.entries() }, true);
    });
  }

  /** 순위표를 정한다 (플러그인에서 한 번). 같은 id를 두 번 정하면 오류 */
  define(def: BoardDef): void {
    if (!/^[a-z][a-z0-9_:-]{0,31}$/i.test(def.id)) throw new Error(`순위표의 id는 영문으로 시작하는 32자 이내입니다 ('${def.id}')`);
    if (this.own.has(def.id) || this.adopted.has(def.id)) throw new Error(`순위표 '${def.id}'가 이미 있습니다`);
    const asc = !!def.asc;
    const board = new Board<BoardEntry & { at: number }>((a, b) => (asc ? a.v - b.v : b.v - a.v) || a.at - b.at, def.keep ?? KEEP);
    this.own.set(def.id, { def, key: this.keyOf(def.period ?? 'ever'), board, prev: [] });
    this.order.push(def.id);
  }
  /** 다른 시스템의 순위표를 창에 보인다 (first면 맨 앞 탭) */
  adopt(b: AdoptedBoard, first = false): void {
    if (this.own.has(b.tab.id)) throw new Error(`순위표 '${b.tab.id}'가 이미 있습니다`);
    if (!this.adopted.has(b.tab.id)) { if (first) this.order.unshift(b.tab.id); else this.order.push(b.tab.id); }
    this.adopted.set(b.tab.id, b);
  }
  has(id: string): boolean { return this.own.has(id) || this.adopted.has(id); }

  /**
   * 값을 올린다: 'max'(기본: 더 좋을 때만, 먼저 닿은 때를 남긴다), 'set'(그 값으로), 'add'(더한다). 저장 키가 없는 사람(손님)과 봇은 오르지 않는다.
   * 사람 대신 { pid, name }을 주면 접속해 있지 않은 사람도
   */
  submit(id: string, who: Ent | { pid: string; name: string }, v: number, how: 'max' | 'set' | 'add' = 'max'): void {
    const b = this.own.get(id);
    if (!b || !Number.isFinite(v) || !who.pid || ('bot' in who && who.bot)) return;
    this.roll(b);
    const now = this.g.now(), asc = !!b.def.asc, r = b.board.find(who.pid);
    if (!r) b.board.rows.push({ pid: who.pid, name: who.name.slice(0, NAME_MAX), v, at: now });
    else {
      const nv = how === 'add' ? r.v + v : v;
      const better = asc ? nv < r.v : nv > r.v;
      if (how === 'max' && !better) return;
      if (nv !== r.v) { r.v = nv; r.at = now; }
      r.name = who.name.slice(0, NAME_MAX);
    }
    b.board.sort();
    this.g.saveDirty = true;
  }

  /** 기간의 열쇠 */
  private keyOf(p: BoardPeriod): string {
    if (p === 'ever') return '';
    if (p === 'season') return this.season()?.key ?? '';
    return this.g.time.keyOf(p);
  }
  /** 기간의 끝 (UTC ms, 상시면 0) */
  private toOf(p: BoardPeriod): number {
    if (p === 'ever') return 0;
    if (p === 'season') return this.season()?.to ?? 0;
    return this.g.time.next(p);
  }
  /** 기간이 바뀌었으면 지난 기간의 1~3등을 남기고 비운다 */
  private roll(b: Own): void {
    const key = this.keyOf(b.def.period ?? 'ever');
    if (key === b.key) return;
    b.prev = b.board.rows.slice(0, 3).map((r, i) => [i + 1, r.name, r.v]);
    b.board.rows = [];
    b.key = key;
    this.g.saveDirty = true;
  }

  /** 탭 목록 */
  tabs(): BoardTab[] {
    return this.order.map((id) => {
      const a = this.adopted.get(id);
      if (a) return a.tab;
      const d = this.own.get(id)!.def;
      return { id, name: d.name, period: d.period ?? 'ever', fmt: d.fmt ?? 'num' };
    });
  }
  /** 정렬한 줄 (게임의 것과 받은 것) */
  entries(id: string): BoardEntry[] {
    const a = this.adopted.get(id);
    if (a) return a.rows();
    const b = this.own.get(id);
    if (!b) return [];
    this.roll(b);
    return b.board.rows;
  }
  /** 그 사람의 등수 (1부터, 없으면 0) */
  rankOf(id: string, pid: string): number { const i = pid ? this.entries(id).findIndex((r) => r.pid === pid) : -1; return i + 1; }

  /** 화면의 순위표: 위의 줄, 내 줄과 위아래 */
  view(id: string, pid: string): BoardView | null {
    const tab = this.tabs().find((t) => t.id === id);
    if (!tab) return null;
    const list = this.entries(id), own = this.own.get(id);
    const row = (r: BoardEntry, i: number): BoardRow => (r.x !== undefined ? [i + 1, r.name, r.v, r.x] : [i + 1, r.name, r.v]);
    const at = pid ? list.findIndex((r) => r.pid === pid) : -1;
    const show = own?.def.show ?? SHOW;
    return {
      ...tab, to: this.adopted.get(id)?.to?.() ?? this.toOf(tab.period), rows: list.slice(0, show).map(row),
      me: at >= 0 ? row(list[at], at) : null, around: at >= show ? list.slice(Math.max(0, at - AROUND), at + AROUND + 1).map((r) => row(r, list.indexOf(r))) : [],
      n: list.length, prev: own ? own.prev : this.adopted.get(id)?.prev?.() ?? [],
    };
  }
  private send(p: Ent, id?: string): void {
    const tabs = this.tabs();
    const pick = id && tabs.some((t) => t.id === id) ? id : tabs[0]?.id;
    this.g.out.push({ id: p.id, msg: { t: 'board', tabs, s: pick ? this.view(pick, p.pid) : null } });
  }

  private save(): unknown {
    return Object.fromEntries([...this.own].map(([id, b]) => [id, { key: b.key, rows: b.board.rows, prev: b.prev }]));
  }
  private load(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      const b = this.own.get(id);
      if (!b || typeof v !== 'object' || v === null) continue; // 정하지 않은 순위표의 줄은 버린다
      const x = v as { key?: unknown; rows?: unknown; prev?: unknown };
      const seen = new Set<string>();
      b.key = typeof x.key === 'string' ? x.key : b.key;
      b.board.rows = (Array.isArray(x.rows) ? x.rows : []).filter((r): r is BoardEntry & { at: number } => typeof r === 'object' && r !== null && typeof r.pid === 'string' && !!r.pid && typeof r.name === 'string' && Number.isFinite(r.v))
        .filter((r) => !seen.has(r.pid) && !!seen.add(r.pid)).map((r) => ({ pid: r.pid, name: r.name.slice(0, NAME_MAX), v: r.v, at: Number.isFinite(r.at) ? r.at : 0 }));
      b.board.sort();
      b.prev = Array.isArray(x.prev) ? (x.prev as BoardRow[]).filter((r) => Array.isArray(r) && typeof r[1] === 'string').slice(0, 3) : [];
      this.roll(b);
    }
  }
}

/** 레이팅 순위표의 id (사다리마다) */
export const ratingBoardId = (ladder: string): string => `rating:${ladder}`;
