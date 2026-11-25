// 운영 안전 묶음: 저장 형식의 버전과 이전, DB 스키마 번호, 저장의 묶음(transaction), 자동 백업, /healthz·/metrics, 압축, 치명적 오류. 시험용 내용 위에서.
// (등불지기의 옛 저장이 이전 전후로 한 글자도 다르지 않게 읽히는가는 games/deungbul/test/saves.test.ts)
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import { Game } from '../../server/game/game';
import { PLAYER_UP, WORLD_UP } from '../../server/game/migrate';
import { setLogSink } from '../../server/log';
import { startServer } from '../../server/net/server';
import { isLocalRequest, PROXY_HEADERS } from '../../server/net/ops';
import { MemoryStore, SqliteStore, type PlayerSave, type Store } from '../../server/store';
import { AUTO_NAME, prune, startBackups } from '../../server/store/backup';
import { SCHEMA } from '../../server/store/sqlite';
import { check, connect, sleep, until } from '../harness';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-ops-'));
const base: PlayerSave = { name: '옛사람', lv: 3, exp: 5, need: 109, maxHp: 230, sparks: 5 };

// ---------- 저장 형식의 버전과 이전 ----------
{
  const calls: string[] = [];
  // 게임 하나를 흉내 낸다: 옛 최상위 칸(logs)을 legacy로 찾는 시스템, 그리고 게임의 이전 두 단계(캐릭터)와 한 단계(월드)
  const plugin = (g: Game) => {
    g.saves.push({ name: 'logs', save: () => 7, load: (_p, raw) => { calls.push(`load ${JSON.stringify(raw)}`); }, legacy: (whole) => whole.wood });
    g.worldSaves.push({ name: 'fire', save: () => ({ heat: 3 }), load: (raw) => { calls.push(`fire ${JSON.stringify(raw)}`); }, legacy: (whole) => (whole.heat === undefined ? undefined : { heat: whole.heat }) });
    g.migrations.player.push(
      { to: 1, note: 'logs 수를 두 배로', up: (s) => { const ext = s.ext as Record<string, unknown>; if (typeof ext.logs === 'number') ext.logs *= 2; } },
      { to: 2, note: 'title 칸을 더한다', up: (s) => ({ ...s, ext: { ...s.ext, title: 'new' } }) },
    );
    g.migrations.world.push({ to: 1, up: (w) => { const f = w.fire as { heat?: number } | undefined; if (f?.heat !== undefined) f.heat += 100; } });
  };
  const g = new Game({ plugins: [plugin] });
  const v0 = { ...structuredClone(base), wood: 4 } as PlayerSave;
  const up = g.upgradePlayer(v0);
  check(up !== v0 && (up.ext as Record<string, unknown>).logs === 8 && (up.ext as Record<string, unknown>).title === 'new' && !('logs' in ((v0 as { ext?: object }).ext ?? {})), `v0 저장: 틀의 이전(옛 칸 → ext, legacy)이 먼저, 그다음 게임의 이전이 차례로 돈다. 받은 저장은 그대로 둔다 (${JSON.stringify(up.ext)})`);
  const now = g.saveVersion('player');
  check(now.v === PLAYER_UP.length && now.gv === 2 && g.saveVersion('world').gv === 1, `쓸 때의 버전: 틀 v${now.v}, 게임 gv${now.gv}`);
  const p = g.players.spawn('옛사람', false, v0, 'k1');
  const out = g.players.export(p);
  check(calls.includes('load 8') && out.v === PLAYER_UP.length && out.gv === 2, `읽을 때 올리고 쓸 때 지금 버전을 적는다 (${calls.join()}, v${out.v} gv${out.gv})`);
  calls.length = 0;
  g.players.spawn('새사람', false, { ...structuredClone(out), wood: 99 } as PlayerSave, 'k2');
  check(calls.join() === 'load 7', `지금 버전의 저장은 다시 올리지 않는다: 옛 칸(wood)을 보지 않고 두 배로 하지도 않는다 (${calls.join()})`);
  const same = { ...structuredClone(out) };
  check(g.upgradePlayer(same) === same, '올릴 것이 없으면 복사하지 않고 그대로 돌려준다');
  // 게임의 버전만 낮은 저장 (틀은 지금, 게임은 1): 게임의 2단계만 돈다
  const half = g.upgradePlayer({ ...structuredClone(base), v: PLAYER_UP.length, gv: 1, ext: { logs: 5 } });
  check((half.ext as Record<string, unknown>).logs === 5 && (half.ext as Record<string, unknown>).title === 'new', '틀과 게임의 버전은 따로 센다: 게임의 버전이 1이면 게임의 2단계만 돈다');
  // 앞날의 버전 (새 서버가 쓴 저장을 옛 서버가 읽음): 건드리지 않는다
  const warns: string[] = [];
  setLogSink(); const warn = console.warn; console.warn = (...a: unknown[]) => { warns.push(a.join(' ')); };
  const future = { ...structuredClone(base), v: 99, ext: { logs: 1 } };
  const read = g.upgradePlayer(future);
  console.warn = warn;
  check(read === future && (read.ext as Record<string, unknown>).logs === 1 && warns.some((w) => w.includes('99')), '틀의 버전이 앞날이면 (게임의 이전까지) 올리지 않고 그대로 읽으며 알린다');
  // 이전이 예외를 던지면 그 단계만 건너뛴다
  const err = console.error; console.error = () => {};
  const g2 = new Game({ plugins: [(x) => { x.migrations.player.push({ to: 1, up: () => { throw new Error('깨짐'); } }, { to: 2, up: (s) => { s.lv = 9; } }); }] });
  const r2 = g2.upgradePlayer(structuredClone(base));
  console.error = err;
  check(r2.lv === 9, '이전 한 단계가 예외를 던지면 그 단계만 건너뛰고 다음 단계는 돈다');
  let threw = '';
  try { new Game({ plugins: [(x) => { x.migrations.world.push({ to: 2, up: () => {} }); }] }); } catch (e) { threw = String(e); }
  check(threw.includes('1부터'), `이전 목록의 번호가 1부터 하나씩이 아니면 게임을 만들 때 멈춘다 (${threw})`);
  // 월드: 옛 형식(이름 없음) → 칸, 그다음 게임의 이전
  calls.length = 0;
  const gw = new Game({ plugins: [plugin] });
  gw.importWorld({ heat: 5 });
  const wout = gw.exportWorld();
  check(calls.join() === 'fire {"heat":105}' && wout.v === WORLD_UP.length && wout.gv === 1, `월드 v0: legacy로 칸을 찾고 게임의 이전을 거친다. 쓸 때 버전을 적는다 (${calls.join()})`);
  calls.length = 0;
  gw.importWorld({ ...wout, heat: 1 });
  check(calls.join() === 'fire {"heat":3}', `지금 버전의 월드는 다시 올리지 않는다 (${calls.join()})`);
}

