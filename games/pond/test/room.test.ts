// 반딧불 연못의 판 (서버 없이, 정해진 시계): 컴퓨터와 두기, 선이 옮겨 가는 차례와 틀의 바퀴, 숨긴 정보, 시간 넘김, 끝과 전적, 다시 하기,
// 사람 셋의 빠른 판과 컴퓨터 채우기, 끊김·돌아옴·몰수, 기권, 판의 저장과 되살리기
import { Game, type Ent, type Room } from '@engine/server';
import { check } from '@engine/testing';
import { POND, seatSpot } from '../shared/content/pond';
import { expected } from '../shared/rules';
import { installPond, pondSeed, type Table } from '../server/pond';

let clock = 1_800_000_000_000;
let seed = 4242;
pondSeed.next = () => seed++;
const make = () => new Game({ plugins: [installPond], now: () => clock });
const run = (g: Game, seconds: number) => { for (let i = 0; i < seconds * 20; i++) { clock += 50; g.tick(0.05); } };
const said = (g: Game, p: Ent, k: string) => g.notices.some((n) => n.id === p.id && n.k === k);
const live = (r: Room<Table>) => r.seats.map((s) => !!s && !s.out);
const myTurn = (g: Game, p: Ent): boolean => { const r = g.rooms.of<Table>(p); return !!r && r.st === 'play' && r.turn === g.rooms.seatOf(r, p) && expected(r.data, live(r)) === r.turn; };
/** 그 사람의 차례가 올 때까지 시간을 흘린다 (판이 끝나면 멈춘다) */
function untilTurn(g: Game, p: Ent, maxS = 120): boolean {
  for (let k = 0; k < maxS * 4; k++) { const r = g.rooms.of<Table>(p); if (!r || r.st !== 'play') return false; if (myTurn(g, p)) return true; run(g, 0.25); }
  return false;
}
const cast = (g: Game, p: Ent, spot = 0) => { const r = g.rooms.of<Table>(p)!; g.command(p, { t: 'cast', value: r.data.hands[g.rooms.seatOf(r, p)][0], spot }); };

