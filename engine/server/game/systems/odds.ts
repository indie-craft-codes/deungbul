// [odds] 확률과 재화의 투명성: 확률표의 버전·변경 이력·사전 공지, 추첨 기록, 공개할 모양(OddsPublic).
// 표 자체와 굴림은 engine/shared/defs/odds.ts에 있다 (모듈과 상관없이 gacha·gear가 그 표에서 굴린다). 이 시스템은 그 표를 '기록'한다:
//   버전   표마다 내용의 서명(tableSig)을 들고 있다가 달라지면 버전을 하나 올리고 이력(시각·전·후·까닭)을 남긴다.
//          살피는 때: 켜질 때(첫 틱: 까닭 boot — 소스가 바뀌었다), 원격 설정이 바뀔 때(live:칸 이름 (누가)), 10초마다(auto: 캐릭터 정의가 더해져 뽑기 판이 바뀐 것 같은 변화),
//          그리고 추첨을 적을 때마다(그 추첨이 쓴 표 그대로: 적힌 버전이 곧 굴린 표다)
//   사전 공지  관리자가 '언제부터 무엇이 바뀐다'를 적는다 (odds plan). 공개 페이지에 나온다. 바꾸는 일 자체는 원격 설정(set)이 한다
//   추첨 기록  사람(owner: 지금은 저장 키, 계정이 생기면 계정)·캐릭터(char)·시각(UTC)·종류·표 id와 버전·쓴 단계·결과·치른 것. ODDS.keepDays가 지난 줄은 하루 한 번 지운다
//   공개   publicView()가 odds.json의 모양. 통신 계층(engine/server/net/odds.ts)이 정적 폴더에 쓰고 GET /odds.json·/odds.html로도 준다. 바뀌면 onChange를 부른다
// 메시지: { t: 'odds', a: 'tables' } → { t: 'odds', a: 'tables', pub }, { t: 'odds', a: 'mine' } → { t: 'odds', a: 'mine', rows } (내 최근 추첨 기록)
// 게임의 굴림(상자·합성): g.odds.roll(p, 표 id, 단계 key)가 ODDS.tables의 표에서 굴리고 적는다.
import { ODDS_RULES, allTables, bannerTable, checkTables, enhanceTable, givenTable, problemText, rollStep, stepOf, tableChanges, tableSig, type DrawRow, type OddsHistoryRow, type OddsOutcome, type OddsPlanRow, type OddsPublic, type OddsTable, type OddsTableDef, type LangText } from '../../../shared/defs';
import type { OddsStore } from '../../store/types';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { personalData } from '../personal';

const DAY_MS = 86_400_000;
/** 표를 다시 살피는 간격(초)과 오래된 추첨 기록을 지우는 간격(초) */
const CHECK_S = 10, PRUNE_S = 3600;
/** 공개 JSON에 싣는 이력의 줄 수, 한 줄에 싣는 바뀐 칸의 수 */
const PUB_HISTORY = 50, PUB_CHANGES = 40;
/** 메모리에 두는 추첨 기록의 수 (저장소가 없을 때) */
const MEM_DRAWS = 20_000;
/** 내 기록 창에 보내는 줄 수 */
export const MINE_MAX = 100;

export class OddsSys {
  private store: OddsStore | null = null;
  /** 표 id → 지금 버전과 그 내용 */
  private vers = new Map<string, { ver: number; sig: string; table: OddsTableDef; at: number }>();
  private memHistory: OddsHistoryRow[] = [];
  private memPlans: OddsPlanRow[] = [];
  private memDraws: DrawRow[] = [];
  private booted = false;
  private checkAcc = 0;
  private pruneAcc = PRUNE_S;
  /** 다음 살피기에 붙일 까닭 (원격 설정이 바뀌었다) */
  private why: string | null = null;
  /** 공개할 모양을 만든 것 (버전이 바뀌면 버린다) */
  private pub: OddsPublic | null = null;
  /** 표가 바뀌거나 사전 공지가 바뀌면 부른다 (통신 계층이 공개 페이지를 다시 쓴다) */
  readonly onChange: (() => void)[] = [];
  /** 공개 페이지의 이름표를 게임이 채운다: 언어(ko, en)와 이름 키(표의 name, 영웅의 이름 키, 등급의 이름 키) → 글. 없으면 내용의 ODDS.names와 영웅의 label (engine/server/net/odds.ts) */
  names: ((lang: string, key: string) => string | undefined) | null = null;
  /** 게임의 굴림이 쓰는 난수 (시험은 seededRng로 바꾼다) */
  rng: () => number = Math.random;

