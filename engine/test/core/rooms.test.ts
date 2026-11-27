// 판(rooms 모듈): 핵심만의 내용(공 마당) 위에서 작은 '말뚝 세기' 판으로 본다. 게임의 파일을 읽지 않는다.
// 판 열기·짝짓기·컴퓨터로 채우기, 판마다의 층(엔티티·스냅샷이 나뉜다), 차례와 기한(넘김, 게임의 처리), 바퀴의 상한, 끊김과 같은 저장 키로 돌아옴, 몰수,
// 기권·다시 하기(자리 돌리기)·나가기와 정리, 걷기 멈춤, 판의 저장과 되살리기, 연출 사건(g.effect), 순간 이동, 실제 소켓 둘. 모듈을 고르지 않으면 아무것도 없다.
// 셋 이상의 판은 '별 줍기'(server/stars.ts)로: 자리 수의 범위와 지금 시작, 바퀴마다 선 돌리기, 바퀴의 끝, 등수로 끝내기, 셋 이상의 기권(outEnds·out·skip), 컴퓨터의 이름.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RoomLobby, RoomView } from '../../shared/defs/rooms';
import type { ServerMsg } from '../../shared/protocol';
import { Game, type Plugin } from '../../server/game/game';
import type { Ent } from '../../server/game/entity';
import { isField } from '../../server/game/layers';
import type { Room, RoomDef } from '../../server/game/systems/rooms';
import { buildFrame, snapshotFor } from '../../server/net/snapshot';
import { startServer } from '../../server/net/server';
import { MemoryStore, SqliteStore } from '../../server/store';
import { SCHEMA } from '../../server/store/sqlite';
import { STARS, stars, type Stars } from './server/stars';
import { check, connect, removeTemp, settle, until, type Peer } from '../harness';

/** 말뚝 세기: 내 차례에 말뚝 n개(1~3)를 세면 차례가 넘어간다. 세 바퀴를 다 쓰면 많이 세운 쪽이 이긴다. 컴퓨터는 늘 1개 */
interface Pegs { score: number[]; marks: number[] }
const BOARD = { x: 0, z: 20 };
const pegs = (over: Partial<Parameters<Game['rooms']['define']>[0]> = {}): Plugin => (g) => {
  g.defineKind('peg', { sync: (e) => [Number(e.data.n ?? 0)] });
  const put = (room: Room<Pegs>) => { for (let i = 0; i < 2; i++) room.data.marks.push(g.rooms.place(room, 'peg', { x: BOARD.x - 2 + i * 4, z: BOARD.z }).id); };
  g.rooms.define<Pegs>({
    seats: 2, turnS: 10, rounds: 3, graceS: 20, cpuAfterS: 15, cpuStepMs: 500,
    seatAt: (_r, i) => ({ x: BOARD.x - 4 + i * 8, z: BOARD.z, face: i ? -Math.PI / 2 : Math.PI / 2 }),
    exitAt: () => ({ x: 0, z: -6 }),
    start: (room) => { room.data = { score: [0, 0], marks: [] }; put(room); },
    cpu: (room, seat) => { room.data.score[seat] += 1; g.rooms.pass(room); },
    outOfRounds: (room) => { const [a, b] = room.data.score; g.rooms.finish(room, a > b ? 0 : b > a ? 1 : -2, 'count'); },
    finished: (room) => { for (const p of g.rooms.players(room)) p.data.ended = Number(p.data.ended ?? 0) + 1; },
    save: (room) => ({ score: room.data.score }),
    load: (room, raw) => { room.data = { score: [...((raw as { score: number[] }).score)], marks: [] }; put(room); },
    ...over,
  });
  g.commands.set('peg', (p, m) => {
    const t = g.rooms.myTurn<Pegs>(p);
    if (!t || typeof m.n !== 'number' || ![1, 2, 3].includes(m.n)) return;
    t.room.data.score[t.seat] += m.n;
    g.effect(t.room.data.marks[t.seat], 'pegHit', t.seat, m.n);
    g.rooms.pass(t.room);
  });
};

function world(over?: Partial<Parameters<Game['rooms']['define']>[0]>) {
  let clock = 1_800_000_000_000;
  const g = new Game({ modules: ['rooms'], plugins: [pegs(over)], now: () => clock });
  const run = (s: number) => { for (let i = 0; i < Math.round(s * 20); i++) { clock += 50; g.tick(0.05); } };
  let n = 0;
  const join = (name: string, pid = `key-${name}-${++n}-0123456789ab`) => g.players.spawn(name, false, null, pid);
  const room = (a: string, p: Ent, id?: number) => g.command(p, id === undefined ? { t: 'room', a } : { t: 'room', a, id });
  const said = (p: Ent, k: string) => g.notices.some((x) => x.id === p.id && x.k === k);
  const view = (p: Ent) => g.personal.find((x) => x.name === 'room')!.state(p) as RoomView | null;
  const lobby = () => g.state().rooms as RoomLobby;
  const drop = (p: Ent) => { g.fire('playerDropped', p); g.players.leave(p.id); };
  return { g, run, join, room, said, view, lobby, drop, now: () => clock };
}

// ---------- 모듈을 고르지 않으면 ----------
{
  const g = new Game({ now: () => 0 });
  let msg = '';
  try { g.rooms.count; } catch (e) { msg = String(e); }
  check(!g.commands.has('room') && !g.personal.some((x) => x.name === 'room') && !('rooms' in g.state()) && msg.includes("'rooms'"), '판 모듈을 고르지 않은 게임: room 명령·개인 상태·공유 상태가 없고, g.rooms는 무엇을 고르라는 오류를 낸다');
}

