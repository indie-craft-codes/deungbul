// 반딧불 연못을 실제 서버와 소켓 셋으로 (게임의 시계는 시험이 옮긴다): 대기실 → 빠른 판 셋 → 컴퓨터 채우기 → 넷의 차례 → 시간 넘김 →
// 끊고 같은 토큰으로 다시 들어와 이어 앉기 → 끝까지 → 결과 → 대기실로(판 닫힘). 그동안 받은 모든 메시지에서 남의 손패·엎은 미끼의 수가 새지 않는지 본다.
import { MemoryStore, startServer } from '@engine/server';
import type { ServerMsg } from '@engine/shared';
import type { myRoom } from '@engine/client';
import { check, connect, until, sleep, type Peer } from '@engine/testing';
// 판의 모양(RoomView, RoomLobby)은 입구에 타입이 없어 화면의 myRoom에서 끌어내고, 대기실의 줄은 여기서 적는다
type RoomView = NonNullable<ReturnType<typeof myRoom>>;
interface RoomLobby { rows: [id: number, host: string, seated: number, size: number, st: number, cpu: number][] }
import { POND } from '../shared/content/pond';
import type { PondView } from '../shared/pond';
import { installPond, pondSeed, type Table } from '../server/pond';

let clock = 1_900_000_000_000;
pondSeed.next = () => 777;
const server = await startServer(0, { store: new MemoryStore(), backup: false, game: { plugins: [installPond], now: () => clock } });
const g = server.game;

interface Got { pond: PondView | null; ponds: PondView[]; room: RoomView | null; lobby: RoomLobby | null }
const got = new Map<string, Got>();
const listen = (tok: string) => (m: ServerMsg) => {
  const r = got.get(tok) ?? { pond: null, ponds: [], room: null, lobby: null };
  got.set(tok, r);
  if (m.t === 'me' && m.k === 'pond') { r.pond = m.s as PondView | null; if (r.pond) r.ponds.push(r.pond); }
  if (m.t === 'me' && m.k === 'room') r.room = m.s as RoomView | null;
  if (m.t === 'world') r.lobby = (m.s as unknown as { rooms: RoomLobby }).rooms;
};
const TOK = { a: 'tok-ari-00000000000000001', b: 'tok-bo-000000000000000001', c: 'tok-cy-000000000000000001' };
const A = await connect(server.port, 'Ari', TOK.a, listen(TOK.a));
const B = await connect(server.port, 'Bo', TOK.b, listen(TOK.b));
let C = await connect(server.port, 'Cy', TOK.c, listen(TOK.c));
const of = (tok: string) => got.get(tok)!;
const has = (p: Peer, k: string) => p.sys.some((s) => s.split(':')[0] === k);

// ---------- 대기실과 빠른 판 ----------
A.send({ t: 'room', a: 'quick' });
check(await until(() => of(TOK.a).room?.st === 'wait' && of(TOK.b).lobby?.rows.length === 1), 'Ari가 빠른 판을 누르면 판이 열리고, 다른 사람의 대기실에 그 판이 보인다');
const row = of(TOK.b).lobby!.rows[0];
check(row[1] === 'Ari' && row[2] === 1 && row[3] === 4 && row[4] === 0, '대기실의 줄: 연 사람, 앉은 1명 / 4자리, 기다림');
B.send({ t: 'room', a: 'quick' });
await until(() => of(TOK.b).room?.st === 'wait');
C.send({ t: 'room', a: 'quick' });
check(await until(() => of(TOK.a).lobby?.rows[0]?.[2] === 3 && of(TOK.c).room?.st === 'wait'), '셋이 같은 판에 앉아 넷째를 기다린다');
clock += (POND.cpuAfterS + 1) * 1000;
check(await until(() => [TOK.a, TOK.b, TOK.c].every((t) => of(t).pond?.cast === 1 && of(t).room?.st === 'play')), '20초가 지나면 컴퓨터가 넷째 자리에 앉아 판이 시작된다');
const room = g.rooms.all()[0] as import('@engine/server').Room<Table>;
const dealt = room.data.hands.map((h) => [...h]);
check([TOK.a, TOK.b, TOK.c].map((t) => of(t).room!.me).join() === '0,1,2' && of(TOK.a).room!.seats[3].cpu === 1, '자리: Ari 0, Bo 1, Cy 2, 컴퓨터 3');
check([TOK.a, TOK.b, TOK.c].every((t, i) => of(t).pond!.hand.join() === dealt[i].join()), '셋은 저마다 제 손패만 받는다');