// ---------- DB 스키마 번호 (PRAGMA user_version) ----------
{
  const fresh = path.join(tmp, 'schema', 'fresh.db');
  const s1 = new SqliteStore(fresh);
  check(s1.schemaVersion() === SCHEMA.length, `새 DB는 스키마 ${SCHEMA.length}까지 올라간다`);
  s1.close();
  // 번호가 생기기 전의 DB: 표는 있고 user_version은 0. 그대로 열리고 값이 남고 번호만 붙는다
  const old = path.join(tmp, 'schema', 'old.db');
  const raw = new DatabaseSync(old);
  raw.exec("CREATE TABLE players (key TEXT PRIMARY KEY, name TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL); CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO kv VALUES ('world', '{\"a\":1}');");
  raw.prepare('INSERT INTO players VALUES (?, ?, ?, ?)').run('k', '옛사람', JSON.stringify(base), 1);
  raw.close();
  const s2 = new SqliteStore(old);
  check(s2.schemaVersion() === SCHEMA.length && s2.loadPlayer('k')?.name === '옛사람' && JSON.stringify(s2.loadWorld()) === '{"a":1}' && s2.econ('').length === 0, '번호가 없던 옛 DB(user_version 0)도 그대로 열리고 값이 남는다. 없던 표는 생긴다');
  s2.close();
  // 다음 단계를 더한 서버가 열면 그 단계만 돈다. 실패한 단계는 적용되지 않고 번호도 그대로다
  const s3 = new SqliteStore(old, [...SCHEMA, 'CREATE TABLE extra (x INTEGER)']);
  const v3 = s3.schemaVersion(); s3.close();
  let threw = '';
  try { new SqliteStore(old, [...SCHEMA, 'CREATE TABLE extra (x INTEGER)', 'CREATE TABLE extra2 (x INTEGER); THIS IS NOT SQL']); } catch (e) { threw = String(e); }
  const check4 = new DatabaseSync(old);
  const v4 = Number(check4.prepare('PRAGMA user_version').get()?.user_version), has2 = !!check4.prepare("SELECT name FROM sqlite_master WHERE name = 'extra2'").get();
  check4.close();
  check(v3 === SCHEMA.length + 1 && threw.includes('올리지 못했습니다') && v4 === SCHEMA.length + 1 && !has2, `스키마는 차례로 한 단계씩, 실패한 단계는 되돌리고 서버가 뜨지 않는다 (번호 ${v3} → ${v4}, extra2 ${has2})`);
}