// ---------- 판 열기, 짝짓기, 층 ----------
{
  const { g, join, room, said, view, lobby, run } = world();
  const a = join('A'), b = join('B'), c = join('C');
  const fieldA = a.layer;
  room('quick', a);
  const r = g.rooms.of(a)!;
  check(said(a, 'roomWait') && view(a)?.st === 'wait' && lobby().rows.length === 1 && lobby().rows[0][4] === 0 && lobby().cpu === 1, '빠른 대국: 기다리는 판이 없으면 판을 열고 기다린다 (대기실 목록에 보인다)');
  check(a.layer === r.layer && !isField(r.layer) && Math.hypot(a.x - (BOARD.x - 4), a.z - BOARD.z) < 0.01 && g.events.some((e) => e[0] === 'r' && e[1] === a.id), '판을 연 사람은 판의 층과 자리 0으로 순간 이동한다 (화면에 바로 옮김 r)');
  check(g.rules.speed(a) === 0 && g.rules.speed(c) > 0, '앉은 사람은 걷지 않는다 (RoomDef.walk 없음)');
  room('quick', b);
  check(g.rooms.of(b) === r && r.st === 'play' && view(a)?.me === 0 && view(b)?.me === 1 && view(b)?.turn === 0 && said(b, 'roomStart') && b.layer === r.layer, '두 번째 빠른 대국은 그 판에 들어가 시작한다 (자리 0이 먼저)');
  check(r.ents.size === 2 && [...r.ents].every((id) => g.ents.get(id)?.layer === r.layer), 'start가 room.place로 놓은 말뚝은 판의 층에 있다');
  check(view(a)?.left === 10_000 && view(a)?.turnMs === 10_000 && view(a)?.rounds === 3, '개인 상태 room: 남은 시간(ms)과 한 차례의 길이, 바퀴의 상한');
  g.notices = [];
  room('join', c, r.id);
  check(said(c, 'roomGone') && !g.rooms.of(c), '찬 판에는 들어갈 수 없다');
  room('host', a);
  check(said(a, 'roomBusy'), '앉은 사람은 판을 또 열지 못한다');
  // 다른 판: 같은 좌표지만 층이 달라 서로 보이지 않는다
  const d = join('D'), e = join('E');
  room('quick', d); room('quick', e);
  const r2 = g.rooms.of(d)!;
  check(r2 !== r && r2.layer !== r.layer && r2.st === 'play', '다음 둘은 새 판 (다른 층)');
  run(0.05);
  const frame = buildFrame(g.ents.values(), (x: Ent) => (x.kind === 'p' ? undefined : g.kinds.get(x.kind)?.sync?.(x)), { hp: false, weapon: false, cls: false });
  const seenBy = (p: Ent) => { const s = snapshotFor(p, new Set(), frame, [], 5); return [...s.seen]; };
  const sa = seenBy(a), sd = seenBy(d), sc = seenBy(c);
  check(sa.includes(b.id) && [...r.ents].every((id) => sa.includes(id)) && !sa.includes(d.id) && ![...r2.ents].some((id) => sa.includes(id)), '판의 사람은 자기 판의 사람과 말뚝만 본다 (같은 자리의 다른 판은 보이지 않는다)');
  check(sd.includes(e.id) && !sd.includes(a.id) && !sc.includes(a.id) && !sc.some((id) => r.ents.has(id)), '다른 판과 들판(대기실)도 서로 보이지 않는다');
  check(fieldA === 0 && c.layer === fieldA, '들판의 사람은 들판의 층에 그대로');
}

// ---------- 차례와 기한 ----------
{
  const { g, run, join, room, said, view } = world();
  const a = join('A'), b = join('B');
  room('host', a); room('join', b, g.rooms.of(a)!.id);
  const r = g.rooms.of<Pegs>(a)!;
  g.notices = [];
  g.command(b, { t: 'peg', n: 2 });
  check(said(b, 'roomNotTurn') && r.data.score[1] === 0, '내 차례가 아니면 게임 명령이 거절된다 (g.rooms.myTurn이 roomNotTurn을 알린다)');
  g.events = [];
  g.command(a, { t: 'peg', n: 2 });
  check(r.data.score[0] === 2 && r.turn === 1 && view(b)?.turn === 1, '게임이 pass를 부르면 다음 자리의 차례');
  const fx = g.events.find((e) => e[0] === 'fx');
  check(!!fx && fx[1] === r.data.marks[0] && fx[2] === 'pegHit' && fx[3] === 0 && fx[4] === 2, `연출 사건 g.effect: ['fx', 엔티티, 이름, …값] (${JSON.stringify(fx)})`);
  room('pass', b);
  check(r.turn === 0 && r.round === 2, '차례 넘기기 (room a:pass): 한 바퀴가 돌면 round가 오른다');
  run(9.9);
  check(r.turn === 0 && (view(a)?.left ?? 0) > 0 && (view(a)?.left ?? 0) <= 100, '기한 전에는 그대로 (남은 시간이 준다)');
  g.notices = [];
  run(0.2);
  check(r.turn === 1 && said(a, 'roomTimeout') && said(b, 'roomTimeout') && (view(b)?.left ?? 0) >= 9_900, '시간이 다 되면 모두에게 알리고 기본 처리로 넘긴다 (새 차례는 다시 10초)');
  room('pass', b); room('pass', a); room('pass', b);
  check(r.st === 'over' && r.why === 'count' && r.win === 0 && said(a, 'roomResult') && a.data.ended === 1 && b.data.ended === 1, '세 바퀴를 다 쓰면 게임의 outOfRounds가 끝을 정한다 (finished가 불린다)');
  check(r.ents.size === 2 && view(a)?.win === 0 && view(a)?.why === 'count' && view(a)?.turn === -1, '끝난 판은 그대로 남아 결과를 보여 준다');
  // 다시 하기: 둘 다 누르면 자리를 돌려 새 판
  const before = [...r.ents];
  room('again', a);
  check(said(a, 'roomAgainWait') && r.st === 'over' && view(b)?.seats[0].again === 1, '한 사람만 누르면 기다린다');
  room('again', b);
  check(r.st === 'play' && view(b)?.me === 0 && view(a)?.me === 1 && r.turn === 0 && before.every((id) => !g.ents.has(id)) && r.ents.size === 2, '둘 다 누르면 자리를 한 칸 돌려 새 판 (먼저 두는 사람이 바뀌고, 앞 판의 말뚝은 치운다)');
  check(Math.hypot(a.x - (BOARD.x + 4), a.z - BOARD.z) < 0.01, '자리를 바꾸면 사람도 새 자리로 옮겨진다');
  // 게임이 정한 시간 넘김 처리
  const t2 = world({ timeout: (room) => { const g2 = t2.g; g2.rooms.finish(room, room.turn === 0 ? 1 : 0, 'slow'); } });
  const x = t2.join('X'), y = t2.join('Y');
  t2.room('host', x); t2.room('join', y, t2.g.rooms.of(x)!.id);
  t2.run(10.1);
  check(t2.g.rooms.of(x)!.st === 'over' && t2.g.rooms.of(x)!.why === 'slow' && t2.g.rooms.of(x)!.win === 1, 'RoomDef.timeout: 시간 넘김을 게임이 처리한다 (여기서는 진 것으로)');
}

// ---------- 컴퓨터 ----------
{
  const { g, run, join, room, view, lobby } = world();
  const a = join('A');
  room('cpu', a);
  const r = g.rooms.of<Pegs>(a)!;
  check(r.st === 'play' && view(a)?.seats[1].cpu === 1 && lobby().rows[0][5] === 1, '컴퓨터와 두기: 빈 자리를 컴퓨터로 채우고 바로 시작한다');
  g.command(a, { t: 'peg', n: 3 });
  run(0.6);
  check(r.turn === 1, '컴퓨터는 바로 두지 않는다 (사람이 보고 따라가게 cpuStepMs 간격)');
  run(0.5);
  check(r.turn === 0 && r.data.score[1] === 1, '간격이 지나면 컴퓨터의 한 수 (RoomDef.cpu)');
  // 기다리다 컴퓨터로 채우기
  const b = join('B');
  room('host', b);
  const rb = g.rooms.of(b)!;
  run(14);
  check(rb.st === 'wait' && view(b)?.st === 'wait', `cpuAfterS(15초) 전에는 사람을 기다린다`);
  run(1.1);
  check(rb.st === 'play' && rb.seats[1]?.cpu === true, '아무도 오지 않으면 빈 자리를 컴퓨터로 채워 시작한다 (혼자면 컴퓨터)');
  // 컴퓨터와 둔 판의 다시 하기: 곧바로, 자리를 돌려 (컴퓨터가 먼저)
  room('resign', a);
  check(r.st === 'over' && r.win === 1 && r.why === 'resign', '기권하면 상대가 이긴다');
  room('again', a);
  check(r.st === 'play' && view(a)?.me === 1 && r.turn === 0, '컴퓨터와는 다시 하기가 곧바로 (자리를 돌려 컴퓨터가 먼저 둔다)');
}

