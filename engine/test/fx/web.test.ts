// 웹 출시의 바탕 (docs/genre-features.md 5.2): 서버 쪽(engine/server/net/web.ts)과 화면의 셈(설정·튜토리얼·키 재설정·플랫폼 접점·인증).
//   화면 오류: 개인정보 빼기, 같은 오류 묶기(빌드·줄 번호가 달라도), HTTP 끝점의 크기·속도 제한과 CORS, 관리자 목록·지우기
//   탭 숨김: 자리 비움 알림(나중에 들어온 사람에게도), 돌아옴, 숨긴 채 끊김, 게임의 playerVisible 사건
//   약관 동의: 묻기, 틀린 버전은 받지 않음, 저장 키 단위로 남음(다시 접속해도), 손님은 적지 않음
//   내 데이터: 내보내기(저장·월드의 몫·신고는 남의 말 빼고), 잦으면 기다림, 손님, 삭제 요청 → 취소 → 다시 → 유예 → 실행 → 기록,
//              다른 사람과 얽힌 것(맡아 둔 우편, 신고의 이름, 차단의 이름), SQLite 저장소의 표(스키마 2)
//   인증 접점: 다른 ServerAuth를 꽂으면 그것이 저장 키를 정한다
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { WebSocket } from 'ws';
import type { ServerMsg } from '../../shared/protocol';
import { startServer } from '../../server/net/server';
import { errorRow, scrub, shortUa, ERASED_CLOSE } from '../../server/net/web';
import { personalData } from '../../server/game/personal';
import { MemoryStore, SqliteStore } from '../../server/store';
import { SCHEMA } from '../../server/store/sqlite';
import { check, connect, removeTemp, settle, until, type Peer } from '../harness';
import { FAR_STEPS, QUALITY, defaultSettings, gfxOf, keyLabel, qualityOf, readSettings, writeSettings } from '../../client/hud/settingscalc';
import { condMet, readProgress, writeProgress } from '../../client/hud/tutorialcalc';
import { scrubLocal } from '../../client/errorscalc';
import { actionOf, bindKey, keyFor, keyList, onKey, runKey, setKeyMap } from '../../client/bus';
import { adBreak, auth, gameplayStart, gameplayStop, guestAuth, memoryPlatform, onAd, onBreakPoint, breakPoint, rewarded, setPlatform } from '../../client/platform';

const keyOf = (t: string) => createHash('sha256').update(t).digest('hex');
const DAY = 86_400_000;

// ---------- 화면 오류: 빼기와 묶기 ----------
{
  const s = scrub('at x (http://192.168.0.7:3002/assets/index-Ab12Cd34.js?v=3#f:10:5) token 0123456789abcdef0123 mail me@example.com ip 10.1.2.3 n 1234567');
  check(!s.includes('192.168') && !s.includes('?v=3') && !s.includes('0123456789abcdef') && !s.includes('me@example.com') && !s.includes('10.1.2.3') && !s.includes('1234567') && s.includes('/assets/index-Ab12Cd34.js'),
    `화면 오류의 글에서 호스트·쿼리·토큰·이메일·IP·긴 숫자를 뺀다 → ${s}`);
  check(scrubLocal('https://h.example/p?token=abc#x 0123456789abcdef01') === 'https://h.example/p <hex>', '화면에서도 보내기 전에 쿼리와 토큰을 뺀다');
  check(shortUa('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36') === 'Chrome 142 Windows'
    && shortUa('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1') === 'Safari 18 iPhone', '브라우저는 이름·큰 버전·기기 종류로만 줄인다');
  const a = errorRow({ kind: 'error', msg: 'Cannot read properties of undefined (reading \'x\') at 12', stack: 'TypeError: boom\n    at draw (http://h/assets/index-AAAA1111.js:10:20)', build: 'index-AAAA1111.js', n: 1 }, 'Chrome/142 Windows', 1);
  const b = errorRow({ kind: 'error', msg: 'Cannot read properties of undefined (reading \'y\') at 99', stack: 'TypeError: boom\n    at draw (http://h/assets/index-BBBB2222.js:55:7)', build: 'index-BBBB2222.js', n: 3 }, '', 2);
  const c = errorRow({ kind: 'rejection', msg: 'Cannot read properties of undefined (reading \'x\') at 12', stack: '' }, '', 3);
  check(!!a && !!b && !!c && a.sig === b.sig && a.sig !== c.sig && b.n === 3, `같은 오류는 빌드·줄 번호·숫자가 달라도 한 서명 (${a?.sig}), 종류가 다르면 다른 서명`);
  check(errorRow({ kind: 'nope', msg: 'x' }, '', 0) === null && errorRow({ kind: 'error', msg: '' }, '', 0) === null && errorRow('x', '', 0) === null, '모양이 아닌 본문은 받지 않는다');
  check((errorRow({ kind: 'error', msg: 'x'.repeat(5000), stack: Array.from({ length: 40 }, (_, i) => `at f${i} (a.js:1:1)`).join('\n') }, '', 0)?.msg.length ?? 0) === 300
    && errorRow({ kind: 'error', msg: 'x', stack: Array.from({ length: 40 }, (_, i) => `at f${i} (a.js:1:1)`).join('\n') }, '', 0)!.stack.split('\n').length === 12, '문장은 300자, 스택은 12줄까지');
}

