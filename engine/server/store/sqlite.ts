import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EconRow, PlayerSave, ReportSave, Store, WorldSave } from './types';

/** 파일 하나짜리 저장소. 검증판 규모(수십 명)에 쓴다. */
export class SqliteStore implements Store {
  private db: DatabaseSync;
  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS players (key TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, target TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS econ_daily (day TEXT NOT NULL, cur TEXT NOT NULL, why TEXT NOT NULL, dir TEXT NOT NULL, amount REAL NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, cur, why, dir));
      CREATE TABLE IF NOT EXISTS econ_snapshot (day TEXT PRIMARY KEY, data TEXT NOT NULL);
    `);
  }
  private parse<T>(text: unknown): T | null {
    if (typeof text !== 'string') return null;
    try { return JSON.parse(text) as T; } catch { return null; }
  }
  loadWorld(): WorldSave | null {
    return this.parse<WorldSave>(this.db.prepare('SELECT value FROM kv WHERE key = ?').get('world')?.value);
  }
  saveWorld(w: WorldSave): void {
    this.db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run('world', JSON.stringify(w));
  }
  loadPlayer(key: string): PlayerSave | null {
    return this.parse<PlayerSave>(this.db.prepare('SELECT data FROM players WHERE key = ?').get(key)?.data);
  }
  keyOfName(name: string): string | null {
    const row = this.db.prepare('SELECT key FROM players WHERE name = ? COLLATE NOCASE LIMIT 1').get(name) as { key?: string } | undefined;
    return row?.key ?? null;
  }
  savePlayer(key: string, p: PlayerSave): void {
    this.db.prepare('INSERT INTO players (key, name, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET name = excluded.name, data = excluded.data, updated = excluded.updated')
      .run(key, p.name, JSON.stringify(p), Date.now());
  }
  saveReport(r: ReportSave): void {
    this.db.prepare('INSERT INTO reports (at, target, data) VALUES (?, ?, ?)').run(r.at, r.target, JSON.stringify(r));
  }
  reports(limit: number): ReportSave[] {
    const rows = this.db.prepare('SELECT data FROM reports ORDER BY id DESC LIMIT ?').all(limit);
    return rows.map((row) => this.parse<ReportSave>(row.data)).filter((r): r is ReportSave => r !== null);
  }
  eachPlayer(fn: (p: PlayerSave) => void): void {
    // 한꺼번에 다 읽지 않고 키 순서로 조금씩 읽는다 (캐릭터가 많아도 메모리가 크게 늘지 않게)
    const page = this.db.prepare('SELECT key, data FROM players WHERE key > ? ORDER BY key LIMIT 500');
    for (let after = '', rows = page.all(after); rows.length; rows = page.all(after)) {
      for (const row of rows) { const p = this.parse<PlayerSave>(row.data); if (p) fn(p); }
      after = String(rows[rows.length - 1].key);
    }
  }
  addEcon(rows: EconRow[]): void {
    if (!rows.length) return;
    const put = this.db.prepare('INSERT INTO econ_daily (day, cur, why, dir, amount, n) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(day, cur, why, dir) DO UPDATE SET amount = amount + excluded.amount, n = n + excluded.n');
    // 한 묶음으로 적는다: 중간에 실패하면 하나도 적히지 않아야, 되돌려 받은 줄을 다음에 다시 얹어도 두 번 더해지지 않는다
    this.db.exec('BEGIN');
    try { for (const r of rows) put.run(r.day, r.cur, r.why, r.dir, r.amount, r.n); this.db.exec('COMMIT'); }
    catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }
  econ(fromDay: string): EconRow[] {
    return this.db.prepare('SELECT day, cur, why, dir, amount, n FROM econ_daily WHERE day >= ? ORDER BY day, cur, why, dir').all(fromDay).map((r) => ({ day: String(r.day), cur: String(r.cur), why: String(r.why), dir: r.dir === '-' ? '-' : '+', amount: Number(r.amount), n: Number(r.n) }));
  }
  saveEconSnapshot(day: string, data: unknown): void {
    this.db.prepare('INSERT INTO econ_snapshot (day, data) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET data = excluded.data').run(day, JSON.stringify(data));
  }
  econSnapshot(day?: string): { day: string; data: unknown } | null {
    const row = day === undefined ? this.db.prepare('SELECT day, data FROM econ_snapshot ORDER BY day DESC LIMIT 1').get() : this.db.prepare('SELECT day, data FROM econ_snapshot WHERE day = ?').get(day);
    const data = this.parse<unknown>(row?.data);
    return row && data !== null ? { day: String(row.day), data } : null;
  }
  close(): void { this.db.close(); }
}