// ---------- 끊김과 돌아옴, 몰수, 나가기 ----------
{
  const { g, run, join, room, said, view, drop } = world();
  const a = join('A', 'key-a-rooms-0123456789'), b = join('B');
  room('host', a); room('join', b, g.rooms.of(a)!.id);
  const r = g.rooms.of(a)!, layer = r.layer;
  g.notices = [];
  drop(a);
  check(said(b, 'roomFoeLeft') && view(b)?.seats[0].away === 1 && r.st === 'play', '끊기면 함께 앉은 사람에게 알리고 판은 기다린다');
  run(10.1);
  check(r.turn === 1, '끊긴 사람의 차례도 시간이 다 되면 넘어간다');
  const a2 = join('A', 'key-a-rooms-0123456789');
  check(g.rooms.of(a2) === r && view(a2)?.me === 0 && said(a2, 'roomBack') && said(b, 'roomFoeBack') && a2.layer === layer && view(b)?.seats[0].away === 0, '같은 저장 키로 다시 들어오면 그 판의 자리와 층으로 돌아온다 (엔티티 id는 새것)');
  check(a2.id !== a.id && Math.hypot(a2.x - (BOARD.x - 4), a2.z - BOARD.z) < 0.01, '돌아온 사람은 자기 자리에 선다');
  g.notices = [];
  drop(a2);
  run(20.1);
  check(r.st === 'over' && r.win === 1 && r.why === 'left' && said(b, 'roomResult'), '기다림(graceS)이 지나도 돌아오지 않으면 몰수 (까닭 left)');
  g.notices = [];
  room('again', b);
  check(said(b, 'roomFoeGone') && r.st === 'over', '떠난 사람과는 다시 할 수 없다');
  const marks = [...r.ents];
  room('leave', b);
  check(g.rooms.count === 0 && marks.every((id) => !g.ents.has(id)) && isField(b.layer) && Math.hypot(b.x, b.z + 6) < 0.01 && g.rules.speed(b) > 0 && view(b) === null, '남은 사람도 나가면 판이 닫힌다: 말뚝을 치우고, 사람은 들판의 층과 exitAt의 자리로, 다시 걷는다');
  const a3 = join('A', 'key-a-rooms-0123456789');
  check(!g.rooms.of(a3) && isField(a3.layer) && Math.hypot(a3.x, a3.z + 6) < 0.01, '판이 닫힌 뒤에 들어오면 판 밖의 자리(exitAt)에 선다');
  // 기다리던 사람이 끊기면 판이 닫힌다
  const c = join('C');
  room('host', c);
  drop(c);
  check(g.rooms.count === 0 && (g.state().rooms as RoomLobby).rows.length === 0, '기다리던 사람이 끊기면 그 판은 닫힌다');
  // 두는 중에 나가면 기권
  const d = join('D'), e = join('E');
  room('quick', d); room('quick', e);
  const rd = g.rooms.of(d)!;
  room('leave', e);
  check(rd.st === 'over' && rd.win === 0 && rd.why === 'resign' && !g.rooms.of(e) && isField(e.layer), '두는 중에 대기실로 나가면 기권으로 치고 판을 떠난다');
  // 손님도 둔다 (돌아올 수는 없다)
  const guest = g.players.spawn('guest', false);
  room('cpu', guest);
  check(g.rooms.of(guest)?.st === 'play', '손님(저장 키 없음)도 판을 둔다');
  // 판의 상한
  const w2 = world({ max: 2 });
  const ps = ['P', 'Q', 'R'].map((n) => w2.join(n));
  for (const p of ps) w2.room('host', p);
  check(w2.g.rooms.count === 2 && w2.said(ps[2], 'roomFull'), 'RoomDef.max를 넘으면 판을 열 수 없다 (roomFull)');
}

// ---------- 판의 저장과 되살리기 ----------
{
  const w = world();
  const a = w.join('A', 'key-save-a-0123456789'), b = w.join('B', 'key-save-b-0123456789');
  w.room('host', a); w.room('join', b, w.g.rooms.of(a)!.id);
  w.g.command(a, { t: 'peg', n: 3 });
  const c = w.join('C', 'key-save-c-0123456789');
  w.room('cpu', c);
  const d = w.join('D');
  w.room('host', d);
  check(w.g.saveDirty, '두는 중인 판이 바뀌면 월드를 저장할 것으로 친다 (save를 준 게임)');
  const saved = JSON.parse(JSON.stringify(w.g.exportWorld()));
  check(Array.isArray(saved.rooms?.rooms) && saved.rooms.rooms.length === 2, `두는 중인 판만 적는다 (기다리는 판은 빼고 ${saved.rooms?.rooms?.length}판)`);
  // 서버를 다시 켠다
  const w2 = world();
  w2.g.importWorld(saved);
  const rs = w2.g.rooms.all();
  check(rs.length === 2 && rs.every((r) => r.st === 'play' && r.ents.size === 2) && (rs[0] as Room<Pegs>).data.score[0] === 3 && rs[0].turn === 1, '다시 켜면 두던 판이 판 상태·말뚝·차례와 함께 되살아난다');
  check(rs.every((r) => r.seats.every((s) => !s || s.cpu || s.goneAt > 0)), '사람의 자리는 모두 끊긴 채로 기다린다 (graceS)');
  const b2 = w2.join('B', 'key-save-b-0123456789');
  check(w2.g.rooms.of(b2) === rs[0] && w2.view(b2)?.me === 1 && b2.layer === rs[0].layer && w2.said(b2, 'roomBack') && (w2.view(b2)?.left ?? 0) === 10_000, '같은 저장 키로 들어오면 그 판으로 돌아간다 (두던 차례는 처음부터 다시)');
  w2.run(20.1);
  check(rs[0].st === 'over' && rs[0].win === 1 && rs[0].why === 'left', '돌아오지 않은 사람은 기다림이 지나면 몰수');
  check(w2.g.rooms.count === 1 && !w2.g.rooms.all().includes(rs[1]), '아무도 돌아오지 않은 판(컴퓨터와 두던 판)은 닫힌다');
  // 깨진 저장
  const w3 = world();
  w3.g.importWorld({ rooms: { next: 'x', rooms: [null, 5, { seats: 'q' }, { seats: [null, null], data: {} }, { seats: [{ key: 'k', name: 'n' }, { cpu: 1 }], data: 'broken' }] } } as never);
  check(w3.g.rooms.count <= 1 && w3.g.rooms.all().every((r) => r.seats.length === 2), '깨진 저장은 그 판만 버리고 서버는 뜬다');
}

