// 운영의 바탕 (시험용 내용 위에서):
//   1. 달력 (engine/shared/defs/live.ts): 시간대·하루 시작 시각·주의 시작 요일, 서머타임, 다음 경계, 운영자의 시각 읽기. 기본값은 예전의 dayOf와 같다
//   2. 시계 (engine/server/game/systems/clock.ts): 가상 시계로 일·주·달 경계 사건, 서버가 사흘 꺼졌다 켜짐(한 번씩), 시계 되감김, 가을의 같은 시각
//   3. 원격 설정 (systems/live.ts): 잘못된 값 거절, 반영, 화면에도 보냄, 되돌리기, 이력, 재시작 뒤 유지(SQLite)
//   4. 깃발·공지·점검 (Game만): 꺼진 명령은 안내문, 공지의 예약, 점검 전 안내와 시작·끝
//   5. 서버와 관리자 명령: 공지·점검이 접속에 가고, 깃발 chat·join, 점검 중 관리자만 입장, 보상 일괄 우편, 상태 페이지
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { MARKET, SALVAGE, NET, applyLive, makeCalendar, parseWhen, type NoticeView } from '../../shared/defs';
import type { ServerMsg } from '../../shared/protocol';
import { dayOf } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { Clock } from '../../server/game/systems/clock';
import { startServer } from '../../server/net/server';
import { MemoryStore, SqliteStore } from '../../server/store';
import { check, connect, removeTemp, until } from '../harness';

const H = 3_600_000, D = 24 * H;
const utc = (s: string) => Date.parse(s);

// ---------- 1. 달력 ----------
{
  const local = makeCalendar({});
  let same = 0;
  for (let i = 0; i < 400; i++) { const t = utc('2026-01-01T00:00:00Z') + i * 7.3 * H + i * 61_000; if (local.day(t) === dayOf(t)) same++; }
  check(same === 400, `기본(서버 현지 자정)의 날은 예전의 dayOf와 같다 (${same}/400)`);
  const u = makeCalendar({ tz: 'UTC', dayAt: 5 });
  check(u.day(utc('2026-03-10T04:59:59Z')) === '2026-03-09' && u.day(utc('2026-03-10T05:00:00Z')) === '2026-03-10', '하루 시작 시각 05:00 (UTC): 04:59는 전날, 05:00부터 그날');
  const seoul = makeCalendar({ tz: 'Asia/Seoul', dayAt: 5 });
  check(seoul.day(utc('2026-03-09T19:59:00Z')) === '2026-03-09' && seoul.day(utc('2026-03-09T20:00:00Z')) === '2026-03-10' && seoul.next('day', utc('2026-03-09T12:00:00Z')) === utc('2026-03-09T20:00:00Z'), '시간대 Asia/Seoul의 05:00 = UTC 20:00에 날이 바뀐다');
  const mon = makeCalendar({ tz: 'UTC' }), sun = makeCalendar({ tz: 'UTC', weekStart: 0 });
  check(mon.week(utc('2026-11-29T23:59:00Z')) === '2026-11-23' && mon.week(utc('2026-11-30T00:00:00Z')) === '2026-11-30' && sun.week(utc('2026-11-29T00:00:00Z')) === '2026-11-29' && sun.week(utc('2026-11-28T23:00:00Z')) === '2026-11-22',
    '주는 시작 요일(월요일 기본, 일요일도)에 바뀐다');
  check(mon.month(utc('2026-11-30T23:59:00Z')) === '2026-11' && mon.month(utc('2026-12-01T00:00:00Z')) === '2026-12' && u.month(utc('2026-12-01T04:00:00Z')) === '2026-11', '달은 1일의 하루 시작 시각에 바뀐다');
  check(mon.next('day', utc('2026-11-27T10:00:00Z')) === utc('2026-11-28T00:00:00Z') && mon.next('week', utc('2026-11-27T10:00:00Z')) === utc('2026-11-30T00:00:00Z') && mon.next('month', utc('2026-11-27T10:00:00Z')) === utc('2026-12-01T00:00:00Z'), '다음 경계: 날·주·달');
  const ny = makeCalendar({ tz: 'America/New_York' });
  const spring = ny.next('day', utc('2026-03-08T05:00:00Z')) - utc('2026-03-08T05:00:00Z'), fall = ny.next('day', utc('2026-11-01T04:00:00Z')) - utc('2026-11-01T04:00:00Z');
  check(spring === 23 * H && fall === 25 * H, `서머타임: 봄의 하루는 23시간, 가을의 하루는 25시간 (${spring / H}, ${fall / H})`);
  const nyGap = makeCalendar({ tz: 'America/New_York', dayAt: 2.5 });
  check(nyGap.next('day', utc('2026-03-08T06:00:00Z')) === utc('2026-03-08T07:00:00Z') && nyGap.day(utc('2026-03-08T06:59:00Z')) === '2026-03-07' && nyGap.day(utc('2026-03-08T07:00:00Z')) === '2026-03-08', '봄에 건너뛰는 02:30이 하루 시작이면 그 뒤의 첫 시각(03:00)에 바뀐다');
  check(ny.prevDay('2026-03-01') === '2026-02-28' && ny.between('day', '2026-11-25', '2026-11-28') === 3 && ny.between('month', '2025-12', '2026-02') === 2, '전날과 경계 수의 셈');
  const now = utc('2026-11-27T01:00:00Z');
  check(parseWhen('+30m', now, seoul) === now + 30 * 60_000 && parseWhen('now', now, seoul) === now && parseWhen('2026-12-01T09:00+09:00', now, seoul) === utc('2026-12-01T00:00:00Z')
    && parseWhen('2026-12-01 09:00', now, seoul) === utc('2026-12-01T00:00:00Z') && parseWhen('2026-12-01 09:00', now, mon) === utc('2026-12-01T09:00:00Z') && parseWhen('내일', now, seoul) === null && parseWhen('2026-13-01', now, seoul) === null,
    '운영자의 시각: +30m, now, 시간대가 붙은 ISO, 시간대 없는 벽시계(초기화 시각의 시간대로), 이상한 글은 null');
  let threw = '';
  try { makeCalendar({ tz: 'Mars/Olympus' }); } catch (e) { threw = String(e); }
  check(threw.includes('RESET.tz'), '모르는 시간대는 서버를 띄울 때 알린다');
}

