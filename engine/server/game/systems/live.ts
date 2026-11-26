// 원격 설정·기능 깃발·공지·점검 (핵심: 끌 수 없다). 값은 버전 있는 키-값 저장소(LiveStore: SQLite의 live·live_log 표)에 두고, 재시작 없이 반영한다.
// 운영자는 관리자 통로(engine/server/net/admin.ts)의 명령 set·flag·notice·maint로 바꾼다. 바꿀 때마다 이력(누가·언제·전·후)이 남는다.
//
//   원격 설정  게임이 내용의 LIVE_KEYS에 이름으로 선언한 칸만 덮어쓴다 (선언하지 않은 칸은 소스 그대로). 값은 검사(engine/shared/defs/live.ts의 checkLive:
//             처음 값과 같은 모양, 게임의 check)를 지나야 반영된다. client를 켠 칸은 접속한 화면에도 보낸다 (메시지 live).
//             g.live.get(이름)은 지금 값 (내용의 칸은 내용을 그대로 읽어도 바뀐 값이다). 되돌리기: reset(소스의 값으로), undo(바로 앞 값으로)
//   깃발      g.flags.on(이름): 깃발이 없거나 켜져 있으면 true (적지 않으면 지금과 같다). 틀의 깃발(join, chat, market, mail, gacha)은 틀이 묻고,
//             명령을 막는 것은 Game.command가 한 곳에서 한다(COMMAND_FLAGS, g.live.gate). 꺼진 기능을 쓰면 안내문 featureOff
//   공지      예약(시작·끝 UTC), 접속 때 창(popup), 흐르는 띠(ticker), 언어마다의 글. 보이는 목록이 바뀌면 모두에게 notices를 보낸다
//   점검      예고(시작 시각, 예정 끝) → 30·10·5·1분 전 안내 → 시작(사건 maintStarted: 통신 계층이 모두 저장하고 관리자 말고 내보낸다) → 끝(maintEnded)
//             점검 중에 들어올 수 있는 사람(관리자)은 저장 키로 적는다 (admins)
// 저장소가 없는 게임(시험, 저장하지 않는 서버)은 서버가 켜져 있는 동안만 남는다. 아무것도 적지 않으면 틱마다 수 몇 개를 견줄 뿐이다 (줄 위의 글자·저장이 예전과 같다).
import { COMMAND_FLAGS, applyLive, checkLive, flagNames, liveCurrent, liveDef, liveOriginal, LIVE_KEYS, type LangText, type MaintView, type NoticeView } from '../../../shared/defs';
import type { LiveLogRow, LiveRow, LiveStore } from '../../store/types';
import type { Game } from '../game';

/** 저장한 공지 하나 */
export interface NoticeRow { text: LangText; from: number; to: number; popup?: boolean; ticker?: boolean }
/** 저장한 점검: 시작 시각, 예정 끝(0이면 정하지 않음), 시작했는가, 안내 글 */
export interface MaintRow { at: number; until: number; on: boolean; text?: LangText }
/** 점검 전에 안내하는 때 (분) */
export const MAINT_WARN_MIN: readonly number[] = [30, 10, 5, 1];

const CFG = 'cfg:', FLAG = 'flag:', NOTICE = 'notice:', MAINT = 'maint', ADMINS = 'admins';
/** 글의 상한 (공지·점검 안내 한 언어) */
export const NOTICE_MAX = 300;

/** 언어마다의 글을 다듬는다: 언어 코드는 영문 2~5자, 글은 제어 문자를 빼고 상한까지. 하나도 없으면 null */
export function langText(raw: unknown): LangText | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-z]{2,5}$/.test(k) || typeof v !== 'string') continue;
    const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NOTICE_MAX);
    if (t) out[k] = t;
  }
  return Object.keys(out).length ? out : null;
}

export class Live {
  /** 기능 깃발: on(이름)은 깃발이 없거나 켜져 있으면 true */
  readonly flags: { on: (name: string) => boolean };
  private rows = new Map<string, LiveRow>();
  private store: LiveStore | null = null;
  /** 저장소가 없을 때의 이력 */
  private memLog: LiveLogRow[] = [];
  private gates = new Map<string, string>(Object.entries(COMMAND_FLAGS));
  private acc = 0;
  /** 마지막으로 보낸 공지 목록의 표시 (바뀌었을 때만 보낸다) */
  private noticeSig = '';
  /** 이번 점검의 예고에서 이미 한 안내 (분) */
  private warned = new Set<number>();