// ---------- 판 100개 ----------
{
  const w = world();
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) w.room('quick', w.join(`M${i}`));
  check(w.g.rooms.count === 100 && w.g.rooms.all().every((r) => r.st === 'play') && new Set(w.g.rooms.all().map((r) => r.layer)).size === 100, '판 100개: 모두 두는 중이고 층이 모두 다르다 (판의 수가 맵의 자리에 묶이지 않는다)');
  w.run(30);
  check(w.g.rooms.all().every((r) => r.round >= 2), `판 100개가 기한으로 함께 돈다 (${Math.round(performance.now() - t0)}ms)`);
}

// ---------- 실제 서버와 소켓 둘 ----------
{
  const store = new MemoryStore();
  const s = await startServer(0, { store, game: { modules: ['rooms'], plugins: [pegs()] } });
  const views = new Map<Peer, RoomView | null>(), lobbies: RoomLobby[] = [], fx: [Peer, unknown][] = [];
  const listen = (m: ServerMsg, p: Peer) => {
    if (m.t === 'me' && m.k === 'room') views.set(p, m.s as RoomView | null);
    if (m.t === 'world' && m.s.rooms) lobbies.push(m.s.rooms);
  };
  try {
    const a = await connect(s.port, 'Ann', 'rooms-net-a-0123456789', listen);
    const b = await connect(s.port, 'Bo', 'rooms-net-b-0123456789', listen);
    a.ws.on('message', (d) => { const m = JSON.parse(d.toString()) as ServerMsg; if (m.t === 'snap') for (const e of m.ev ?? []) if (e[0] === 'fx') fx.push([a, e]); });
    a.send({ t: 'room', a: 'quick' });
    await until(() => views.get(a)?.st === 'wait');
    await until(() => lobbies.some((l) => l.rows.length === 1));
    b.send({ t: 'room', a: 'quick' });
    await until(() => views.get(a)?.st === 'play' && views.get(b)?.st === 'play');
    check(views.get(a)?.me === 0 && views.get(b)?.me === 1 && b.sys.some((x) => x.startsWith('roomStart:0:Ann')), '소켓: 빠른 대국 둘이 한 판에 앉는다 (roomStart:먼저 아님:상대)');
    await until(() => [...a.seen.values()].length >= 3);
    check([...a.seen.values()].some((x) => x.name === 'Bo') && a.seen.size >= 3, '판의 층에서 서로와 말뚝을 본다');
    a.send({ t: 'peg', n: 2 } as never);
    await until(() => views.get(b)?.turn === 1 && fx.length > 0);
    check(views.get(b)?.turn === 1 && (fx[0]?.[1] as unknown[])?.[2] === 'pegHit', '소켓: 게임 명령으로 차례가 넘어가고 연출 사건이 스냅샷의 ev로 온다');
    b.ws.close();
    await until(() => a.sys.some((x) => x.startsWith('roomFoeLeft')));
    const b2 = await connect(s.port, 'Bo', 'rooms-net-b-0123456789', listen);
    await until(() => views.get(b2)?.me === 1);
    check(views.get(b2)?.st === 'play' && b2.sys.includes('roomBack') && a.sys.some((x) => x.startsWith('roomFoeBack')), '소켓: 끊고 같은 토큰으로 다시 들어오면 그 판의 자리로');
    a.send({ t: 'room', a: 'resign' });
    await until(() => views.get(b2)?.st === 'over');
    check(views.get(b2)?.win === 1 && views.get(b2)?.why === 'resign', '소켓: 기권하면 결과가 간다');
    a.send({ t: 'room', a: 'leave' }); b2.send({ t: 'room', a: 'leave' });
    await until(() => views.get(a) === null && views.get(b2) === null);
    await settle(a);
    check(s.game.rooms.count === 0, '소켓: 둘 다 나가면 판이 닫힌다');
    a.ws.close(); b2.ws.close();
  } finally {
    await s.close();
  }
}

// ========== 셋 이상의 판 (별 줍기: server/stars.ts) ==========
function starWorld(over: Partial<RoomDef<Stars>> = {}, rush: Partial<RoomDef<Stars>> = {}) {
  let clock = 1_800_000_000_000;
  const g = new Game({ modules: ['rooms'], plugins: [stars(over, rush)], now: () => clock });
  const run = (s: number) => { for (let i = 0; i < Math.round(s * 20); i++) { clock += 50; g.tick(0.05); } };
  let n = 0;
  const join = (name: string) => g.players.spawn(name, false, null, `key-star-${name}-${++n}-0123456789`);
  const room = (a: string, p: Ent, id?: number) => g.command(p, id === undefined ? { t: 'room', a } : { t: 'room', a, id });
  const view = (p: Ent) => g.personal.find((x) => x.name === 'room')!.state(p) as RoomView | null;
  const said = (p: Ent, k: string) => g.notices.filter((x) => x.id === p.id && x.k === k);
  return { g, run, join, room, view, said };
}

// ---------- 자리 수의 범위: 셋이면 셋으로, '지금 시작', 넷이면 곧바로, 모자라면 컴퓨터 ----------
{
  const { g, join, room, view, said } = starWorld();
  const [a, b, c] = ['A', 'B', 'C'].map(join);
  room('quick', a); room('quick', b);
  const r = g.rooms.of<Stars>(a)!;
  check(r.st === 'wait' && r.seats.length === 4 && view(a)?.min === 3 && (g.state().rooms as RoomLobby).startAfterS === STARS.startAfterS, 'seats { min: 3, max: 4 }: 판은 넷 자리로 열리고 화면은 min(3)과 저절로 시작하는 초를 안다');
  room('start', a);
  check(r.st === 'wait' && said(a, 'roomFewer').length === 1 && said(a, 'roomFewer')[0].a[0] === 3, "'지금 시작'은 사람이 min보다 적으면 거절 (roomFewer)");
  room('quick', c);
  room('start', b);
  check(r.st === 'wait', "'지금 시작'은 가장 먼저 앉은 사람만 (다른 사람은 무시)");
  g.notices = [];
  room('start', a);
  check(r.st === 'play' && r.seats.length === 3 && r.data.pile === 15 && view(c)?.seats.length === 3 && view(c)?.min === 3, "가장 먼저 앉은 사람의 '지금 시작': 모인 셋으로 시작한다 (빈 자리는 빠진다)");
  check(said(c, 'roomStart')[0]?.a.join() === '0,A,3' && said(a, 'roomStart')[0]?.a[0] === 1, 'roomStart의 셋째 값은 자리 수 (화면은 셋 이상이면 상대 하나를 적지 않는다)');
  // 기다림이 지나면 저절로: 셋은 셋으로, 둘은 컴퓨터가 넷까지
  const w2 = starWorld();
  const [p, q, s] = ['P', 'Q', 'S'].map(w2.join);
  for (const x of [p, q, s]) w2.room('quick', x);
  const r2 = w2.g.rooms.of(p)!;
  w2.run(STARS.startAfterS - 0.5);
  check(r2.st === 'wait', 'startAfterS 전에는 넷째를 기다린다');
  w2.run(1);
  check(r2.st === 'play' && r2.seats.length === 3 && r2.seats.every((x) => x && !x.cpu), 'startAfterS가 지나 사람이 min 이상이면 모인 만큼으로 시작한다 (컴퓨터 없이)');
  const w3 = starWorld();
  const [u, v2] = ['U', 'V'].map(w3.join);
  w3.room('quick', u); w3.room('quick', v2);
  const r3 = w3.g.rooms.of(u)!;
  w3.run(STARS.startAfterS + 1);
  check(r3.st === 'wait', '사람이 min보다 적으면 startAfterS가 지나도 기다린다');
  w3.run(STARS.cpuAfterS - STARS.startAfterS);
  check(r3.st === 'play' && r3.seats.length === 4 && r3.seats.filter((x) => x?.cpu).length === 2, '그다음 cpuAfterS가 지나면 컴퓨터가 빈 자리를 채운다 (cpuFill 기본 max: 넷까지)');
  const w4 = starWorld({ cpuFill: 'min' });
  const lone = w4.join('L');
  w4.room('cpu', lone);
  const r4 = w4.g.rooms.of(lone)!;
  check(r4.st === 'play' && r4.seats.length === 3 && r4.seats.filter((x) => x?.cpu).length === 2, "cpuFill 'min': 컴퓨터는 min(셋)이 될 만큼만 앉는다");
  // 넷이 다 차면 곧바로
  const w5 = starWorld();
  const four = ['W', 'X', 'Y', 'Z'].map(w5.join);
  for (const x of four) w5.room('quick', x);
  check(w5.g.rooms.of(four[0])?.st === 'play' && w5.g.rooms.of(four[0])?.seats.length === 4, '넷이 다 차면 기다리지 않고 시작한다');
  let msg = '';
  try { new Game({ modules: ['rooms'], plugins: [(g2) => g2.rooms.define({ seats: { min: 4, max: 3 }, start: () => undefined })], now: () => 0 }); } catch (e) { msg = String(e); }
  check(msg.includes('min ≤ max'), `seats의 범위가 거꾸로면 define이 알려 준다 (${msg.slice(0, 60)})`);
}

