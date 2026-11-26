import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ClientErrorRow, EconRow, EconStore, EraseRow, PlayerSave, ReportSave, Store, WebStore, WorldSave } from './types';

/**
 * DB 스키마의 이전 목록. PRAGMA user_version이 지금까지 적용한 단계의 수다: 열 때 그 뒤의 단계를 차례로 적용하고 번호를 올린다.
 * 새 단계는 끝에 더한다. 적용한 단계는 고치지 않는다(이미 적용된 DB에는 다시 돌지 않는다).
 *   1: 처음의 표들. 번호가 생기기 전의 DB(user_version 0)에도 그대로 돈다: 모두 IF NOT EXISTS라 이미 있는 표는 건드리지 않는다
 *   2: 웹 출시의 바탕: 약관 동의(consents), 내 데이터 삭제 요청과 기록(erasures), 화면 오류 묶음(client_errors) (engine/server/net/web.ts)
 */
export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS players (key TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, target TEXT NOT NULL, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS econ_daily (day TEXT NOT NULL, cur TEXT NOT NULL, why TEXT NOT NULL, dir TEXT NOT NULL, amount REAL NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, cur, why, dir));
   CREATE TABLE IF NOT EXISTS econ_snapshot (day TEXT PRIMARY KEY, data TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS consents (key TEXT PRIMARY KEY, version TEXT NOT NULL, at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS erasures (key TEXT PRIMARY KEY, name TEXT NOT NULL, asked INTEGER NOT NULL, due INTEGER NOT NULL, state TEXT NOT NULL, done INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS client_errors (sig TEXT PRIMARY KEY, kind TEXT NOT NULL, msg TEXT NOT NULL, stack TEXT NOT NULL, place TEXT NOT NULL, build TEXT NOT NULL, ua TEXT NOT NULL, n INTEGER NOT NULL, first INTEGER NOT NULL, last INTEGER NOT NULL);`,
];

/** 파일 하나짜리 저장소. 검증판 규모(수십 명)에 쓴다. */
export class SqliteStore implements Store, EconStore, WebStore {
  private db: DatabaseSync;
  readonly file: string;
  /** 지금 열린 묶음의 깊이 (transaction의 SAVEPOINT 이름에 쓴다) */
  private depth = 0;
  constructor(file: string, schema: readonly string[] = SCHEMA) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    // 열다가(스키마를 올리다가) 실패하면 연 파일을 닫고 예외를 낸다: 열린 채 남으면 Windows에서는 그 파일을 옮기거나 지우지 못한다
    try { this.db.exec('PRAGMA journal_mode = WAL;'); this.migrate(schema); }
    catch (err) { try { this.db.close(); } catch { /* 이미 닫혔으면 그것으로 됐다 */ } throw err; }
  }
  /** 이 DB의 스키마 번호 (PRAGMA user_version) */
  schemaVersion(): number { return Number(this.db.prepare('PRAGMA user_version').get()?.user_version ?? 0); }
  /** 스키마를 차례로 올린다. 한 단계와 그 번호는 한 묶음이다: 중간에 실패하면 그 단계는 적용되지 않은 채 예외가 난다(서버가 뜨지 않는다) */
  private migrate(schema: readonly string[]): void {
    const have = this.schemaVersion();
    if (have > schema.length) { console.warn(`[store] DB의 스키마 번호가 ${have}입니다. 이 서버는 ${schema.length}까지 압니다 (새 서버가 쓴 DB): 그대로 씁니다`); return; }
    for (let i = have; i < schema.length; i++) {
      this.db.exec('BEGIN IMMEDIATE');
      try { this.db.exec(schema[i]); this.db.exec(`PRAGMA user_version = ${i + 1}`); this.db.exec('COMMIT'); }
      catch (err) { this.db.exec('ROLLBACK'); throw new Error(`DB 스키마를 ${i + 1}로 올리지 못했습니다: ${String(err)}`); }
    }
  }
  transaction<T>(fn: () => T): T {
    // 바깥 묶음은 BEGIN과 같고, 안쪽 묶음은 바깥의 일부가 된다 (SAVEPOINT는 겹쳐 열 수 있다)
    const name = `t${this.depth++}`;
    this.db.exec(`SAVEPOINT ${name}`);
    try {
      const out = fn();
      this.db.exec(`RELEASE ${name}`);
      return out;
    } catch (err) {
      try { this.db.exec(`ROLLBACK TO ${name}`); this.db.exec(`RELEASE ${name}`); } catch { /* 되돌리지도 못하면 원래의 예외를 알린다 */ }
      throw err;
    } finally { this.depth--; }
  }
  backup(file: string): void {
    // VACUUM INTO: 읽는 묶음 하나로 지금의 DB를 새 파일에 통째로 쓴다(WAL에만 있는 것도 들어간다). 이미 있는 파일에는 쓰지 못한다
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db.prepare('VACUUM INTO ?').run(file);
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
    this.transaction(() => { for (const r of rows) put.run(r.day, r.cur, r.why, r.dir, r.amount, r.n); });
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
  // ---- 웹 출시의 바탕 ----
  consent(key: string): { v: string; at: number } | null {
    const r = this.db.prepare('SELECT version, at FROM consents WHERE key = ?').get(key);
    return r ? { v: String(r.version), at: Number(r.at) } : null;
  }
  setConsent(key: string, v: string, at: number): void {
    this.db.prepare('INSERT INTO consents (key, version, at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET version = excluded.version, at = excluded.at').run(key, v, at);
  }
  deletePlayer(key: string): void {
    this.db.prepare('DELETE FROM players WHERE key = ?').run(key);
    this.db.prepare('DELETE FROM consents WHERE key = ?').run(key);
  }
  private reportRows(): { id: number; r: ReportSave }[] {
    return this.db.prepare('SELECT id, data FROM reports ORDER BY id').all().map((row) => ({ id: Number(row.id), r: this.parse<ReportSave>(row.data) })).filter((x): x is { id: number; r: ReportSave } => x.r !== null);
  }
  anonymizeReports(key: string): number {
    const put = this.db.prepare('UPDATE reports SET target = ?, data = ? WHERE id = ?');
    let n = 0;
    for (const { id, r } of this.reportRows()) {
      if (r.byKey !== key && r.targetKey !== key) continue;
      const out = anonymize(r, key);
      put.run(out.target, JSON.stringify(out), id); n++;
    }
    return n;
  }
  reportsOf(key: string): ReportSave[] { return this.reportRows().map((x) => x.r).filter((r) => r.byKey === key || r.targetKey === key); }
  private eraseRow(row: Record<string, unknown> | undefined): EraseRow | null {
    if (!row) return null;
    const state = row.state === 'done' || row.state === 'cancel' ? row.state : 'wait';
    return { key: String(row.key), name: String(row.name), asked: Number(row.asked), due: Number(row.due), state, done: Number(row.done) };
  }
  eraseOf(key: string): EraseRow | null { return this.eraseRow(this.db.prepare('SELECT * FROM erasures WHERE key = ?').get(key)); }
  erasePending(): EraseRow[] { return this.db.prepare("SELECT * FROM erasures WHERE state = 'wait' ORDER BY due").all().map((r) => this.eraseRow(r)!); }
  putErase(r: EraseRow): void {
    this.db.prepare('INSERT INTO erasures (key, name, asked, due, state, done) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET name = excluded.name, asked = excluded.asked, due = excluded.due, state = excluded.state, done = excluded.done')
      .run(r.key, r.name, r.asked, r.due, r.state, r.done);
  }
  eraseLog(limit: number): EraseRow[] { return this.db.prepare('SELECT * FROM erasures ORDER BY MAX(asked, done) DESC LIMIT ?').all(limit).map((r) => this.eraseRow(r)!); }
  addClientError(r: ClientErrorRow, max: number): void {
    this.transaction(() => {
      this.db.prepare('INSERT INTO client_errors (sig, kind, msg, stack, place, build, ua, n, first, last) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(sig) DO UPDATE SET n = n + excluded.n, last = excluded.last, build = excluded.build, ua = excluded.ua')
        .run(r.sig, r.kind, r.msg, r.stack, r.where, r.build, r.ua, r.n, r.first, r.last);
      this.db.prepare('DELETE FROM client_errors WHERE sig IN (SELECT sig FROM client_errors ORDER BY last DESC LIMIT -1 OFFSET ?)').run(max);
    });
  }
  clientErrors(limit: number): ClientErrorRow[] {
    return this.db.prepare('SELECT * FROM client_errors ORDER BY last DESC LIMIT ?').all(limit).map((r) => ({
      sig: String(r.sig), kind: String(r.kind), msg: String(r.msg), stack: String(r.stack), where: String(r.place), build: String(r.build), ua: String(r.ua), n: Number(r.n), first: Number(r.first), last: Number(r.last),
    }));
  }
  clearClientErrors(sig: string): number {
    const r = sig === 'all' ? this.db.prepare('DELETE FROM client_errors').run() : this.db.prepare('DELETE FROM client_errors WHERE sig LIKE ?').run(sig.replace(/[%_]/g, '') + '%');
    return Number(r.changes);
  }
  close(): void { this.db.close(); }
}

/** 신고 한 건에서 그 저장 키의 이름과 키를 지운 것 (신고한 사람이면 by, 당한 사람이면 target) */
export function anonymize(r: ReportSave, key: string): ReportSave {
  const out = { ...r, lines: [...r.lines] };
  if (out.byKey === key) { out.byKey = null; out.by = '-'; }
  if (out.targetKey === key) { out.targetKey = null; out.target = '-'; }
  return out;
}
