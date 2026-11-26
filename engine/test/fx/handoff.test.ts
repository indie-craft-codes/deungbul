// 기기 옮기기 (engine/server/net/handoff.ts): 일회용 코드로 다른 기기가 새 토큰을 받아 같은 캐릭터를 이어받고, 옛 토큰은 쓸 수 없게 된다.
// 성공, 옛 토큰 무효, 재사용, 만료, 자기 코드, 손님, 틀린 시도의 제한(주소·사람별), 다시 켜도 남는 별칭,
// 그리고 받은 코드가 실제 서버를 강제로 죽였다 다시 켜도(같은 DB) 쓰이는가 (코드의 해시만 저장, 한 번만, 만료).
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { ServerMsg } from '../../shared/protocol';
import { Game } from '../../server/game/game';
import { CODE_LEN, CODE_MS, Handoff, TRY_MAX, TRY_WINDOW_MS, hashCode, normCode } from '../../server/net/handoff';
import { startServer } from '../../server/net/server';
import { MemoryStore, SqliteStore } from '../../server/store';
import { check, connect, removeTemp, until, type Peer } from '../harness';

const keyOf = (t: string) => createHash('sha256').update(t).digest('hex');
const OLD = 'handoff-old-device-token-01', NEWDEV = 'handoff-new-device-token-02', OTHER = 'handoff-third-device-token3';
const store = new MemoryStore();
store.savePlayer(keyOf(OLD), { name: '옮길이', lv: 4, exp: 7, need: 148, maxHp: 245, sparks: 3, gold: 77, cls: '' });

/** 시계를 손으로 움직이는 서버 (만료를 보려고) */
let clock = Date.now();
const now = () => clock;