// ---------- 바퀴마다 선 돌리기 (rotateFirst), 바퀴의 끝 (roundEnd), 등수로 끝내기 ----------
{
  const { g, join, room, view, said } = starWorld();
  const ps = ['A', 'B', 'C', 'D'].map(join);
  for (const p of ps) room('quick', p);
  const r = g.rooms.of<Stars>(ps[0])!;
  const order: number[] = [];
  for (let k = 0; k < 8; k++) { order.push(r.turn); g.command(ps[r.turn], { t: 'star', n: 1 }); }
  check(order.join() === '0,1,2,3,1,2,3,0' && r.first === 2 && r.turn === 2 && r.round === 3 && r.data.rounds === 2, `rotateFirst: 1바퀴는 자리 0부터, 2바퀴는 1부터, 3바퀴는 2부터 (차례 ${order.join()}, roundEnd 두 번)`);
  check(view(ps[2])?.round === 3 && view(ps[0])?.turn === 2, '화면의 바퀴(round)는 그대로 센다');
  // 기권 하나: 그 자리만 빠지고 남은 셋이 잇는다 (틀의 기본). 빠진 자리는 선도 건너뛴다
  g.notices = [];
  room('resign', ps[3]);
  check(r.st === 'play' && r.seats[3]!.out && view(ps[0])?.seats[3].away === 2, '넷 가운데 하나의 기권: 그 자리만 빠지고 판은 이어진다 (outEnds 기본 false)');
  const outs: number[] = [];
  const w0 = starWorld({ out: (_rr, seat) => { outs.push(seat); } });
  const qs0 = ['Q1', 'Q2', 'Q3', 'Q4'].map(w0.join);
  for (const p of qs0) w0.room('quick', p);
  w0.room('resign', qs0[2]); w0.room('resign', qs0[2]); w0.room('leave', qs0[2]);
  check(outs.join() === '2' && w0.g.rooms.of(qs0[0])?.st === 'play', '이미 빠진 자리가 다시 기권하거나 대기실로 나가도 out은 한 번만 (판은 이어진다)');
  const order2: number[] = [];
  for (let k = 0; k < 6 && r.st === 'play'; k++) { order2.push(r.turn); g.command(ps[r.turn], { t: 'star', n: 1 }); }
  check(order2.join() === '2,0,1,0,1,2', `빠진 자리 3은 차례에서도, 선에서도 건너뛴다 (${order2.join()})`);
  // 끝까지: 셋이 많이 줍는다 → 무더기가 바닥난 바퀴의 끝에서 등수로
  g.notices = [];
  for (let k = 0; k < 40 && r.st === 'play'; k++) g.command(ps[r.turn], { t: 'star', n: r.turn === 1 ? 3 : r.turn === 0 ? 2 : 1 });
  check(r.st === 'over' && r.why === 'stars' && r.data.pile === 0 && r.round === 5, '무더기가 바닥나면 바퀴의 끝(roundEnd)에서 게임이 끝낸다');
  const ranks = view(ps[0])!.ranks;
  check(ranks.join() === '2,1,3,4' && view(ps[0])!.scores.join() === r.data.got.join() && r.win === 1, `등수로 끝내기: finish(room, 등수, 까닭, 점수) → 화면의 ranks·scores, 1등 하나면 room.win (${ranks.join()} / ${r.data.got.join()})`);
  const res = (i: number) => said(ps[i], 'roomResult')[0]?.a.join();
  check(res(1) === '0,stars,1,4,0' && res(0) === '1,stars,2,4,0' && res(2) === '1,stars,3,4,0' && res(3) === '1,stars,4,4,0', `roomResult: [이김/짐, 까닭, 내 등수, 자리 수, 같은 등수] (기권하고 앉아 있던 자리도 받는다: ${res(0)} / ${res(1)} / ${res(3)})`);
  check([0, 1, 2, 3].map((i) => g.rooms.rankOf(r, i)).join() === '2,1,3,4', 'rankOf: 등수로 끝낸 판은 그 등수');
  // 1등이 둘: room.win은 -2, 두 사람은 '함께 1등'
  const w = starWorld();
  const qs = ['E', 'F', 'G'].map(w.join);
  for (const p of qs) w.room('quick', p);
  w.room('start', qs[0]);
  const r2 = w.g.rooms.of<Stars>(qs[0])!;
  w.g.notices = [];
  w.g.rooms.finish(r2, [1, 1, 3], 'stars', [5, 5, 2]);
  check(r2.win === -2 && w.said(qs[0], 'roomResult')[0]?.a.join() === '2,stars,1,3,1' && w.said(qs[2], 'roomResult')[0]?.a.join() === '1,stars,3,3,0', '1등이 여럿이면 room.win은 -2, 그 사람들의 roomResult는 [2, 까닭, 1, 자리 수, 1](함께 1등)');
}