  constructor(private g: Game) {
    const bad = checkTables(ODDS_RULES.tables);
    if (bad.length) throw new Error(bad.map(problemText).join('\n'));
    if (!(ODDS_RULES.keepDays >= 0)) throw new Error('[odds] ODDS.keepDays는 0 이상이어야 합니다 (0이면 지우지 않는다)');
    g.commands.set('odds', (p, m) => {
      if (m.a === 'tables') g.out.push({ id: p.id, msg: { t: 'odds', a: 'tables', pub: this.publicView() } });
      else if (m.a === 'mine') g.out.push({ id: p.id, msg: { t: 'odds', a: 'mine', rows: this.mine(p) } });
    });
    g.on('liveChanged', (key) => {
      if (!key.startsWith('cfg:')) return;
      const name = key.slice(4), by = g.live.row(name)?.by;
      this.why = `live:${name}${by ? ` (${by})` : ''}`;
      this.refresh(this.why);
    });
    g.ticks.push((dt) => this.tick(dt));
    // 내 데이터: 내보내기에 내 추첨 기록, 지우기는 사람만 지운다 (줄은 입증 자료로 남는다: docs/making-a-game.md 20절)
    personalData(g).push({
      name: 'draws',
      get: (pid) => { const rows = this.draws({ owner: pid, limit: 10_000 }); return rows.length ? rows : undefined; },
      erase: (pid) => { this.forget(pid); },
    });
  }

  /** 저장소를 붙인다 (통신 계층이 서버를 켤 때, 원격 설정을 붙인 뒤): 적혀 있던 버전을 읽는다. 지금 표와 견주는 것은 첫 틱에서 (까닭 boot) */
  attach(store: OddsStore): void {
    this.store = store;
    this.vers = new Map(store.oddsVersions().map((r) => [r.table, { ver: r.ver, sig: r.sig, table: r.data, at: r.at }]));
    this.booted = false;
    this.pub = null;
  }

