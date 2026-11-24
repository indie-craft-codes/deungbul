import type { PlayerSave, ReportSave, Store, WorldSave } from './types';

/** 시험용 저장소: 프로세스가 끝나면 사라진다. */
export class MemoryStore implements Store {
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
  close(): void { /* 할 일 없음 */ }
}