// ---------- 셋 이상의 기권·몰수: outEnds, out 고리, skip ----------
{
  const outs: string[] = [];
  const { g, join, room } = starWorld({ outEnds: true, out: (_r, seat, why) => { outs.push(`${seat}:${why}`); } });
  const ps = ['A', 'B', 'C'].map(join);
  for (const p of ps) room('quick', p);
  room('start', ps[0]);
  const r = g.rooms.of<Stars>(ps[0])!;
  room('resign', ps[1]);
  check(outs.join() === '1:resign' && r.st === 'over' && r.ranks.join() === '1,3,1' && r.win === -2, `outEnds: 하나가 빠지면 판이 끝난다 (out 고리가 먼저 불리고, 남은 자리가 함께 1등, 빠진 자리는 그다음: ${r.ranks.join()})`);
  // out 고리에서 게임이 끝을 정한다
  let gave: Game | null = null;
  const w = starWorld({ out: (rr, seat) => { gave?.rooms.finish(rr, rr.seats.map((_, i) => (i === seat ? 3 : i + 1)), 'gave'); } });
  gave = w.g;
  const qs = ['D', 'E', 'F'].map(w.join);
  for (const p of qs) w.room('quick', p);
  w.room('start', qs[0]);
  w.room('leave', qs[2]);
  const r2 = w.g.rooms.all()[0] as Room<Stars>;
  check(r2.st === 'over' && r2.why === 'gave' && r2.ranks.join() === '1,2,3', '두는 중에 나가기도 기권으로 친다: out 고리가 finish를 부르면 그 결과로 끝난다');
  // 셋 가운데 둘이 빠지면 (outEnds 없이) 남은 하나가 이긴다
  const w2 = starWorld();
  const ss = ['G', 'H', 'I'].map(w2.join);
  for (const p of ss) w2.room('quick', p);
  w2.room('start', ss[0]);
  const r3 = w2.g.rooms.of<Stars>(ss[0])!;
  w2.room('resign', ss[0]);
  check(r3.st === 'play' && r3.turn === 1, '셋 가운데 차례인 자리가 기권하면 다음 자리로 넘어가고 판은 이어진다');
  w2.room('resign', ss[2]);
  check(r3.st === 'over' && r3.win === 1 && r3.ranks.length === 0 && w2.g.rooms.rankOf(r3, 1) === 1 && w2.g.rooms.rankOf(r3, 0) === 2, '남은 자리가 하나면 그 자리가 이긴다 (이김/짐: rankOf는 1과 2)');
  // skip: 이번에 둘 수 없는 자리를 건너뛴다
  const sw = starWorld({ skip: (rr, seat) => rr.data.got[seat] >= 2 });
  const ks = ['J', 'K', 'L'].map(sw.join);
  for (const p of ks) sw.room('quick', p);
  sw.room('start', ks[0]);
  const r4 = sw.g.rooms.of<Stars>(ks[0])!;
  sw.g.command(ks[0], { t: 'star', n: 1 });
  sw.g.command(ks[1], { t: 'star', n: 2 });
  sw.g.command(ks[2], { t: 'star', n: 1 });
  check(r4.round === 2 && r4.first === 1 && r4.turn === 2, `skip: 2바퀴의 선(자리 1)이 별을 둘 주워 건너뛰면 자리 2부터 (turn ${r4.turn})`);
  sw.g.command(ks[2], { t: 'star', n: 1 });
  check(r4.turn === 0, '바퀴 안에서도 건너뛰지 않는 다음 자리로');
  sw.g.command(ks[0], { t: 'star', n: 2 });
  check(r4.st === 'play' && r4.round === 3 && r4.turn === 2, `모든 자리가 건너뛰면 틀은 건너뛰기를 무시하고 선(자리 2)부터 (round ${r4.round}, turn ${r4.turn})`);
}

// ---------- 컴퓨터의 이름, 둘의 판은 예전 그대로 ----------
{
  const named = world({ cpuName: (_r, i) => `봇${i}`, cpu: () => undefined });
  const a = named.join('A');
  named.room('cpu', a);
  const r = named.g.rooms.of(a)!;
  check(named.view(a)?.seats[1].name === '봇1' && r.seats[1]?.name === '봇1', 'RoomDef.cpuName: 컴퓨터 자리의 이름을 게임이 준다 (화면의 seats[i].name)');
  named.g.command(a, { t: 'peg', n: 1 });
  named.g.notices = [];
  named.run(10.1);
  check(named.said(a, 'roomTimeout') && named.g.notices.find((x) => x.k === 'roomTimeout')?.a[0] === '봇1', '시간 넘김 안내문도 컴퓨터의 이름을 싣는다');
  const plain = world();
  const b = plain.join('B');
  plain.room('cpu', b);
  check(plain.view(b)?.seats[1].name === '' && plain.view(b)?.seats[1].cpu === 1, '이름을 주지 않으면 빈 문자열 (화면이 roomCpu로, 컴퓨터가 둘 이상이면 roomCpuN의 번호로)');
  // 둘의 판: 등수 없이 끝내면 ranks·scores는 빈 배열, 안내문의 등수는 0, 선은 늘 자리 0
  const { g, join, room, said, view } = world();
  const p = join('P'), q = join('Q');
  room('quick', p); room('quick', q);
  const r2 = g.rooms.of<Pegs>(p)!;
  for (let k = 0; k < 4; k++) g.command(k % 2 ? q : p, { t: 'peg', n: 1 });
  check(r2.first === 0 && r2.turn === 0 && r2.round === 3, '둘의 판 (rotateFirst 없음): 바퀴가 바뀌어도 자리 0이 먼저');
  g.notices = [];
  room('resign', q);
  check(r2.st === 'over' && r2.win === 0 && view(p)?.ranks.length === 0 && view(p)?.scores.length === 0, '둘의 판의 기권: 상대가 이기고, 등수·점수는 빈 배열 (예전 그대로)');
  check(said(p, 'roomResult') && g.notices.find((x) => x.k === 'roomResult' && x.id === p.id)?.a.join() === '0,resign,0,0,0', 'roomResult: 앞의 둘(0 이김, 까닭)은 예전 그대로, 등수 칸은 0');
}

// ---------- 셋의 판 저장과 되살리기 (자리 수가 범위인 판) ----------
{
  const w3 = starWorld({ save: (rr) => rr.data, load: (rr, raw) => { rr.data = raw as Stars; } });
  const qs = ['D', 'E', 'F'].map(w3.join);
  for (const p of qs) w3.room('quick', p);
  w3.room('start', qs[0]);
  w3.g.command(qs[0], { t: 'star', n: 2 });
  const w4 = starWorld({ save: (rr) => rr.data, load: (rr, raw) => { rr.data = raw as Stars; } });
  w4.g.importWorld(JSON.parse(JSON.stringify(w3.g.exportWorld())));
  const back = w4.g.rooms.all()[0] as Room<Stars> | undefined;
  check(!!back && back.seats.length === 3 && back.turn === 1 && back.data.got.join() === '2,0,0', '셋으로 시작한 판도 저장했다가 셋 자리 그대로 되살린다 (자리 수가 min~max면 받는다)');
}