// ---------- 저장의 묶음 (transaction): 도중에 예외가 나면 아무것도 적히지 않는다 ----------
{
  const stores: [string, Store][] = [['SQLite', new SqliteStore(path.join(tmp, 'tx', 'game.db'))], ['메모리', new MemoryStore()]];
  for (const [what, st] of stores) {
    st.saveWorld({ n: 1 }); st.savePlayer('a', { ...base, lv: 1 }); st.addEcon([{ day: '2026-11-26', cur: 'gold', why: 'kill', dir: '+', amount: 10, n: 1 }]);
    let threw = false;
    try {
      st.transaction(() => {
        st.saveWorld({ n: 2 }); st.savePlayer('a', { ...base, lv: 2 }); st.savePlayer('b', { ...base, name: '비' });
        st.addEcon([{ day: '2026-11-26', cur: 'gold', why: 'kill', dir: '+', amount: 5, n: 1 }]);
        st.transaction(() => { st.saveWorld({ n: 3 }); }); // 안쪽 묶음은 바깥의 일부가 된다
        throw new Error('도중에 실패');
      });
    } catch { threw = true; }
    const econ = st.econ('');
    check(threw && (st.loadWorld() as { n: number }).n === 1 && st.loadPlayer('a')?.lv === 1 && st.loadPlayer('b') === null && econ.length === 1 && econ[0].amount === 10, `${what}: 묶음 도중에 예외가 나면 월드·캐릭터·지표가 하나도 적히지 않고 예외가 그대로 나온다`);
    st.transaction(() => { st.saveWorld({ n: 4 }); st.transaction(() => st.savePlayer('b', { ...base, name: '비' })); });
    check((st.loadWorld() as { n: number }).n === 4 && st.loadPlayer('b')?.name === '비', `${what}: 끝까지 돈 묶음은 (안쪽 묶음까지) 모두 적힌다`);
    let inner = false;
    st.transaction(() => { try { st.transaction(() => { st.saveWorld({ n: 5 }); throw new Error('안쪽'); }); } catch { inner = true; } st.savePlayer('c', { ...base, name: '씨' }); });
    check(inner && (st.loadWorld() as { n: number }).n === 4 && st.loadPlayer('c')?.name === '씨', `${what}: 안쪽 묶음만 실패하면 그것만 되돌린다`);
    st.close();
  }
}