// ---------- 혼자 컴퓨터 셋과 ----------
{
  const g = make();
  const ann = g.players.spawn('Ann', false, null, 'pid-ann-0000000001');
  g.command(ann, { t: 'room', a: 'cpu' });
  const room = g.rooms.of<Table>(ann)!;
  check(!!room && room.st === 'play' && room.seats.length === 4 && room.seats.filter((s) => s?.cpu).length === 3, '컴퓨터와 낚기: 넷 자리 가운데 셋을 컴퓨터가 채우고 곧바로 시작한다');
  check(ann.layer === room.layer && Math.hypot(ann.x - seatSpot(0).x, ann.z - seatSpot(0).z) < 0.01, '나는 자리 0(연못 가)에 판의 층으로 앉는다');
  const kinds = (k: string) => [...room.ents].map((id) => g.ents.get(id)!).filter((e) => e?.kind === k);
  check(kinds('fish').length === 3 && kinds('angler').length === 3, '판의 층에 물고기 셋과 컴퓨터 낚시꾼 셋');
  check(g.rules.speed(ann) === 0, '앉은 동안은 걷지 않는다');

  // 개인 상태: 내 손패만
  const v = g.pond.view(ann)!;
  check(v.hand.join() === room.data.hands[0].join() && v.hand.length === 8, '개인 상태 pond에 내 손패 여덟 장');
  const text = JSON.stringify(v);
  check(!('hands' in v) && [1, 2, 3].every((s) => !text.includes(JSON.stringify(room.data.hands[s]))), '남의 손패는 내 개인 상태에 없다');

  // 첫 차례: 내가 선
  check(room.turn === 0 && myTurn(g, ann), '첫 던지기의 선은 자리 0인 나');
  g.notices = [];
  g.command(ann, { t: 'cast', value: 99, spot: 0 });
  check(said(g, ann, 'pondBad') && room.turn === 0, '손에 없는 수는 거절 (안내문 pondBad), 차례는 그대로');
  g.command(ann, { t: 'room', a: 'pass' });
  check(room.turn === 0, "이 판은 '차례 넘기기'가 없다 (RoomDef.pass: false)");
  const mine = room.data.hands[0][2];
  g.command(ann, { t: 'cast', value: mine, spot: 1 });
  check(room.turn === 1 && room.data.placed[0]?.value === mine && room.data.hands[0].length === 7, '던지면 차례가 자리 1로');
  const bait = kinds('bait')[0];
  check(!!bait && g.kinds.get('bait')!.sync!(bait).join() === '0,0,1', '판에 놓인 찌는 자리와 나루만 싣고 수는 0 (엎어 있다)');
  check(g.pond.view(ann)!.mine?.value === mine && g.pond.view(ann)!.thrown.join() === '1,-1,-1,-1', '내 개인 상태에는 엎은 미끼의 수(나만), 모두에게는 던진 나루만');

  // 컴퓨터 셋이 던지면 펼친다: 선이 자리 1로, 틀의 바퀴가 2로
  run(g, 5);
  check(room.data.cast === 2 && room.data.leader === 1 && room.first === 1 && room.round === 2, '모두 던지면 펼치고 선이 자리 1로 (room.first = 선, 틀의 바퀴 = 던지기 번호)');
  check(kinds('bait').length === 4 && kinds('bait').every((e) => Number(e.data.shown) > 0), '펼친 찌는 수를 싣는다');
  check(room.turn === 1 && room.cpuAt >= room.data.pauseUntil, '둘째 던지기는 선(컴퓨터)부터: 펼친 뒤 조금 쉰다');
  // 둘째 던지기에서 나는 마지막
  check(untilTurn(g, ann) && room.data.order.join() === '1,2,3', '둘째 던지기: 자리 1·2·3이 던진 뒤에 내 차례');
  check(kinds('bait').length === 3, '새 던지기의 첫 미끼에서 지난번 펼친 찌를 치운다');

  // 시간 넘김: 20초 동안 두지 않으면 대신 던진다
  g.notices = [];
  run(g, POND.turnS + 0.5);
  check(said(g, ann, 'roomTimeout') && room.data.cast === 3, '20초가 지나면 내 미끼를 대신 던지고 (roomTimeout) 펼친다');
  check(room.data.hands[0].length === 6, '대신 던진 패도 손에서 빠진다');

  // 끝까지
  for (let k = 0; k < 40 && room.st === 'play'; k++) if (untilTurn(g, ann)) cast(g, ann, k % 3);
  check(room.st === 'over' && room.why === 'score' && room.data.done, '여덟 번 던지면 끝나고 점수로 정한다 (까닭 score)');
  check(room.data.hands.every((h) => h.length === 0) && room.round === POND.hand, '모두 패를 다 썼고 틀의 바퀴는 8');
  const rank = g.pond.view(ann)!.rank;
  check(rank.every((k) => k >= 1 && k <= 4) && said(g, ann, 'roomResult'), '끝나면 자리마다 등수, 나에게 roomResult');
  check(ann.pondRec.games === 1 && ann.pondRec.wins === (room.win === 0 ? 1 : 0) && ann.pondRec.best === room.data.scores[0], '전적: 한 판, 이겼으면 1승, 최고 점수');

  // 다시 하기: 컴퓨터만 남았으니 곧바로, 자리를 한 칸 돌린다 (내가 자리 3)
  g.command(ann, { t: 'room', a: 'again' });
  check(room.st === 'play' && g.rooms.seatOf(room, ann) === 3 && room.data.cast === 1, '다시 하기: 곧바로 새 판, 자리가 한 칸 돌아 나는 자리 3');
  check(Math.hypot(ann.x - seatSpot(3).x, ann.z - seatSpot(3).z) < 0.01 && room.turn !== 3, '자리 3의 연못 가로 옮기고, 선은 자리 0(컴퓨터)');
  check(kinds('bait').length === 0 && kinds('fish').length === 3, '새 판: 지난 찌는 치우고 물고기를 새로 놓는다');

  // 대기실로: 두는 중이면 기권으로 치고 판이 닫힌다 (사람이 없다)
  const ents = [...room.ents];
  g.command(ann, { t: 'room', a: 'leave' });
  check(!g.rooms.of(ann) && g.rooms.count === 0 && ents.every((id) => !g.ents.has(id)), '대기실로: 사람이 없어진 판은 닫히고 판의 엔티티가 치워진다');
  check(ann.layer !== room.layer && Math.abs(ann.z - POND.lobbyZ) < 0.01 && g.pond.view(ann) === null, '나는 들판의 대기실 자리로, 개인 상태 pond는 null');
}