// ---------- 설정·튜토리얼·키 재설정의 셈 ----------
{
  const d = readSettings(null);
  check(JSON.stringify(d) === JSON.stringify(defaultSettings()) && d.gfx.shadows && d.gfx.pixelRatio === 2 && d.gfx.far === 320 && d.ui === 1 && d.calm === null, '설정의 처음 값은 이 창이 생기기 전과 같다 (그림자, 배율 2, 320m, 배율 1)');
  check(qualityOf(d.gfx) === 'high' && qualityOf(gfxOf('low')) === 'low' && qualityOf({ ...QUALITY.low, far: 320 }) === 'custom', '품질 단계를 알아보고, 고쳤으면 직접 고름');
  const r = readSettings(JSON.stringify({ gfx: { shadows: false, pixelRatio: 9, far: 170 }, ui: 1.2, calm: true, keys: { M: 'K', bad: 5 }, extra: { tags: false } }), 1.5);
  check(!r.gfx.shadows && r.gfx.pixelRatio === 1.5 && r.gfx.far === 200 && r.ui === 1.15 && r.calm === true && r.keys.m === 'k' && !('bad' in r.keys) && r.extra.tags === false, '저장한 값을 읽을 때 가장 가까운 단계로, 상한까지, 이상한 키는 버린다');
  check(JSON.stringify(readSettings('{broken')) === JSON.stringify(d) && readSettings(writeSettings(r), 1.5).gfx.far === 200 && FAR_STEPS.includes(r.gfx.far), '깨진 글은 처음 값, 쓴 것은 그대로 읽힌다');
  check(keyLabel('m') === 'M' && keyLabel(' ') === 'Space' && keyLabel('tab') === 'Tab', '키 이름');
  check(condMet({ cmd: 'move' }, { kind: 'cmd', name: 'move' }) && !condMet({ cmd: 'move' }, { kind: 'cmd', name: 'attack' }) && condMet({ msg: 'sys:levelUp' }, { kind: 'msg', name: 'sys:levelUp' })
    && condMet({ key: 'm' }, { kind: 'key', name: 'M' }) && condMet({ test: () => true }, { kind: 'tick' }) && !condMet(undefined, { kind: 'tick' }), '튜토리얼의 조건: 명령, 안내문, 단축키, 물음');
  check(readProgress(null, 4).i === 0 && readProgress('2', 4).i === 2 && readProgress('9', 4).i === 0 && readProgress('skip', 4).end === 'skip' && writeProgress({ i: 4, end: 'done' }) === 'done', '튜토리얼의 진행 저장');
  // 키 재설정 (engine/client/bus.ts)
  let menu = 0, game = 0;
  bindKey('m', () => { menu++; });
  onKey('g', () => { game++; }, () => '게임 기능');
  runKey('M');
  setKeyMap({ m: 'k' });
  const noOld = !runKey('m'); runKey('k');
  check(menu === 2 && noOld && keyFor('m') === 'k' && actionOf('k') === 'm' && actionOf('m') === null, '키 재설정: M을 K로 옮기면 K가 메뉴를 열고 M은 아무것도 하지 않는다');
  setKeyMap({});
  runKey('m'); runKey('g');
  check(menu === 3 && game === 1 && keyList().some((k) => k.action === 'g' && !k.engine && k.label?.() === '게임 기능'), '처음대로 돌리면 M이 다시 메뉴, 게임의 키는 이름과 함께 목록에');
}

