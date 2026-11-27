// 운영 도구와 고객지원 (docs/genre-features.md 5.5, 시험용 내용 위에서):
//   1. 분석 사건: 속성의 개인정보 검사, 기본 사건(접속·종료·처음 옴·레벨), 저장 묶음과 함께 적힘, 보관 기간, 내 데이터 삭제
//   2. 집계: 잔존(D1·D7·D30)·일별 활성·퍼널의 셈 / 부하 도구의 봇 접속자로 D1 표가 나온다 (scripts/load/clients.mjs)
//   3. 역할과 웹 관리 화면: 보기 전용·운영·전체, 같은 PC의 그 페이지만 (Host·Origin·터널의 머리), 페이지와 API
//   4. 문의·제재 이의 (support 모듈): 티켓, 길이·빈도·금칙어, 답(알림·우편), 말 막기 이의, 차단된 사람의 이의(접속 메시지에 실어)
//   5. 봇·매크로 의심 점수
//   6. 경보: 임계값 → 가짜 웹훅 수신기, 되풀이 억제와 풀림
//   7. 사고 리허설: 복제 버그 → 장부가 통로 밖의 변화를 잡음(경보) → 킬 스위치로 거래 중단 → 그 사람만 롤백 → 보상 우편 → 공지
//   8. 스키마: 목록 길이만큼 올라가고 운영 도구의 표가 있다
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket } from 'ws';
import { RPG_MODULES, type ModuleId } from '../../shared/modules';
import type { ServerMsg } from '../../shared/protocol';
import { Game } from '../../server/game/game';
import { cleanProps } from '../../server/game/systems/analytics';
import { ROLE_FILES, roleFor } from '../../server/net/admin';
import { checkRule, startAlerts } from '../../server/net/alerts';
import { daily, funnel, retention } from '../../server/net/stats';
import { Suspects, scoreOf } from '../../server/net/suspect';
import { startServer, type Running } from '../../server/net/server';
import { MemoryStore, SqliteStore } from '../../server/store';
import { SCHEMA } from '../../server/store/sqlite';
import type { EventRow } from '../../server/store/types';
import { check, connect, removeTemp, settle, until, type Peer } from '../harness';

