// 실제 서버와 접속 둘: 빠른 대국으로 짝을 짓고(틀의 room 명령), 소켓으로 걷고·치고·차례를 넘기고, 치기의 연출 사건, 끊김과 같은 토큰으로 돌아오기, 기권과 결과, 판의 정리.
import type { RoomLobby, RoomView } from '@engine/shared/defs';
import type { ServerMsg } from '@engine/shared';
import type { DuelView, MeState } from '../shared/stepstone';
import { installStepstone } from '../server/stepstone';
import { MemoryStore, startServer } from '@engine/server';
import { check, connect, settle, until, type Peer } from '@engine/testing';

const store = new MemoryStore();
const server = await startServer(0, { store, game: { plugins: [installStepstone] } });
const duels = new Map<Peer, DuelView | null>(), rooms = new Map<Peer, RoomView | null>();
const lobbies: RoomLobby[] = [], effects: unknown[][] = [];
const listen = (m: ServerMsg, p: Peer) => {
  if (m.t === 'me' && m.k === 'duel') duels.set(p, m.s as MeState['duel']);
  if (m.t === 'me' && m.k === 'room') rooms.set(p, m.s as RoomView | null);
  if (m.t === 'world' && m.s.rooms) lobbies.push(m.s.rooms);
};
const duel = (p: Peer) => duels.get(p) ?? null, room = (p: Peer) => rooms.get(p) ?? null;
/** 받은 안내문: 피어의 sys는 '종류:값:…'의 목록이다 */
const heard = (p: Peer, k: string) => p.sys.some((s) => s.split(':')[0] === k);
const TOKEN_A = 'stepstone-net-a-0123456789', TOKEN_B = 'stepstone-net-b-0123456789';

try {
  const a = await connect(server.port, 'Ann', TOKEN_A, listen);
  const b = await connect(server.port, 'Bo', TOKEN_B, listen);
  a.ws.on('message', (d) => { const m = JSON.parse(d.toString()) as ServerMsg; if (m.t === 'snap') for (const e of m.ev ?? []) if (e[0] === 'fx') effects.push(e); });
  a.send({ t: 'room', a: 'quick' });
  await until(() => room(a)?.st === 'wait');
  await until(() => lobbies.some((l) => l.rows.length === 1 && l.rows[0][4] === 0));
  check(room(a)?.st === 'wait' && lobbies.some((l) => l.rows.length === 1 && l.rows[0][1] === 'Ann' && l.cpu === 1), '빠른 대국: 기다리는 판을 열고, 대기실의 판 목록(틀의 공유 상태 rooms)에 보인다');
  b.send({ t: 'room', a: 'quick' });
  await until(() => room(a)?.st === 'play' && room(b)?.st === 'play' && heard(b, 'roomStart') && !!duel(a) && !!duel(b));
  check(room(a)?.me === 0 && room(b)?.me === 1 && room(a)?.seats.map((s) => s.name).join() === 'Ann,Bo' && (room(a)?.left ?? 0) > 29_000, '두 번째 빠른 대국이 그 판에 들어가 시작한다 (남은 시간은 ms로)');
  await until(() => [...a.lines.keys()].filter((id) => duel(a)!.units.some((u) => u[0] === id)).length === 6);
  check([...b.lines.keys()].filter((id) => duel(b)!.units.some((u) => u[0] === id)).length === 6, '말 여섯이 두 사람의 시야 안 엔티티로 온다 (판의 층)');
  const shield = duel(a)!.units.find((u) => u[2] === 0 && u[1] === 0)!;
  a.send({ t: 'duel', a: 'move', u: shield[0], c: 3, r: 3 });
  await until(() => duel(b)!.units.some((u) => u[0] === shield[0] && u[3] === 3 && u[4] === 3));
  check(true, '걷기가 상대의 화면 상태에도 실린다');
  const bs = duel(b)!.units.find((u) => u[2] === 1 && u[1] === 0)!;
  b.send({ t: 'duel', a: 'move', u: bs[0], c: 4, r: 3 });
  await until(() => heard(b, 'roomNotTurn'));
  check(heard(b, 'roomNotTurn'), '내 차례가 아닌 사람의 수는 거절된다');
  a.send({ t: 'room', a: 'pass' });
  await until(() => room(b)?.turn === 1);
  b.send({ t: 'duel', a: 'move', u: bs[0], c: 4, r: 3 });
  await until(() => duel(b)!.units.some((u) => u[0] === bs[0] && u[3] === 4));
  b.send({ t: 'duel', a: 'hit', u: bs[0], to: shield[0] });
  await until(() => effects.length > 0 && duel(a)!.units.find((u) => u[0] === shield[0])![5] < 10);
  check(effects[0][1] === bs[0] && effects[0][2] === 'hit' && effects[0][3] === shield[0] && duel(a)!.units.find((u) => u[0] === shield[0])![5] === 8, `치기: 연출 사건(ev의 fx)과 줄어든 체력이 간다 (첫 바퀴의 나중 편이라 3 → 2: ${JSON.stringify(effects[0])})`);
  // 끊김: B의 연결이 끊기면 A에게 알리고, 같은 토큰으로 돌아오면 판으로
  b.ws.close();
  await until(() => heard(a, 'roomFoeLeft'));
  await until(() => room(a)?.seats[1].away === 1);
  check(room(a)?.seats[1].away === 1 && room(a)?.st === 'play', 'B가 끊기면 A에게 알리고 판은 그대로');
  const b2 = await connect(server.port, 'Bo', TOKEN_B, listen);
  await until(() => room(b2)?.st === 'play' && !!duel(b2));
  await until(() => heard(a, 'roomFoeBack'));
  check(room(b2)?.me === 1 && heard(b2, 'roomBack') && room(a)?.seats[1].away === 0 && duel(b2)!.units.length === 6, '같은 토큰으로 돌아오면 그 판의 자기 자리로 (말도 그대로)');
  // 기권과 결과
  b2.send({ t: 'room', a: 'resign' });
  await until(() => room(a)?.st === 'over' && room(b2)?.st === 'over' && heard(a, 'roomResult') && heard(b2, 'roomResult'));
  check(room(a)?.win === 0 && room(a)?.why === 'resign', '기권: 두 사람 모두 결과를 받는다 (A 이김)');
  a.send({ t: 'room', a: 'again' });
  await until(() => room(b2)?.seats[0].again === 1);
  b2.send({ t: 'room', a: 'again' });
  await until(() => room(b2)?.st === 'play');
  check(room(b2)?.me === 0 && room(a)?.me === 1, '다시 하기: 자리를 바꿔 새 판');
  // 대기실로 나가면 상대는 이긴다, 둘 다 나가면 판이 닫힌다
  b2.send({ t: 'room', a: 'leave' });
  await until(() => room(b2) === null && room(a)?.st === 'over');
  check(room(a)?.win === 1 && room(a)?.why === 'resign' && duel(b2) === null, '두는 중에 대기실로 나가면 기권으로 친다');
  a.send({ t: 'room', a: 'leave' });
  await until(() => room(a) === null);
  await settle(a);
  check(server.game.rooms.count === 0 && [...server.game.ents.values()].every((e) => e.kind !== 'unit'), '둘 다 나가면 판이 닫히고 말이 치워진다');
  a.ws.close(); b2.ws.close();
} finally {
  await server.close();
}
