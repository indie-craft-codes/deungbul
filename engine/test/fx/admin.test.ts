// 관리자 통로와 제재 (engine/server/net/admin.ts, engine/server/game/systems/sanctions.ts): 시험용 내용 위에서.
//   1. 통로의 문: 토큰, 터널·프록시·브라우저의 머리 거절 (cloudflared처럼 머리를 붙여 넘기는 프록시를 같은 PC에 세워 본다)
//   2. 제재: 말 막기(전체·길드), 내보내기, 차단(이름), 주소 차단과 해제, 전체 공지
//   3. 지급·회수: 지갑과 가방을 지나 장부에 'admin'으로 적힌다. 접속해 있지 않은 캐릭터는 다음 접속 때
//   4. 신고 목록과 처리 표시
//   5. 다시 켜도 남는다 (차단, 말 막기, 처리 표시, 기록), 기록은 끌 수 없고 적지 못하면 명령을 하지 않는다
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { ITEMS, itemDef, type ItemId } from '../../shared/defs';
import type { ServerMsg } from '../../shared/protocol';
import { AUDIT_FILE, FORWARD_HEADERS, TOKEN_FILE, createAdmin, parseSpan } from '../../server/net/admin';
import { startServer, type Running } from '../../server/net/server';
import { MemoryStore } from '../../server/store';
import { check, connect, removeTemp, settle, until, type Peer } from '../harness';

const keyOf = (t: string) => createHash('sha256').update(t).digest('hex');
const TA = 'admin-test-token-aaaaaaaa', TB = 'admin-test-token-bbbbbbbb', TC = 'admin-test-token-cccccccc';
const store = new MemoryStore();
store.savePlayer(keyOf(TA), { name: '가람', lv: 3, exp: 0, need: 109, maxHp: 230, sparks: 0, gold: 100, cls: '' });
store.savePlayer(keyOf(TB), { name: '나래', lv: 3, exp: 0, need: 109, maxHp: 230, sparks: 0, gold: 50, cls: '' });
store.savePlayer(keyOf(TC), { name: '다솜', lv: 2, exp: 0, need: 80, maxHp: 200, sparks: 0, gold: 10, cls: '' });
const MAT = (Object.keys(ITEMS) as ItemId[]).find((id) => itemDef(id).kind === 'mat')!;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-admin-'));

/** 관리자 통로에 직접 보낸다. headers로 머리를 더하거나(값) 빼거나(null) 한다 */
function post(port: number, body: unknown, headers: Record<string, string | null> = {}, method = 'POST'): Promise<{ status: number; body: { ok?: boolean; out?: string } | null }> {
  return new Promise((done, fail) => {
    const payload = JSON.stringify(body);
    const h: Record<string, string> = { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) };
    for (const [k, v] of Object.entries(headers)) { if (v === null) delete h[k]; else h[k] = v; }
    if (method !== 'POST') delete h['content-length'];
    const req = http.request({ host: '127.0.0.1', port, path: '/admin', method, headers: h }, (res) => {
      const parts: Buffer[] = [];
      res.on('data', (c: Buffer) => parts.push(c));
      res.on('end', () => { const text = Buffer.concat(parts).toString('utf8'); let b = null; try { b = JSON.parse(text); } catch { /* 글 */ } done({ status: res.statusCode ?? 0, body: b }); });
    });
    req.on('error', fail);
    req.end(method === 'POST' ? payload : undefined);
  });
}