// ---------- 사람 셋: 빠른 판, 기다리다 컴퓨터, 끊김·돌아옴·몰수, 기권 ----------
{
  const g = make();
  const a = g.players.spawn('Ari', false, null, 'pid-ari-0000000001');
  let b = g.players.spawn('Bo', false, null, 'pid-bo-00000000001');
  let c = g.players.spawn('Cy', false, null, 'pid-cy-00000000001');
  g.command(a, { t: 'room', a: 'quick' });
  g.command(b, { t: 'room', a: 'quick' });
  g.command(c, { t: 'room', a: 'quick' });
  const room = g.rooms.of<Table>(a)!;
  check(room.st === 'wait' && g.rooms.of(b) === room && g.rooms.of(c) === room && room.seats.filter(Boolean).length === 3, '빠른 판: 셋이 한 판에 앉아 넷째를 기다린다');
  check(g.pond.view(a) === null, '기다리는 동안 연못 상태는 없다');
  run(g, POND.cpuAfterS + 1);
  check(room.st === 'play' && room.seats[3]?.cpu === true, '20초 동안 넷째가 오지 않으면 빈자리에 컴퓨터가 앉아 시작한다');
  check([a, b, c].map((p) => g.rooms.seatOf(room, p)).join() === '0,1,2', '들어온 차례대로 자리 0·1·2');

  // 숨긴 정보: 셋의 개인 상태는 저마다 제 손패만
  const views = [a, b, c].map((p) => g.pond.view(p)!);
  check(views.every((v, i) => v.hand.join() === room.data.hands[i].join()), '셋은 저마다 제 손패만 받는다');
  cast(g, a, 2);
  const seenByB = g.pond.view(b)!;
  check(seenByB.thrown[0] === 2 && seenByB.mine === null && !JSON.stringify(seenByB).includes(`"value":${room.data.placed[0]!.value}`), 'Bo는 Ari가 다 나루에 던진 것만 알고 수는 모른다');

  // 끊김: Cy가 나갔다 돌아온다 (같은 저장 키, 새 엔티티)
  const handC = [...room.data.hands[2]];
  g.notices = [];
  g.players.leave(c.id);
  check(said(g, a, 'roomFoeLeft') && room.seats[2]!.goneAt > 0, 'Cy가 끊기면 다른 사람에게 roomFoeLeft, 자리는 기다린다');
  cast(g, b, 0);
  // Cy의 차례: 끊긴 채 20초가 지나면 대신 던진다
  run(g, POND.turnS + 0.5);
  check(room.data.placed[2] !== null || room.data.cast === 2, '끊긴 사람의 차례도 시간이 다 되면 대신 던진다');
  c = g.players.spawn('Cy', false, null, 'pid-cy-00000000001');
  check(g.rooms.of(c) === room && g.rooms.seatOf(room, c) === 2 && c.layer === room.layer && said(g, c, 'roomBack'), 'Cy가 60초 안에 돌아오면 같은 자리·층으로 (roomBack)');
  const back = g.pond.view(c)!;
  const rest = [...handC];
  check(back.hand.length === 7 && back.hand.every((v) => { const k = rest.indexOf(v); if (k < 0) return false; rest.splice(k, 1); return true; }), '돌아온 Cy의 손패는 끊기기 전의 것 (대신 던진 한 장만 빠졌다)');

  // 몰수: Bo가 끊긴 채 60초를 넘긴다 → 빠지고 판은 셋으로 이어진다
  g.players.leave(b.id);
  for (let k = 0; k < 200 && room.seats[1]!.goneAt >= 0; k++) { if (myTurn(g, a)) cast(g, a); if (myTurn(g, c)) cast(g, c); run(g, 0.5); }
  check(room.seats[1]!.out && room.st === 'play', 'Bo가 60초 안에 돌아오지 않으면 판에서 빠지고 (몰수) 셋이 이어 낚는다');
  const before = room.data.cast;
  for (let k = 0; k < 200 && room.data.cast === before && room.st === 'play'; k++) { if (myTurn(g, a)) cast(g, a); if (myTurn(g, c)) cast(g, c); run(g, 0.5); }
  check(room.data.cast === before + 1 && room.data.last!.spots.every((sp) => sp.baits.every(([i]) => i !== 1)), '빠진 Bo를 기다리지 않고 셋의 미끼로 펼친다');
  b = g.players.spawn('Bo', false, null, 'pid-bo-00000000001');
  check(!g.rooms.of(b) && Math.abs(b.z - POND.lobbyZ) < 0.01, '몰수된 뒤 돌아온 Bo는 판이 아니라 대기실로');

  // 기권: Ari, 그다음 Cy → 컴퓨터 하나가 남아 이긴다
  g.notices = [];
  g.command(a, { t: 'room', a: 'resign' });
  check(room.seats[0]!.out && room.st === 'play', '넷 가운데 하나의 기권은 그 자리만 빠지고 판은 이어진다');
  g.command(c, { t: 'room', a: 'resign' });
  check(room.st === 'over' && room.win === 3 && room.why === 'resign' && said(g, a, 'roomResult'), '살아 있는 자리가 하나(컴퓨터)만 남으면 그 자리가 이긴다');
  g.command(a, { t: 'room', a: 'leave' });
  g.command(c, { t: 'room', a: 'leave' });
  check(g.rooms.count === 0, '모두 대기실로 나가면 끝난 판이 닫힌다');
}