// ---------- 플랫폼 접점·인증 (화면 쪽: memory 구현으로) ----------
{
  const p = memoryPlatform();
  setPlatform(p);
  const a = guestAuth();
  const t1 = await a.token(), t2 = await a.token();
  check(!!t1 && t1 === t2 && /^[0-9a-f]{32}$/.test(t1) && p.data.get('secret:token') === t1 && a.deviceBound(), '손님 인증: 처음에 토큰을 만들어 비밀 저장의 token 칸에 두고 다음부터 그것을 낸다, 진행은 기기에 묶여 있다');
  await a.adopt('f'.repeat(32));
  const t3 = await a.token();
  await a.forget();
  const t4 = await a.token();
  check(t3 === 'f'.repeat(32) && t4 !== t3 && auth().kind === 'guest', '옮겨 받은 토큰을 간직하고, 버리면 새로 만든다');
  const ads: boolean[] = [], points: string[] = [];
  onAd((on) => ads.push(on));
  onBreakPoint((w) => points.push(w));
  gameplayStart(); gameplayStart();
  await adBreak('roundEnd');
  const ok = await rewarded('revive');
  gameplayStop(); gameplayStop();
  breakPoint('respawn');
  check(p.did.join() === 'ads:gameplayStart,ads:gameplayStop,ads:adBreak:roundEnd,ads:gameplayStart,ads:gameplayStop,ads:rewarded:revive,ads:gameplayStart,ads:gameplayStop' && ok === false && ads.join() === 'true,false,true,false' && points.join() === 'respawn',
    '광고 구간: 게임 구간 알림은 잇달아 두 번 가지 않고, 광고 동안 닫혔다가 다시 열리며, 소리를 멈추는 사건이 오간다. 기본 보상형은 false(보상 없음), 광고 지점은 사건으로만');
}

