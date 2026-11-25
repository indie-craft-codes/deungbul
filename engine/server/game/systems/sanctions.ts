// 제재와 관리자 지급: 접속 차단(저장 키, 접속 주소), 말 막기, 관리자의 지급·회수, 신고 처리 표시, 관리자 행동의 기록(끝부분).
// 무엇을 할지는 사람이 정한다: 관리자 통로(engine/server/net/admin.ts)가 명령을 받아 여기를 부르고, 통신 계층(server.ts)은 접속과 대화에서 여기를 묻는다.
// 게임 계층은 통신을 모른다: 연결을 끊는 일(내보내기, 차단된 사람 끊기)은 통신 계층이 한다.
//
// 대상의 열쇠는 통신 계층의 '사람' 열쇠와 같은 모양이다: 'k:저장 키' 또는 'i:접속 주소'.
// 기간: until(ms)이 0이면 영구다. 지난 것은 물을 때와 저장할 때 지운다.
//
// 말 막기: 전체 대화는 통신 계층(server.ts의 chat)이 묻고, 길드 대화처럼 게임 명령으로 오는 대화는 여기서 명령을 감싸 막는다 (CHAT_COMMANDS).
// 귓말은 아직 없다: 생기면 그 명령의 이름을 CHAT_COMMANDS에 더한다.
//
// 지급·회수는 지갑(g.wallet)과 가방(g.bag)을 지나고, 원인은 WHY.admin이다: 장부(ledger.ts)에 'admin' 줄로 따로 적힌다.
// 접속해 있지 않은 캐릭터에게는 미뤄 두었다가(pending) 다음 접속 때 같은 통로로 준다 (저장 파일을 직접 고치면 통로와 장부를 비켜 간다).
//
// 월드와 함께 저장한다 (g.worldSaves의 'sanctions' 칸): 서버를 다시 켜도 차단과 말 막기, 미룬 지급, 신고 처리 표시가 남는다.
import { isItemId, type ItemId } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { CURS, WHY, type Cur } from './wallet';

/** 말을 보내는 게임 명령들: 말 막힌 사람의 것은 처리하지 않는다 */
const CHAT_COMMANDS = ['gchat'];
/** 관리자 행동 기록의 끝부분을 월드에 남기는 수 (전부는 관리자 기록 파일에 있다: admin.ts) */
const LOG_KEEP = 300;
/** 신고 처리 표시를 남기는 수 (오래된 것부터 지운다) */
const RESOLVED_KEEP = 2000;
/** 한 캐릭터에 미뤄 둘 수 있는 지급·회수의 수 */
const PENDING_MAX = 50;

/** 차단 또는 말 막기 한 건 */
export interface Sanction {
  /** 끝나는 시각(ms). 0이면 영구 */
  until: number;
  /** 사유 (관리자가 적은 것) */
  why: string;
  /** 건 시각과 건 사람 */
  at: number; by: string;
  /** 걸 때의 캐릭터 이름 (주소 차단이면 빈 문자열). 기록을 읽기 쉽게 남긴다 */
  name: string;
}
/** 지급(+)·회수(−) 한 건. what은 지갑의 재화(wallet.ts의 CURS) 또는 아이템 id */
export interface Grant { what: string; n: number; at: number; by: string }
/** 관리자 행동 기록 한 줄 */
export interface AuditRow { at: number; by: string; from: string; cmd: string; args: string[]; ok: boolean; out: string }

/** 주소를 견줄 모양으로: IPv4를 IPv6 꼴로 적은 것(::ffff:127.0.0.1)은 IPv4로 */
export const normIp = (ip: string): string => ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '').toLowerCase();