// ========== 판의 공통화 (묶음 7: 별 줍기에 방장·투표를 켜서) ==========
// 한 줄기로 본다: 방 코드로 들어감 → 공개 설정·비밀번호 → 준비 → 방장 나감·이전 → 내보내기 → 판 → 숨은 정보와 관전 지연 → 관전 대기 → 결과 → 같은 무리로 다음 판 → 투표 → 전적
{
  const store = new MemoryStore();
  const w = starWorld({ lead: true, voteS: 10 });
  w.g.rooms.attach(store);
  const [a, b, c, d, e, x] = ['A', 'B', 'C', 'D', 'E', 'X'].map(w.join);
  const said = (p: Ent, k: string) => w.said(p, k).length > 0;
  w.room('host', a);
  const r = w.g.rooms.of<Stars>(a)!;
  const code = w.view(a)!.code!;
  check(/^[A-HJ-NP-Z2-9]{6}$/.test(code) && w.view(a)?.lead === 0 && w.view(a)?.privacy === 'public' && r.size === 4 && w.g.rooms.byCode(code.toLowerCase()) === r, `방 코드 6자(헷갈리는 글자 없이, 소문자로 적어도 찾는다): ${code}, 연 사람이 방장`);
  // 공개 설정: 비밀번호 판은 목록에 자물쇠로, 틀린 비밀번호는 세고, 너무 자주 틀리면 맞아도 잠시 막힌다
  w.g.command(a, { t: 'room', a: 'privacy', v: 'password', pass: 'moon' });
  const row = () => (w.g.state().rooms as RoomLobby).rows.find((q) => q[0] === r.id);
  check(r.privacy === 'password' && !r.pass.includes('moon') && row()?.[7] === 1, '비밀번호 판: 목록에 자물쇠(1), 비밀번호는 해시로만 남는다');
  for (let k = 0; k < 5; k++) w.g.command(b, { t: 'room', a: 'code', code, pass: 'sun' });
  w.g.command(b, { t: 'room', a: 'code', code, pass: 'moon' });
  check(said(b, 'roomPassword') && said(b, 'roomSlow') && !w.g.rooms.of(b), '틀린 비밀번호 다섯 번이면 맞는 비밀번호도 1분 동안 막힌다 (roomSlow)');
  w.run(61);
  w.g.command(b, { t: 'room', a: 'code', code, pass: 'moon' });
  w.g.command(a, { t: 'room', a: 'privacy', v: 'private' });
  w.room('join', c, r.id);
  check(w.g.rooms.of(b) === r && !w.g.rooms.of(c) && row() === undefined, '1분 뒤에는 들어간다. 비공개 판은 목록에 없고 id로는 못 들어간다');
  w.g.command(c, { t: 'room', a: 'code', code: ` ${code} ` });
  w.g.command(d, { t: 'room', a: 'code', code: 'ZZZZZZ' });
  check(w.g.rooms.of(c) === r && said(d, 'roomCodeBad'), '비공개 판도 코드로는 들어간다 (앞뒤 공백 무시), 없는 코드는 roomCodeBad');
  // 준비와 규칙: 방장이 있는 판은 셋이 모여도 저절로 시작하지 않는다
  w.run(STARS.startAfterS + 1);
  w.room('start', a);
  check(r.st === 'wait' && w.said(a, 'roomNotReady')[0]?.a[0] === 2, '방장의 판은 기다림이 지나도 저절로 시작하지 않고, 모두 준비해야 시작한다 (roomNotReady: 2명)');
  w.g.command(b, { t: 'room', a: 'ready' }); w.g.command(c, { t: 'room', a: 'ready' });
  w.g.command(b, { t: 'room', a: 'opt', k: 'lucky', v: 'on' });
  w.g.command(a, { t: 'room', a: 'opt', k: 'lucky', v: 'on' });
  check(said(b, 'roomLeadOnly') && r.opts.lucky === 'on' && w.view(c)?.opts?.lucky === 'on' && w.view(c)?.seats[1].ready === 0, '규칙은 방장만 고른다 (room.opts). 규칙이 바뀌면 준비가 풀린다');
  // 방장이 나가면 다음 사람이 방장, 돌아와도 되돌리지 않는다. 방장이 내보낸 사람은 다시 못 들어온다
  w.room('leave', a);
  w.g.command(a, { t: 'room', a: 'code', code });
  check(said(c, 'roomLeadNew') && w.view(c)?.lead === 1 && w.g.rooms.seatOf(r, a) === 0 && w.view(a)?.lead === 1, '방장이 나가면 다음 자리의 사람이 방장 (돌아온 옛 방장은 그냥 자리에)');
  w.g.command(b, { t: 'room', a: 'kick', seat: 0 });
  w.g.command(a, { t: 'room', a: 'code', code });
  check(said(a, 'roomKicked') && said(c, 'roomKickedOut') && !w.g.rooms.of(a) && said(a, 'roomBanned') && isField(a.layer), '방장이 내보내면 들판으로 나가고 그 판에 다시 들어오지 못한다 (roomBanned)');
  w.g.command(d, { t: 'room', a: 'code', code });
  for (const p of [c, d]) w.g.command(p, { t: 'room', a: 'ready' });
  w.room('start', b);
  check(r.st === 'play' && r.seats.length === 3 && r.data.luck.length === 3, '모두 준비하면 방장이 시작한다 (빈 자리는 빠진다)');
  // 숨은 정보: 행운의 수는 그 자리에만. 구경꾼은 지연(2초)만큼 늦은 판과 watchView만 받는다
  const luck = (p: Ent) => (w.g.personal.find((q) => q.name === 'stars')!.state(p) as { luck: number } | null)?.luck ?? 0;
  w.g.command(x, { t: 'room', a: 'watch', code });
  check(said(x, 'roomWatching') && luck(b) === r.data.luck[w.g.rooms.seatOf(r, b)] && luck(x) === 0 && w.g.rooms.watched(x) === r && !w.g.rooms.of(x) && isField(x.layer), '비공개 판도 코드로 구경한다. 구경꾼은 앉지 않는다: 행운의 수(게임의 개인 상태)는 가지 않고, 지연이 있으면 판의 층에도 들지 않는다');
  const xv0 = w.view(x)!;
  check(xv0.watch === 1 && xv0.me === -1 && xv0.code === undefined && xv0.st === 'wait', `구경꾼의 판은 지연만큼 늦다 (막 시작한 판은 아직 '기다림', 코드 없음)`);
  w.run(STARS.delayS + 0.1);
  const before = r.data.got.join();
  w.g.command(w.g.rooms.playerAt(r, r.turn)!, { t: 'star', n: 3 });
  const xv = w.view(x)!, pub = xv.pub as { pile: number; got: number[]; luck?: unknown };
  check(xv.st === 'play' && pub.got.join() === before && pub.luck === undefined && !JSON.stringify(xv).includes('"luck"') && r.data.got.join() !== before, `지연이 지나면 구경꾼에게 판이 보인다: 방금 둔 수는 아직 (${pub.got.join()}), 행운의 수는 어디에도 없다`);
  w.run(STARS.delayS + 0.1);
  check((w.view(x)!.pub as { got: number[] }).got.join() === r.data.got.join(), `${STARS.delayS}초 뒤에 구경꾼에게도 그 수가 보인다`);
  // 두는 중에 들어오면 관전 대기
  w.g.command(e, { t: 'room', a: 'code', code });
  check(said(e, 'roomQueued') && w.view(e)?.queued === 1 && (w.g.state().rooms as RoomLobby).rows.length === 0, '두는 중인 판에 코드로 들어오면 관전 대기 (다음 판에 앉는다)');
  for (let k = 0; k < 60 && r.st === 'play'; k++) w.g.command(w.g.rooms.playerAt(r, r.turn)!, { t: 'star', n: 3 });
  check(r.st === 'over' && store.roomRecords(b.pid, 5).length === 1 && store.roomRecords(x.pid, 5).length === 0, '판이 끝나면 앉은 사람마다 판 기록이 저장소에 (구경꾼은 없음)');
  // 같은 무리로 다음 판: 방장만, 떠난 사람은 빠지고 관전 대기가 그 자리에
  w.room('leave', d);
  w.room('regroup', c);
  check(said(c, 'roomLeadOnly') && r.st === 'over', '같은 무리로 다음 판은 방장이');
  w.room('regroup', b);
  check(r.st === 'wait' && w.g.rooms.of(e) === r && !w.g.rooms.watched(e) && r.seats.filter((s) => !!s).map((s) => s!.name).join() === 'B,C,E' && r.code === code && said(c, 'roomRegroup'), '결과 창에서 같은 무리로: 같은 판·코드의 대기실로, 떠난 D 대신 기다리던 E가 앉는다');
  // 투표: 과반이면 통과
  w.g.command(c, { t: 'room', a: 'vote', kind: 'opt', k: 'lucky', v: 'off' });
  const vote = w.view(b)!.vote!;
  check(vote.kind === 'opt' && vote.yes === 1 && vote.need === 2 && vote.mine === -1 && said(b, 'roomVote') && r.opts.lucky === 'on', `투표: 낸 사람은 찬성, 셋이면 둘이 찬성해야 (${vote.yes}/${vote.need})`);
  w.g.command(e, { t: 'room', a: 'ballot', yes: true });
  check(r.opts.lucky === 'off' && w.view(b)?.vote === null && said(b, 'roomVoteEnd'), '과반이 찬성하면 통과해 규칙이 바뀐다');
  w.g.command(c, { t: 'room', a: 'vote', kind: 'kick', seat: 2 });
  w.run(10.1);
  check(w.g.rooms.of(e) === r && w.said(c, 'roomVoteEnd').some((n) => n.a[0] === 0), '시간 안에 과반이 안 되면 부결');
  // 전적: 나와 같은 판의 다른 사람
  w.g.out = [];
  w.g.command(b, { t: 'room', a: 'stats' });
  w.g.command(b, { t: 'room', a: 'stats', seat: 2 });
  const stats = w.g.out.flatMap((o) => (o.msg.t === 'roomStats' ? [o.msg.s] : []));
  check(stats[0]?.me === 1 && stats[0].all.n === 1 && stats[0].defs.main?.n === 1 && stats[0].recent[0]?.n === 3 && stats[1]?.name === 'E' && stats[1].all.n === 0 && !JSON.stringify(stats).includes(b.pid), '전적 창: 나(1판)와 자리의 다른 사람(0판). 저장 키는 보내지 않는다');
}

