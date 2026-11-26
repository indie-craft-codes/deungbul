// 실제 서버와 접속 둘: 빠른 대국으로 짝을 짓고, 소켓으로 걷고·치고·차례를 넘기고, 기권과 결과, 끊김과 같은 토큰으로 돌아오기.
import type { ServerMsg } from '@engine/shared';
import type { DuelView, MeState, TableRow } from '../shared/stepstone';
import { installStepstone } from '../server/stepstone';
import { MemoryStore, startServer } from '@engine/server';
import { check, connect, settle, until, type Peer } from '@engine/testing';

const store = new MemoryStore();
const server = await startServer(0, { store, game: { plugins: [installStepstone] } });
const views = new Map<Peer, DuelView | null>();
const tables: TableRow[][] = [];
const listen = (m: ServerMsg, p: Peer) => {
  if (m.t === 'me' && m.k === 'duel') views.set(p, m.s as MeState['duel']);
  if (m.t === 'world') tables.push(m.s.tables);
};
const view = (p: Peer) => views.get(p) ?? null;
/** 받은 안내문: 피어의 sys는 '종류:값:…'의 목록이다 */
const heard = (p: Peer, k: string) => p.sys.some((s) => s.split(':')[0] === k);
const TOKEN_A = 'stepstone-net-a-0123456789', TOKEN_B = 'stepstone-net-b-0123456789';

try {
  const a = await connect(server.port, 'Ann', TOKEN_A, listen);
  const b = await connect(server.port, 'Bo', TOKEN_B, listen);
  a.send({ t: 'duel', a: 'quick' });
  await until(() => view(a)?.st === 'wait');
  await until(() => tables.some((t) => t.length === 1 && t[0][3] === 0));
  check(view(a)?.st === 'wait', '빠른 대국: 기다리는 판을 연다 (개인 상태 duel)');
  check(tables.some((t) => t.length === 1 && t[0][1] === 'Ann' && t[0][3] === 0), '대기실의 판 목록(공유 상태)에 기다리는 판이 보인다');
  b.send({ t: 'duel', a: 'quick' });
  await until(() => view(a)?.st === 'play' && view(b)?.st === 'play' && heard(b, 'duelStart'));
  check(view(a)?.me === 0 && view(b)?.me === 1 && view(a)?.names.join() === 'Ann,Bo' && heard(b, 'duelStart'), '두 번째 빠른 대국이 그 판에 들어가 시작한다');
  // 말이 시야 안의 엔티티로 온다 (두 사람 모두 판의 자리에 앉아 말 여섯을 본다)
  await until(() => [...a.lines.keys()].filter((id) => view(a)!.units.some((u) => u[0] === id)).length === 6);
  check([...b.lines.keys()].filter((id) => view(b)!.units.some((u) => u[0] === id)).length === 6, '말 여섯이 두 사람의 시야 안 엔티티로 온다');
  // A: 방패돌을 등불돌로
  const shield = view(a)!.units.find((u) => u[2] === 0 && u[1] === 0)!;
  a.send({ t: 'duel', a: 'move', u: shield[0], c: 3, r: 3 });
  await until(() => view(b)!.units.some((u) => u[0] === shield[0] && u[3] === 3 && u[4] === 3));
  check(true, '걷기가 상대의 화면 상태에도 실린다');
  // B가 내 차례가 아닐 때 둔다
  const bs = view(b)!.units.find((u) => u[2] === 1 && u[1] === 0)!;
  b.send({ t: 'duel', a: 'move', u: bs[0], c: 4, r: 3 });
  await until(() => heard(b, 'duelNotTurn'));
  check(heard(b, 'duelNotTurn'), '내 차례가 아닌 사람의 수는 거절된다');
  a.send({ t: 'duel', a: 'end' });
  await until(() => view(b)?.turn === 1);
  b.send({ t: 'duel', a: 'move', u: bs[0], c: 4, r: 3 });
  await until(() => view(b)!.units.some((u) => u[0] === bs[0] && u[3] === 4));
  b.send({ t: 'duel', a: 'hit', u: bs[0], to: shield[0] });
  await until(() => (view(a)?.fx[0] ?? 0) > 0);
  check(view(a)!.fx[1] === bs[0] && view(a)!.fx[2] === shield[0] && view(a)!.units.find((u) => u[0] === shield[0])![5] === 7, '치기: 두 사람에게 연출 값과 줄어든 체력이 간다');
  // 기권
  b.send({ t: 'duel', a: 'resign' });
  await until(() => view(a)?.st === 'over' && view(b)?.st === 'over' && heard(a, 'duelResult') && heard(b, 'duelResult'));
  check(view(a)?.win === 0 && view(a)?.why === 'resign' && heard(a, 'duelResult') && heard(b, 'duelResult'), '기권: 두 사람 모두 결과를 받는다 (A 이김)');
  // 다시 하기 (둘 다)
  a.send({ t: 'duel', a: 'again' });
  await until(() => view(b)?.again[0] === 1);
  b.send({ t: 'duel', a: 'again' });
  await until(() => view(b)?.st === 'play');
  check(view(b)?.me === 0 && view(a)?.me === 1, '다시 하기: 자리를 바꿔 새 판');

  // 끊김: B의 연결이 끊기면 A에게 알리고, 같은 토큰으로 돌아오면 판으로
  b.ws.close();
  await until(() => heard(a, 'duelFoeLeft'));
  check(view(a)?.away[0] === 1 && view(a)?.st === 'play', 'B가 끊기면 A에게 알리고 판은 그대로');
  const b2 = await connect(server.port, 'Bo', TOKEN_B, listen);
  await until(() => view(b2)?.st === 'play');
  await until(() => heard(a, 'duelFoeBack'));
  check(view(b2)?.me === 0 && heard(b2, 'duelBack') && view(a)?.away.join() === '0,0', '같은 토큰으로 돌아오면 그 판의 자기 자리로');
  // 대기실로 나가면 상대는 이긴다
  b2.send({ t: 'duel', a: 'lobby' });
  await until(() => view(b2) === null && view(a)?.st === 'over');
  check(view(a)?.win === 1 && view(a)?.why === 'resign', '두는 중에 대기실로 나가면 기권으로 친다');
  a.send({ t: 'duel', a: 'lobby' });
  await until(() => view(a) === null);
  await settle(a);
  check(server.game.duels.count === 0, '둘 다 나가면 판이 닫힌다');
  a.ws.close(); b2.ws.close();
} finally {
  await server.close();
}