  constructor(private g: Game) {
    this.flags = { on: (name) => this.rows.get(FLAG + name)?.value !== false };
    g.ticks.push((dt) => this.tick(dt));
  }

  /** 저장소를 붙인다 (통신 계층이 서버를 켤 때): 적혀 있던 칸을 읽고 원격 설정을 내용에 적용한다. 지금의 검사를 지나지 못하는 값(내용이 바뀌었다)은 적용하지 않고 알린다 */
  attach(store: LiveStore): void {
    this.store = store;
    this.rows = new Map(store.liveRows().map((r) => [r.key, r]));
    for (const [key, r] of this.rows) {
      if (!key.startsWith(CFG)) continue;
      const name = key.slice(CFG.length), err = checkLive(name, r.value) ?? applyLive(name, r.value);
      if (err) console.warn(`[live] 저장된 원격 설정 '${name}'을(를) 적용하지 않았습니다: ${err}`);
    }
    this.noticeSig = this.sig(this.g.now());
  }

  // ---------- 원격 설정 ----------
  /** 덮어쓸 수 있다고 선언된 칸의 이름 (LIVE_KEYS) */
  names(): string[] { return Object.keys(LIVE_KEYS); }
  /** 그 칸의 지금 값: 덮어썼으면 그 값, 아니면 소스의 값. 내용에 없는 게임만의 값(LiveKeyDef.value)도 이것으로 읽는다 */
  get<T = unknown>(name: string): T {
    const r = this.rows.get(CFG + name);
    if (r) return r.value as T;
    const def = liveDef(name);
    return (def && 'value' in def ? def.value : liveCurrent(name)) as T;
  }
  /** 그 칸의 덮어쓴 기록 (덮어쓰지 않았으면 undefined) */
  row(name: string): LiveRow | undefined { return this.rows.get(CFG + name); }
  /** 소스의 값 */
  original(name: string): unknown { return liveOriginal(name); }
  /** 칸을 바꾼다: 검사를 지나야 반영된다. 바뀐 버전, 또는 거절의 까닭 */
  set(name: string, value: unknown, by: string, note = ''): { ver: number } | { err: string } {
    const err = checkLive(name, value) ?? applyLive(name, value);
    if (err) return { err };
    const ver = this.write(CFG + name, value, by, note);
    this.changed(name, value);
    return { ver };
  }
  /** 소스의 값으로 돌린다 (덮어쓴 것이 없으면 null) */
  reset(name: string, by: string, note = ''): { ver: number } | { err: string } | null {
    if (!liveDef(name)) return { err: `덮어쓸 수 있다고 선언되지 않은 칸입니다: ${name}` };
    if (!this.rows.has(CFG + name)) return null;
    const err = applyLive(name, undefined);
    if (err) return { err };
    const ver = this.write(CFG + name, null, by, note);
    this.changed(name, undefined);
    return { ver };
  }
  /** 바로 앞의 값으로 되돌린다 (그 칸의 마지막 변경을 무른다). 무를 것이 없으면 null */
  undo(name: string, by: string): { ver: number } | { err: string } | null {
    const last = this.log(CFG + name, 1)[0];
    if (!last) return null;
    return last.before === null ? this.reset(name, by, `undo ${last.ver}`) : this.set(name, last.before, by, `undo ${last.ver}`);
  }
  /** 화면에도 보내는 칸 가운데 덮어쓴 것 (접속한 화면에 처음 보낸다) */
  clientSet(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, r] of this.rows) if (key.startsWith(CFG) && liveDef(key.slice(CFG.length))?.client) out[key.slice(CFG.length)] = r.value;
    return out;
  }
  /** 변경 이력: 최근 것부터. key를 주면 그 칸(cfg:이름, flag:이름, notice:id, maint, admins)의 것만 */
  log(key: string | null, n = 20): LiveLogRow[] {
    return this.store ? this.store.liveLog(key, n) : this.memLog.filter((r) => key === null || r.key === key).slice(-n).reverse();
  }

  // ---------- 깃발 ----------
  /** 쓸 수 있는 깃발과 지금 상태 */
  flagList(): { name: string; on: boolean; row?: LiveRow }[] { return flagNames().map((name) => ({ name, on: this.flags.on(name), row: this.rows.get(FLAG + name) })); }
  /** 깃발을 켜거나 끈다. 켜면 칸을 지운다(없는 것 = 켜짐). 모르는 이름이면 까닭 */
  setFlag(name: string, on: boolean, by: string): { ver: number } | { err: string } {
    if (!flagNames().includes(name)) return { err: `모르는 깃발입니다: ${name} (${flagNames().join(', ')})` };
    if (this.flags.on(name) === on) return { ver: this.rows.get(FLAG + name)?.ver ?? 0 };
    const ver = this.write(FLAG + name, on ? null : false, by);
    this.g.fire('liveChanged', FLAG + name);
    return { ver };
  }
  /** 게임의 명령을 깃발로 막는다: 그 깃발이 꺼져 있으면 명령을 처리하지 않고 featureOff를 알린다 */
  gate(command: string, flag: string): void { this.gates.set(command, flag); }
  /** 그 명령을 막는 깃발 (없으면 undefined) */
  gateOf(command: string): string | undefined { return this.gates.get(command); }

  // ---------- 공지 ----------
  /** 공지를 더한다. id를 돌려준다 */
  addNotice(n: NoticeRow, by: string): string {
    let id = Math.max(0, ...[...this.rows.keys()].filter((k) => k.startsWith(NOTICE)).map((k) => Number(k.slice(NOTICE.length)) || 0), ...this.log(null, 500).filter((r) => r.key.startsWith(NOTICE)).map((r) => Number(r.key.slice(NOTICE.length)) || 0)) + 1;
    while (this.rows.has(NOTICE + id)) id++;
    this.write(NOTICE + id, n, by);
    this.g.fire('liveChanged', NOTICE + id);
    this.pushNotices();
    return String(id);
  }
  /** 공지를 내린다. 없으면 false */
  delNotice(id: string, by: string): boolean {
    if (!this.rows.has(NOTICE + id)) return false;
    this.write(NOTICE + id, null, by);
    this.g.fire('liveChanged', NOTICE + id);
    this.pushNotices();
    return true;
  }
  /** 저장된 공지 모두 (지난 것·아직인 것 포함), id 차례 */
  noticeRows(): { id: string; n: NoticeRow; row: LiveRow }[] {
    return [...this.rows].filter(([k]) => k.startsWith(NOTICE)).map(([k, r]) => ({ id: k.slice(NOTICE.length), n: r.value as NoticeRow, row: r })).sort((a, b) => Number(a.id) - Number(b.id));
  }
  /** 지금 보이는 공지 */
  notices(now = this.g.now()): NoticeView[] {
    return this.noticeRows().filter(({ n }) => now >= n.from && now < n.to).map(({ id, n }) => ({ id, text: n.text, from: n.from, to: n.to, ...(n.popup ? { popup: true } : {}), ...(n.ticker ? { ticker: true } : {}) }));
  }

  // ---------- 점검 ----------
  /** 예고했거나 진행 중인 점검 (없으면 null) */
  maint(): MaintRow | null { return (this.rows.get(MAINT)?.value as MaintRow | undefined) ?? null; }
  /** 지금 점검 중인가 */
  maintOn(): boolean { return this.maint()?.on === true; }
  /** 화면에 보내는 점검 (없으면 null) */
  maintView(): MaintView | null { const m = this.maint(); return m ? { at: m.at, until: m.until, on: m.on, ...(m.text ? { text: m.text } : {}) } : null; }
  /** 점검을 예고한다 (at이 지금이거나 지났으면 바로 시작한다) */
  planMaint(at: number, until: number, text: LangText | null, by: string): void {
    this.warned.clear();
    this.write(MAINT, { at, until, on: false, ...(text ? { text } : {}) } satisfies MaintRow, by);
    this.g.fire('liveChanged', MAINT);
    this.pushMaint();
    if (at <= this.g.now()) this.startMaint(by);
  }
  /** 점검을 지금 시작한다 (예고가 없으면 지금 시각으로 만든다). 이미 점검 중이면 false */
  startMaint(by: string, until = 0, text: LangText | null = null): boolean {
    const m = this.maint();
    if (m?.on) return false;
    this.write(MAINT, { at: this.g.now(), until: m?.until ?? until, on: true, ...(m?.text ?? text ? { text: (m?.text ?? text)! } : {}) } satisfies MaintRow, by);
    this.g.fire('liveChanged', MAINT);
    this.pushMaint();
    this.g.fire('maintStarted');
    return true;
  }
  /** 점검을 끝내거나 예고를 거둔다. 없으면 false */
  endMaint(by: string): boolean {
    const m = this.maint();
    if (!m) return false;
    this.write(MAINT, null, by);
    this.warned.clear();
    this.g.fire('liveChanged', MAINT);
    this.g.casts.push({ t: 'maint', off: true });
    if (m.on) { this.g.announce('maintEnd'); this.g.fire('maintEnded'); }
    return true;
  }
  /** 점검 중에 들어올 수 있는 사람 (저장 키 → 적을 때의 이름) */
  admins(): Readonly<Record<string, string>> { return (this.rows.get(ADMINS)?.value as Record<string, string> | undefined) ?? {}; }
  isAdmin(key: string | null): boolean { return !!key && Object.hasOwn(this.admins(), key); }
  /** 관리자(점검 중 입장)를 더하거나(name) 뺀다(null) */
  setAdmin(key: string, name: string | null, by: string): void {
    const list = { ...this.admins() };
    if (name === null) delete list[key]; else list[key] = name;
    this.write(ADMINS, Object.keys(list).length ? list : null, by);
    this.g.fire('liveChanged', ADMINS);
  }

  // ---------- 안 ----------
  /** 칸을 적는다 (저장소가 있으면 거기에, 이력과 함께). 새 버전 */
  private write(key: string, value: unknown, by: string, note = ''): number {
    const at = this.g.now(), old = this.rows.get(key);
    let ver: number;
    if (this.store) ver = this.store.liveWrite(key, value, by, at, note);
    else {
      ver = this.memLog.filter((r) => r.key === key).reduce((m, r) => Math.max(m, r.ver), 0) + 1;
      this.memLog.push({ id: this.memLog.length + 1, key, ver, before: old ? structuredClone(old.value) : null, after: value === null || value === undefined ? null : structuredClone(value), at, by, note });
    }
    if (value === null || value === undefined) this.rows.delete(key);
    else this.rows.set(key, { key, value: structuredClone(value), ver, at, by });
    return ver;
  }
  /** 원격 설정이 바뀌었다: 사건을 알리고 화면에도 보내는 칸이면 모두에게 보낸다 */
  private changed(name: string, value: unknown): void {
    this.g.fire('liveChanged', CFG + name);
    if (liveDef(name)?.client) this.g.casts.push(value === undefined ? { t: 'live', set: {}, reset: [name] } : { t: 'live', set: { [name]: value } });
  }
  private sig(now: number): string { return this.notices(now).map((n) => `${n.id}@${this.rows.get(NOTICE + n.id)?.ver}`).join(','); }
  private pushNotices(): void {
    const now = this.g.now(), sig = this.sig(now);
    if (sig === this.noticeSig) return;
    this.noticeSig = sig;
    this.g.casts.push({ t: 'notices', list: this.notices(now) });
  }
  private pushMaint(): void { const v = this.maintView(); this.g.casts.push(v ? { t: 'maint', ...v } : { t: 'maint', off: true }); }
  /** 1초마다: 공지의 시작·끝, 점검 전의 안내와 시작 */
  private tick(dt: number): void {
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc = 0;
    if (this.rows.size === 0 && this.noticeSig === '') return;
    this.pushNotices();
    const m = this.maint();
    if (!m || m.on) return;
    const now = this.g.now(), left = (m.at - now) / 60000;
    if (left <= 0) { this.startMaint('schedule'); return; }
    // 남은 시간이 든 가장 작은 안내 때: 아직 하지 않았으면 한 번 (늦게 예고했으면 더 이른 안내는 건너뛴다)
    const near = MAINT_WARN_MIN.filter((x) => left <= x);
    if (!near.length) return;
    const w = Math.min(...near);
    if (this.warned.has(w)) return;
    for (const x of near) this.warned.add(x);
    this.g.announce('maintSoon', Math.ceil(left), m.until);
  }
}