  // ---------- 표와 버전 ----------
  /** 지금의 표 하나 (자동 표면 지금의 내용으로 만든다. 실효 확률은 빼고). 없으면 null */
  build(id: string): OddsTableDef | null {
    if (id === 'enhance' && this.g.has('gear')) return enhanceTable();
    if (id.startsWith('banner:') && this.g.has('gacha')) return bannerTable(id.slice(7));
    return givenTable(id) ?? null;
  }
  /** 지금 공개하는 표들 (실효 확률 없이) */
  private now(): OddsTableDef[] { return allTables((m) => this.g.has(m), false); }
  /**
   * 지금의 표들을 적힌 버전과 견주어, 달라진 표의 버전을 올리고 이력을 남긴다. 바뀐 표의 수.
   * 처음 부를 때(켜진 뒤 첫 틱)는 까닭을 boot로 적는다 (전에 적힌 것이 없으면 첫 버전 1)
   */
  refresh(why = 'auto'): number {
    if (!this.booted) { this.booted = true; why = 'boot'; }
    const list = this.now();
    let n = 0;
    const live = new Set<string>();
    for (const t of list) { live.add(t.id); if (this.bump(t, why)) n++; }
    // 없어진 표 (배너가 내려갔다): 이력에 '없어짐'을 남기고 버전 목록에서 뺀다
    for (const [id, v] of [...this.vers]) {
      if (live.has(id) || this.build(id)) continue;
      const h: OddsHistoryRow = { at: this.g.now(), table: id, ver: v.ver + 1, before: v.table, after: null, why };
      this.vers.delete(id);
      this.writeVersion(id, null, h);
      n++;
    }
    if (n) this.changed();
    if (why === this.why) this.why = null;
    return n;
  }
  /** 표 하나를 견준다: 서명이 다르면 버전을 올린다 (올렸으면 true) */
  private bump(t: OddsTableDef, why: string): boolean {
    const sig = tableSig(t), old = this.vers.get(t.id);
    if (old && old.sig === sig) return false;
    const ver = (old?.ver ?? 0) + 1, at = this.g.now(), table = structuredClone(t);
    this.vers.set(t.id, { ver, sig, table, at });
    this.writeVersion(t.id, { table: t.id, ver, sig, data: table, at }, { at, table: t.id, ver, before: old?.table ?? null, after: table, why });
    return true;
  }
  private writeVersion(id: string, row: { table: string; ver: number; sig: string; data: OddsTableDef; at: number } | null, h: OddsHistoryRow): void {
    if (this.store) { try { this.store.putOddsVersion(id, row, h); } catch (err) { console.error('[odds] 버전을 적지 못했습니다:', err); } }
    else this.memHistory.push({ ...h, n: this.memHistory.length + 1 });
  }
  private changed(): void {
    this.pub = null;
    for (const fn of this.onChange) { try { fn(); } catch (err) { console.error('[odds] 공개 페이지를 쓰다가 난 예외:', err); } }
    this.g.casts.push({ t: 'odds', a: 'tables', pub: this.publicView() });
  }
  /** 그 표의 지금 버전 (그 내용이 지금의 표와 같게 맞춘 뒤). table을 주면 그 내용으로 견준다 (추첨이 실제로 쓴 표) */
  versionOf(id: string, table?: OddsTableDef | null): number {
    if (!this.booted) this.refresh();
    const t = table ?? this.build(id);
    if (t && this.bump(t, this.why ?? 'auto')) this.changed();
    return this.vers.get(id)?.ver ?? 0;
  }
  /** 지금 버전이 붙은 표들 (실효 확률을 넣어: 공개용) */
  tables(): OddsTable[] {
    if (!this.booted) this.refresh();
    return allTables((m) => this.g.has(m), true).map((t) => ({ ...t, version: this.vers.get(t.id)?.ver ?? 0 }));
  }
  /** 변경 이력 (최근부터) */
  history(table: string | null = null, n = 50): OddsHistoryRow[] {
    return this.store ? this.store.oddsHistory(table, n) : this.memHistory.filter((r) => table === null || r.table === table).slice(-n).reverse();
  }

  // ---------- 사전 공지 ----------
  plans(): OddsPlanRow[] { return this.store ? this.store.oddsPlans() : [...this.memPlans]; }
  /** 사전 공지를 적는다: 표 id, 적용할 때(UTC ms), 글. 번호 */
  plan(table: string, at: number, text: LangText, by: string): number {
    const r: OddsPlanRow = { table, at, text, made: this.g.now(), by, state: 'wait' };
    const n = this.store ? this.store.putOddsPlan(r) : (this.memPlans.push({ ...r, n: this.memPlans.length + 1 }), this.memPlans.length);
    this.changed();
    return n;
  }
  /** 사전 공지를 거두거나(cancel) 끝났다고(done) 적는다. 없으면 false */
  setPlan(n: number, state: 'done' | 'cancel'): boolean {
    const r = this.plans().find((x) => x.n === n);
    if (!r) return false;
    if (this.store) this.store.putOddsPlan({ ...r, state }); else r.state = state;
    this.changed();
    return true;
  }