// ---------- 서버: 월드와 캐릭터를 한 묶음으로. 실패하면 모두 되돌리고 다시 시도한다 ----------
{
  /** 캐릭터를 적다가 한 번 실패하는 저장소 (월드를 먼저 적은 뒤에 실패한다: 묶음이 아니면 월드만 남는다) */
  class Flaky extends MemoryStore {
    failPlayer = 0;
    override savePlayer(key: string, p: PlayerSave): void { if (this.failPlayer > 0) { this.failPlayer--; throw new Error('디스크가 가득 찼다 (흉내)'); } super.savePlayer(key, p); }
  }
  const store = new Flaky();
  const lines: string[] = [];
  setLogSink((_l, line) => { lines.push(line); });
  const server = await startServer(0, { store });
  try {
    let mark = 1;
    server.game.worldSaves.push({ name: 'mark', save: () => mark, load: () => {} });
    const TOKEN = 'ops-token-aaaaaaaaaaaaaa', key = createHash('sha256').update(TOKEN).digest('hex');
    store.savePlayer(key, { ...base, name: '묶음이' });
    const a = await connect(server.port, undefined, TOKEN);
    await sleep(300);
    const ent = server.game.ents.get(a.id)!;
    // 한쪽은 월드에, 한쪽은 캐릭터에 적히는 일(거래 같은 것)을 흉내 낸다
    mark = 2; ent.gold = 777; ent.unsaved = true; store.failPlayer = 1; server.game.saveDirty = true;
    await until(() => lines.some((l) => l.includes('월드와 캐릭터 저장 실패')), 2000);
    const w1 = store.loadWorld() as { mark?: number } | null, p1 = store.loadPlayer(key);
    check(w1?.mark !== 2 && p1?.gold !== 777 && server.game.saveDirty && ent.unsaved, `저장 도중(캐릭터)에 실패하면 월드도 적히지 않고, 표시(saveDirty, unsaved)가 남는다 (월드 mark ${w1?.mark}, 골드 ${p1?.gold})`);
    check(await until(() => (store.loadWorld() as { mark?: number } | null)?.mark === 2 && store.loadPlayer(key)?.gold === 777, 3000) && !server.game.saveDirty && !ent.unsaved, '잠시 뒤 다시 시도해 월드와 캐릭터가 함께 적힌다');
    const metrics = await get(server.port, '/metrics');
    check(/game_save_failures_total 1\b/.test(metrics.body) && /game_last_save_timestamp_seconds [1-9]/.test(metrics.body), '저장 실패 수와 마지막 저장 시각이 /metrics에 나온다');
    a.ws.close();
  } finally { await server.close(); setLogSink(); }
}

// ---------- 자동 백업 ----------
{
  const dir = path.join(tmp, 'bk');
  const st = new SqliteStore(path.join(dir, 'game.db'));
  st.savePlayer('k', { ...base, name: '백업' });
  const bdir = path.join(dir, 'backup');
  fs.mkdirSync(bdir, { recursive: true });
  // 사람이 만든 백업 (운영 DB의 data/backup/에 있는 이름 꼴들)과 이름이 비슷한 다른 파일
  const human = ['game.db.20261126-064442', 'game.db-wal.20261126-064442', 'game-20261125-163851-before-rest.db', 'game-before-fw1.db', 'auto-notes.txt', 'auto-20261126.db', 'my-auto-20261126-071500.db'];
  for (const n of human) fs.writeFileSync(path.join(bdir, n), 'human');
  const b = startBackups(st, { keep: 2, everyMin: 0 })!;
  const made = [b.now(), b.now(), b.now()].filter((x): x is string => !!x);
  const autos = fs.readdirSync(bdir).filter((n) => AUTO_NAME.test(n));
  check(b.lastAt > 0 && b.fails === 0 && autos.length === 2 && made.length === 3 && autos.every((n) => n.startsWith('auto-')), `켜질 때 하나, 부를 때마다 하나. 보관 개수(2)를 넘는 오래된 자동 백업만 지운다 (${autos.join(', ')})`);
  check(human.every((n) => fs.readFileSync(path.join(bdir, n), 'utf8') === 'human'), '사람이 만든 파일(game.db.<시각>, game-…-before-….db, auto-로 시작하지만 꼴이 다른 것)은 지우지 않는다');
  check(autos.includes(path.basename(made[2])) && !autos.includes(path.basename(made[0])), '남는 것은 가장 새 자동 백업들이다');
  const copy = new SqliteStore(path.join(bdir, autos[autos.length - 1]));
  check(copy.loadPlayer('k')?.name === '백업', '백업 파일은 그 자체로 열리는 DB다 (WAL의 내용까지 들어 있다)');
  copy.close();
  b.stop();
  check(prune(bdir, 1).length === 1 && fs.readdirSync(bdir).filter((n) => AUTO_NAME.test(n)).length === 1, 'prune은 자동 백업 이름 꼴의 파일만 센다');
  check(startBackups(new MemoryStore()) === null, '메모리 저장소는 백업하지 않는다');
  st.close();
  // startServer의 옵션: backup:false면 만들지 않는다
  const st2 = new SqliteStore(path.join(tmp, 'bk2', 'game.db'));
  const s2 = await startServer(0, { store: st2, backup: false });
  await s2.close();
  check(!fs.existsSync(path.join(tmp, 'bk2', 'backup')), 'startServer의 backup: false면 백업하지 않는다');
  st2.close();
}