/** 기기 옮기기의 답을 모으는 접속 */
async function device(port: number, token?: string): Promise<Peer & { codes: { code: string; ms: number }[]; tokens: string[]; closeCode: Promise<number> }> {
  const codes: { code: string; ms: number }[] = [], tokens: string[] = [];
  const p = await connect(port, undefined, token, (m: ServerMsg) => { if (m.t === 'handoff') { if ('token' in m) tokens.push(m.token); else codes.push({ code: m.code, ms: m.ms }); } });
  const closeCode = new Promise<number>((done) => p.ws.on('close', (c) => done(c)));
  return Object.assign(p, { codes, tokens, closeCode });
}
function tryJoin(port: number, token?: string): Promise<{ welcome: string | null; code: number; sys: string[] }> {
  return new Promise((done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`), sys: string[] = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', token })));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'sys') sys.push(m.k);
      if (m.t === 'welcome') { ws.close(); done({ welcome: m.name, code: 0, sys }); }
    });
    ws.on('close', (code) => done({ welcome: null, code, sys }));
    ws.on('error', () => { /* close가 뒤따른다 */ });
  });
}

let server = await startServer(0, { store, game: { now } });
let newToken = '';
try {
  const old = await device(server.port, OLD);
  check(old.name === '옮길이', '옛 기기에 캐릭터가 있다');
  old.send({ t: 'handoff', a: 'make' });
  check(await until(() => old.codes.length === 1), '코드를 받는다');
  const { code, ms } = old.codes[0];
  check(code.length === CODE_LEN && /^[A-HJKMNP-Z2-9]+$/.test(code) && ms === CODE_MS, `코드는 헷갈리는 글자 없이 ${CODE_LEN}자이고 ${CODE_MS / 60000}분 동안 산다 (${code})`);
  old.send({ t: 'handoff', a: 'make' });
  check(await until(() => old.codes.length === 2) && old.codes[1].code === code, '곧바로 다시 달라고 하면 같은 코드를 준다');
  // 자기 코드
  old.send({ t: 'handoff', a: 'use', code });
  check(await until(() => old.sys.includes('handoffSelf')), '이 기기 캐릭터의 코드를 이 기기에서 넣으면 알려 준다 (코드는 그대로 산다)');

  // 새 기기: 처음 들어오면 새 손님 캐릭터다
  const dev = await device(server.port, NEWDEV);
  check(dev.name !== '옮길이', '새 기기는 처음에 다른 캐릭터로 들어온다');
  dev.send({ t: 'handoff', a: 'use', code: 'WRONG234' });
  check(await until(() => dev.sys.includes(`handoffBad:${TRY_MAX - 1}`)), '틀린 코드는 남은 횟수와 함께 거절한다');
  // 맞는 코드: 소문자와 줄표를 섞어 쳐도 된다
  const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
  dev.send({ t: 'handoff', a: 'use', code: typed });
  check(await until(() => dev.tokens.length === 1), '맞는 코드를 넣으면 새 토큰을 받는다');
  newToken = dev.tokens[0];
  check(/^[A-Za-z0-9-]{16,64}$/.test(newToken) && newToken !== OLD && newToken !== NEWDEV, '새 토큰은 접속에 쓸 수 있는 모양이고 옛 토큰과 다르다');
  check(await old.closeCode === 4001 && old.sys.includes('handedOff'), '옛 기기는 안내문을 받고 4001로 끊긴다 (화면은 토큰을 지운다)');
  dev.ws.close();
  const moved = await device(server.port, newToken);
  const ent = server.game.ents.get(moved.id)!;
  check(moved.name === '옮길이' && ent.lv === 4 && ent.gold === 77 && ent.pid === keyOf(OLD), '새 토큰으로 들어오면 같은 캐릭터다 (이름, 레벨, 골드, 저장 키 그대로)');
  const oldAgain = await tryJoin(server.port, OLD);
  check(oldAgain.welcome === null && oldAgain.code === 4001 && oldAgain.sys.includes('handedOff'), '옛 토큰으로는 더 들어오지 못한다 (새 캐릭터도 만들지 않는다)');
  // 재사용
  const third = await device(server.port, OTHER);
  third.send({ t: 'handoff', a: 'use', code });
  check(await until(() => third.sys.some((s) => s.startsWith('handoffBad'))) && third.tokens.length === 0, '한 번 쓴 코드는 다시 쓸 수 없다');
  // 만료: 새 코드를 받고 10분이 지나면 맞는 코드라도 거절한다
  moved.send({ t: 'handoff', a: 'make' });
  await until(() => moved.codes.length === 1);
  clock += CODE_MS + 1000;
  third.send({ t: 'handoff', a: 'use', code: moved.codes[0].code });
  check(await until(() => third.sys.filter((s) => s.startsWith('handoffBad')).length === 2) && third.tokens.length === 0, '10분이 지난 코드는 거절한다');
  // 손님(토큰 없는 연결)은 옮길 코드를 받을 수 없다
  const guest = await device(server.port);
  guest.send({ t: 'handoff', a: 'make' });
  check(await until(() => guest.sys.includes('handoffGuest')) && guest.codes.length === 0, '저장되지 않는 손님은 코드를 받지 못한다');
  // 시도 제한: 같은 주소에서 계속 틀리면 막힌다 (시험의 연결은 모두 같은 주소)
  for (let i = 0; i < TRY_MAX; i++) guest.send({ t: 'handoff', a: 'use', code: `ZZZZZZZ${i + 2}` });
  check(await until(() => guest.sys.includes('handoffWait:10') || guest.sys.includes('handoffWait:9')), '틀린 시도가 쌓이면 기다리라고 한다');
  moved.send({ t: 'handoff', a: 'make' });
  await until(() => moved.codes.length === 2);
  guest.send({ t: 'handoff', a: 'use', code: moved.codes[1].code });
  check(await until(() => guest.sys.filter((s) => s.startsWith('handoffWait')).length >= 2) && guest.tokens.length === 0, '막힌 동안에는 맞는 코드라도 받지 않는다');
  clock += TRY_WINDOW_MS + 1000;
  moved.send({ t: 'handoff', a: 'make' });
  await until(() => moved.codes.length === 3);
  guest.send({ t: 'handoff', a: 'use', code: moved.codes[2].code });
  check(await until(() => guest.tokens.length === 1), '창이 지나면 다시 넣을 수 있다 (두 번째 옮기기)');
  newToken = guest.tokens[0];
  check(await moved.closeCode === 4001, '두 번째로 옮기면 그 전 기기도 끊긴다');
  check((await tryJoin(server.port, dev.tokens[0])).code === 4001 && (await tryJoin(server.port, newToken)).welcome === '옮길이', '두 번 옮기면 첫 번째 새 토큰도 물러나고 마지막 토큰만 된다');
  third.ws.close(); guest.ws.close();
} finally {
  await server.close();
}

// 다시 켜도: 별칭과 물러난 토큰은 월드와 함께 저장된다
server = await startServer(0, { store, game: { now } });
try {
  check((await tryJoin(server.port, newToken)).welcome === '옮길이', '다시 켜도 새 토큰으로 같은 캐릭터에 들어온다');
  check((await tryJoin(server.port, OLD)).code === 4001, '다시 켜도 옛 토큰은 쓸 수 없다');
} finally {
  await server.close();
}

// 시도 제한의 열쇠: 주소와 사람마다 따로 센다
{
  const t = { now: Date.now() };
  const h = new Handoff(new Game({ now: () => t.now }));
  for (let i = 0; i < TRY_MAX; i++) h.use('AAAAAAAA', ['i:1', 'k:x'], null);
  const r1 = h.use('AAAAAAAA', ['i:2', 'k:x'], null), r2 = h.use('AAAAAAAA', ['i:1', 'k:y'], null), r3 = h.use('AAAAAAAA', ['i:3', 'k:z'], null);
  check('wait' in r1 && 'wait' in r2 && 'left' in r3 && r3.left === TRY_MAX - 1, '틀린 시도는 주소별로도 사람별로도 막는다 (다른 주소의 같은 사람, 같은 주소의 다른 사람 모두 막히고, 둘 다 다르면 된다)');
  check(normCode(' abcd-efgh ') === 'ABCDEFGH' && normCode(5) === '', '코드는 대소문자와 줄표·칸을 가리지 않는다');
}

// 저장의 모양: 코드가 없으면 'handoff' 칸은 예전과 같다 (codes 칸 없음), 코드는 해시로만
{
  const t = { now: Date.now() };
  const g = new Game({ now: () => t.now });
  const h = new Handoff(g);
  check(g.exportWorld().handoff === undefined, '별칭도 코드도 없으면 handoff 칸을 적지 않는다 (예전과 같다)');
  const { code } = h.make('a'.repeat(64));
  const w = JSON.stringify(g.exportWorld().handoff);
  check(g.saveDirty && w.includes(hashCode(code)) && !w.includes(code), `새 코드는 곧 저장되고(saveDirty), 저장에는 해시만 있다 (${w.slice(0, 60)}…)`);
  t.now += CODE_MS + 1;
  check(g.exportWorld().handoff === undefined, '끝난 코드는 저장에 남기지 않는다');
  // 옛 저장(codes 칸 없음)과 깨진 codes 칸도 읽는다
  const g2 = new Game({ now: () => t.now }), h2 = new Handoff(g2);
  g2.importWorld({ handoff: { alias: {}, retired: [], codes: { nothex: ['x', 1], [hashCode('ABCDEFGH')]: ['b'.repeat(64), 'soon'], [hashCode('ZZZZZZZZ')]: ['c'.repeat(64), t.now + CODE_MS * 50] } } });
  const r = h2.use('ZZZZZZZZ', ['i:9'], null);
  check('token' in r && r.key === 'c'.repeat(64), '읽은 코드는 쓰인다 (끝나는 시각은 지금부터 10분을 넘지 않게 자른다)');
  check('left' in h2.use('ABCDEFGH', ['i:9'], null), '깨진 칸의 코드는 버린다');
}

// 실제 서버를 강제로 죽였다가 같은 DB로 다시 켠다: 받은 코드가 끝날 때까지 쓰이고, 한 번만 쓰인다
{
  const root = path.resolve(import.meta.dirname, '..', '..', '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-handoff-'));
  const db = path.join(tmp, 'game.db');
  const A = 'handoff-proc-device-a-0001', B = 'handoff-proc-device-b-0002', C = 'handoff-proc-device-c-0003';
  { const st = new SqliteStore(db); st.savePlayer(keyOf(A), { name: '다시켜기', lv: 3, exp: 1, need: 100, maxHp: 200, sparks: 0, gold: 12, cls: '' }); st.close(); }
  const procs: ChildProcess[] = [];
  /** 서버 프로세스를 띄우고 포트를 받는다 */
  const boot = (skew = 0) => new Promise<{ p: ChildProcess; port: number }>((done, fail) => {
    const p = spawn(process.execPath, ['--import', 'tsx', path.join(import.meta.dirname, 'handoff-proc.ts')], {
      cwd: root, env: { ...process.env, DB: db, PORT: '0', BACKUP: '0', HANDOFF_SKEW_MS: String(skew), TSX_TSCONFIG_PATH: path.join(import.meta.dirname, 'tsconfig.json'), TEST_REPORT: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    procs.push(p);
    let out = '';
    const timer = setTimeout(() => fail(new Error('서버가 뜨지 않았다: ' + out)), 60_000);
    p.stdout!.on('data', (d) => { out += d; const m = /PORT (\d+)/.exec(out); if (m) { clearTimeout(timer); done({ p, port: Number(m[1]) }); } });
    p.stderr!.on('data', (d) => { out += d; });
    p.on('exit', (code) => { clearTimeout(timer); fail(new Error(`서버가 끝났다 (${code}): ${out}`)); });
  });
  /** 강제로 죽인다 (저장할 틈을 주지 않는다: 배포나 정전과 같다) */
  const kill = (p: ChildProcess) => new Promise<void>((done) => { if (p.exitCode !== null || p.signalCode !== null) { done(); return; } p.once('exit', () => done()); p.kill('SIGKILL'); });
  try {
    let s = await boot();
    const a = await device(s.port, A);
    a.send({ t: 'handoff', a: 'make' });
    check(await until(() => a.codes.length === 1), '실제 서버: 코드를 받는다');
    const code = a.codes[0].code;
    a.ws.close();
    await kill(s.p);
    const raw = fs.readFileSync(db).toString('latin1') + (fs.existsSync(db + '-wal') ? fs.readFileSync(db + '-wal').toString('latin1') : '');
    check(raw.includes(hashCode(code)) && !raw.includes(code), 'DB에는 코드의 해시가 있고 코드 그 글자는 없다');

    s = await boot();
    const b = await device(s.port, B);
    b.send({ t: 'handoff', a: 'use', code });
    check(await until(() => b.tokens.length === 1), '강제로 죽였다 다시 켠 서버에서 그 전에 받은 코드가 쓰인다');
    const moved = await device(s.port, b.tokens[0]);
    check(moved.name === '다시켜기', '이어받은 캐릭터가 같다');
    check((await tryJoin(s.port, A)).code === 4001, '옛 토큰은 물러난다');
    const c = await device(s.port, C);
    c.send({ t: 'handoff', a: 'use', code });
    check(await until(() => c.sys.some((x) => x.startsWith('handoffBad'))) && c.tokens.length === 0, '같은 서버에서 다시 쓸 수 없다');
    // 새 코드를 받고 다시 죽였다가 켜서, 쓴 코드가 다시 살아나지 않는지와 새 코드의 만료를 본다
    moved.send({ t: 'handoff', a: 'make' });
    check(await until(() => moved.codes.length === 1), '새 코드를 받는다');
    const late = moved.codes[0].code;
    moved.ws.close(); c.ws.close(); b.ws.close();
    await kill(s.p);

    s = await boot();
    const c2 = await device(s.port, C);
    c2.send({ t: 'handoff', a: 'use', code });
    check(await until(() => c2.sys.some((x) => x.startsWith('handoffBad'))) && c2.tokens.length === 0, '다시 켜도 한 번 쓴 코드는 쓸 수 없다');
    c2.ws.close();
    await kill(s.p);

    // 11분 뒤의 시계로 다시 켠다: 저장된 코드는 끝났다
    s = await boot(CODE_MS + 60_000);
    const c3 = await device(s.port, C);
    c3.send({ t: 'handoff', a: 'use', code: late });
    check(await until(() => c3.sys.some((x) => x.startsWith('handoffBad'))) && c3.tokens.length === 0, '다시 켠 뒤에도 10분이 지난 코드는 거절한다');
    c3.ws.close();
    await kill(s.p);
  } finally {
    for (const p of procs) await kill(p);
    removeTemp(tmp);
  }
}