// ---------- 판의 저장과 되살리기 ----------
{
  const g = make();
  const dee = g.players.spawn('Dee', false, null, 'pid-dee-0000000001');
  g.command(dee, { t: 'room', a: 'cpu' });
  const room = g.rooms.of<Table>(dee)!;
  cast(g, dee, 1);
  run(g, 5);
  untilTurn(g, dee);
  const snap = JSON.stringify({ hands: room.data.hands, fish: room.data.fish, scores: room.data.scores, order: room.data.order, cast: room.data.cast, leader: room.data.leader });
  const saved = g.exportWorld();
  const g2 = make();
  g2.importWorld(JSON.parse(JSON.stringify(saved)));
  const r2 = g2.rooms.all()[0] as Room<Table>;
  check(!!r2 && r2.st === 'play' && JSON.stringify({ hands: r2.data.hands, fish: r2.data.fish, scores: r2.data.scores, order: r2.data.order, cast: r2.data.cast, leader: r2.data.leader }) === snap, '다시 켠 서버: 두던 판의 손패·물고기·점수·이번 던지기가 그대로');
  const placedBaits = [...r2.ents].map((id) => g2.ents.get(id)!).filter((e) => e.kind === 'bait');
  check(placedBaits.length === r2.data.order.length && placedBaits.every((e) => Number(e.data.shown) === 0), '이번 던지기에 엎은 찌를 다시 놓는다 (수는 엎은 채)');
  const dee2 = g2.players.spawn('Dee', false, null, 'pid-dee-0000000001');
  check(g2.rooms.of(dee2) === r2 && g2.rooms.seatOf(r2, dee2) === 0 && g2.pond.view(dee2)!.hand.join() === r2.data.hands[0].join(), '같은 저장 키로 들어오면 그 판·자리·손패로 돌아온다');
  check(myTurn(g2, dee2) && r2.round === r2.data.cast, '두던 차례(내 차례)를 다시 받고, 틀의 바퀴와 던지기 번호가 맞는다');
  cast(g2, dee2, 2);
  run(g2, 3);
  check(r2.data.cast === room.data.cast + 1, '되살린 판에서 이어 던지고 펼친다');
  const broken = g.exportWorld() as unknown as Record<string, unknown>;
  (broken.rooms as { rooms: { data: Record<string, unknown> }[] }).rooms[0].data.hands = 'x';
  const g3 = make();
  let threw = false;
  try { g3.importWorld(broken as never); } catch { threw = true; }
  check(!threw && g3.rooms.count === 0, '깨진 판의 저장은 그 판만 버리고 서버는 뜬다');
}