// ---------- 서버: 탭 숨김, 약관, 내 데이터, 화면 오류 ----------
let clock = Date.now();
const now = () => clock;
const store = new MemoryStore();
const TA = 'web-test-token-aaaa-0001', TB = 'web-test-token-bbbb-0002';
store.savePlayer(keyOf(TA), { name: '가온', lv: 3, exp: 5, gold: 40, cls: '' });
store.savePlayer(keyOf(TB), { name: '나린', lv: 2, gold: 9, cls: '' });
const server = await startServer(0, { store, now, game: { now } });
const g = server.game;
const visible: string[] = [];
g.on('playerVisible', (p, on) => visible.push(`${p.name}:${on}`));
const probe: string[] = [];
personalData(g).push({ name: 'probe', get: (pid) => (pid === keyOf(TA) ? { mine: 1 } : undefined), erase: (pid) => probe.push(pid) });
type Got = { afk: { ids: number[]; on: boolean }[]; consent: (string | null)[]; data: unknown[]; state: { due: number | null; days: number }[]; close: Promise<number> };
async function join(token?: string, name?: string): Promise<Peer & Got> {
  const got: Got = { afk: [], consent: [], data: [], state: [], close: Promise.resolve(0) };
  const p = await connect(server.port, name, token, (m: ServerMsg) => {
    if (m.t === 'afk') got.afk.push({ ids: m.ids, on: m.on });
    else if (m.t === 'consent') got.consent.push(m.v);
    else if (m.t === 'mydata') { if (m.a === 'export') got.data.push(m.data); else got.state.push({ due: m.due, days: m.days }); }
  });
  got.close = new Promise((done) => p.ws.on('close', (c) => done(c)));
  return Object.assign(p, got);
}
/** 화면 오류를 보낸다 */
function post(body: string, headers: Record<string, string> = {}): Promise<{ status: number; cors: string }> {
  return new Promise((done) => {
    const req = http.request({ host: '127.0.0.1', port: server.port, path: '/client-error', method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/142.0 Safari/537', ...headers } }, (res) => { res.resume(); res.on('end', () => done({ status: res.statusCode ?? 0, cors: String(res.headers['access-control-allow-origin'] ?? '') })); });
    req.on('error', () => done({ status: 0, cors: '' }));
    req.end(body);
  });
}
const admin = (cmd: string, ...args: string[]) => server.admin.run(cmd, args, 'tester', 'test');
try {
  const a = await join(TA), b = await join(TB);
  // ---- 탭 숨김 ----
  a.send({ t: 'vis', on: true }); b.send({ t: 'vis', on: true });
  await settle(a); await settle(b);
  a.send({ t: 'vis', on: false });
  check(await until(() => b.afk.some((x) => x.on && x.ids.includes(a.id))), '숨기면 다른 사람에게 자리 비움이 간다');
  const c = await join(undefined, '다솜');
  c.send({ t: 'vis', on: true });
  check(await until(() => c.afk.some((x) => x.on && x.ids.includes(a.id))), '나중에 들어온 사람은 처음 알릴 때 지금 자리 비움인 사람의 목록을 받는다');
  a.send({ t: 'vis', on: false });
  await settle(a);
  a.send({ t: 'vis', on: true });
  check(await until(() => b.afk.some((x) => !x.on && x.ids.includes(a.id))) && b.afk.filter((x) => x.on && x.ids.includes(a.id)).length === 1, '돌아오면 풀렸다고 알린다 (같은 상태를 두 번 보내도 한 번만)');
  check(visible.join() === '가온:false,가온:true', `게임에 playerVisible 사건이 간다 (${visible.join()})`);
  c.send({ t: 'vis', on: false });
  await until(() => b.afk.some((x) => x.on && x.ids.includes(c.id)));
  c.ws.close();
  check(await until(() => b.afk.some((x) => !x.on && x.ids.includes(c.id))), '숨긴 채 끊기면 자리 비움이 풀렸다고 알린다');

  // ---- 약관 동의 ----
  a.send({ t: 'consent', a: 'ask' });
  check(await until(() => a.consent.length === 1) && a.consent[0] === null, '처음에는 동의한 버전이 없다');
  a.send({ t: 'consent', a: 'agree', v: 'old-1' });
  await settle(a);
  a.send({ t: 'consent', a: 'agree', v: 'fx-2' });
  check(await until(() => a.consent.length === 2) && a.consent[1] === 'fx-2' && store.consent(keyOf(TA))?.v === 'fx-2', '지금 버전(LEGAL.version)에만 동의를 받고, 저장 키에 적는다 (틀린 버전은 무시)');
  const guest = await join(undefined, '손님');
  guest.send({ t: 'consent', a: 'agree', v: 'fx-2' });
  guest.send({ t: 'consent', a: 'ask' });
  check(await until(() => guest.consent.length === 2) && guest.consent[0] === 'fx-2' && guest.consent[1] === null, '손님(저장 키 없음)은 동의를 받되 적지 않는다');

  // ---- 내 데이터: 내보내기 ----
  b.send({ t: 'chat', text: '안녕하세요' });
  a.send({ t: 'chat', text: '내가 한 말' });
  await settle(a); await settle(b);
  b.send({ t: 'report', id: a.id });
  await settle(b);
  a.send({ t: 'report', id: b.id });
  await settle(a);
  g.mail.sendTo(keyOf('nobody-token-zzzz-0009'), 'daily', [], { gold: 1 }); // 접속하지 않은 다른 사람의 우편 (남는다)
  a.send({ t: 'mydata', a: 'export' });
  check(await until(() => a.data.length === 1), '내보내기를 받았다');
  const ex = a.data[0] as { format: string; key: string; save: { name: string }; consent: { v: string }; world: Record<string, unknown>; reports: { role: string; lines?: string[] }[] };
  check(ex.format === 'mydata/1' && ex.key === keyOf(TA) && ex.save.name === '가온' && ex.consent.v === 'fx-2' && (ex.world.probe as { mine: number }).mine === 1, '내보내기: 저장 키, 캐릭터(지금 값), 동의, 월드에 둔 몫(개인 데이터 칸)');
  const roles = ex.reports.map((r) => r.role).sort().join();
  check(roles === 'reported,reporter' && !JSON.stringify(ex.reports.find((r) => r.role === 'reporter')).includes('안녕하세요') && !JSON.stringify(ex).includes('나린'), `신고는 한 것과 당한 것 모두, 남의 이름과 남이 한 말은 빼고 (${roles})`);
  a.send({ t: 'mydata', a: 'export' });
  check(await until(() => a.sys.some((s) => s.startsWith('mydataWait'))) && a.data.length === 1, '내보내기는 30초에 한 번');
  guest.send({ t: 'mydata', a: 'export' });
  check(await until(() => guest.sys.includes('mydataGuest')), '손님은 내보낼 것이 없다고 알린다');

  // ---- 내 데이터: 삭제 요청 → 취소 → 다시 → 유예 → 실행 ----
  g.sanctions.mute('k:' + keyOf(TA), 3600_000, '시험', 'tester', '가온');
  a.send({ t: 'mydata', a: 'status' });
  check(await until(() => a.state.length === 1) && a.state[0].due === null && a.state[0].days === 7, '상태: 요청 없음, 유예 7일(PRIVACY.eraseDays)');
  a.send({ t: 'mydata', a: 'erase' });
  check(await until(() => a.state.length === 2) && a.state[1].due === clock + 7 * DAY && a.sys.some((s) => s === 'eraseAsked:7'), '삭제를 요청하면 7일 뒤로 잡힌다');
  clock += 6_000;
  a.send({ t: 'mydata', a: 'cancel' });
  check(await until(() => a.state.length === 3) && a.state[2].due === null && a.sys.includes('eraseCanceled') && store.eraseOf(keyOf(TA))?.state === 'cancel', '유예 동안 거둘 수 있다');
  clock += 6_000;
  a.send({ t: 'mydata', a: 'erase' });
  await until(() => a.state.length === 4);
  check((await admin('erase')).out.includes('가온'), '관리자: 기다리는 삭제 요청 목록');
  clock += 6 * DAY;
  check(/0건/.test((await admin('erase', 'sweep')).out) && !!store.loadPlayer(keyOf(TA)), '유예가 끝나기 전에는 지우지 않는다');
  clock += DAY + 1000;
  check(/1건/.test((await admin('erase', 'sweep')).out), '유예가 끝나면 실행한다');
  check(await a.close === ERASED_CLOSE && a.sys.includes('erased'), `접속해 있었으면 안내와 함께 연결을 끊는다 (닫힘 ${ERASED_CLOSE}: 화면은 토큰을 지운다)`);
  check(store.loadPlayer(keyOf(TA)) === null && store.keyOfName('가온') === null && store.consent(keyOf(TA)) === null, '캐릭터 저장과 동의 기록이 지워지고 이름도 풀린다');
  const reps = store.reports(10);
  check(reps.length === 2 && reps.every((r) => r.byKey !== keyOf(TA) && r.targetKey !== keyOf(TA)) && reps.some((r) => r.target === '-' && r.lines.length > 0) && reps.some((r) => r.by === '-'), '신고 기록: 이름과 키를 지우고 대화 줄은 남긴다 (제재 근거)');
  check(g.sanctions.mutes.get('k:' + keyOf(TA))?.name === '' && probe.includes(keyOf(TA)), '말 막기는 해시로 남기되 이름을 지우고, 개인 데이터 칸의 erase가 불린다');
  check(personalData(g).find((x) => x.name === 'mailbox')?.get(keyOf('nobody-token-zzzz-0009')) !== undefined, '다른 사람의 맡아 둔 우편은 그대로');
  const log = (await admin('erase', 'log')).out;
  check(/지움 {2}키 [0-9a-f]{10} {2}요청 .+ {2}실행 /.test(log) && !log.includes('가온'), '삭제 기록: 키 해시와 요청·실행 시각만 (이름 없음)');
  const again = await join(TA);
  check(again.name !== '가온', `같은 토큰으로 다시 오면 새 캐릭터다 (${again.name})`);
  again.ws.close();

  // ---- 관리자: 대신 받기·거두기·곧바로 ----
  check((await admin('erase', 'ask', '나린', '3')).out.includes('나린') && store.eraseOf(keyOf(TB))?.due === clock + 3 * DAY, 'erase ask: 메일로 받은 요청을 대신 적는다 (일수)');
  check((await admin('erase', 'cancel', '나린')).out.includes('거뒀') && store.eraseOf(keyOf(TB))?.state === 'cancel', 'erase cancel');
  check((await admin('erase', 'now', '나린')).out.includes('지웠') && (await b.close) === ERASED_CLOSE && store.loadPlayer(keyOf(TB)) === null, 'erase now: 유예 없이 곧바로');

  // ---- 화면 오류 끝점 ----
  const body = (msg: string, build = 'index-AAAA1111.js') => JSON.stringify({ kind: 'error', msg, stack: `Error: ${msg}\n at f (http://192.168.1.2:3017/assets/${build}:1:2)`, where: '/', build });
  const r1 = await post(body('boom 1')), r2 = await post(body('boom 2', 'index-BBBB2222.js')), r3 = await post(body('other thing'));
  check(r1.status === 204 && r2.status === 204 && r3.status === 204 && r1.cors === '*', '화면 오류를 받는다 (204, 다른 출처에서도: CORS *)');
  const list = (await admin('errors')).out;
  check(/2개/.test(list) && /2회 {2}error {2}boom 1/.test(list) && !list.includes('192.168'), `관리자 errors: 같은 오류는 한 줄로 세고 주소의 호스트는 빠진다\n${list}`);
  check((await post('x'.repeat(9000))).status === 413 && (await post('{"kind":"nope"}')).status === 400, '8KB를 넘으면 413, 모양이 아니면 400');
  const codes: number[] = [];
  for (let i = 0; i < 12; i++) codes.push((await post(body('flood'))).status);
  check(codes.filter((x) => x === 429).length >= 5, `한 주소에서 잦으면 429 (${codes.join(',')})`);
  const sig = /\[([0-9a-f]{12})\] 2회/.exec(list)?.[1] ?? '';
  check((await admin('errors', 'clear', sig)).out.includes('1개') && !(await admin('errors')).out.includes(sig), 'errors clear 서명: 고친 오류를 지운다');
  guest.ws.close();
} finally {
  await server.close();
}

// ---------- SQLite: 스키마 2의 표 ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-web-'));
  try {
    const file = path.join(dir, 'g.db');
    const old = new SqliteStore(file, SCHEMA.slice(0, 1));
    old.savePlayer('k1', { name: '옛사람', lv: 2 });
    old.saveReport({ at: 1, by: '옛사람', byKey: 'k1', target: '남', targetKey: 'k2', lines: ['남의 말'] });
    old.close();
    const s = new SqliteStore(file);
    check(s.schemaVersion() === SCHEMA.length && SCHEMA.length >= 2 && s.loadPlayer('k1')?.name === '옛사람', `옛 DB(스키마 1)를 열면 웹의 표를 더한다 (스키마 ${s.schemaVersion()})`);
    s.setConsent('k1', 'v1', 5);
    s.putErase({ key: 'k1', name: '옛사람', asked: 1, due: 2, state: 'wait', done: 0 });
    const row = { sig: 'aaaa', kind: 'error', msg: 'm', stack: '', where: '/', build: 'b', ua: 'u', n: 1, first: 1, last: 1 };
    s.addClientError(row, 2); s.addClientError({ ...row, n: 4, last: 9 }, 2); s.addClientError({ ...row, sig: 'bbbb', last: 3 }, 2); s.addClientError({ ...row, sig: 'cccc', last: 4 }, 2);
    const errs = s.clientErrors(10);
    check(errs.length === 2 && errs[0].sig === 'aaaa' && errs[0].n === 5 && !errs.some((e) => e.sig === 'bbbb'), '같은 서명은 수를 더하고, 상한을 넘으면 마지막 시각이 가장 오래된 묶음부터 지운다');
    check(s.anonymizeReports('k1') === 1 && s.reports(5)[0].by === '-' && s.reports(5)[0].lines[0] === '남의 말' && s.reportsOf('k1').length === 0, '신고의 이름 지우기 (SQLite)');
    s.deletePlayer('k1');
    check(s.loadPlayer('k1') === null && s.consent('k1') === null && s.erasePending().length === 1 && s.clearClientErrors('all') === 2, '캐릭터와 동의를 지우고, 삭제 요청은 남는다');
    s.close();
  } finally { removeTemp(dir); }
}

// ---------- 인증 접점: 다른 ServerAuth ----------
{
  const st = new MemoryStore();
  st.savePlayer('portal:42', { name: '포털사람', lv: 5 });
  const srv = await startServer(0, { store: st, auth: { kind: 'portal', keyOf: (m) => (typeof m.token === 'string' && m.token.startsWith('jwt-') ? 'portal:' + m.token.slice(4) : m.token ? undefined : null) } });
  try {
    const p = await connect(srv.port, undefined, 'jwt-42');
    const refused = await new Promise<number>((done) => { const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`); ws.on('open', () => ws.send(JSON.stringify({ t: 'join', token: 'bad-token-xxxxxxxx' }))); ws.on('close', (c) => done(c)); });
    check(p.name === '포털사람' && refused === 4001, '인증 접점을 꽂으면 그것이 저장 키를 정한다 (증표 → 키, 받지 않는 증표는 닫는다)');
    p.ws.close();
  } finally { await srv.close(); }
}