/** 토큰으로 접속해 본다: 환영을 받았는가, 아니면 어떤 까닭으로 끊겼는가 */
function tryJoin(port: number, token?: string): Promise<{ welcome: boolean; code: number; sys: string[] }> {
  return new Promise((done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`), sys: string[] = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', token })));
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString()) as ServerMsg;
      if (m.t === 'sys') sys.push([m.k, ...(m.a ?? [])].join(':'));
      if (m.t === 'welcome') { ws.close(); done({ welcome: true, code: 0, sys }); }
    });
    ws.on('close', (code) => done({ welcome: false, code, sys }));
    ws.on('error', () => { /* close가 뒤따른다 */ });
  });
}
const closed = (p: Peer): Promise<number> => new Promise((done) => { if (p.ws.readyState === p.ws.CLOSED) done(-1); else p.ws.on('close', (c) => done(c)); });

// 대화 간격(0.7초)은 시험의 시계로 넘긴다 (벽시계로 자지 않는다)
let t = Date.now();
const pass = (ms: number) => { t += ms; };
let server: Running = await startServer(0, { store, admin: { dir }, now: () => t });
let port = server.port;
const run = async (cmd: string, ...args: string[]) => (await post(port, { cmd, args, by: '시험' }, { 'x-admin-token': server.admin.token })).body ?? {};
try {
  // ---------- 1. 통로의 문 ----------
  const file = path.join(dir, TOKEN_FILE);
  check(fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() === server.admin.token && server.admin.token.length >= 32, '켜질 때 저장 폴더에 무작위 관리자 토큰 파일을 만든다');
  const tok = { 'x-admin-token': server.admin.token };
  const ok = await post(port, { cmd: 'who', args: [], by: '시험' }, tok);
  check(ok.status === 200 && ok.body?.ok === true, '토큰이 맞으면 명령을 받는다');
  check((await post(port, { cmd: 'who' })).status === 401 && (await post(port, { cmd: 'who' }, { 'x-admin-token': 'x'.repeat(48) })).status === 401, '토큰이 없거나 틀리면 401로 거절한다');
  const viaHeader = await Promise.all(['cf-connecting-ip', 'x-forwarded-for', 'forwarded', 'x-real-ip', 'cf-ray', 'cdn-loop'].map((k) => post(port, { cmd: 'who' }, { ...tok, [k]: k === 'forwarded' ? 'for=203.0.113.9' : '203.0.113.9' })));
  check(viaHeader.every((r) => r.status === 404), '맞는 토큰이라도 터널·프록시의 머리(CF-Connecting-IP, X-Forwarded-For, Forwarded, X-Real-IP, CF-Ray, CDN-Loop)가 있으면 없는 주소처럼 404');
  const browser = await Promise.all(([['origin', 'http://evil.example'], ['referer', 'http://localhost/'], ['sec-fetch-mode', 'cors']] as const).map(([k, v]) => post(port, { cmd: 'who' }, { ...tok, [k]: v })));
  check(browser.every((r) => r.status === 404), '브라우저가 붙이는 머리(Origin, Referer, Sec-Fetch-*)가 있으면 404 (같은 PC의 웹 페이지가 대신 보내지 못한다)');
  check((await post(port, { cmd: 'who' }, tok, 'GET')).status === 404 && (await post(port, { cmd: 'who' }, { ...tok, 'content-type': 'text/plain' })).status === 415, 'POST가 아니면 404, JSON이 아니면 415');
  check(FORWARD_HEADERS.includes('cf-connecting-ip') && FORWARD_HEADERS.includes('x-forwarded-for'), '거절하는 머리의 목록에 cloudflared가 붙이는 것이 있다');

  // cloudflared처럼: 같은 PC에서 받아 머리를 붙여 서버로 넘기는 프록시. 토큰을 아는 바깥 사람이라도 지나가지 못한다
  const tunnel = http.createServer((req, res) => {
    const up = http.request({ host: '127.0.0.1', port, path: req.url, method: req.method, headers: { ...req.headers, 'cf-connecting-ip': '198.51.100.7', 'x-forwarded-for': '198.51.100.7', 'cdn-loop': 'cloudflare', 'cf-ray': '8a1b2c3d4e5f-ICN' } }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    req.pipe(up);
  });
  await new Promise<void>((r) => tunnel.listen(0, '127.0.0.1', () => r()));
  const tport = (tunnel.address() as { port: number }).port;
  const through = await post(tport, { cmd: 'announce', args: ['터널로 온 공지'], by: '바깥' }, tok);
  check(through.status === 404, `터널을 지난 요청은 토큰이 맞아도 통과하지 못한다 (${through.status})`);
  // 머리를 지우는 프록시: 이것까지 막지는 못하므로 토큰이 마지막 문이다 (토큰 없이 오면 401)
  const strip = http.createServer((req, res) => {
    const h = { ...req.headers }; delete h['x-admin-token'];
    const up = http.request({ host: '127.0.0.1', port, path: req.url, method: req.method, headers: h }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    req.pipe(up);
  });
  await new Promise<void>((r) => strip.listen(0, '127.0.0.1', () => r()));
  check((await post((strip.address() as { port: number }).port, { cmd: 'who' })).status === 401, '머리를 붙이지 않는 프록시를 지나도 토큰이 없으면 401');
  tunnel.close(); strip.close();
  check(!server.game.sanctions.log.some((r) => r.by === '바깥'), '거절한 요청은 명령으로 처리되지 않았다');

  // ---------- 2. 제재 ----------
  const a = await connect(port, undefined, TA), b = await connect(port, undefined, TB);
  check(a.name === '가람' && b.name === '나래', '두 사람이 접속했다');
  const who = await run('who');
  check(who.ok === true && /가람/.test(who.out ?? '') && /나래/.test(who.out ?? ''), 'who: 접속한 사람을 보여 준다');
  const found = await run('find', '다솜');
  check(/접속하지 않음/.test(found.out ?? '') && /Lv2/.test(found.out ?? ''), 'find: 접속하지 않은 캐릭터도 저장에서 찾는다');

  // 신고 (처리 표시는 아래 4에서)
  a.send({ t: 'chat', text: '신고될 말' });
  await until(() => b.chat.some((c) => c.endsWith('신고될 말')));
  b.send({ t: 'report', id: a.id });
  check(await until(() => b.sys.some((s) => s.startsWith('reported'))), '신고가 접수됐다');

  // 말 막기
  check((await run('mute', '가람', '2', '도배')).ok === true && (await until(() => a.sys.some((s) => s.startsWith('muted:')))), 'mute: 막힌 사람에게 알린다');
  pass(800);
  a.send({ t: 'chat', text: '막힌 뒤의 말' });
  check(await until(() => a.sys.filter((s) => s.startsWith('muted:')).length >= 2), '막힌 사람이 전체 대화를 하면 안내문을 받는다');
  await settle(a); await settle(b);
  check(!b.chat.some((c) => c.endsWith('막힌 뒤의 말')), '막힌 사람의 전체 대화는 남에게 가지 않는다');
  const aEnt = server.game.ents.get(a.id)!;
  const before = a.sys.length;
  server.game.command(aEnt, { t: 'gchat', text: '길드 대화' });
  check(await until(() => a.sys.slice(before).some((s) => s.startsWith('muted:'))), '막힌 사람은 길드 대화도 막힌다 (명령을 감싼다)');
  check((await run('unmute', '가람')).ok === true, 'unmute');
  pass(800);
  a.send({ t: 'chat', text: '풀린 뒤의 말' });
  check(await until(() => b.chat.some((c) => c.endsWith('풀린 뒤의 말'))), '말 막기를 풀면 다시 전해진다');

  // 전체 공지
  await run('announce', '곧', '점검합니다');
  await run('announce', '--chat', '대화창', '공지');
  check(await until(() => a.sys.includes('adminNotice:곧 점검합니다') && b.sys.includes('adminChat:대화창 공지')), 'announce: 가운데 알림(adminNotice)과 대화창 줄(adminChat)이 모두에게 간다');

  // 내보내기: 끊기고, 자동 사냥으로 남지 않는다. 다시 들어올 수는 있다
  aEnt.auto = false;
  const bClosed = closed(b);
  check((await run('kick', '나래', '시험')).ok === true, 'kick');
  check(await bClosed === 4002 && b.sys.includes('kicked'), '내보내진 사람은 안내문을 받고 4002로 끊긴다');
  check(!(await run('who')).out?.includes('나래'), '내보내진 캐릭터는 월드에 남지 않는다');
  check((await tryJoin(port, TB)).welcome, '내보내진 사람은 다시 들어올 수 있다');

  // ---------- 3. 지급·회수 ----------
  const ledgerSum = (cur: string, dir: '+' | '-') => server.game.ledger.rows().filter((r) => r.cur === cur && r.why === 'admin' && r.dir === dir).reduce((s, r) => s + r.amount, 0);
  const gold0 = aEnt.gold;
  check((await run('give', '가람', 'gold', '500')).ok === true && aEnt.gold === gold0 + 500, `give gold: 지갑에 더해진다 (${gold0} → ${aEnt.gold})`);
  check((await run('take', '가람', 'gold', '200')).ok === true && aEnt.gold === gold0 + 300, 'take gold: 지갑에서 빠진다');
  const big = await run('take', '가람', 'gold', '999999');
  check(aEnt.gold === 0 && /-400/.test(big.out ?? ''), `take: 가진 것보다 많이 거두면 가진 만큼만 (${big.out})`);
  check(ledgerSum('gold', '+') === 500 && ledgerSum('gold', '-') === 600, `장부에 gold의 'admin' 줄이 +500 / -600으로 적힌다 (${ledgerSum('gold', '+')} / ${ledgerSum('gold', '-')})`);
  await run('give', '가람', MAT, '3');
  await run('take', '가람', MAT, '1');
  check(server.game.bag.count(aEnt, MAT) === 2 && ledgerSum(`item:${MAT}`, '+') === 3 && ledgerSum(`item:${MAT}`, '-') === 1, `아이템(${MAT})도 가방을 지나 장부에 'admin'으로 적힌다`);
  check(await until(() => a.sys.some((s) => s.startsWith('adminGive:gold:500')) && a.sys.some((s) => s.startsWith('adminTake:gold:200'))), '받는 사람에게 지급·회수를 알린다');
  check(!server.game.ledger.rows().some((r) => (r.why === 'other' || r.why === 'tick') && r.cur === 'gold'), '지급·회수가 원인 모름(other, tick)으로 새지 않는다');
  check((await run('give', '가람', 'nothing', '1')).ok === false && (await run('give', '가람', 'gold', '-5')).ok === false, '모르는 것이나 잘못된 수는 거절한다');
  // 접속해 있지 않은 캐릭터: 다음 접속 때 같은 통로로
  const pend = await run('give', '다솜', 'gold', '300');
  check(/다음 접속/.test(pend.out ?? '') && server.game.sanctions.pending.get(keyOf(TC))?.length === 1, '접속해 있지 않은 캐릭터에게는 미뤄 둔다');
  const c = await connect(port, undefined, TC);
  const cEnt = server.game.ents.get(c.id)!;
  check(cEnt.gold === 310 && !server.game.sanctions.pending.has(keyOf(TC)) && ledgerSum('gold', '+') === 800, `접속하면 미뤄 둔 것이 지갑을 지나 들어오고 장부에 적힌다 (골드 ${cEnt.gold})`);
  c.ws.close();

  // ---------- 4. 신고 ----------
  const reports = await run('reports');
  const id = /\[([0-9a-z]+)\]/.exec(reports.out ?? '')?.[1] ?? '';
  check(!!id && /나래 → 가람/.test(reports.out ?? '') && /신고될 말/.test(reports.out ?? ''), `reports: 신고와 그때의 대화를 보여 준다 (id ${id})`);
  check((await run('resolve', id, '경고함')).ok === true && /처리하지 않은 신고가 없습니다/.test((await run('reports')).out ?? ''), 'resolve: 처리한 신고는 기본 목록에서 빠진다');
  check(/처리함: 시험 · 경고함/.test((await run('reports', '--all')).out ?? ''), 'reports --all: 처리 표시와 메모가 보인다');

  // ---------- 2(이어서). 차단 ----------
  const aClosed = closed(a);
  check((await run('ban', '가람', '2', '욕설')).ok === true, 'ban 이름 2(시간)');
  check(await aClosed === 4003 && a.sys.some((s) => s.startsWith('banned:')), '차단된 사람은 안내문을 받고 4003으로 끊긴다');
  const again = await tryJoin(port, TA);
  check(!again.welcome && again.code === 4003 && again.sys.some((s) => /^banned:1[12]\d$/.test(s)), `차단된 토큰으로는 들어오지 못하고 남은 시간을 받는다 (${again.sys.join(',')})`);
  check(/차단: .*욕설/.test((await run('find', '가람')).out ?? ''), 'find: 차단 기간과 사유가 보인다');
  // 주소 차단: 시험의 손님은 모두 127.0.0.1이다
  const d = await connect(port, '손님');
  const dClosed = closed(d);
  check((await run('banip', '127.0.0.1', '30m')).ok === true && (await dClosed) === 4003, 'banip: 그 주소의 연결을 끊는다');
  check((await tryJoin(port)).code === 4003 && (await tryJoin(port, TB)).code === 4003, '막힌 주소에서는 손님도 저장된 캐릭터도 들어오지 못한다');
  check((await run('unbanip', '127.0.0.1')).ok === true && (await tryJoin(port, TB)).welcome, 'unbanip: 풀면 다시 들어온다');
  check((await run('ban', '나래', 'perm')).ok === true && /영구/.test((await run('find', '나래')).out ?? ''), 'ban perm: 영구 차단');
  check((await run('mute', '다솜', '1d', '시험')).ok === true, '접속하지 않은 사람도 말을 막을 수 있다');
  check((await run('ban', '없는사람', '1')).out?.includes('없습니다') === true && (await run('ban', '가람', '이상한기간')).ok === false, '없는 이름과 읽지 못하는 기간을 알린다');
  check(parseSpan('perm') === 0 && parseSpan('30m') === 1800000 && parseSpan('12h') === 43200000 && parseSpan('2') === 7200000 && parseSpan('7d') === 604800000 && parseSpan('x') === null && parseSpan('-1') === null, '기간 읽기: perm, 30m, 12h, 2(시간), 7d');

  // ---------- 5. 다시 켜도 남는다 ----------
  const logBefore = server.game.sanctions.log.length;
  await server.close();
  check(!fs.existsSync(file), '끌 때 토큰 파일을 지운다 (다음에 켜면 새로 만든다)');
  server = await startServer(0, { store, admin: { dir }, now: () => t });
  port = server.port;
  check(fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() === server.admin.token, '다시 켜면 새 토큰 파일');
  check((await tryJoin(port, TA)).code === 4003 && (await tryJoin(port, TB)).code === 4003, '다시 켜도 차단이 남는다 (시간 차단, 영구 차단)');
  check(!!server.game.sanctions.muted(keyOf(TC), ''), '다시 켜도 말 막기가 남는다');
  check(/처리하지 않은 신고가 없습니다/.test((await run('reports')).out ?? ''), '다시 켜도 신고 처리 표시가 남는다');
  check(server.game.sanctions.log.length >= logBefore && server.game.sanctions.log.some((r) => r.cmd === 'ban' && r.args[0] === '가람'), '다시 켜도 관리자 기록의 끝부분이 남는다');
  check((await run('unban', '가람')).ok === true && (await tryJoin(port, TA)).welcome, 'unban: 풀면 다시 들어온다');

  // 기록 파일: 모든 명령이 처리 전(start)과 뒤(done) 두 줄로, 누가·무엇을·언제
  const rows = fs.readFileSync(path.join(dir, AUDIT_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { at: number; by: string; from: string; cmd: string; phase: string });
  const starts = rows.filter((r) => r.phase === 'start'), dones = rows.filter((r) => r.phase === 'done');
  check(starts.length === dones.length && starts.length >= 30 && rows.every((r) => r.by && r.from && r.cmd && r.at > 0), `기록 파일에 모든 명령이 누가·어디서·무엇을·언제로 남는다 (${starts.length}건)`);
  check(rows.some((r) => r.cmd === 'who') && rows.some((r) => r.cmd === 'give') && rows.some((r) => r.cmd === 'reports'), '읽기만 하는 명령도 기록된다');
  // 기록을 적지 못하면 명령을 하지 않는다 (기록 파일 자리에 폴더가 있다)
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-admin-bad-'));
  fs.mkdirSync(path.join(bad, AUDIT_FILE));
  const noLog = createAdmin({ game: server.game, store, people: () => [], drop: () => 0, broadcast: () => {}, save: () => {} }, { dir: bad });
  const refused = noLog.run('banip', ['10.0.0.9', 'perm'], '시험', 'local');
  check(refused.ok === false && !server.game.sanctions.banned(null, '10.0.0.9'), '관리자 기록을 적지 못하면 명령을 처리하지 않는다');
  noLog.close();
  removeTemp(bad);
  // 저장 폴더가 없는 서버(DB=memory): 토큰을 따로 주지 않으면 통로가 닫혀 있다
  const closedOne = await startServer(0, { store: new MemoryStore() });
  check((await post(closedOne.port, { cmd: 'who' }, { 'x-admin-token': closedOne.admin.token })).status === 404, '토큰 파일을 둘 곳이 없는 서버는 관리자 통로를 열지 않는다');
  await closedOne.close();
} finally {
  await server.close();
  removeTemp(dir);
}