const isCur = (v: string): v is Cur => (CURS as readonly string[]).includes(v);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export class Sanctions {
  /** 접속 차단: 'k:저장 키' | 'i:주소' → 차단 */
  readonly bans = new Map<string, Sanction>();
  /** 말 막기: 같은 열쇠 → 말 막기 */
  readonly mutes = new Map<string, Sanction>();
  /** 접속해 있지 않아 미뤄 둔 지급·회수: 저장 키 → 차례대로 */
  readonly pending = new Map<string, Grant[]>();
  /** 처리했다고 표시한 신고: 신고 id → 표시 */
  readonly resolved = new Map<string, { at: number; by: string; note: string }>();
  /** 관리자 행동 기록의 끝부분 (오래된 것이 앞) */
  readonly log: AuditRow[] = [];

  constructor(private g: Game) {
    g.worldSaves.push({ name: 'sanctions', save: () => this.save(), load: (raw) => this.load(raw) });
    // 길드 대화처럼 게임 명령으로 오는 말: 말 막힌 사람의 것은 처리하지 않고 알린다. 명령은 모든 시스템이 만들어진 뒤에 감싼다
    g.ready.push(() => {
      for (const name of CHAT_COMMANDS) {
        const fn = g.commands.get(name);
        if (!fn) continue;
        g.commands.set(name, (p, m) => {
          const s = p.pid ? this.muted(p.pid, '') : null;
          if (s) { g.notify(p, 'muted', Sanctions.minutesLeft(s, g.now())); return; }
          fn(p, m);
        });
      }
    });
    // 미뤄 둔 지급·회수: 접속하면 지갑과 가방을 지나 준다
    g.on('playerJoined', (p) => {
      const list = p.pid ? this.pending.get(p.pid) : undefined;
      if (!list) return;
      this.pending.delete(p.pid);
      g.saveDirty = true;
      for (const x of list) this.apply(p, x.what, x.n);
    });
  }

  /** 남은 분 (영구면 0). 안내문에 넣는다 */
  static minutesLeft(s: Sanction, now: number): number { return s.until === 0 ? 0 : Math.max(1, Math.ceil((s.until - now) / 60000)); }

  private live(map: Map<string, Sanction>, k: string): Sanction | null {
    const s = map.get(k);
    if (!s) return null;
    if (s.until !== 0 && s.until <= this.g.now()) { map.delete(k); this.g.saveDirty = true; return null; }
    return s;
  }
  /** 그 사람(저장 키, 접속 주소)이 차단되어 있는가. 저장 키의 것이 먼저다. 빈 값은 보지 않는다 */
  banned(key: string | null, ip: string): Sanction | null { return (key ? this.live(this.bans, 'k:' + key) : null) ?? (ip ? this.live(this.bans, 'i:' + normIp(ip)) : null); }
  /** 그 사람이 말을 막혀 있는가 */
  muted(key: string | null, ip: string): Sanction | null { return (key ? this.live(this.mutes, 'k:' + key) : null) ?? (ip ? this.live(this.mutes, 'i:' + normIp(ip)) : null); }

  /** 차단한다. ms가 0이면 영구 */
  ban(target: string, ms: number, why: string, by: string, name = ''): Sanction { return this.put(this.bans, target, ms, why, by, name); }
  unban(target: string): boolean { const had = this.bans.delete(target); if (had) this.g.saveDirty = true; return had; }
  mute(target: string, ms: number, why: string, by: string, name = ''): Sanction { return this.put(this.mutes, target, ms, why, by, name); }
  unmute(target: string): boolean { const had = this.mutes.delete(target); if (had) this.g.saveDirty = true; return had; }
  private put(map: Map<string, Sanction>, target: string, ms: number, why: string, by: string, name: string): Sanction {
    const now = this.g.now();
    const s: Sanction = { until: ms > 0 ? now + ms : 0, why: why.slice(0, 200), at: now, by: by.slice(0, 40), name: name.slice(0, 40) };
    map.set(target, s);
    this.g.saveDirty = true;
    return s;
  }

  /** 지급·회수할 수 있는 것인가: 재화 셋과 아이템 id */
  static canGrant(what: string): boolean { return isCur(what) || isItemId(what); }

  /**
   * 지금 접속해 있는(또는 자리 비움 사냥 중인) 캐릭터에게 준다(n > 0) 또는 거둔다(n < 0). 실제로 바뀐 양을 돌려준다 (부호 포함).
   * 거둘 때 가진 것이 모자라면 가진 만큼만 거둔다. 받는 사람에게 알린다
   */
  apply(p: Ent, what: string, n: number): number {
    const g = this.g, k = Math.trunc(n);
    if (!k || !Sanctions.canGrant(what)) return 0;
    let done = 0;
    if (isCur(what)) {
      if (k > 0) done = g.wallet.add(p, what, k, WHY.admin);
      else { const cut = Math.min(-k, p[what]); if (cut > 0 && g.wallet.take(p, what, cut, WHY.admin)) done = -cut; }
    } else {
      const id = what as ItemId;
      if (k > 0) done = g.bag.putItem(p, id, k, WHY.admin);
      else { const cut = Math.min(-k, g.bag.count(p, id)); if (cut > 0 && g.bag.takeItem(p, id, cut, WHY.admin)) done = -cut; }
    }
    if (done) g.notify(p, done > 0 ? 'adminGive' : 'adminTake', what, Math.abs(done));
    return done;
  }

  /** 접속해 있지 않은 캐릭터(저장 키)에게 다음 접속 때 줄 것(또는 거둘 것)을 미뤄 둔다. 가득 찼으면 false */
  queue(key: string, what: string, n: number, by: string): boolean {
    if (!Sanctions.canGrant(what) || !Math.trunc(n)) return false;
    const list = this.pending.get(key) ?? [];
    if (list.length >= PENDING_MAX) return false;
    list.push({ what, n: Math.trunc(n), at: this.g.now(), by: by.slice(0, 40) });
    this.pending.set(key, list);
    this.g.saveDirty = true;
    return true;
  }

  /** 신고를 처리했다고 표시한다 (다시 부르면 표시를 고친다) */
  resolve(id: string, by: string, note: string): void {
    this.resolved.delete(id); // 다시 넣어 맨 뒤(가장 최근)로 보낸다
    this.resolved.set(id, { at: this.g.now(), by: by.slice(0, 40), note: note.slice(0, 200) });
    while (this.resolved.size > RESOLVED_KEEP) this.resolved.delete(this.resolved.keys().next().value!);
    this.g.saveDirty = true;
  }

  /** 관리자 행동 한 줄을 끝부분 기록에 더한다 (파일 기록은 admin.ts가 먼저 적는다) */
  audit(row: AuditRow): void {
    this.log.push(row);
    if (this.log.length > LOG_KEEP) this.log.splice(0, this.log.length - LOG_KEEP);
    this.g.saveDirty = true;
  }

  // ---------- 저장 ----------
  private save(): unknown {
    const now = this.g.now();
    const keep = (map: Map<string, Sanction>) => Object.fromEntries([...map].filter(([, s]) => s.until === 0 || s.until > now));
    const bans = keep(this.bans), mutes = keep(this.mutes);
    // 한 번도 쓰지 않았으면 칸을 만들지 않는다 (이 기능을 쓰지 않는 서버의 월드 저장은 전과 같다)
    if (!Object.keys(bans).length && !Object.keys(mutes).length && !this.pending.size && !this.resolved.size && !this.log.length) return undefined;
    return { bans, mutes, pending: Object.fromEntries(this.pending), resolved: Object.fromEntries(this.resolved), log: this.log };
  }
  private load(raw: unknown): void {
    const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {});
    const readS = (v: unknown): Sanction | null => {
      const s = obj(v);
      return typeof s.until === 'number' ? { until: Math.max(0, num(s.until)), why: str(s.why, 200), at: num(s.at), by: str(s.by, 40), name: str(s.name, 40) } : null;
    };
    for (const [map, from] of [[this.bans, d.bans], [this.mutes, d.mutes]] as const) {
      for (const [k, v] of Object.entries(obj(from))) { const s = readS(v); if (s && /^[ki]:/.test(k)) map.set(k, s); }
    }
    for (const [k, v] of Object.entries(obj(d.pending))) {
      if (!Array.isArray(v)) continue;
      const list = v.map(obj).filter((x) => typeof x.what === 'string' && Sanctions.canGrant(x.what) && num(x.n) !== 0)
        .map((x): Grant => ({ what: x.what as string, n: Math.trunc(num(x.n)), at: num(x.at), by: str(x.by, 40) })).slice(0, PENDING_MAX);
      if (list.length) this.pending.set(k, list);
    }
    for (const [k, v] of Object.entries(obj(d.resolved))) { const r = obj(v); this.resolved.set(k, { at: num(r.at), by: str(r.by, 40), note: str(r.note, 200) }); }
    if (Array.isArray(d.log)) {
      for (const v of d.log.slice(-LOG_KEEP)) {
        const r = obj(v);
        this.log.push({ at: num(r.at), by: str(r.by, 40), from: str(r.from, 60), cmd: str(r.cmd, 20), args: Array.isArray(r.args) ? r.args.map((a) => str(a, 200)) : [], ok: r.ok === true, out: str(r.out, 400) });
      }
    }
  }
}
