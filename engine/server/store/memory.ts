import type { EconRow, EconStore, LiveLogRow, LiveRow, LiveStore, PlayerSave, ReportSave, Store, WorldSave } from './types';

/** 시험용 저장소: 프로세스가 끝나면 사라진다. */
export class MemoryStore implements Store, EconStore, LiveStore {
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
    const before = { world: this.world, players: new Map(this.players), reportList: [...this.reportList], econRows: new Map([...this.econRows].map(([k, r]) => [k, { ...r }])), snapshots: new Map(this.snapshots), live: new Map(this.live), liveLogRows: [...this.liveLogRows], meta: new Map(this.meta) };
    try { return fn(); } catch (err) { Object.assign(this, before); throw err; }
  }
  close(): void { /* 할 일 없음 */ }
}