  // ---------- 추첨 기록 ----------
  /**
   * 추첨 한 건을 적는다: 종류(gacha, enhance, 게임의 이름), 굴린 표(그 내용 그대로), 쓴 단계들, 결과들, 치른 것.
   * 봇과 저장 키가 없는 사람(시험의 손님)도 적는다 (사람 칸이 빈 줄). 적은 줄
   */
  record(p: Ent, kind: string, table: OddsTableDef, steps: string[], got: string[], cost?: DrawRow['cost']): DrawRow {
    const row: DrawRow = { at: this.g.now(), owner: p.pid, char: p.pid, kind, table: table.id, ver: this.versionOf(table.id, table), steps, got, ...(cost ? { cost } : {}) };
    if (this.store) { try { this.store.addDraw(row); } catch (err) { console.error('[odds] 추첨 기록을 적지 못했습니다:', err); } }
    else { this.memDraws.push({ ...row, n: this.memDraws.length + 1 }); if (this.memDraws.length > MEM_DRAWS) this.memDraws.splice(0, this.memDraws.length - MEM_DRAWS); }
    return row;
  }
  /** 추첨 기록을 고른다 (최근부터) */
  draws(q: { owner?: string; table?: string; since?: number; limit: number }): DrawRow[] {
    if (this.store) return this.store.draws(q);
    return this.memDraws.filter((r) => (q.owner === undefined || r.owner === q.owner) && (q.table === undefined || r.table === q.table) && (q.since === undefined || r.at >= q.since)).slice(-q.limit).reverse();
  }
  /** 내 기록 창의 줄: 저장 키가 있는 사람만 (손님은 빈 목록) */
  mine(p: Ent): DrawRow[] {
    if (!p.pid) return [];
    return this.draws({ owner: p.pid, limit: MINE_MAX }).map((r) => { const { owner: _o, char: _c, ...rest } = r; return { ...rest, owner: '', char: '' }; });
  }
  private forget(pid: string): void {
    if (this.store) this.store.forgetDraws(pid);
    else for (const r of this.memDraws) if (r.owner === pid || r.char === pid) { r.owner = '-'; r.char = '-'; }
  }
  /** 보관 기간이 지난 추첨 기록을 지운다. 지운 수 */
  prune(): number {
    if (!(ODDS_RULES.keepDays > 0)) return 0;
    const before = this.g.now() - ODDS_RULES.keepDays * DAY_MS;
    if (this.store) { try { return this.store.pruneDraws(before); } catch (err) { console.error('[odds] 오래된 추첨 기록을 지우지 못했습니다:', err); return 0; } }
    const n = this.memDraws.length;
    this.memDraws = this.memDraws.filter((r) => r.at >= before);
    return n - this.memDraws.length;
  }

  // ---------- 게임의 굴림 ----------
  /**
   * 게임이 준 표(ODDS.tables)의 한 단계에서 하나를 뽑고 적는다 (상자·합성·게임만의 뽑기). 종류(kind)는 기록에 적을 이름 (기본: 표의 kind).
   * 표나 단계가 없으면 null. 값을 치르는 것은 부른 쪽이 먼저 한다 (지갑·가방): cost로 무엇을 치렀는지 적는다
   */
  roll(p: Ent, table: string, step: string, opts: { kind?: string; cost?: DrawRow['cost'] } = {}): OddsOutcome | null {
    const t = givenTable(table), s = t && stepOf(t, step);
    if (!t || !s) return null;
    const o = rollStep(s, this.rng());
    if (!o) return null;
    this.record(p, opts.kind ?? t.kind, t, [s.key], [o.id], opts.cost);
    return o;
  }

  // ---------- 공개 ----------
  /** 공개 JSON의 모양 (odds.json, 화면의 확률표 창). 버전이 바뀌기 전까지는 만든 것을 다시 쓴다 */
  publicView(): OddsPublic {
    if (this.pub) return this.pub;
    const now = this.g.now();
    const history = this.history(null, PUB_HISTORY).map((h) => {
      const changes = h.before && h.after ? tableChanges(h.before, h.after).slice(0, PUB_CHANGES) : undefined;
      return { at: h.at, table: h.table, ver: h.ver, why: h.why.replace(/ \(.*\)$/, ''), ...(h.after === null ? { gone: true as const } : {}), ...(changes?.length ? { changes } : {}) };
    });
    const plans = this.plans().filter((r) => r.state === 'wait' && r.at > now - 7 * DAY_MS).map((r) => ({ table: r.table, at: r.at, text: r.text }));
    this.pub = { at: now, tables: this.tables(), history, plans };
    return this.pub;
  }

  private tick(dt: number): void {
    if (!this.booted) this.refresh('boot');
    this.checkAcc += dt;
    if (this.checkAcc >= CHECK_S) { this.checkAcc = 0; this.refresh(this.why ?? 'auto'); }
    this.pruneAcc += dt;
    if (this.pruneAcc >= PRUNE_S) { this.pruneAcc = 0; this.prune(); }
  }
}