// ---------- 넷의 차례 ----------
const baitIds = () => [...room.ents].filter((id) => g.ents.get(id)?.kind === 'bait');
A.send({ t: 'cast', value: dealt[0][7], spot: 0 });
check(await until(() => of(TOK.b).pond?.thrown[0] === 0 && of(TOK.b).room?.turn === 1), 'Ari가 던지면 Bo의 화면에 Ari의 찌가 가 나루에, 차례는 Bo');
const aBait = baitIds()[0];
check(await until(() => B.lines.has(aBait)) && B.lines.get(aBait)![6] === 0 && B.lines.get(aBait)![5] === 0, 'Bo가 받은 Ari의 찌: 자리 0, 수 0 (엎어 있다)');
C.send({ t: 'cast', value: dealt[2][0], spot: 1 });
check(await until(() => has(C, 'roomNotTurn')), '차례가 아닌 Cy의 던지기는 거절 (roomNotTurn)');
// Bo는 두지 않는다: 20초 뒤 대신 던진다
clock += (POND.turnS + 0.5) * 1000;
check(await until(() => has(A, 'roomTimeout') && of(TOK.a).pond?.thrown[1] !== -1), 'Bo의 시간이 다 되면 모두에게 roomTimeout, Bo의 미끼를 대신 던진다');
check(await until(() => of(TOK.c).room?.turn === 2), '그다음 Cy의 차례');
C.send({ t: 'cast', value: dealt[2][0], spot: 2 });
await until(() => of(TOK.a).room?.turn === 3);
clock += 3000;
check(await until(() => of(TOK.a).pond?.last?.n === 1), '컴퓨터까지 넷이 던지면 펼친다 (모두에게 지난 결과)');
check(baitIds().every((id) => (B.lines.get(id)?.[6] ?? 0) > 0), '펼친 뒤에는 Bo도 모든 찌의 수를 본다');
check(of(TOK.a).pond!.leader === 1 && of(TOK.a).room!.round === 2, '둘째 던지기: 선은 Bo, 틀의 바퀴도 2');

// ---------- 끊고 다시 들어와 이어 앉기 ----------
const handC = room.data.hands[2].join();
C.ws.close();
check(await until(() => has(A, 'roomFoeLeft')), 'Cy가 끊기면 Ari에게 roomFoeLeft');
C = await connect(server.port, 'Cy', TOK.c, listen(TOK.c));
check(await until(() => has(C, 'roomBack') && of(TOK.c).pond?.hand.join() === handC), '같은 토큰으로 다시 들어온 Cy는 그 판·자리·손패로 돌아온다 (roomBack)');
check(await until(() => has(A, 'roomFoeBack')), 'Ari에게 roomFoeBack');

// ---------- 끝까지 ----------
const peers: [Peer, string, number][] = [[A, TOK.a, 0], [B, TOK.b, 1], [C, TOK.c, 2]];
for (let k = 0; k < 600 && room.st === 'play'; k++) {
  for (const [p, tok, seat] of peers) {
    const v = of(tok).pond;
    if (v && room.turn === seat && v.next === seat && !v.mine && v.hand.length) p.send({ t: 'cast', value: v.hand[v.hand.length - 1 - (k % v.hand.length)], spot: k % 3 });
  }
  clock += 1000;
  await sleep(30);
}
check(room.st === 'over' && room.why === 'score', '여덟 번을 다 던져 끝났다 (까닭 score)');
check(await until(() => peers.every(([p, tok]) => has(p, 'roomResult') && of(tok).room?.st === 'over' && (of(tok).pond?.rank.every((x) => x >= 1) ?? false))), '셋 모두 roomResult와 결과 창(등수)을 받는다');
check(await until(() => of(TOK.a).lobby?.rows[0]?.[4] === 2), '대기실의 줄도 끝남으로');

// ---------- 숨긴 정보가 새지 않았는가 (받은 개인 상태 전부) ----------
let leak = 0;
peers.forEach(([, tok, seat]) => {
  for (const v of of(tok).ponds) {
    const rest = [...dealt[seat]];
    if (!v.hand.every((x) => { const i = rest.indexOf(x); if (i < 0) return false; rest.splice(i, 1); return true; })) leak++;
    if (v.mine && !dealt[seat].includes(v.mine.value)) leak++;
    if (Object.keys(v).some((k) => /hands|placed|order|rng|seen/.test(k))) leak++;
  }
});
check(leak === 0 && of(TOK.b).ponds.length > 20, `받은 개인 상태 ${peers.reduce((n, [, t]) => n + of(t).ponds.length, 0)}개 모두 제 손패와 제 미끼만 (남의 것 0건)`);

// ---------- 대기실로: 판이 닫힌다 ----------
const ents = [...room.ents];
for (const [p] of peers) p.send({ t: 'room', a: 'leave' });
check(await until(() => g.rooms.count === 0 && peers.every(([, tok]) => of(tok).pond === null && of(tok).room === null)), '셋이 대기실로 나가면 판이 닫히고 연못 상태가 비워진다');
check(ents.every((id) => !g.ents.has(id)) && await until(() => of(TOK.a).lobby?.rows.length === 0), '판의 엔티티가 치워지고 대기실의 목록도 빈다');
check(await until(() => peers.every(([p]) => Math.abs(p.you[1] - POND.lobbyZ) < 0.5)), '셋 모두 연못 남쪽의 대기실 자리로 돌아온다');

for (const [p] of peers) p.ws.close();
await server.close();
