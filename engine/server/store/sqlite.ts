import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { BlockRow, ClientErrorRow, EconRow, EconStore, EraseRow, FriendRow, LiveLogRow, LiveRow, LiveStore, PlayerSave, ReportSave, SocialStore, Store, WebStore, WorldSave } from './types';
import type { DrawQuery, OddsStore, OddsVersionRow } from './types';
import type { DrawRow, OddsHistoryRow, OddsPlanRow, OddsTableDef } from '../../shared/defs/odds';
import type { EventRow, OpsStore, StashRow, TicketRow } from './types';
import type { RoomRecordRow, RoomStore } from './types';

/**
 * DB 스키마의 이전 목록. PRAGMA user_version이 지금까지 적용한 단계의 수다: 열 때 그 뒤의 단계를 차례로 적용하고 번호를 올린다.
 * 새 단계는 끝에 더한다. 적용한 단계는 고치지 않는다(이미 적용된 DB에는 다시 돌지 않는다).
 *   1: 처음의 표들. 번호가 생기기 전의 DB(user_version 0)에도 그대로 돈다: 모두 IF NOT EXISTS라 이미 있는 표는 건드리지 않는다
 *   2: 원격 설정(live: 버전 있는 키-값, live_log: 변경 이력, live_meta: 이력 없는 운영 값). 옛 표는 건드리지 않는다
 *   3: 웹 출시의 바탕: 약관 동의(consents), 내 데이터 삭제 요청과 기록(erasures), 화면 오류 묶음(client_errors) (engine/server/net/web.ts)
 *   4: 사회와 안전: 차단(blocks: owner 사람 → target 캐릭터), 친구(friends: 캐릭터 a·b), 대화 설정과 연령(social_prefs: owner 사람) (engine/server/net/social.ts)
 *   다음: 운영 도구와 고객지원: 분석 사건(events), 문의(tickets), 롤백 전의 보관(player_stash) (engine/server/game/systems/analytics.ts, net/support.ts, net/rollback.ts).
 *         번호는 목록에서의 자리다 (다른 가지의 단계와 합치면 번호가 바뀔 수 있어 여기 적지 않는다)
 *   (끝) 확률과 재화의 투명성: 확률표의 버전(odds_tables)·변경 이력(odds_history)·사전 공지(odds_plans), 추첨 기록(draws: owner 사람·char 캐릭터, 표와 버전) (engine/server/game/systems/odds.ts).
 *        다른 가지와 합칠 때 번호가 바뀔 수 있어 번호를 적지 않는다: 시험은 SCHEMA.length로 본다
 *   (끝) 판의 기록: 끝난 판의 한 사람 몫(room_records: key 캐릭터, 판의 이름, 결과 data) (engine/server/game/systems/rooms.ts의 RoomDef.record). 번호는 적지 않는다
 */