// ---------- 2. 시계: 가상 시계로 경계를 넘긴다 ----------
{
  let T = utc('2026-11-27T10:00:00Z');
  const g = new Game({ now: () => T });
  const clock = new Clock(g, { tz: 'UTC' });
  const got: string[] = [];
  g.on('dayReset', (k, prev, n) => got.push(`d:${k}<${prev}:${n}`));
  g.on('weekReset', (k, prev, n) => got.push(`w:${k}<${prev}:${n}`));
  g.on('monthReset', (k, prev, n) => got.push(`m:${k}<${prev}:${n}`));
  const go = (iso: string) => { T = utc(iso); clock.check(); };
  go('2026-11-27T23:59:59Z');
  check(got.length === 0, '경계 전에는 사건이 없다');
  go('2026-11-28T00:00:00Z'); go('2026-11-28T06:00:00Z');
  check(got.join() === 'd:2026-11-28<2026-11-27:1', `자정에 날 사건 한 번 (${got.join()})`);
  got.length = 0; go('2026-11-30T00:00:01Z');
  check(got.join() === 'd:2026-11-30<2026-11-28:2,w:2026-11-30<2026-11-23:1', `월요일: 날(이틀 지남)과 주 (${got.join()})`);
  got.length = 0; go('2026-12-01T00:00:00Z');
  check(got.join() === 'd:2026-12-01<2026-11-30:1,m:2026-12<2026-11:1', `1일: 날과 달 (${got.join()})`);
  // 되감김: PC의 시계가 하루 뒤로 갔다가 돌아온다
  got.length = 0; go('2026-11-30T12:00:00Z'); go('2026-12-01T03:00:00Z');
  check(got.length === 0, '시계를 되감았다가 돌아와도 이미 알린 경계는 다시 알리지 않는다');
  go('2026-12-02T00:00:00Z');
  check(got.join() === 'd:2026-12-02<2026-12-01:1', `되감김 뒤 다음 경계는 한 번 (${got.join()})`);
  // 가을의 같은 시각이 두 번 오는 하루 시작(01:30, America/New_York): 한 번만
  let T2 = utc('2026-11-01T05:00:00Z');
  const g2 = new Game({ now: () => T2 });
  const c2 = new Clock(g2, { tz: 'America/New_York', dayAt: 1.5 });
  let n2 = 0;
  g2.on('dayReset', () => n2++);
  for (let t = utc('2026-11-01T05:00:00Z'); t <= utc('2026-11-01T08:00:00Z'); t += 5 * 60_000) { T2 = t; c2.check(); }
  check(n2 === 1, `가을에 01:30이 두 번 와도 날 사건은 한 번 (${n2})`);
  // 서버가 사흘 꺼졌다 켜짐: 저장소에서 마지막 경계를 읽고 한 번씩 알린다
  const store = new MemoryStore();
  let T3 = utc('2026-11-27T10:00:00Z');
  const a = new Game({ now: () => T3 });
  const ca = new Clock(a, { tz: 'UTC' });
  ca.attach(store);
  let first = 0;
  a.on('dayReset', () => first++);
  T3 = utc('2026-11-28T01:00:00Z'); ca.check();
  T3 = utc('2026-12-01T09:00:00Z'); // 꺼져 있는 동안 사흘 (토 → 화: 주와 달도 넘었다)
  const b = new Game({ now: () => T3 });
  const cb = new Clock(b, { tz: 'UTC' });
  const back: string[] = [];
  b.on('dayReset', (k, p, n) => back.push(`d:${k}<${p}:${n}`)); b.on('weekReset', (k, p, n) => back.push(`w:${k}<${p}:${n}`)); b.on('monthReset', (k, p, n) => back.push(`m:${k}<${p}:${n}`));
  cb.attach(store);
  cb.check(); T3 += H; cb.check();
  check(first === 1 && back.join() === 'd:2026-12-01<2026-11-28:3,w:2026-11-30<2026-11-23:1,m:2026-12<2026-11:1', `서버가 사흘 꺼졌다 켜지면 날·주·달 사건이 한 번씩, 지난 수와 함께 (${back.join()})`);
  const fresh = new Game({ now: () => T3 }), cf = new Clock(fresh, { tz: 'UTC' });
  let none = 0;
  fresh.on('dayReset', () => none++);
  cf.attach(new MemoryStore());
  check(none === 0, '처음 켜는 서버(적힌 것이 없다)는 알리지 않는다');
  // 틀이 만든 시계 (g.time: 내용의 RESET = 기본)
  check(g.time.dayOf(utc('2026-06-15T15:30:00Z')) === dayOf(utc('2026-06-15T15:30:00Z')) && g.time.cal.tz === 'local' && g.time.open(T - 1, T + 1) && !g.time.open(T + 1) && g.time.open(undefined, undefined), 'g.time: 기본은 서버 현지 자정, open(start, end)');
}

