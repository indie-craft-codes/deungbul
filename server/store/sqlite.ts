import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { PlayerSave, ReportSave, Store, WorldSave } from './types';

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
  close(): void { this.db.close(); }
}
