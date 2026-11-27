import { anonymize } from './sqlite';
import type { BlockRow, ClientErrorRow, EconRow, EconStore, EraseRow, FriendRow, LiveLogRow, LiveRow, LiveStore, PlayerSave, ReportSave, SocialStore, Store, WebStore, WorldSave } from './types';

/** 시험용 저장소: 프로세스가 끝나면 사라진다. */
export class MemoryStore implements Store, EconStore, LiveStore, WebStore, SocialStore {
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
    const before = { world: this.world, players: new Map(this.players), reportList: [...this.reportList], econRows: new Map([...this.econRows].map(([k, r]) => [k, { ...r }])), snapshots: new Map(this.snapshots), live: new Map(this.live), liveLogRows: [...this.liveLogRows], meta: new Map(this.meta), consents: new Map(this.consents), erasures: new Map(this.erasures), errors: new Map(this.errors), blocks: [...this.blocks], friends: [...this.friends], prefs: new Map(this.prefs) };
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
  close(): void { /* 할 일 없음 */ }
}