// ---------- 3. 원격 설정 ----------
{
  const tax0 = MARKET.tax;
  let T = utc('2026-11-27T10:00:00Z');
  const g = new Game({ now: () => T });
  const L = g.live;
  const err = (r: { ver: number } | { err: string } | null) => (r && 'err' in r ? r.err : '');
  check(err(L.set('MARKET.tax', 'abc', 'op')).includes('수여야') && err(L.set('MARKET.tax', 0.9, 'op')).includes('0~0.5') && err(L.set('MARKET.minLv', 1, 'op')).includes('선언되지 않은') && MARKET.tax === tax0,
    '잘못된 값(모양, 범위, 선언하지 않은 칸)은 거절되고 내용은 그대로다');
  check(err(L.set('GEAR.weaponFor', 'x', 'op')).includes('함수') && err(L.set('SALVAGE.dust', ['a'], 'op')).includes('수여야') && err(L.set('NET.extra', 'x', 'op')).includes('수') && err(L.set('MARKET.tax', 1e400, 'op')) !== '', '함수 칸, 목록의 모양, 처음 값이 없는 칸의 type, 무한대도 거절');
  g.casts = [];
  const r1 = L.set('MARKET.tax', 0.1, 'op');
  const sent = g.casts.find((m) => m.t === 'live') as Extract<ServerMsg, { t: 'live' }> | undefined;
  check(!err(r1) && MARKET.tax === 0.1 && L.get('MARKET.tax') === 0.1 && sent?.set['MARKET.tax'] === 0.1, '맞는 값은 재시작 없이 반영되고(내용의 칸이 바뀐다), 화면에도 보내는 칸이면 모두에게 보낸다');
  T += 1000; L.set('MARKET.tax', 0.2, 'op2', '시험');
  T += 1000; const u = L.undo('MARKET.tax', 'op3');
  check(!err(u) && MARKET.tax === 0.1, `되돌리기(undo): 바로 앞 값으로 (${MARKET.tax})`);
  g.casts = [];
  const rs = L.reset('MARKET.tax', 'op');
  check(!err(rs) && MARKET.tax === tax0 && L.row('MARKET.tax') === undefined && JSON.stringify(g.casts.find((m) => m.t === 'live')) === JSON.stringify({ t: 'live', set: {}, reset: ['MARKET.tax'] }), '소스로 돌리기(reset): 내용의 처음 값, 화면에도 알린다');
  const log = L.log('cfg:MARKET.tax', 10);
  check(log.length === 4 && log[0].after === null && log[0].before === 0.1 && log[3].before === null && log[3].after === 0.1 && log[2].by === 'op2' && log[2].note === '시험' && log[1].note.startsWith('undo') && log[0].ver === 4,
    `이력: 누가·언제·전·후, 차례대로 버전 (${log.map((r) => `v${r.ver} ${JSON.stringify(r.before)}→${JSON.stringify(r.after)}`).join(', ')})`);
  check(L.get('testKnob') === 3 && !err(L.set('testKnob', 7, 'op')) && L.get('testKnob') === 7 && err(L.set('testKnob', 70, 'op')) !== '' && !err(L.set('SALVAGE.dust', [1, 2, 3, 4, 5], 'op')) && SALVAGE.dust.length === 5 && !err(L.set('NET.extra', 5, 'op')) && (NET as Record<string, unknown>).extra === 5,
    '게임만의 값(value)은 g.live.get으로, 수의 목록과 처음 값이 없는 칸도 검사를 지나면 반영');
  L.reset('SALVAGE.dust', 'op'); L.reset('NET.extra', 'op');
  check(SALVAGE.dust.length === 4 && !('extra' in NET), '소스로 돌리면 없던 칸은 다시 없다');
  // 재시작 뒤 유지 (SQLite)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-live-'));
  const file = path.join(dir, 'game.db');
  const s1 = new SqliteStore(file);
  const g1 = new Game({ now: () => T });
  g1.live.attach(s1);
  g1.live.set('MARKET.tax', 0.25, '운영자');
  g1.live.setFlag('market', false, '운영자');
  s1.close();
  applyLive('MARKET.tax', undefined); // 새 프로세스처럼: 내용은 소스의 값
  const before = MARKET.tax;
  const s2 = new SqliteStore(file);
  const g2 = new Game({ now: () => T });
  g2.live.attach(s2);
  check(before === tax0 && MARKET.tax === 0.25 && !g2.flags.on('market') && g2.live.row('MARKET.tax')?.by === '운영자' && g2.live.log(null, 10).length === 2, '다시 켜도 원격 설정과 깃발이 남고 내용에 다시 적용된다, 이력도 (SQLite)');
  // 저장된 값이 지금의 검사를 지나지 못하면(소스가 바뀌었다) 적용하지 않는다
  s2.liveWrite('cfg:SALVAGE.dust', ['깨짐'], 'x', T);
  const warn = console.warn; let warned = ''; console.warn = (m: string) => { warned += m; };
  const g3 = new Game({ now: () => T }); g3.live.attach(s2);
  console.warn = warn;
  check(SALVAGE.dust.length === 4 && warned.includes('적용하지 않았습니다'), '저장된 값이 검사를 지나지 못하면 적용하지 않고 알린다');
  g2.live.reset('MARKET.tax', 'op');
  s2.close();
  removeTemp(dir);
  check(MARKET.tax === tax0, '시험 뒤 내용은 소스 그대로');
}