// ---------- /healthz, /metrics: localhost에서 직접 온 요청에만 ----------
function get(port: number, p: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((ok, fail) => {
    http.get({ host: '127.0.0.1', port, path: p, headers }, (res) => { let body = ''; res.on('data', (d) => { body += d; }); res.on('end', () => ok({ status: res.statusCode ?? 0, body })); }).on('error', fail);
  });
}
{
  const server = await startServer(0, { staticDir: path.join(tmp, 'no-dist') });
  try {
    await sleep(200);
    const h = await get(server.port, '/healthz');
    const body = JSON.parse(h.body) as { ok: boolean; ticking: boolean; clients: number; lastSaveAt: unknown };
    check(h.status === 200 && body.ok && body.ticking && body.clients === 0 && 'lastSaveAt' in body, `GET /healthz: 틱이 도는지, 접속 수, 마지막 저장 시각 (${h.body})`);
    const m = await get(server.port, '/metrics');
    check(m.status === 200 && ['game_tick_ms_avg', 'game_sent_bytes_total', 'game_clients', 'game_save_failures_total'].every((k) => new RegExp(`^${k} `, 'm').test(m.body)), 'GET /metrics: 틱 시간, 보낸 바이트, 접속 수, 저장 실패 수');
    const viaTunnel = await Promise.all(PROXY_HEADERS.map((hd) => get(server.port, '/healthz', { [hd]: '203.0.113.9' })));
    check(viaTunnel.every((r) => r.status === 404 && !r.body.includes('ticking')), `터널(프록시)의 머리말(${PROXY_HEADERS.join(', ')})이 있으면 바깥 요청으로 보고 답하지 않는다 (화면 파일처럼 404)`);
    const fake = { socket: { remoteAddress: '203.0.113.9' }, headers: {} } as unknown as http.IncomingMessage;
    check(!isLocalRequest(fake) && isLocalRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: {} } as unknown as http.IncomingMessage), '바깥 주소에서 직접 온 요청도 막는다');
    const post = await new Promise<number>((ok) => { const r = http.request({ host: '127.0.0.1', port: server.port, path: '/healthz', method: 'POST' }, (res) => { res.resume(); ok(res.statusCode ?? 0); }); r.end(); });
    check(post !== 200, 'GET만 받는다');
    // 압축은 기본으로 켜져 있다
    const p = await connect(server.port, '압축이');
    check(p.ws.extensions.includes('permessage-deflate') && (await until(() => p.seen.size > 0)), `압축(perMessageDeflate)은 기본으로 맺어지고 메시지가 오간다 (${p.ws.extensions})`);
    p.ws.close();
  } finally { await server.close(); }
  const z = await startServer(0, { compress: false });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${z.port}`);
    await new Promise((r) => ws.once('open', r));
    check(ws.extensions === '', `compress: false면 압축하지 않는다 (확장: '${ws.extensions}')`);
    ws.close();
  } finally { await z.close(); }
}

// ---------- 치명적 오류: 처리되지 않은 예외는 저장하고 코드 1로, 처리되지 않은 거부는 적고 계속 ----------
{
  const db = path.join(tmp, 'crash', 'game.db');
  const root = path.resolve(import.meta.dirname, '..', '..', '..');
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '--tsconfig', path.join(import.meta.dirname, 'tsconfig.json'), path.join(import.meta.dirname, 'crash.ts')], { cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, DB: db, PORT: '0', BACKUP: '0' } });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const rej = out.indexOf('처리되지 않은 거부 (계속 돕니다)'), exc = out.indexOf('처리되지 않은 예외. 저장하고 끝냅니다');
  check(r.status === 1 && rej >= 0 && exc > rej, `처리되지 않은 거부는 적고 계속 돌고, 뒤의 예외는 적은 뒤 코드 1로 끝난다 (코드 ${r.status})`);
  check(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} ERROR /m.test(out) && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} INFO  \[server\] 저장했습니다/m.test(out), '로그 줄에 시각과 수준이 붙는다');
  const st = new SqliteStore(db);
  const w = st.loadWorld() as { crashMark?: string; v?: number } | null;
  st.close();
  check(w?.crashMark === 'after-throw' && w.v === WORLD_UP.length, `예외 뒤에 월드를 저장하고 끝났다 (crashMark ${w?.crashMark})`);
  check(!fs.existsSync(path.join(path.dirname(db), 'server.pid')), '끝날 때 server.pid를 지운다');
  if (r.status !== 1) console.log(out.split('\n').slice(-15).join('\n'));
}

fs.rmSync(tmp, { recursive: true, force: true });