// ---------- 게임당 판 여럿, 실시간 판, 자리 수 고르기, 판 중간 참가, 친구만, 기록의 저장 ----------
{
  const caught: number[] = [];
  const w = starWorld({}, { midJoin: 'seat', catchUp: (room, seat) => { caught.push(seat); room.data.got[seat] = Math.min(...room.data.got.filter((_, i) => i !== seat)); } });
  const lob = () => w.g.state().rooms as RoomLobby;
  check(lob().defs?.map((d) => `${d.id}:${d.rt}:${d.min}-${d.max}`).join() === 'main:0:3-4,rush:1:2-4', `판의 이름마다 대기실에 (${lob().defs?.map((d) => d.id).join()}). 처음 것이 빠른 대국의 기본`);
  const [p, q, s] = ['P', 'Q', 'S'].map(w.join);
  w.g.command(p, { t: 'room', a: 'host', def: 'rush', n: 3 });
  const r = w.g.rooms.of<Stars>(p)!;
  w.room('quick', q);
  check(r.def === 'rush' && r.size === 3 && r.seats.length === 3 && w.g.rooms.of(q) !== r, '판을 열 때 판의 이름과 자리 수를 고른다 (빠른 대국은 기본 판으로 간다)');
  w.room('leave', q);
  w.g.command(q, { t: 'room', a: 'quick', def: 'rush' });
  w.room('start', p);
  check(r.st === 'play' && r.turn === -1 && w.view(p)?.rt === 1 && w.view(p)?.left === STARS.rushS * 1000 && w.view(p)?.pass === 0, '실시간 판: 차례가 없고(turn -1), 남은 시간은 판 전체');
  w.g.notices = [];
  w.g.command(q, { t: 'star', n: 2 }); w.g.command(p, { t: 'star', n: 1 }); w.g.command(q, { t: 'star', n: 1 });
  check(r.data.got.join() === '1,3' && !w.g.notices.some((n) => n.k === 'roomNotTurn'), '누구나 언제든 둔다 (myTurn이 차례를 묻지 않는다)');
  w.room('join', s, r.id);
  check(w.g.rooms.of(s) === r && r.seats.length === 3 && caught.join() === '2' && r.data.got[2] === 1 && w.view(p)?.seats[2].name === 'S', '협동형(midJoin seat)은 판 중간에 남은 자리로 들어오고 따라잡기 고리(catchUp)가 불린다');
  w.run(STARS.rushS + 0.1);
  check(r.st === 'over' && r.why === 'stars' && r.ranks.length === 3, '시간이 다 되면 timeUp이 끝을 정한다 (등수)');
  // 친구만: 방장의 친구만 들어온다 (사회와 안전이 g.friends를 건다)
  const [f, o] = ['F', 'O'].map(w.join);
  w.g.friends = (x, y) => (x.name === 'P' && y.name === 'F') || (x.name === 'F' && y.name === 'P');
  w.room('leave', p); w.room('leave', q); w.room('leave', s);
  w.room('host', p);
  w.g.command(p, { t: 'room', a: 'privacy', v: 'friends' });
  const r2 = w.g.rooms.of(p)!;
  w.room('join', o, r2.id); w.room('join', f, r2.id);
  check(w.said(o, 'roomFriendsOnly').length === 1 && w.g.rooms.of(f) === r2 && (w.g.state().rooms as RoomLobby).rows.find((x) => x[0] === r2.id)?.[7] === 2, '친구만: 목록에 자물쇠(2), 방장의 친구가 아니면 roomFriendsOnly');
  // 판 기록이 SQLite에 남고 내 데이터 지우기로 지워진다 (스키마의 끝 단계)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-rec-'));
  try {
    const db = new SqliteStore(path.join(dir, 'g.db'));
    db.addRoomRecords([{ key: 'k1', at: 5, def: 'rush', res: 0, rank: 1, n: 3, why: 'stars', score: 4 }, { key: 'k1', at: 6, def: 'main', res: 1, rank: 0, n: 2, why: 'resign' }]);
    const got = db.roomRecords('k1', 10);
    const gone = db.forgetRoomRecords('k1');
    check(db.schemaVersion() === SCHEMA.length && got.length === 2 && got[0].def === 'main' && got[1].score === 4 && gone === 2 && db.roomRecords('k1', 10).length === 0, '판 기록의 표(room_records): 최근부터 읽고, 지우기로 그 사람의 줄을 지운다');
    db.close();
  } finally { removeTemp(dir); }
}