// ---------- 4. 깃발·공지·점검 (Game만) ----------
{
  let T = utc('2026-11-27T10:00:00Z');
  const g = new Game({ now: () => T });
  const p = g.players.spawn('깃발', false, null, 'k-flag');
  const tick = (s: number) => { for (let i = 0; i < s * 20; i++) { T += 50; g.tick(0.05); } };
  check(g.flags.on('market') && g.flags.on('anything'), '깃발이 없으면 켜짐 (지금과 같다)');
  check('err' in g.live.setFlag('nope', false, 'op') && !('err' in g.live.setFlag('market', false, 'op')) && !g.flags.on('market'), '모르는 깃발은 거절, 아는 깃발은 끈다');
  g.notices = [];
  g.command(p, { t: 'market', a: 'list', page: 0 });
  g.command(p, { t: 'mailClaim', id: 0 });
  const offs = g.notices.filter((n) => n.k === 'featureOff').map((n) => n.a[0]);
  check(offs.join() === 'market', `꺼진 기능의 명령은 처리하지 않고 안내문 featureOff (${offs.join()}), 켜진 것은 그대로`);
  g.live.gate('dance', 'testGate'); let danced = 0; g.commands.set('dance', () => danced++);
  g.live.setFlag('testGate', false, 'op'); g.command(p, { t: 'dance' }); g.live.setFlag('testGate', true, 'op'); g.command(p, { t: 'dance' });
  check(danced === 1 && g.live.flagList().some((f) => f.name === 'testGate'), '게임의 깃발(FLAGS)과 g.live.gate로 게임의 명령도 막는다');
  // 공지: 지금 것과 예약한 것
  g.casts = [];
  const a = g.live.addNotice({ text: { ko: '지금 공지', en: 'Now' }, from: T - 1000, to: T + 60_000, popup: true, ticker: true }, 'op');
  const b = g.live.addNotice({ text: { ko: '예약 공지' }, from: T + 10_000, to: T + 120_000, ticker: true }, 'op');
  const lists = () => g.casts.filter((m): m is Extract<ServerMsg, { t: 'notices' }> => m.t === 'notices').map((m) => m.list.map((n: NoticeView) => n.id).join('+'));
  check(lists().join('|') === a && g.live.notices().length === 1, `공지를 올리면 보이는 목록이 바로 간다, 예약한 것은 아직 (${lists().join('|')})`);
  g.casts = []; tick(11);
  check(lists().join('|') === `${a}+${b}`, `예약한 시각이 되면 목록이 다시 간다 (${lists().join('|')})`);
  g.casts = []; tick(50);
  check(lists().join('|') === b, `끝난 공지는 빠진다 (${lists().join('|')})`);
  check(g.live.delNotice(b, 'op') && !g.live.delNotice('999', 'op') && g.live.notices().length === 0, '공지를 내린다, 없는 공지는 false');
  // 점검: 6분 뒤로 예고 → 5분·1분 전 안내 → 시작 → 끝
  let started = 0, ended = 0;
  g.on('maintStarted', () => started++); g.on('maintEnded', () => ended++);
  g.announces = []; g.casts = [];
  g.live.planMaint(T + 6 * 60_000, T + 66 * 60_000, { ko: '서버 옮기기' }, 'op');
  const plan = g.casts.find((m) => m.t === 'maint') as Extract<ServerMsg, { t: 'maint' }> & { on?: boolean } | undefined;
  tick(70); const at5 = g.announces.map((x) => `${x.k}:${x.a[0]}`);
  tick(240); const at1 = g.announces.map((x) => `${x.k}:${x.a[0]}`);
  tick(60);
  check(plan?.on === false && at5.join() === 'maintSoon:6,maintSoon:5' && at1.join() === 'maintSoon:6,maintSoon:5,maintSoon:1' && started === 1 && g.live.maintOn(), `예고는 모두에게, 예고한 때(10분 안)와 5분·1분 전 안내, 시각이 되면 점검 시작 (${at1.join()})`);
  check(g.live.endMaint('op') && ended === 1 && !g.live.maintOn() && g.live.maint() === null && g.announces.some((x) => x.k === 'maintEnd'), '점검을 끝낸다');
  g.live.setAdmin('k-boss', '사장', 'op');
  check(g.live.isAdmin('k-boss') && !g.live.isAdmin('k-flag') && !g.live.isAdmin(null), '점검 중 입장(관리자)은 저장 키로');
}