const root = path.resolve(import.meta.dirname, '../../..');
const keyOf = (t: string) => createHash('sha256').update(t).digest('hex');
const DAY = 86_400_000;
const MODS: ModuleId[] = [...RPG_MODULES, 'support'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-ops5-'));

/** 관리자 통로나 웹 관리 화면에 보낸다 (머리를 정해서) */
function req(port: number, p: string, method: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; text: string; json: Record<string, unknown> | null; headers: http.IncomingHttpHeaders }> {
  return new Promise((done, fail) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const h: Record<string, string> = { ...headers };
    if (payload !== undefined) { h['content-type'] ??= 'application/json'; h['content-length'] = String(Buffer.byteLength(payload)); }
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: h }, (res) => {
      const parts: Buffer[] = [];
      res.on('data', (c: Buffer) => parts.push(c));
      res.on('end', () => { const text = Buffer.concat(parts).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* 글 */ } done({ status: res.statusCode ?? 0, text, json, headers: res.headers }); });
    });
    r.on('error', fail);
    r.end(payload);
  });
}
/** 따로 된 연결로 접속 메시지 하나를 보내고 닫힐 때까지 받은 것 */
function joinOnce(port: number, msg: Record<string, unknown>): Promise<{ code: number; msgs: ServerMsg[] }> {
  return new Promise((done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`), msgs: ServerMsg[] = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', ...msg })));
    ws.on('message', (d) => { const m = JSON.parse(d.toString()) as ServerMsg; msgs.push(m); if (m.t === 'welcome') ws.close(); });
    ws.on('close', (code) => done({ code, msgs }));
    ws.on('error', () => { /* close가 뒤따른다 */ });
  });
}
/** 부하 도구의 가짜 접속자 (scripts/load/clients.mjs)를 다른 프로세스로 n명, s초 */
function bots(port: number, n: number, s: number, tag: string): Promise<string> {
  return new Promise((done) => {
    const p = spawn(process.execPath, [path.join(root, 'scripts', 'load', 'clients.mjs'), String(port), String(n), 'field', String(s), '0', tag], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (c: Buffer) => { out += c.toString(); });
    p.on('close', () => done(out.trim()));
  });
}

try {
  // ---------- 1. 분석 사건 ----------
  {
    const c = cleanProps({ lv: 3, ok: true, id: 'q_3', where: 'zone:2', note: '안녕 하세요', email: 'a b@x.y', Bad: 1, long: 'x'.repeat(41), n: NaN, obj: { a: 1 } });
    check(c.props.lv === 3 && c.props.ok === true && c.props.id === 'q_3' && c.props.where === 'zone:2' && !('note' in c.props) && !('email' in c.props) && !('long' in c.props) && !('n' in c.props) && !('obj' in c.props) && !('Bad' in c.props),
      `속성은 수·참거짓·짧은 표만 받는다: 띄어쓰기·한글이 든 글(자유 문장), 긴 글, 수가 아닌 수, 객체, 이상한 칸 이름은 뺀다 (뺀 것 ${c.dropped.join(',')})`);
    const many = cleanProps(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i])));
    check(Object.keys(many.props).length === 8, '한 사건의 속성은 8개까지');
    let T = Date.parse('2026-11-20T10:00:00Z');
    const g = new Game({ now: () => T });
    g.track('quest_done', { id: 'q1', text: '자유 문장은 안 됨' }, 'key-a');
    g.track('Bad Name', {}, 'key-a');
    g.track('server_start');
    const rows = g.analytics.drain();
    check(rows.length === 2 && rows[0].name === 'quest_done' && rows[0].key === 'key-a' && rows[0].props.id === 'q1' && !('text' in rows[0].props) && rows[1].key === '' && g.analytics.rejected === 2,
      '모양이 아닌 이름의 사건은 버리고, 자유 문장 속성은 빼고 센다. 누가 없으면 서버의 사건(빈 키)');
    const bot = g.players.spawn('Bot1', true);
    g.track('x_y', {}, bot);
    check(g.analytics.pending === 0, '봇의 사건은 적지 않는다');
    for (let i = 0; i < 25_000; i++) g.track('spam', { i });
    check(g.analytics.pending <= 20_000 && g.analytics.overflow > 0, `가져가는 쪽이 없으면(시험·황금 실행) 쌓아 두는 줄에 끝이 있다 (${g.analytics.pending}줄, 버림 ${g.analytics.overflow})`);
  }

  // 서버: 기본 사건이 저장 묶음과 함께 SQLite에 적힌다
  {
    const file = path.join(tmp, 'ev', 'game.db');
    let T = Date.parse('2026-11-20T10:00:00Z');
    const store = new SqliteStore(file);
    const s = await startServer(0, { store, backup: false, admin: { token: 'x'.repeat(48) }, game: { now: () => T, modules: MODS }, now: () => T, alerts: false });
    const a = await connect(s.port, undefined, 'ev-token-aaaaaaaaaaaa');
    a.send({ t: 'class', id: Object.keys((await import('../../shared/defs')).CLASSES)[0] } as never);
    await settle(a);
    const e = [...s.game.ents.values()].find((x) => x.kind === 'p' && !x.bot)!;
    s.game.wallet.add(e, 'exp', 100000, 'quest');
    T += 90_000;
    a.ws.close();
    await until(() => ![...s.game.ents.values()].some((x) => x.kind === 'p' && !x.bot));
    const b = await connect(s.port, undefined, 'ev-token-aaaaaaaaaaaa');
    b.ws.close();
    await until(() => ![...s.game.ents.values()].some((x) => x.kind === 'p' && !x.bot));
    await s.close();
    store.close();
    const db = new DatabaseSync(file, { readOnly: true });
    const ev = db.prepare('SELECT key, sess, name, props FROM events ORDER BY id').all() as { key: string; sess: string; name: string; props: string }[];
    db.close();
    const names = ev.map((r) => r.name);
    const key = keyOf('ev-token-aaaaaaaaaaaa');
    const end = ev.find((r) => r.name === 'session_end');
    check(names.filter((n) => n === 'first_join').length === 1 && names.filter((n) => n === 'session_start').length === 2 && names.filter((n) => n === 'session_end').length === 2 && names.includes('level_up'),
      `기본 사건: 처음 옴(한 번만), 접속 둘, 끝 둘, 레벨 (${names.join(',')})`);
    check(ev.every((r) => r.key === key) && end !== undefined && JSON.parse(end.props).sec === 90 && /^[0-9a-f]{12}$/.test(end.sess) && ev[0].sess !== ev[ev.length - 1].sess,
      '사건은 저장 키·접속 표(무작위)·속성과 함께. 접속 길이(초)는 서버의 시계로 잰다');
    check(ev.every((r) => !/token|토큰|ev-token/.test(r.props)), '속성에 토큰이나 글이 들지 않는다');
    // 보관 기간과 삭제
    const st2 = new SqliteStore(file);
    const n0 = st2.events(0, Date.now() * 2).length;
    check(st2.pruneEvents(T + 1) === n0 && st2.events(0, Date.now() * 2).length === 0, '보관 기간이 지난 사건은 지운다 (pruneEvents)');
    st2.addEvents([{ at: T, key, sess: 's', name: 'x', props: {} }, { at: T, key: 'other', sess: 's', name: 'x', props: {} }]);
    st2.deletePlayer(key);
    check(st2.events(0, Date.now() * 2).map((r) => r.key).join() === 'other', '내 데이터 삭제는 그 저장 키의 분석 사건도 지운다');
    st2.close();
  }

  // ---------- 2. 집계 ----------
  {
    const d0 = Date.parse('2026-11-01T12:00:00Z');
    const ev = (day: number, key: string, name: string, props: EventRow['props'] = {}): EventRow => ({ at: d0 + day * DAY + key.length * 1000, key, sess: '', name, props });
    const rows: EventRow[] = [];
    for (const k of ['a', 'bb', 'ccc', 'dddd']) rows.push(ev(0, k, 'first_join'), ev(0, k, 'session_start'));
    rows.push(ev(1, 'a', 'session_start'), ev(1, 'bb', 'session_start'), ev(7, 'a', 'session_start'), ev(30, 'ccc', 'session_start'));
    rows.push(ev(1, 'eeeee', 'first_join'), ev(1, 'eeeee', 'session_start'), ev(2, 'eeeee', 'session_start'));
    rows.push(ev(0, 'a', 'session_end', { sec: 100 }), ev(0, 'bb', 'session_end', { sec: 300 }));
    rows.push(ev(0, 'a', 'level_up', { lv: 2 }), ev(0, 'bb', 'tutorial_done'), ev(1, 'bb', 'level_up', { lv: 2 }), ev(0, 'ccc', 'level_up'), ev(-1, 'dddd', 'tutorial_done'));
    rows.sort((x, y) => x.at - y.at);
    const r = retention(rows, d0 + 31 * DAY);
    const c0 = r.find((x) => x.day === '2026-11-01')!, c1 = r.find((x) => x.day === '2026-11-02')!, all = r.find((x) => x.day === 'all')!;
    check(c0.n === 4 && c0.d1?.n === 2 && c0.d1.pct === 50 && c0.d7?.n === 1 && c0.d30?.n === 1 && c1.n === 1 && c1.d1?.n === 1 && all.n === 5 && all.d1?.n === 3 && all.d1.pct === 60,
      `잔존: 처음 온 날의 무리마다 n일 뒤에 다시 접속한 비율 (D1 ${c0.d1?.pct}%, 합계 D1 ${all.d1?.pct}%)`);
    const early = retention(rows, d0 + 3 * DAY).find((x) => x.day === '2026-11-01')!;
    check(early.d1 !== null && early.d7 === null && early.d30 === null, '아직 오지 않은 날의 칸은 비운다');
    const dd = daily(rows);
    const d1 = dd.find((x) => x.day === '2026-11-01')!, d2 = dd.find((x) => x.day === '2026-11-02')!;
    check(d1.active === 4 && d1.fresh === 4 && d1.medianSec === 200 && d2.active === 3, `일별 활성: 활성·새로·접속 길이 (${JSON.stringify(d1)})`);
    const f = funnel(rows, ['first_join', 'tutorial_done', 'level_up']);
    check(f.map((x) => x.n).join() === '5,1,1' && f[1].pct === 20, `퍼널: 차례대로 밟은 수 (앞 단계보다 먼저 일어난 것은 세지 않는다: ${f.map((x) => x.n).join(',')})`);
  }
  // 부하 도구의 봇 접속자로 D1 표
  {
    let T = Date.parse('2026-11-20T09:00:00Z');
    const store = new SqliteStore(path.join(tmp, 'd1', 'game.db'));
    const s = await startServer(0, { store, backup: false, admin: { token: 'y'.repeat(48) }, game: { now: () => T }, now: () => T, alerts: false });
    const first = await bots(s.port, 6, 2, 'd1');
    await until(() => ![...s.game.ents.values()].some((x) => x.kind === 'p' && !x.bot));
    T += DAY;
    const second = await bots(s.port, 3, 2, 'd1'); // 같은 토큰의 앞 셋이 다음 날 돌아온다
    await until(() => ![...s.game.ents.values()].some((x) => x.kind === 'p' && !x.bot));
    const r = s.admin.run('stats', ['retention'], '시험', 'test');
    const rows = (r.data as { rows: { day: string; n: number; d1: { n: number; pct: number } | null }[] }).rows;
    const c = rows.find((x) => x.day === '2026-11-20');
    check(/"joined":6/.test(first) && /"joined":3/.test(second) && c?.n === 6 && c.d1?.n === 3 && c.d1.pct === 50, `봇 접속자 6명 중 다음 날 3명: D1 50% (${r.out.split('\n').slice(0, 3).join(' / ')})`);
    const d = s.admin.run('stats', ['daily'], '시험', 'test');
    const dr = (d.data as { rows: { day: string; active: number; fresh: number }[] }).rows;
    check(dr.length === 2 && dr[0].active === 6 && dr[0].fresh === 6 && dr[1].active === 3 && dr[1].fresh === 0, '일별 활성: 둘째 날은 돌아온 사람이라 새로 온 수가 0 (저장되지 않은 새 캐릭터도 처음 옴은 한 번)');
    await s.close();
    store.close();
  }

  // ---------- 3. 역할과 웹 관리 화면 ----------
  {
    check(roleFor('who', []) === 'view' && roleFor('ban', ['a', '1']) === 'ops' && roleFor('give', ['a', 'gold', '1']) === 'full' && roleFor('set', []) === 'view' && roleFor('set', ['x', '1']) === 'full'
      && roleFor('flag', []) === 'view' && roleFor('flag', ['market', 'off']) === 'ops' && roleFor('rollback', ['preview', 'a', 'latest']) === 'view' && roleFor('rollback', ['apply', 'a', 'b', 'c']) === 'full'
      && roleFor('maint', []) === 'view' && roleFor('maint', ['now']) === 'ops' && roleFor('erase', ['now', 'a']) === 'full' && roleFor('모르는것', []) === 'full', '명령마다 필요한 역할은 한 곳(roleFor)에서: 읽기 view, 사람·공지 ops, 재화·저장 full, 모르는 것은 full');
    const dir = path.join(tmp, 'web');
    const s = await startServer(0, { store: new MemoryStore(), backup: false, admin: { dir }, game: { modules: MODS }, alerts: false });
    const p = s.port, T = s.admin.tokens;
    check(fs.readFileSync(path.join(dir, ROLE_FILES.view), 'utf8').trim() === T.view && fs.readFileSync(path.join(dir, ROLE_FILES.ops), 'utf8').trim() === T.ops && new Set([T.view, T.ops, T.full]).size === 3, '역할마다 다른 토큰 파일을 만든다');
    const cli = (tok: string, cmd: string, ...args: string[]) => req(p, '/admin', 'POST', { 'x-admin-token': tok }, { cmd, args, by: '시험' });
    const v1 = await cli(T.view, 'who'), v2 = await cli(T.view, 'kick', '아무개'), o1 = await cli(T.ops, 'announce', '운영 공지'), o2 = await cli(T.ops, 'give', '아무개', 'gold', '5');
    check(v1.json?.ok === true && v1.json.role === 'view' && v2.json?.ok === false && /권한이 없습니다/.test(String(v2.json.out)) && o1.json?.ok === true && o2.json?.ok === false, '보기 전용은 읽기만, 운영은 공지까지, 지급은 전체만 (CLI의 길도 같은 검사)');
    const host = `127.0.0.1:${p}`;
    const page = await req(p, '/admin/ui', 'GET', { host, 'sec-fetch-site': 'none' });
    check(page.status === 200 && /<title>운영 관리<\/title>/.test(page.text) && /frame-ancestors 'none'/.test(String(page.headers['content-security-policy'])) && page.headers['x-frame-options'] === 'DENY' && !page.text.includes(T.full) && !page.text.includes(T.view),
      '같은 PC에서 열면 페이지를 준다 (토큰은 들어 있지 않다, 다른 페이지에 넣을 수 없다, 바깥의 것을 읽지 않는다)');
    const bad = await Promise.all([
      req(p, '/admin/ui', 'GET', { host: 'game.example.com' }),
      req(p, '/admin/ui', 'GET', { host, 'cf-connecting-ip': '203.0.113.5', 'cf-ray': 'x' }),
      req(p, '/admin/ui', 'GET', { host, 'x-forwarded-for': '203.0.113.5' }),
      req(p, '/admin/ui', 'GET', { host, 'sec-fetch-site': 'cross-site' }),
    ]);
    check(bad.every((r) => r.status === 404), `공개 터널(바깥의 Host, cloudflared·프록시의 머리)이나 다른 사이트에서 오면 페이지도 없는 것처럼 404 (${bad.map((r) => r.status).join(',')})`);
    const api = (tok: string | null, h: Record<string, string>, cmd: string, ...args: string[]) => req(p, '/admin/api', 'POST', { host, origin: `http://${host}`, 'sec-fetch-site': 'same-origin', ...(tok ? { 'x-admin-token': tok } : {}), ...h }, { cmd, args });
    const w1 = await api(T.view, {}, 'whoami'), w2 = await api(T.view, {}, 'flag', 'chat', 'off'), w3 = await api(T.ops, {}, 'flag', 'chat', 'off'), w4 = await api(null, {}, 'who');
    check(w1.json?.ok === true && w1.json.role === 'view' && w2.json?.ok === false && w3.json?.ok === true && !s.game.flags.on('chat') && w4.status === 401, '웹 관리 화면의 API: 같은 명령, 같은 역할 검사, 토큰이 없으면 401');
    const x = await Promise.all([
      api(T.full, { origin: 'http://evil.example' }, 'who'),
      api(T.full, { 'sec-fetch-site': 'cross-site' }, 'who'),
      api(T.full, { host: 'evil.example' }, 'who'),
      api(T.full, { 'cf-connecting-ip': '1.2.3.4' }, 'who'),
      api(T.full, { 'content-type': 'text/plain' }, 'who'),
    ]);
    check(x.every((r) => r.status === 404 || r.status === 415) && x.slice(0, 4).every((r) => r.status === 404), `다른 출처·다른 Host·터널을 지난 API 요청은 토큰이 맞아도 404, JSON이 아니면 415 (${x.map((r) => r.status).join(',')})`);
    const cliBrowser = await req(p, '/admin', 'POST', { 'x-admin-token': T.full, origin: `http://${host}` }, { cmd: 'who' });
    check(cliBrowser.status === 404, 'CLI의 길(/admin)은 여전히 브라우저의 머리를 거절한다');
    const audit = s.game.sanctions.log.filter((r) => r.by.startsWith('web:'));
    check(audit.length >= 3 && audit.some((r) => r.by === 'web:ops' && r.cmd === 'flag' && r.ok), '웹에서 한 명령도 기록에 남는다 (누가: web:역할)');
    const offWeb = await startServer(0, { store: new MemoryStore(), backup: false, admin: { token: 'z'.repeat(48), web: false }, alerts: false });
    check((await req(offWeb.port, '/admin/ui', 'GET', { host: `127.0.0.1:${offWeb.port}` })).status === 404, '웹 관리 화면은 끌 수 있다 (admin.web: false)');
    await offWeb.close();
    await s.close();
    check(!fs.existsSync(path.join(dir, ROLE_FILES.view)) && !fs.existsSync(path.join(dir, ROLE_FILES.ops)), '끌 때 역할 토큰 파일도 지운다');
  }

  // ---------- 4. 문의·제재 이의 ----------
  {
    let T = Date.parse('2026-11-21T09:00:00Z');
    const store = new MemoryStore();
    store.savePlayer(keyOf('sup-a-token-aaaaaaa'), { name: '가온', lv: 3, gold: 10 });
    store.savePlayer(keyOf('sup-b-token-bbbbbbb'), { name: '나비', lv: 3, gold: 10 });
    const s = await startServer(0, { store, backup: false, admin: { token: 'w'.repeat(48) }, game: { now: () => T, modules: MODS }, now: () => T, alerts: false });
    const got: ServerMsg[] = [];
    const a = await connect(s.port, undefined, 'sup-a-token-aaaaaaa', (m) => got.push(m));
    const run = (cmd: string, ...args: string[]) => s.admin.run(cmd, args, '운영자', 'test');
    a.send({ t: 'support', a: 'new', kind: 'ask', text: '짧음' });
    await settle(a);
    check(a.sys.some((x) => x.startsWith('supportShort')), '너무 짧은 글은 받지 않는다');
    a.send({ t: 'support', a: 'new', kind: 'bug', text: '상점에서 시발 물약이 안 사져요' });
    await until(() => got.some((m) => m.t === 'support' && m.a === 'sent'));
    const list = got.filter((m): m is Extract<ServerMsg, { t: 'support'; a: 'list' }> => m.t === 'support' && m.a === 'list').pop();
    check(!!list && list.list.length === 1 && list.list[0].kind === 'bug' && list.list[0].state === 'open' && !list.list[0].text.includes('시발') && list.list[0].text.includes('물약'), `문의를 받아 내 목록에 보인다. 글은 금칙어를 가린다 (${list?.list[0]?.text})`);
    a.send({ t: 'support', a: 'new', kind: 'ask', text: '하나 더 물어볼게요' });
    await settle(a);
    check(a.sys.some((x) => x.startsWith('supportWait')), '한 사람이 1분에 한 건');
    T += 61_000;
    a.send({ t: 'support', a: 'new', kind: 'ask', text: 'x'.repeat(900) });
    await until(() => got.filter((m) => m.t === 'support' && m.a === 'sent').length === 2);
    const tk = run('tickets');
    check(tk.ok && Array.isArray(tk.data) && (tk.data as { text: string }[])[0].text.length === 500 && (tk.data as unknown[]).length === 2, '글은 500자까지 자른다. 관리자 목록에 열린 문의 둘');
    const id = (tk.data as { id: number }[])[1].id;
    check(run('answer', String(id), '고쳤습니다. 다시 해 보세요').ok && await until(() => a.sys.some((x) => x === `supportAnswered:${id}`)), '관리자의 답이 접속한 사람에게 곧바로 알려진다');
    const ent = [...s.game.ents.values()].find((e) => e.kind === 'p' && e.name === '가온')!;
    check(ent.mail.some((m) => m.k === 'support' && m.a[0] === id), '답은 알림 우편(종류 support)으로도 온다');
    const after = got.filter((m): m is Extract<ServerMsg, { t: 'support'; a: 'list' }> => m.t === 'support' && m.a === 'list').pop()!;
    check(after.list.find((x) => x.id === id)?.state === 'answered' && after.list.find((x) => x.id === id)?.answer === '고쳤습니다. 다시 해 보세요', '내 목록에 상태(답변)와 답이 보인다');
    check(run('tclose', String(id)).ok && store.ticket(id)?.state === 'closed', '관리자가 닫는다');
    // 말 막기 이의
    a.send({ t: 'support', a: 'new', kind: 'appeal', text: '말 막기가 잘못 걸렸어요' });
    await settle(a);
    check(a.sys.some((x) => x.startsWith('supportNoSanction')), '걸린 제재가 없으면 이의를 받지 않는다');
    run('mute', '가온', '2', '도배');
    a.send({ t: 'support', a: 'list' });
    await until(() => got.some((m) => m.t === 'support' && m.a === 'list' && !!m.sanction));
    const ml = got.filter((m): m is Extract<ServerMsg, { t: 'support'; a: 'list' }> => m.t === 'support' && m.a === 'list').pop()!;
    check(ml.sanction?.kind === 'mute' && ml.sanction.why === '도배' && ml.sanction.until === T + 2 * 3600_000 && ml.appealed === false, '말 막힌 사람의 목록에 사유·기간이 온다');
    T += 61_000;
    a.send({ t: 'support', a: 'new', kind: 'appeal', text: '말 막기가 잘못 걸렸어요' });
    await until(() => got.filter((m) => m.t === 'support' && m.a === 'sent').length === 3);
    const ap = store.tickets({ state: 'open', limit: 10 }).find((x) => x.kind === 'appeal');
    check(ap?.sanction?.kind === 'mute' && ap.sanction.why === '도배', '이의에는 그때의 제재가 붙는다');
    T += 61_000;
    a.send({ t: 'support', a: 'new', kind: 'appeal', text: '한 번 더 이의를 냅니다' });
    await settle(a);
    check(a.sys.some((x) => x.startsWith('supportAppealed')), '같은 제재에 열린 이의는 하나');
    // 차단된 사람: 사유·기간을 알리고, 접속 메시지에 실은 이의를 받는다
    run('ban', '나비', '7d', '욕설 반복');
    const j1 = await joinOnce(s.port, { token: 'sup-b-token-bbbbbbb' });
    const sn = j1.msgs.find((m): m is Extract<ServerMsg, { t: 'sanction' }> => m.t === 'sanction');
    check(j1.code === 4003 && sn?.s.kind === 'ban' && sn.s.why === '욕설 반복' && sn.s.until === T + 7 * DAY && sn.appealed === false, '차단된 사람의 접속에 사유·기간을 알리고 닫는다 (4003)');
    const j2 = await joinOnce(s.port, { token: 'sup-b-token-bbbbbbb', appeal: '저는 욕을 하지 않았습니다. 다시 봐 주세요' });
    const sn2 = j2.msgs.find((m): m is Extract<ServerMsg, { t: 'sanction' }> => m.t === 'sanction');
    check(j2.code === 4003 && j2.msgs.some((m) => m.t === 'support' && m.a === 'sent') && sn2?.appealed === true && store.tickets({ state: 'open', limit: 20 }).some((x) => x.kind === 'appeal' && x.sanction?.kind === 'ban' && x.name === '나비'),
      '차단된 사람은 접속 메시지에 이의를 실어 낼 수 있다 (게임에는 들어오지 못한다)');
    const j3 = await joinOnce(s.port, { token: 'sup-b-token-bbbbbbb', appeal: '또 냅니다 또 냅니다' });
    check(j3.msgs.some((m) => m.t === 'sys' && (m.k === 'supportWait' || m.k === 'supportAppealed')) && !j3.msgs.some((m) => m.t === 'support'), '차단된 사람의 이의도 빈도·하나의 제한을 지난다');
    const guest = await joinOnce(s.port, {});
    check(guest.code !== 4003, '손님은 차단과 상관없다');
    // 모듈을 고르지 않은 게임
    const s2 = await startServer(0, { store: new MemoryStore(), backup: false, admin: { token: 'v'.repeat(48) }, alerts: false });
    const g2: ServerMsg[] = [];
    const b2 = await connect(s2.port, undefined, 'nosup-token-aaaaaa', (m) => g2.push(m));
    b2.send({ t: 'support', a: 'new', kind: 'ask', text: '모듈이 없는데 보낸 문의' });
    await settle(b2);
    check(!g2.some((m) => m.t === 'support') && !b2.sys.some((x) => x.startsWith('support')) && /고르지 않았습니다/.test(s2.admin.run('tickets', [], '시험', 't').out), 'support를 고르지 않은 게임은 문의 메시지를 무시한다');
    b2.ws.close();
    await s2.close();
    a.ws.close();
    await s.close();
  }

  // ---------- 5. 봇·매크로 의심 점수 ----------
  {
    check(scoreOf(120, 0.02, 1, 5 * 3600_000) >= 90 && scoreOf(15, 0.9, 0.3, 10 * 60_000) <= 10, `점수의 셈: 빠르고 고르고 같은 명령만 오래 = 높음, 사람다운 것 = 낮음 (${scoreOf(120, 0.02, 1, 5 * 3600_000)}, ${scoreOf(15, 0.9, 0.3, 10 * 60_000)})`);
    const S = new Suspects();
    let t0 = Date.parse('2026-11-21T00:00:00Z');
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 400; i++) S.see('k:macro', '매크로', 'attack', t0 + i * 500); // 0.5초마다 똑같이
    let t1 = t0;
    for (let i = 0; i < 400; i++) { t1 += 800 + rnd() * 6000 + (rnd() < 0.05 ? 400_000 : 0); S.see('k:human', '사람', ['move', 'attack', 'skill', 'use'][Math.floor(rnd() * 4)], t1); }
    for (let i = 0; i < 10; i++) S.see('k:few', '조금', 'move', t0 + i * 1000);
    const list = S.list(Math.max(t0 + 400 * 500, t1));
    const m = list.find((r) => r.name === '매크로'), h = list.find((r) => r.name === '사람');
    check(!!m && !!h && m.score >= 50 && h.score < 50 && list[0].name === '매크로' && !list.some((r) => r.name === '조금'), `고른 간격의 연타는 높고(${m?.score}) 사람다운 놀이는 낮다(${h?.score}). 명령이 적으면 점수를 내지 않는다`);
  }

  // ---------- 6. 경보 ----------
  {
    const got: Record<string, unknown>[] = [];
    const hook = http.createServer((q, r) => { const parts: Buffer[] = []; q.on('data', (c: Buffer) => parts.push(c)); q.on('end', () => { got.push(JSON.parse(Buffer.concat(parts).toString('utf8'))); r.writeHead(204).end(); }); });
    await new Promise<void>((r) => hook.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(hook.address() as { port: number }).port}/hook`;
    const v: Record<string, number> = { game_tick_ms_p95: 10, game_save_failures_total: 0 };
    let now = 1_000_000;
    const A = startAlerts({ webhook: url, rules: [{ name: 'tick', metric: 'game_tick_ms_p95', op: '>', value: 40, forS: 30 }, { name: 'save', metric: 'game_save_failures_total', op: '>', value: 0, delta: true }], repeatMin: 10, everyS: 3600 }, () => v, () => now);
    A.check();
    v.game_tick_ms_p95 = 80; A.check(); now += 10_000; A.check();
    check(got.length === 0 && A.list()[0].state === 'pending', '정한 시간(forS)만큼 이어 넘기 전에는 알리지 않는다');
    now += 25_000; A.check(); now += 5_000; A.check(); now += 60_000; A.check();
    await until(() => got.length >= 1);
    check(got.length === 1 && got[0].state === 'firing' && got[0].rule === 'tick' && typeof got[0].text === 'string', '넘은 채로 있으면 한 번만 알린다 (같은 경보의 되풀이 억제)');
    now += 10 * 60_000; A.check();
    await until(() => got.length >= 2);
    check(got[1]?.state === 'still', 'repeatMin이 지나면 \'아직\'을 한 번');
    v.game_tick_ms_p95 = 5; A.check();
    v.game_save_failures_total = 2; A.check(); A.check();
    await until(() => got.length >= 5);
    check(got.some((x) => x.state === 'resolved' && x.rule === 'tick') && got.filter((x) => x.rule === 'save').map((x) => x.state).join() === 'firing,resolved', '내려오면 풀림을 알린다. 늘어나는 수(delta)는 늘어난 그때만');
    A.stop();
    const quiet = startAlerts({ rules: [{ name: 't', metric: 'm', op: '>', value: 0 }], everyS: 3600 }, () => ({ m: 5 }), () => now);
    check(quiet.check() === 0 && !quiet.on && quiet.list()[0].state === 'firing', '웹훅 주소가 없으면(기본) 재기만 하고 아무 데도 보내지 않는다');
    quiet.stop();
    check(checkRule({ name: 'bad name!', metric: 'x', op: '>', value: 1 }) !== null && checkRule({ name: 'ok', metric: 'game_x', op: '~', value: 1 }) !== null && checkRule({ name: 'ok', metric: 'game_x', op: '>=', value: 1 }) === null, '규칙의 모양을 본다');
    hook.close();
  }

  // ---------- 7. 사고 리허설 ----------
  {
    const dir = path.join(tmp, 'incident');
    const file = path.join(dir, 'game.db');
    const TA = 'incident-a-token-aaaaaa', TB = 'incident-b-token-bbbbbb';
    // 켜기 전의 저장 (자동 백업이 켜질 때 이것을 뜬다)
    const pre = new SqliteStore(file);
    pre.savePlayer(keyOf(TA), { name: '사고자', lv: 4, exp: 0, gold: 100, sparks: 3, cls: '', seen: Date.parse('2026-11-21T00:00:00Z') });
    pre.savePlayer(keyOf(TB), { name: '구경꾼', lv: 4, exp: 0, gold: 50, sparks: 0, cls: '', seen: Date.parse('2026-11-21T00:00:00Z') });
    pre.close();
    const store = new SqliteStore(file);
    // 복제 버그를 흉내 내는 명령: 지갑을 거치지 않고 골드를 늘린다
    const dupe = (g: Game) => { g.commands.set('dupe', (p) => { p.gold += 5000; p.dirty = true; p.unsaved = true; }); };
    const s: Running = await startServer(0, {
      store, admin: { dir }, backup: { everyMin: 0 }, game: { plugins: [dupe], modules: MODS }, alerts: false,
    });
    const run = (cmd: string, ...args: string[]) => s.admin.run(cmd, args, '당번', 'test');
    const backups = fs.readdirSync(path.join(dir, 'backup'));
    check(backups.length === 1, `켜질 때 자동 백업 하나 (${backups.join(',')})`);
    const a = await connect(s.port, undefined, TA), b = await connect(s.port, undefined, TB);
    // (1) 복제 버그
    a.send({ t: 'dupe' } as never);
    await settle(a);
    const ea = [...s.game.ents.values()].find((e) => e.kind === 'p' && e.name === '사고자')!;
    check(ea.gold === 5100, '복제 버그: 지갑을 거치지 않고 골드가 늘었다');
    // (2) 장부가 통로 밖의 변화를 잡는다 → 경보
    const led = run('ledger', '1');
    const strays = (led.data as { strays: { name: string; cur: string; d: number; why: string }[] }).strays;
    check(strays.some((x) => x.name === '사고자' && x.cur === 'gold' && x.d === 5000 && x.why === 'other') && /사고자/.test(led.out), `장부가 통로 밖의 변화를 사람과 함께 잡았다 (${led.out.split('\n')[1]?.trim()})`);
    const mt = run('metrics');
    check((mt.data as Record<string, number>).game_econ_stray_total >= 1, '지표 game_econ_stray_total이 0이 아니다');
    // (3) 킬 스위치: 거래 중단
    check(run('flag', 'market', 'off').ok && run('flag', 'mail', 'off').ok, '킬 스위치로 거래소와 우편을 끈다');
    a.send({ t: 'market', a: 'list', page: 0 } as never);
    check(await until(() => a.sys.some((x) => x === 'featureOff:market')), '꺼진 거래소를 쓰면 안내문 featureOff');
    // (4) 그 사람만 롤백: 목록 → 미리보기 → 확인 코드 → 실행
    const ls = run('rollback', 'list', '사고자');
    check(ls.ok && /Lv4 gold 100/.test(ls.out), '백업 목록에 그때의 저장이 보인다');
    const pv = run('rollback', 'preview', '사고자', 'latest');
    const code = (pv.data as { code: string }).code;
    check(/gold: 지금 5100 → 백업 100/.test(pv.out) && /접속 중/.test(pv.out) && /other/.test(pv.out) && /^[0-9a-f]{8}$/.test(code), `미리보기: 바뀌는 것, 장부(그 사이의 통로 밖 변화), 확인 코드\n${pv.out.split('\n').map((l) => '      ' + l).join('\n')}`);
    check(!run('rollback', 'apply', '사고자', 'latest', '00000000').out.includes('되돌렸습니다') && ea.gold === 5100, '확인 코드가 틀리면 실행하지 않는다');
    check(s.admin.run('rollback', ['apply', '사고자', 'latest', code], 'web:ops', 'test', 'ops').ok === false, '롤백 실행은 전체 역할만');
    const closedA = new Promise<number>((r) => a.ws.on('close', (c) => r(c)));
    const ap = run('rollback', 'apply', '사고자', 'latest', code);
    check(ap.ok && /되돌렸습니다/.test(ap.out) && (await closedA) === 4002 && a.sys.includes('rolledBack'), '실행: 접속 중인 그 사람을 먼저 끊는다 (안내문 rolledBack)');
    const saved = store.loadPlayer(keyOf(TA))!;
    const stash = store.stashes(keyOf(TA), 5);
    check(saved.gold === 100 && saved.sparks === 3 && stash.length === 1 && stash[0].save.gold === 5100, '그 사람만 백업의 상태로 (골드 100), 되돌리기 전의 상태(5100)는 따로 보관했다');
    const eb = [...s.game.ents.values()].find((e) => e.kind === 'p' && e.name === '구경꾼')!;
    check(eb.gold === 50 && b.ws.readyState === b.ws.OPEN, '다른 사람은 그대로 (접속도 끊기지 않았다)');
    check(store.econ('2000-01-01').some((r) => r.why === 'rollback' && r.cur === 'gold' && r.dir === '-' && r.amount === 5000), '되돌린 재화는 장부에 원인 rollback으로 적힌다');
    const a2 = await connect(s.port, undefined, TA);
    const ea2 = [...s.game.ents.values()].find((e) => e.kind === 'p' && e.name === '사고자')!;
    check(a2.name === '사고자' && ea2.gold === 100, '다시 들어오면 되돌린 상태다');
    // (5) 보상 우편 (거래를 멈춘 동안의 보상: 모두에게)
    run('flag', 'mail', 'on');
    const cm = run('mail', '--all', '--gold', '200');
    check(cm.ok && /2명/.test(cm.out) && ea2.mail.some((m) => m.k === 'comp' && m.r.gold === 200) && eb.mail.some((m) => m.k === 'comp'), `운영 보상 우편 (${cm.out})`);
    const compId = eb.mail.find((m) => m.k === 'comp')!.id;
    b.send({ t: 'mailClaim', id: compId });
    await until(() => eb.gold === 250);
    check(eb.gold === 250 && s.game.ledger.rows().some((r) => r.why === 'mail:comp' && r.amount === 200), '보상 우편은 통로(우편 → 지갑)를 지나 장부에 mail:comp로 적힌다');
    // (6) 공지
    const nGot: ServerMsg[] = [];
    const c = await connect(s.port, undefined, 'incident-c-token-cccc', (m) => nGot.push(m));
    run('notice', 'add', '--popup', '--for', '2h', '--ko', '거래소 오류로 잠시 거래를 멈췄습니다. 보상 우편을 보냈습니다.');
    await until(() => nGot.some((m) => m.t === 'notices'));
    check(nGot.some((m) => m.t === 'notices' && m.list.some((n) => (n.text.ko ?? '').includes('보상 우편'))), '공지가 접속한 사람에게 간다');
    run('flag', 'market', 'on');
    check(s.game.flags.on('market'), '거래를 다시 연다');
    // 되돌리기를 되돌린다 (보관한 것으로)
    const st = run('rollback', 'stash', '사고자');
    check(/#1/.test(st.out), '보관 목록');
    const undo1 = run('rollback', 'undo', '사고자', '1');
    const ucode = /undo 사고자 1 ([0-9a-f]{8})/.exec(undo1.out)?.[1];
    const undo = run('rollback', 'undo', '사고자', '1', ucode ?? '');
    check(!!ucode && /되돌렸습니다/.test(undo.out) && store.loadPlayer(keyOf(TA))?.gold === 5100 && store.stashes(keyOf(TA), 5).length === 2, '보관한 것으로 다시 되돌릴 수 있다 (그때도 지금 상태를 또 보관한다)');
    // 기록
    check(s.game.sanctions.log.filter((r) => r.cmd === 'rollback').length >= 5, '롤백의 모든 단계가 관리자 기록에 남는다');
    for (const p of [a2, b, c] as Peer[]) p.ws.close();
    await s.close();
    store.close();
  }
  // 경보와 장부: 진짜 서버에서 통로 밖의 변화가 웹훅까지 간다
  {
    const got: Record<string, unknown>[] = [];
    const hook = http.createServer((q, r) => { const parts: Buffer[] = []; q.on('data', (c: Buffer) => parts.push(c)); q.on('end', () => { got.push(JSON.parse(Buffer.concat(parts).toString('utf8'))); r.writeHead(204).end(); }); });
    await new Promise<void>((r) => hook.listen(0, '127.0.0.1', () => r()));
    const dupe = (g: Game) => { g.commands.set('dupe', (p) => { p.gold += 777; p.unsaved = true; }); };
    const s = await startServer(0, { store: new MemoryStore(), backup: false, admin: { token: 'u'.repeat(48) }, game: { plugins: [dupe] }, alerts: { webhook: `http://127.0.0.1:${(hook.address() as { port: number }).port}/`, everyS: 1 } });
    const a = await connect(s.port, undefined, 'alert-token-aaaaaaaaa');
    await new Promise((r) => setTimeout(r, 1200)); // 처음 값을 한 번 잰 뒤에
    a.send({ t: 'dupe' } as never);
    check(await until(() => got.some((x) => x.rule === 'econ_stray' && x.state === 'firing'), 8000), `통로 밖의 재화 변화가 생기면 경보(econ_stray)가 웹훅에 간다 (${JSON.stringify(got[0] ?? null)})`);
    const view = s.admin.run('alerts', [], '시험', 't');
    check(/웹훅: 켜짐/.test(view.out) && /econ_stray/.test(view.out), '관리자 명령 alerts로 규칙과 상태를 본다');
    a.ws.close();
    await s.close();
    hook.close();
  }

  // ---------- 8. 스키마 ----------
  {
    const file = path.join(tmp, 'schema', 'game.db');
    const st = new SqliteStore(file);
    const v = st.schemaVersion();
    st.close();
    const db = new DatabaseSync(file, { readOnly: true });
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name);
    db.close();
    check(v === SCHEMA.length && ['events', 'tickets', 'player_stash'].every((t) => tables.includes(t)), `스키마는 목록의 길이(${SCHEMA.length})까지 올라가고 운영 도구의 표(events, tickets, player_stash)가 있다`);
  }
} finally {
  removeTemp(tmp);
}
