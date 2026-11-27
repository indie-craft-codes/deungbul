import { anonymize } from './sqlite';
import type { BlockRow, ClientErrorRow, EconRow, EconStore, EraseRow, FriendRow, LiveLogRow, LiveRow, LiveStore, PlayerSave, ReportSave, SocialStore, Store, WebStore, WorldSave } from './types';
import type { DrawQuery, OddsStore, OddsVersionRow } from './types';
import type { DrawRow, OddsHistoryRow, OddsPlanRow } from '../../shared/defs/odds';
import type { EventRow, OpsStore, StashRow, TicketRow } from './types';
import type { CouponRow, CouponStore } from './types';

/** 시험용 저장소: 프로세스가 끝나면 사라진다. */
export class MemoryStore implements Store, EconStore, LiveStore, WebStore, SocialStore, OddsStore, OpsStore, CouponStore {
  private world: WorldSave | null = null;
  private players = new Map<string, PlayerSave>();
  loadWorld(): WorldSave | null { return this.world && structuredClone(this.world); }
  saveWorld(w: WorldSave): void { this.world = structuredClone(w); }
  loadPlayer(key: string): PlayerSave | null { const p = this.players.get(key); return p ? { ...p } : null; }
  savePlayer(key: string, p: PlayerSave): void { this.players.set(key, { ...p }); }
  keyOfName(name: string): string | null { const k = name.toLowerCase(); for (const [key, p] of this.players) if (p.name.toLowerCase() === k) return key; return null; }
  private reportList: ReportSave[] = [];
  saveReport(r: ReportSave): void { this.reportList.push(structuredClone(r)); }
  reports(limit: number): ReportSave[] { return this.reportList.slice(-limit).reverse(); }
  eachPlayer(fn: (p: PlayerSave) => void): void { for (const p of this.players.values()) fn(structuredClone(p)); }
  private econRows = new Map<string, EconRow>();
  private snapshots = new Map<string, unknown>();
  addEcon(rows: EconRow[]): void {
    for (const r of rows) {
      const key = `${r.day}|${r.cur}|${r.why}|${r.dir}`, old = this.econRows.get(key);
      if (old) { old.amount += r.amount; old.n += r.n; } else this.econRows.set(key, { ...r });
    }
  }
  econ(fromDay: string): EconRow[] { return [...this.econRows.values()].filter((r) => r.day >= fromDay).map((r) => ({ ...r })); }
  saveEconSnapshot(day: string, data: unknown): void { this.snapshots.set(day, structuredClone(data)); }
  econSnapshot(day?: string): { day: string; data: unknown } | null {
    const d = day ?? [...this.snapshots.keys()].sort().pop();
    return d !== undefined && this.snapshots.has(d) ? { day: d, data: structuredClone(this.snapshots.get(d)) } : null;
  }
  eachPlayerKey(fn: (key: string, p: PlayerSave) => void): void { for (const [k, p] of [...this.players].sort(([a], [b]) => (a < b ? -1 : 1))) fn(k, structuredClone(p)); }
  // ---- 원격 설정 (LiveStore) ----
  private live = new Map<string, LiveRow>();
  private liveLogRows: LiveLogRow[] = [];
  private meta = new Map<string, unknown>();
  liveRows(): LiveRow[] { return [...this.live.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((r) => structuredClone(r)); }
  liveWrite(key: string, value: unknown, by: string, at: number, note = ''): number {
    const old = this.live.get(key), ver = this.liveLogRows.filter((r) => r.key === key).reduce((m, r) => Math.max(m, r.ver), 0) + 1;
    const after = value === null || value === undefined ? null : structuredClone(value);
    if (after === null) this.live.delete(key); else this.live.set(key, { key, value: after, ver, at, by });
    this.liveLogRows.push({ id: this.liveLogRows.length + 1, key, ver, before: old ? structuredClone(old.value) : null, after: after === null ? null : structuredClone(after), at, by, note });
    return ver;
  }
  liveLog(key: string | null, limit: number): LiveLogRow[] { return this.liveLogRows.filter((r) => key === null || r.key === key).slice(-limit).reverse().map((r) => structuredClone(r)); }
  liveMeta(key: string): unknown { return this.meta.has(key) ? structuredClone(this.meta.get(key)) : null; }
  setLiveMeta(key: string, value: unknown): void { this.meta.set(key, structuredClone(value)); }
  transaction<T>(fn: () => T): T {
    // 들어갈 때의 모든 것을 떠 두고, 예외가 나면 그것으로 되돌린다 (시험용이라 통째로 떠도 된다). 안에서 다시 불러도 같다
    const before = { world: this.world, players: new Map(this.players), reportList: [...this.reportList], econRows: new Map([...this.econRows].map(([k, r]) => [k, { ...r }])), snapshots: new Map(this.snapshots), live: new Map(this.live), liveLogRows: [...this.liveLogRows], meta: new Map(this.meta), consents: new Map(this.consents), erasures: new Map(this.erasures), errors: new Map(this.errors), blocks: [...this.blocks], friends: [...this.friends], prefs: new Map(this.prefs), eventList: [...this.eventList], ticketList: this.ticketList.map((t) => ({ ...t })), stashList: [...this.stashList] };
    try { return fn(); } catch (err) { Object.assign(this, before); throw err; }
  }
  // ---- 웹 출시의 바탕 ----
  private consents = new Map<string, { v: string; at: number }>();
  private erasures = new Map<string, EraseRow>();
  private errors = new Map<string, ClientErrorRow>();
  consent(key: string): { v: string; at: number } | null { const c = this.consents.get(key); return c ? { ...c } : null; }
  setConsent(key: string, v: string, at: number): void { this.consents.set(key, { v, at }); }
  deletePlayer(key: string): void {
    this.players.delete(key); this.consents.delete(key);
    this.blocks = this.blocks.filter((r) => r.owner !== key && r.char !== key);
    this.friends = this.friends.filter((r) => r.a !== key && r.b !== key);
    this.prefs.delete(key);
    this.eventList = this.eventList.filter((r) => r.key !== key);
    this.stashList = this.stashList.filter((r) => r.key !== key);
    for (const t of this.ticketList) if (t.key === key) { t.key = ''; t.name = ''; }
  }
  anonymizeReports(key: string): number {
    let n = 0;
    this.reportList = this.reportList.map((r) => { if (r.byKey !== key && r.targetKey !== key) return r; n++; return anonymize(r, key); });
    return n;
  }
  reportsOf(key: string): ReportSave[] { return this.reportList.filter((r) => r.byKey === key || r.targetKey === key).map((r) => structuredClone(r)); }
  eraseOf(key: string): EraseRow | null { const r = this.erasures.get(key); return r ? { ...r } : null; }
  erasePending(): EraseRow[] { return [...this.erasures.values()].filter((r) => r.state === 'wait').sort((a, b) => a.due - b.due).map((r) => ({ ...r })); }
  putErase(r: EraseRow): void { this.erasures.set(r.key, { ...r }); }
  eraseLog(limit: number): EraseRow[] { return [...this.erasures.values()].sort((a, b) => Math.max(b.asked, b.done) - Math.max(a.asked, a.done)).slice(0, limit).map((r) => ({ ...r })); }
  addClientError(r: ClientErrorRow, max: number): void {
    const old = this.errors.get(r.sig);
    if (old) Object.assign(old, { n: old.n + r.n, last: r.last, build: r.build, ua: r.ua }); else this.errors.set(r.sig, { ...r });
    const list = [...this.errors.values()].sort((a, b) => b.last - a.last);
    for (const x of list.slice(max)) this.errors.delete(x.sig);
  }
  clientErrors(limit: number): ClientErrorRow[] { return [...this.errors.values()].sort((a, b) => b.last - a.last).slice(0, limit).map((r) => ({ ...r })); }
  clearClientErrors(sig: string): number {
    if (sig === 'all') { const n = this.errors.size; this.errors.clear(); return n; }
    let n = 0;
    for (const k of [...this.errors.keys()]) if (k.startsWith(sig)) { this.errors.delete(k); n++; }
    return n;
  }
  // ---- 사회와 안전 ----
  private blocks: BlockRow[] = [];
  private friends: FriendRow[] = [];
  private prefs = new Map<string, Record<string, unknown>>();
  blocksOf(owner: string): BlockRow[] { return this.blocks.filter((r) => r.owner === owner).map((r) => ({ ...r })); }
  putBlock(r: BlockRow): void { this.blocks = this.blocks.filter((x) => !(x.owner === r.owner && x.char === r.char)); this.blocks.push({ ...r }); }
  delBlock(owner: string, char: string): void { this.blocks = this.blocks.filter((x) => !(x.owner === owner && x.char === char)); }
  friendsOf(key: string): FriendRow[] { return this.friends.filter((r) => r.a === key || r.b === key).map((r) => ({ ...r })); }
  putFriend(r: FriendRow): void { this.delFriend(r.a, r.b); this.friends.push({ ...r }); }
  delFriend(a: string, b: string): void { this.friends = this.friends.filter((x) => !((x.a === a && x.b === b) || (x.a === b && x.b === a))); }
  socialPrefs(key: string): Record<string, unknown> | null { const v = this.prefs.get(key); return v ? structuredClone(v) : null; }
  setSocialPrefs(key: string, data: Record<string, unknown>): void { this.prefs.set(key, structuredClone(data)); }
  // ---- 운영 도구와 고객지원 (OpsStore) ----
  private eventList: EventRow[] = [];
  private ticketList: TicketRow[] = [];
  private stashList: StashRow[] = [];
  addEvents(rows: EventRow[]): void { for (const r of rows) this.eventList.push(structuredClone(r)); }
  events(from: number, to: number, names?: readonly string[]): EventRow[] {
    return this.eventList.filter((r) => r.at >= from && r.at < to && (!names?.length || names.includes(r.name))).sort((a, b) => a.at - b.at).map((r) => structuredClone(r));
  }
  hasEvent(key: string, name: string): boolean { return this.eventList.some((r) => r.key === key && r.name === name); }
  pruneEvents(before: number): number { const n = this.eventList.length; this.eventList = this.eventList.filter((r) => r.at >= before); return n - this.eventList.length; }
  addTicket(t: Omit<TicketRow, 'id'>): number { const id = this.ticketList.reduce((m, x) => Math.max(m, x.id), 0) + 1; this.ticketList.push(structuredClone({ ...t, id })); return id; }
  ticket(id: number): TicketRow | null { const t = this.ticketList.find((x) => x.id === id); return t ? structuredClone(t) : null; }
  putTicket(t: TicketRow): void { const i = this.ticketList.findIndex((x) => x.id === t.id); if (i >= 0) this.ticketList[i] = structuredClone(t); }
  tickets(q: { state?: TicketRow['state'] | 'live'; key?: string; limit: number }): TicketRow[] {
    return this.ticketList.filter((t) => (q.state === 'live' ? t.state !== 'closed' : !q.state || t.state === q.state) && (q.key === undefined || t.key === q.key))
      .sort((a, b) => b.id - a.id).slice(0, q.limit).map((t) => structuredClone(t));
  }
  addStash(r: Omit<StashRow, 'id'>): number { const id = this.stashList.length + 1; this.stashList.push(structuredClone({ ...r, id })); return id; }
  stashes(key: string, limit: number): StashRow[] { return this.stashList.filter((r) => r.key === key).sort((a, b) => b.id - a.id).slice(0, limit).map((r) => structuredClone(r)); }
  close(): void { /* 할 일 없음 */ }
  // ---- 확률과 재화의 투명성 ----
  private oddsVer = new Map<string, OddsVersionRow>();
  private oddsLog: OddsHistoryRow[] = [];
  private plans: OddsPlanRow[] = [];
  private drawRows: DrawRow[] = [];
  oddsVersions(): OddsVersionRow[] { return [...this.oddsVer.values()].sort((a, b) => (a.table < b.table ? -1 : 1)).map((r) => structuredClone(r)); }
  putOddsVersion(table: string, row: OddsVersionRow | null, h: OddsHistoryRow): void {
    if (row) this.oddsVer.set(table, structuredClone(row)); else this.oddsVer.delete(table);
    this.oddsLog.push({ ...structuredClone(h), n: this.oddsLog.length + 1 });
  }
  oddsHistory(table: string | null, limit: number): OddsHistoryRow[] { return this.oddsLog.filter((r) => table === null || r.table === table).slice(-limit).reverse().map((r) => structuredClone(r)); }
  oddsPlans(): OddsPlanRow[] { return [...this.plans].sort((a, b) => a.at - b.at || (a.n ?? 0) - (b.n ?? 0)).map((r) => structuredClone(r)); }
  putOddsPlan(r: OddsPlanRow): number {
    if (r.n !== undefined) { const i = this.plans.findIndex((x) => x.n === r.n); if (i >= 0) this.plans[i] = structuredClone(r); return r.n; }
    const n = this.plans.length + 1;
    this.plans.push({ ...structuredClone(r), n });
    return n;
  }
  addDraw(r: DrawRow): void { this.drawRows.push({ ...structuredClone(r), n: this.drawRows.length + 1 }); }
  draws(q: DrawQuery): DrawRow[] {
    return this.drawRows.filter((r) => (q.owner === undefined || r.owner === q.owner) && (q.table === undefined || r.table === q.table) && (q.since === undefined || r.at >= q.since)).slice(-Math.max(1, Math.floor(q.limit))).reverse().map((r) => structuredClone(r));
  }
  pruneDraws(before: number): number { const n = this.drawRows.length; this.drawRows = this.drawRows.filter((r) => r.at >= before); return n - this.drawRows.length; }
  forgetDraws(owner: string): number { let n = 0; for (const r of this.drawRows) if (r.owner === owner || r.char === owner) { r.owner = '-'; r.char = '-'; n++; } return n; }
  // ---- 라이브 콘텐츠: 쿠폰 ----
  private couponRows = new Map<string, CouponRow>();
  private couponUse = new Map<string, Map<string, number>>();
  coupons(): CouponRow[] { return [...this.couponRows.values()].sort((a, b) => (a.code < b.code ? -1 : 1)).map((r) => ({ ...structuredClone(r), used: this.couponUse.get(r.code)?.size ?? 0 })); }
  putCoupon(code: string, row: CouponRow | null): void { if (row) this.couponRows.set(code, structuredClone(row)); else this.couponRows.delete(code); }
  useCoupon(code: string, owner: string, at: number): boolean { const m = this.couponUse.get(code) ?? new Map<string, number>(); if (m.has(owner)) return false; m.set(owner, at); this.couponUse.set(code, m); return true; }
  couponUsesOf(owner: string): string[] { return [...this.couponUse].filter(([, m]) => m.has(owner)).map(([c]) => c); }
  forgetCouponUses(owner: string): number { let n = 0; for (const m of this.couponUse.values()) if (m.delete(owner)) n++; return n; }
}