export const SCHEMA: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS players (key TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, target TEXT NOT NULL, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS econ_daily (day TEXT NOT NULL, cur TEXT NOT NULL, why TEXT NOT NULL, dir TEXT NOT NULL, amount REAL NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, cur, why, dir));
   CREATE TABLE IF NOT EXISTS econ_snapshot (day TEXT PRIMARY KEY, data TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS live (key TEXT PRIMARY KEY, value TEXT NOT NULL, ver INTEGER NOT NULL, at INTEGER NOT NULL, by TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS live_log (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, ver INTEGER NOT NULL, before TEXT, after TEXT, at INTEGER NOT NULL, by TEXT NOT NULL, note TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS live_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS consents (key TEXT PRIMARY KEY, version TEXT NOT NULL, at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS erasures (key TEXT PRIMARY KEY, name TEXT NOT NULL, asked INTEGER NOT NULL, due INTEGER NOT NULL, state TEXT NOT NULL, done INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS client_errors (sig TEXT PRIMARY KEY, kind TEXT NOT NULL, msg TEXT NOT NULL, stack TEXT NOT NULL, place TEXT NOT NULL, build TEXT NOT NULL, ua TEXT NOT NULL, n INTEGER NOT NULL, first INTEGER NOT NULL, last INTEGER NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS blocks (owner TEXT NOT NULL, target TEXT NOT NULL, name TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (owner, target));
   CREATE INDEX IF NOT EXISTS blocks_target ON blocks (target);
   CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, state TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (a, b));
   CREATE INDEX IF NOT EXISTS friends_b ON friends (b);
   CREATE TABLE IF NOT EXISTS social_prefs (owner TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, key TEXT NOT NULL, sess TEXT NOT NULL, name TEXT NOT NULL, props TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS events_at ON events (at);
   CREATE INDEX IF NOT EXISTS events_key ON events (key, at);
   CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, state TEXT NOT NULL, text TEXT NOT NULL, answer TEXT NOT NULL, by TEXT NOT NULL, at INTEGER NOT NULL, upd INTEGER NOT NULL, sanction TEXT);
   CREATE INDEX IF NOT EXISTS tickets_key ON tickets (key);
   CREATE TABLE IF NOT EXISTS player_stash (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, at INTEGER NOT NULL, by TEXT NOT NULL, note TEXT NOT NULL, data TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS odds_tables (tbl TEXT PRIMARY KEY, ver INTEGER NOT NULL, sig TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS odds_history (n INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, ver INTEGER NOT NULL, at INTEGER NOT NULL, before TEXT, after TEXT, why TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS odds_plans (n INTEGER PRIMARY KEY AUTOINCREMENT, tbl TEXT NOT NULL, at INTEGER NOT NULL, text TEXT NOT NULL, made INTEGER NOT NULL, by TEXT NOT NULL, state TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS draws (n INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, owner TEXT NOT NULL, char TEXT NOT NULL, kind TEXT NOT NULL, tbl TEXT NOT NULL, ver INTEGER NOT NULL, steps TEXT NOT NULL, got TEXT NOT NULL, cost TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS draws_owner ON draws (owner, at);
   CREATE INDEX IF NOT EXISTS draws_at ON draws (at);`,
  `CREATE TABLE IF NOT EXISTS room_records (n INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL, at INTEGER NOT NULL, def TEXT NOT NULL, data TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS room_records_key ON room_records (key, n);`,
];

/** 파일 하나짜리 저장소. 검증판 규모(수십 명)에 쓴다. */
export class SqliteStore implements Store, EconStore, LiveStore, WebStore, SocialStore, OpsStore, OddsStore, RoomStore {
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
  eachPlayerKey(fn: (key: string, p: PlayerSave) => void): void {
    const page = this.db.prepare('SELECT key, data FROM players WHERE key > ? ORDER BY key LIMIT 500');
    for (let after = '', rows = page.all(after); rows.length; rows = page.all(after)) {
      for (const row of rows) { const p = this.parse<PlayerSave>(row.data); if (p) fn(String(row.key), p); }
      after = String(rows[rows.length - 1].key);
    }
  }
  // ---- 원격 설정 (LiveStore) ----
  liveRows(): LiveRow[] {
    return this.db.prepare('SELECT key, value, ver, at, by FROM live ORDER BY key').all().map((r) => ({ key: String(r.key), value: this.parse<unknown>(r.value), ver: Number(r.ver), at: Number(r.at), by: String(r.by) }));
  }
  liveWrite(key: string, value: unknown, by: string, at: number, note = ''): number {
    return this.transaction(() => {
      const old = this.db.prepare('SELECT value FROM live WHERE key = ?').get(key) as { value?: string } | undefined;
      const last = this.db.prepare('SELECT MAX(ver) AS v FROM live_log WHERE key = ?').get(key) as { v?: number | null } | undefined;
      const ver = Number(last?.v ?? 0) + 1, after = value === null || value === undefined ? null : JSON.stringify(value);
      if (after === null) this.db.prepare('DELETE FROM live WHERE key = ?').run(key);
      else this.db.prepare('INSERT INTO live (key, value, ver, at, by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, ver = excluded.ver, at = excluded.at, by = excluded.by').run(key, after, ver, at, by);
      this.db.prepare('INSERT INTO live_log (key, ver, before, after, at, by, note) VALUES (?, ?, ?, ?, ?, ?, ?)').run(key, ver, old?.value ?? null, after, at, by, note);
      return ver;
    });
  }
  liveLog(key: string | null, limit: number): LiveLogRow[] {
    const rows = key === null ? this.db.prepare('SELECT * FROM live_log ORDER BY id DESC LIMIT ?').all(limit) : this.db.prepare('SELECT * FROM live_log WHERE key = ? ORDER BY id DESC LIMIT ?').all(key, limit);
    return rows.map((r) => ({ id: Number(r.id), key: String(r.key), ver: Number(r.ver), before: this.parse<unknown>(r.before), after: this.parse<unknown>(r.after), at: Number(r.at), by: String(r.by), note: String(r.note ?? '') }));
  }
  liveMeta(key: string): unknown {
    return this.parse<unknown>(this.db.prepare('SELECT value FROM live_meta WHERE key = ?').get(key)?.value);
  }
  setLiveMeta(key: string, value: unknown): void {
    this.db.prepare('INSERT INTO live_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
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
    this.db.prepare('DELETE FROM blocks WHERE owner = ? OR target = ?').run(key, key);
    this.db.prepare('DELETE FROM friends WHERE a = ? OR b = ?').run(key, key);
    this.db.prepare('DELETE FROM social_prefs WHERE owner = ?').run(key);
    // 운영 도구: 분석 사건과 롤백 보관은 지운다. 문의는 이름과 키를 지우고 글은 남긴다(이의·답변의 기록)
    this.db.prepare('DELETE FROM events WHERE key = ?').run(key);
    this.db.prepare('DELETE FROM player_stash WHERE key = ?').run(key);
    this.db.prepare("UPDATE tickets SET key = '', name = '' WHERE key = ?").run(key);
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
  // ---- 사회와 안전 ----
  blocksOf(owner: string): BlockRow[] {
    return this.db.prepare('SELECT owner, target, name, at FROM blocks WHERE owner = ? ORDER BY at').all(owner).map((r) => ({ owner: String(r.owner), char: String(r.target), name: String(r.name), at: Number(r.at) }));
  }
  putBlock(r: BlockRow): void {
    this.db.prepare('INSERT INTO blocks (owner, target, name, at) VALUES (?, ?, ?, ?) ON CONFLICT(owner, target) DO UPDATE SET name = excluded.name, at = excluded.at').run(r.owner, r.char, r.name, r.at);
  }
  delBlock(owner: string, char: string): void { this.db.prepare('DELETE FROM blocks WHERE owner = ? AND target = ?').run(owner, char); }
  friendsOf(key: string): FriendRow[] {
    return this.db.prepare('SELECT a, b, state, at FROM friends WHERE a = ? OR b = ? ORDER BY at').all(key, key).map((r) => ({ a: String(r.a), b: String(r.b), state: r.state === 'ok' ? 'ok' : 'ask', at: Number(r.at) }));
  }
  putFriend(r: FriendRow): void {
    this.transaction(() => {
      this.db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').run(r.b, r.a);
      this.db.prepare('INSERT INTO friends (a, b, state, at) VALUES (?, ?, ?, ?) ON CONFLICT(a, b) DO UPDATE SET state = excluded.state, at = excluded.at').run(r.a, r.b, r.state, r.at);
    });
  }
  delFriend(a: string, b: string): void { this.db.prepare('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').run(a, b, b, a); }
  socialPrefs(owner: string): Record<string, unknown> | null {
    const v = this.parse<unknown>(this.db.prepare('SELECT data FROM social_prefs WHERE owner = ?').get(owner)?.data);
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : null;
  }
  setSocialPrefs(owner: string, data: Record<string, unknown>, at: number): void {
    this.db.prepare('INSERT INTO social_prefs (owner, data, at) VALUES (?, ?, ?) ON CONFLICT(owner) DO UPDATE SET data = excluded.data, at = excluded.at').run(owner, JSON.stringify(data), at);
  }
  // ---- 운영 도구와 고객지원 (OpsStore) ----
  addEvents(rows: EventRow[]): void {
    if (!rows.length) return;
    const put = this.db.prepare('INSERT INTO events (at, key, sess, name, props) VALUES (?, ?, ?, ?, ?)');
    this.transaction(() => { for (const r of rows) put.run(r.at, r.key, r.sess, r.name, JSON.stringify(r.props)); });
  }
  events(from: number, to: number, names?: readonly string[]): EventRow[] {
    const rows = names?.length
      ? this.db.prepare(`SELECT at, key, sess, name, props FROM events WHERE at >= ? AND at < ? AND name IN (${names.map(() => '?').join(',')}) ORDER BY at, id`).all(from, to, ...names)
      : this.db.prepare('SELECT at, key, sess, name, props FROM events WHERE at >= ? AND at < ? ORDER BY at, id').all(from, to);
    return rows.map((r) => ({ at: Number(r.at), key: String(r.key), sess: String(r.sess), name: String(r.name), props: this.parse<EventRow['props']>(r.props) ?? {} }));
  }
  hasEvent(key: string, name: string): boolean { return !!this.db.prepare('SELECT 1 AS x FROM events WHERE key = ? AND name = ? LIMIT 1').get(key, name); }
  pruneEvents(before: number): number { return Number(this.db.prepare('DELETE FROM events WHERE at < ?').run(before).changes); }
  private ticketRow(r: Record<string, unknown> | undefined): TicketRow | null {
    if (!r) return null;
    const kind = r.kind === 'bug' || r.kind === 'appeal' ? r.kind : 'ask', state = r.state === 'answered' || r.state === 'closed' ? r.state : 'open';
    const sanction = this.parse<TicketRow['sanction']>(r.sanction);
    return { id: Number(r.id), key: String(r.key), name: String(r.name), kind, state, text: String(r.text), answer: String(r.answer), by: String(r.by), at: Number(r.at), upd: Number(r.upd), ...(sanction ? { sanction } : {}) };
  }
  addTicket(t: Omit<TicketRow, 'id'>): number {
    const r = this.db.prepare('INSERT INTO tickets (key, name, kind, state, text, answer, by, at, upd, sanction) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(t.key, t.name, t.kind, t.state, t.text, t.answer, t.by, t.at, t.upd, t.sanction ? JSON.stringify(t.sanction) : null);
    return Number(r.lastInsertRowid);
  }
  ticket(id: number): TicketRow | null { return this.ticketRow(this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)); }
  putTicket(t: TicketRow): void {
    this.db.prepare('UPDATE tickets SET key = ?, name = ?, kind = ?, state = ?, text = ?, answer = ?, by = ?, at = ?, upd = ?, sanction = ? WHERE id = ?')
      .run(t.key, t.name, t.kind, t.state, t.text, t.answer, t.by, t.at, t.upd, t.sanction ? JSON.stringify(t.sanction) : null, t.id);
  }
  tickets(q: { state?: TicketRow['state'] | 'live'; key?: string; limit: number }): TicketRow[] {
    const where: string[] = [], args: (string | number)[] = [];
    if (q.state === 'live') where.push("state != 'closed'"); else if (q.state) { where.push('state = ?'); args.push(q.state); }
    if (q.key !== undefined) { where.push('key = ?'); args.push(q.key); }
    const sql = `SELECT * FROM tickets${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`;
    return this.db.prepare(sql).all(...args, q.limit).map((r) => this.ticketRow(r)!);
  }
  addStash(r: Omit<StashRow, 'id'>): number {
    return Number(this.db.prepare('INSERT INTO player_stash (key, at, by, note, data) VALUES (?, ?, ?, ?, ?)').run(r.key, r.at, r.by, r.note, JSON.stringify(r.save)).lastInsertRowid);
  }
  stashes(key: string, limit: number): StashRow[] {
    return this.db.prepare('SELECT * FROM player_stash WHERE key = ? ORDER BY id DESC LIMIT ?').all(key, limit)
      .map((r) => ({ id: Number(r.id), key: String(r.key), at: Number(r.at), by: String(r.by), note: String(r.note), save: this.parse<PlayerSave>(r.data) ?? { name: '?' } }));
  }
  // ---- 확률과 재화의 투명성 ----
  oddsVersions(): OddsVersionRow[] {
    return this.db.prepare('SELECT tbl, ver, sig, data, at FROM odds_tables ORDER BY tbl').all().map((r) => ({ table: String(r.tbl), ver: Number(r.ver), sig: String(r.sig), data: this.parse<OddsTableDef>(r.data)!, at: Number(r.at) })).filter((r) => r.data !== null);
  }
  putOddsVersion(table: string, row: OddsVersionRow | null, h: OddsHistoryRow): void {
    this.transaction(() => {
      if (row) this.db.prepare('INSERT INTO odds_tables (tbl, ver, sig, data, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(tbl) DO UPDATE SET ver = excluded.ver, sig = excluded.sig, data = excluded.data, at = excluded.at').run(table, row.ver, row.sig, JSON.stringify(row.data), row.at);
      else this.db.prepare('DELETE FROM odds_tables WHERE tbl = ?').run(table);
      this.db.prepare('INSERT INTO odds_history (tbl, ver, at, before, after, why) VALUES (?, ?, ?, ?, ?, ?)').run(h.table, h.ver, h.at, h.before === null ? null : JSON.stringify(h.before), h.after === null ? null : JSON.stringify(h.after), h.why);
    });
  }
  oddsHistory(table: string | null, limit: number): OddsHistoryRow[] {
    const rows = table === null ? this.db.prepare('SELECT * FROM odds_history ORDER BY n DESC LIMIT ?').all(limit) : this.db.prepare('SELECT * FROM odds_history WHERE tbl = ? ORDER BY n DESC LIMIT ?').all(table, limit);
    return rows.map((r) => ({ n: Number(r.n), at: Number(r.at), table: String(r.tbl), ver: Number(r.ver), before: this.parse<OddsTableDef>(r.before), after: this.parse<OddsTableDef>(r.after), why: String(r.why) }));
  }
  oddsPlans(): OddsPlanRow[] {
    return this.db.prepare('SELECT * FROM odds_plans ORDER BY at, n').all().map((r) => ({ n: Number(r.n), table: String(r.tbl), at: Number(r.at), text: this.parse<Record<string, string>>(r.text) ?? {}, made: Number(r.made), by: String(r.by), state: r.state === 'done' || r.state === 'cancel' ? r.state : 'wait' }));
  }
  putOddsPlan(r: OddsPlanRow): number {
    if (r.n !== undefined) { this.db.prepare('UPDATE odds_plans SET tbl = ?, at = ?, text = ?, made = ?, by = ?, state = ? WHERE n = ?').run(r.table, r.at, JSON.stringify(r.text), r.made, r.by, r.state, r.n); return r.n; }
    return Number(this.db.prepare('INSERT INTO odds_plans (tbl, at, text, made, by, state) VALUES (?, ?, ?, ?, ?, ?)').run(r.table, r.at, JSON.stringify(r.text), r.made, r.by, r.state).lastInsertRowid);
  }
  addDraw(r: DrawRow): void {
    this.db.prepare('INSERT INTO draws (at, owner, char, kind, tbl, ver, steps, got, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(r.at, r.owner, r.char, r.kind, r.table, r.ver, JSON.stringify(r.steps), JSON.stringify(r.got), JSON.stringify(r.cost ?? null));
  }
  draws(q: DrawQuery): DrawRow[] {
    const where: string[] = [], args: (string | number)[] = [];
    if (q.owner !== undefined) { where.push('owner = ?'); args.push(q.owner); }
    if (q.table !== undefined) { where.push('tbl = ?'); args.push(q.table); }
    if (q.since !== undefined) { where.push('at >= ?'); args.push(q.since); }
    const sql = `SELECT * FROM draws${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY n DESC LIMIT ?`;
    return this.db.prepare(sql).all(...args, Math.max(1, Math.floor(q.limit))).map((r) => {
      const cost = this.parse<DrawRow['cost'] | null>(r.cost);
      return { n: Number(r.n), at: Number(r.at), owner: String(r.owner), char: String(r.char), kind: String(r.kind), table: String(r.tbl), ver: Number(r.ver), steps: this.parse<string[]>(r.steps) ?? [], got: this.parse<string[]>(r.got) ?? [], ...(cost ? { cost } : {}) };
    });
  }
  pruneDraws(before: number): number { return Number(this.db.prepare('DELETE FROM draws WHERE at < ?').run(before).changes); }
  forgetDraws(owner: string): number { return Number(this.db.prepare("UPDATE draws SET owner = '-', char = '-' WHERE owner = ? OR char = ?").run(owner, owner).changes); }
  close(): void { this.db.close(); }

  // ---- 판의 기록 (rooms 모듈) ----
  addRoomRecords(rows: readonly RoomRecordRow[]): void {
    const st = this.db.prepare('INSERT INTO room_records (key, at, def, data) VALUES (?, ?, ?, ?)');
    for (const r of rows) st.run(r.key, r.at, r.def, JSON.stringify({ res: r.res, rank: r.rank, n: r.n, why: r.why, ...(r.score !== undefined ? { score: r.score } : {}) }));
  }
  roomRecords(key: string, limit: number): RoomRecordRow[] {
    const rows = this.db.prepare('SELECT key, at, def, data FROM room_records WHERE key = ? ORDER BY n DESC LIMIT ?').all(key, Math.max(1, Math.floor(limit))) as { key: string; at: number; def: string; data: string }[];
    return rows.map((r) => {
      const d = this.parse<Partial<RoomRecordRow>>(r.data) ?? {};
      return { key: r.key, at: Number(r.at), def: r.def, res: d.res === 0 || d.res === 1 ? d.res : 2, rank: Number(d.rank) || 0, n: Number(d.n) || 0, why: String(d.why ?? ''), ...(typeof d.score === 'number' ? { score: d.score } : {}) };
    });
  }
  forgetRoomRecords(key: string): number { return Number(this.db.prepare('DELETE FROM room_records WHERE key = ?').run(key).changes); }
}

/** 백업 파일(SqliteStore.backup이 만든 것)에서 캐릭터 한 명의 저장만 읽는다 (계정 단위 롤백: engine/server/net/rollback.ts). 파일은 읽기 전용으로 열고 곧 닫는다. 없으면 null */
export function readBackupPlayer(file: string, key: string): { save: PlayerSave; updated: number } | null {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const r = db.prepare('SELECT data, updated FROM players WHERE key = ?').get(key) as { data?: string; updated?: number } | undefined;
    if (!r?.data) return null;
    try { return { save: JSON.parse(r.data) as PlayerSave, updated: Number(r.updated ?? 0) }; } catch { return null; }
  } finally { db.close(); }
}

/** 신고 한 건에서 그 저장 키의 이름과 키를 지운 것 (신고한 사람이면 by, 당한 사람이면 target) */
export function anonymize(r: ReportSave, key: string): ReportSave {
  const out = { ...r, lines: [...r.lines] };
  if (out.byKey === key) { out.byKey = null; out.by = '-'; }
  if (out.targetKey === key) { out.targetKey = null; out.target = '-'; }
  return out;
}