// ---------- 5. 서버와 관리자 명령 ----------
{
  let T = Date.now();
  const store = new MemoryStore();
  const { createHash } = await import('node:crypto');
  const hk = (t: string) => createHash('sha256').update(t).digest('hex');
  const TA = 'liveops-admin-token-aaaa', TB = 'liveops-player-token-bbb', TC = 'liveops-offline-token-cc';
  store.savePlayer(hk(TA), { name: '운영', lv: 3, exp: 0, need: 109, maxHp: 230, sparks: 0, gold: 10, cls: 'knight', seen: T });
  store.savePlayer(hk(TB), { name: '손님', lv: 3, exp: 0, need: 109, maxHp: 230, sparks: 0, gold: 10, cls: 'knight', seen: T });
  store.savePlayer(hk(TC), { name: '쉬는이', lv: 3, exp: 0, need: 109, maxHp: 230, sparks: 0, gold: 10, cls: 'knight', seen: T - 40 * D });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-status-'));
  const s = await startServer(0, { store, backup: false, admin: { token: 'liveops-admin' }, status: { dir, everyS: 5 }, game: { now: () => T } });
  const run = (line: string) => s.admin.run(line.split(' ')[0], line.split(' ').slice(1), '시험', '127.0.0.1');
  const runA = (cmd: string, args: string[]) => s.admin.run(cmd, args, '시험', '127.0.0.1');
  const status = () => JSON.parse(fs.readFileSync(path.join(dir, 'status.json'), 'utf8')) as { state: string; players: number; maint?: { on: boolean } };
  check(status().state === 'ok' && fs.readFileSync(path.join(dir, 'status.html'), 'utf8').includes('status.json'), '상태 페이지: 켜질 때 status.json(정상)과 status.html을 쓴다');
  // 공지: 올리고 접속하면 받는다
  const n1 = runA('notice', ['add', '--popup', '--for', '2h', '--ko', '오늘', '저녁', '점검', '--en', 'Maintenance', 'tonight']);
  const got: ServerMsg[] = [];
  const b = await connect(s.port, undefined, TB, (m) => got.push(m));
  await until(() => got.some((m) => m.t === 'notices'), 3000);
  const nl = got.find((m) => m.t === 'notices') as Extract<ServerMsg, { t: 'notices' }> | undefined;
  check(n1.ok && nl?.list.length === 1 && nl.list[0].text.ko === '오늘 저녁 점검' && nl.list[0].text.en === 'Maintenance tonight' && nl.list[0].popup === true && !nl.list[0].ticker, `notice add: 여러 낱말의 글, 접속하면 공지를 받는다 (${n1.out})`);
  check(!runA('notice', ['add', '--ko']).ok && !runA('notice', ['add', '--from', '어제', '--ko', 'x']).ok && run('notice').out.includes('보이는 중'), '공지: 쓰는 법이 틀리면 실패, 목록');
  // 깃발 chat: 꺼지면 말이 가지 않고 안내문
  run('flag chat off');
  b.send({ t: 'chat', text: '들리나요' });
  await until(() => b.sys.some((x) => x.startsWith('featureOff')), 3000);
  check(b.sys.includes('featureOff:chat') && b.chat.length === 0 && run('flag').out.includes('chat  꺼짐'), '깃발 chat이 꺼지면 대화가 가지 않고 featureOff:chat');
  run('flag chat on');
  // 원격 설정: 접속한 화면에 바로
  got.length = 0;
  const set1 = run('set MARKET.tax 0.3');
  await until(() => got.some((m) => m.t === 'live'), 3000);
  const bad = run('set MARKET.tax 2'), hist = run('set --log MARKET.tax');
  check(set1.ok && got.some((m) => m.t === 'live' && m.set['MARKET.tax'] === 0.3) && !bad.ok && bad.out.includes('거절') && hist.out.includes('0.3') && run('set').out.includes('MARKET.tax = 0.3'), `set: 반영되고 접속한 화면에 가고, 잘못된 값은 실패로 남고, 이력이 보인다 (${bad.out})`);
  run('set MARKET.tax --reset');
  check(MARKET.tax !== 0.3, 'set --reset');
  // 깃발 join: 새 접속은 막히고, 관리자(maint allow)는 들어온다
  check(run('maint allow 운영').ok, 'maint allow: 점검 중에 들어올 사람');
  run('flag join off');
  const tryJoin = (token?: string) => new Promise<{ welcome: boolean; code: number; msgs: string[] }>((done) => {
    const ws = new WebSocket(`ws://127.0.0.1:${s.port}`), msgs: string[] = [];
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', token })));
    ws.on('message', (d) => { const m = JSON.parse(d.toString()) as ServerMsg; msgs.push(m.t === 'sys' ? `sys:${m.k}` : m.t); if (m.t === 'welcome') { ws.close(); done({ welcome: true, code: 0, msgs }); } });
    ws.on('close', (code) => done({ welcome: false, code, msgs }));
    ws.on('error', () => { /* close가 뒤따른다 */ });
  });
  const j1 = await tryJoin(), j2 = await tryJoin(TA);
  check(!j1.welcome && j1.code === 4005 && j1.msgs.includes('sys:joinClosed') && j2.welcome && b.ws.readyState === b.ws.OPEN, `깃발 join이 꺼지면 새 접속은 4005와 joinClosed, 관리자는 들어오고 이미 있던 사람은 그대로 (${j1.code})`);
  run('flag join on');
  // 점검: 예고 → 시작(관리자만 남는다) → 손님은 막힘, 관리자는 입장 → 끝과 보상
  const a = await connect(s.port, undefined, TA, () => {});
  const bClosed = new Promise<number>((done) => b.ws.on('close', (c) => done(c)));
  got.length = 0;
  const plan = runA('maint', ['plan', '+10m', '--for', '1h', '--ko', '서버', '옮기기']);
  await until(() => got.some((m) => m.t === 'maint'), 3000);
  const pm = got.find((m) => m.t === 'maint') as { at: number; until: number; on: boolean; text?: { ko?: string } } | undefined;
  check(plan.ok && pm?.on === false && pm.until - pm.at === H && pm.text?.ko === '서버 옮기기' && run('maint').out.includes('점검 예고'), `maint plan: 접속한 화면에 예고와 예정 끝 (${plan.out})`);
  T += 9 * 60_000 + 30_000;
  await until(() => b.sys.some((x) => x.startsWith('maintSoon')), 4000);
  check(b.sys.some((x) => x.startsWith('maintSoon:1')), `1분 전 안내 (${b.sys.filter((x) => x.startsWith('maint')).join(', ')})`);
  T += 40_000;
  const code = await Promise.race([bClosed, new Promise<number>((r) => setTimeout(() => r(-1), 5000))]);
  await until(() => status().state === 'maint', 3000);
  check(code === 4004 && b.sys.some((x) => x.startsWith('maintStart')) && a.ws.readyState === a.ws.OPEN && s.game.live.maintOn() && status().state === 'maint', `시각이 되면 점검: 손님은 저장되고 4004로 끊기고 관리자는 남는다, 상태 페이지도 점검 (${code})`);
  check(store.loadPlayer(hk(TB)) !== null, '끊긴 사람은 저장되어 있다');
  const j3 = await tryJoin(TB), j4 = await tryJoin();
  check(!j3.welcome && j3.code === 4004 && j3.msgs.includes('maint') && !j4.welcome && j4.code === 4004, '점검 중에 손님과 저장된 사람은 들어오지 못한다 (4004와 점검 안내)');
  // 관리자는 다시 들어와도 된다
  a.ws.close();
  await until(() => s.game.players && ![...s.game.ents.values()].some((e) => e.kind === 'p' && e.name === '운영'), 3000);
  const j5 = await tryJoin(TA);
  check(j5.welcome, '점검 중에도 관리자는 들어온다');
  // 끝: 보상 우편 (최근 30일 안에 저장된 캐릭터: 쉬는이는 빠진다)
  const bad2 = runA('maint', ['end', '--item', 'nothing:3']);
  check(!bad2.ok && s.game.live.maintOn(), '보상이 이상하면 점검을 끝내지 않는다');
  const end = runA('maint', ['end', '--gold', '100', '--days', '30']);
  const waiting = s.game.mail.waitingFor(hk(TB)), rest = s.game.mail.waitingFor(hk(TC));
  check(end.ok && end.out.includes('2명') && waiting.length === 1 && waiting[0].k === 'maint' && waiting[0].r.gold === 100 && rest.length === 0 && !s.game.live.maintOn(), `maint end: 점검이 끝나고 보상 우편 (${end.out})`);
  await until(() => status().state === 'ok', 3000);
  const j6 = await tryJoin(TB);
  check(j6.welcome && status().state === 'ok', '점검이 끝나면 다시 들어온다, 상태 페이지는 정상');
  check(run('audit 30').out.includes('maint end') && run('set --log maint').out.includes('maint v'), '관리자 기록과 원격 설정 이력에 남는다');
  await s.close();
  check(status().state === 'down', '깨끗하게 끄면 상태 페이지는 꺼짐(down)');
  removeTemp(dir);
}
