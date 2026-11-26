// 대국 시스템 (서버 없이 틀의 게임 위에서, 정해진 시계): 틀의 판 모듈(rooms) 위의 징검돌. 대기실과 짝짓기, 판의 층, 차례와 명령의 검사, 제한 시간,
// 컴퓨터 상대가 끝까지, 첫 바퀴 보정, 컴퓨터끼리의 승률, 끊김과 돌아옴, 기권·다시 하기, 판의 끝과 정리, 판의 저장과 되살리기, 전적의 저장.
import { BOARDS, LOBBY, TURN, UNITS } from '../shared/content/board';
import { aiStep, alive, anyAction, byHp, damage, isLamp, knockout, seatPos, startUnits, type Unit } from '../shared/rules';
import type { MeState } from '../shared/stepstone';
import type { RoomLobby, RoomView } from '@engine/shared/defs';
import { installStepstone } from '../server/stepstone';
import type { Board } from '../server/duels';
import { type Ent, Game, type Room } from '@engine/server';
import { check } from '@engine/testing';

function world() {
  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [installStepstone], now: () => clock });
  const run = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) { clock += 50; g.tick(0.05); } };
  let n = 0;
  /** 저장 키가 있는 사람 (끊겼다 돌아오는 것을 보려고) */
  const join = (name: string, pid = `key-${name}-${++n}-abcdefghijkl`) => g.players.spawn(name, false, null, pid);
  const room = (p: Ent, a: string, id?: number) => g.command(p, id === undefined ? { t: 'room', a } : { t: 'room', a, id });
  const cmd = (p: Ent, m: Record<string, unknown>) => g.command(p, { t: 'duel', ...m });
  const said = (p: Ent, k: string) => g.notices.some((x) => x.id === p.id && x.k === k);
  const duel = (p: Ent) => g.personal.find((x) => x.name === 'duel')!.state(p) as MeState['duel'];
  const view = (p: Ent) => g.personal.find((x) => x.name === 'room')!.state(p) as RoomView | null;
  const table = (p: Ent) => g.duels.tableOf(p)!;
  const drop = (p: Ent) => { g.fire('playerDropped', p); g.players.leave(p.id); };
  return { g, run, join, room, cmd, said, duel, view, table, drop, clock: () => clock };
}
const mine = (r: Room<Board>, side: 0 | 1) => r.data.units.filter((u) => u.side === side && u.hp > 0);

// ---------- 내용: 판 모듈만 ----------
{
  const { g } = world();
  check(g.modules.size === 1 && g.has('rooms') && !g.commands.has('attack') && g.commands.has('duel') && g.commands.has('room') && Object.keys(g.state()).join() === 'rooms', '고른 모듈은 판(rooms)뿐: 틀의 전투 명령이 없고, 공유 상태는 틀의 대기실뿐');
}

// ---------- 대기실과 짝짓기, 판의 층 ----------
{
  const { g, join, room, said, view, duel, table } = world();
  const a = join('A'), b = join('B'), c = join('C');
  check(Math.hypot(a.x - LOBBY.x, a.z - LOBBY.z) <= LOBBY.r + 0.01, '접속하면 대기실의 둥근 마당에 선다 (RoomDef.exitAt)');
  room(a, 'quick');
  check(said(a, 'roomWait') && view(a)?.st === 'wait' && (g.state().rooms as RoomLobby).rows.length === 1 && duel(a) === null, '빠른 대국: 기다리는 판이 없으면 판을 열고 기다린다');
  const seat = seatPos(0, 0);
  check(Math.hypot(a.x - seat.x, a.z - seat.z) < 0.01 && g.events.some((e) => e[0] === 'r' && e[1] === a.id) && a.layer === table(a).layer, '판을 연 사람은 판의 층, 왼쪽 자리로 순간 이동한다');
  check(g.rules.speed(a) === 0 && g.rules.speed(c) > 0, '판에 앉은 사람은 걷지 않는다');
  room(b, 'quick');
  const t = table(a);
  check(table(b) === t && t.st === 'play' && view(a)?.me === 0 && view(b)?.me === 1 && said(b, 'roomStart'), '다음 사람의 빠른 대국은 기다리던 판에 들어가 바로 시작한다 (판을 연 사람이 왼쪽, 먼저 둔다)');
  check(duel(a)?.units.length === 6 && t.ents.size === 6 && [...t.ents].every((id) => g.ents.get(id)?.kind === 'unit' && g.ents.get(id)?.layer === t.layer), '말 여섯이 판의 층에 놓인다 (g.rooms.place)');
  // 판이 여럿: 같은 대국판 자리에서 층만 다르다 (판의 수가 대국판의 수에 묶이지 않는다)
  const more = Array.from({ length: 20 }, (_, i) => join(`P${i}`));
  for (const p of more) room(p, 'quick');
  const rooms = g.rooms.all();
  check(rooms.length === 11 && rooms.every((r) => r.st === 'play') && new Set(rooms.map((r) => r.layer)).size === 11 && BOARDS.length === 1, `판 11개가 대국판 하나에서 층으로 나뉘어 함께 열린다 (예전에는 여섯 자리까지)`);
  g.notices = [];
  room(c, 'join', t.id);
  check(said(c, 'roomGone') && !g.duels.tableOf(c), '찬 판에는 들어갈 수 없다');
}

// ---------- 차례와 명령의 검사 ----------
{
  const { g, join, room, cmd, said, view, duel, table } = world();
  const a = join('A'), b = join('B');
  room(a, 'host'); room(b, 'join', table(a).id);
  const t = table(a), us = mine(t, 0), them = mine(t, 1);
  g.notices = [];
  cmd(b, { a: 'move', u: them[0].id, c: 4, r: 3 });
  check(said(b, 'roomNotTurn') && them[0].c === 5, '내 차례가 아니면 둘 수 없다 (틀의 roomNotTurn)');
  g.notices = [];
  const shield = us.find((u) => u.type === 'shield')!;
  cmd(a, { a: 'move', u: them[0].id, c: 4, r: 3 });
  cmd(a, { a: 'move', u: shield.id, c: 4, r: 3 });
  cmd(a, { a: 'move', u: shield.id, c: 1.5, r: 3 });
  cmd(a, { a: 'move', u: shield.id, c: '2', r: 3 });
  check(g.notices.filter((n) => n.k === 'duelBad').length === 4 && shield.c === 1, '남의 말, 너무 먼 칸, 수가 아닌 칸은 거절한다');
  cmd(a, { a: 'move', u: shield.id, c: 3, r: 3 });
  check(shield.c === 3 && shield.r === 3 && shield.moved && !!duel(a)?.units.some((r) => r[0] === shield.id && r[3] === 3 && (r[6] & 1) === 1), '걷기: 자리가 바뀌고 걸었음이 개인 상태에 실린다');
  room(a, 'pass');
  check(t.turn === 1 && view(b)?.turn === 1, '차례 넘기기 (틀의 room a:pass): 상대의 차례가 된다');
  // 오른쪽 방패돌이 다가와 등불돌의 방패돌을 친다: 첫 바퀴의 나중 편이라 1 덜 준다
  const theirShield = them.find((u) => u.type === 'shield')!;
  cmd(b, { a: 'move', u: theirShield.id, c: 4, r: 3 });
  g.events = [];
  cmd(b, { a: 'hit', u: theirShield.id, to: shield.id });
  const fx = g.events.find((e) => e[0] === 'fx');
  check(shield.hp === UNITS.shield.hp - (UNITS.shield.atk - TURN.openerSoften) && theirShield.acted, `첫 바퀴 보정: 나중 편의 첫 차례 치기는 피해가 ${TURN.openerSoften} 덜하다 (${UNITS.shield.atk} → ${UNITS.shield.atk - TURN.openerSoften})`);
  check(!!fx && fx[1] === theirShield.id && fx[2] === 'hit' && fx[3] === shield.id && fx[4] === UNITS.shield.atk - TURN.openerSoften && fx[5] === 0, `치기의 연출은 틀의 연출 사건 (g.effect): ${JSON.stringify(fx)}`);
  room(b, 'pass');
  check(t.turn === 0 && t.round === 2 && shield.hp === UNITS.shield.hp - 2, '두 편이 한 번씩 두면 차례 수가 오른다');
  room(a, 'pass');
  check(shield.hp === UNITS.shield.hp - 2 + TURN.lampHeal, '등불돌 위에서 차례를 마치면 체력 1을 되찾는다 (RoomDef.turnEnd)');
  cmd(b, { a: 'hit', u: theirShield.id, to: shield.id });
  check(shield.hp === UNITS.shield.hp - 2 + TURN.lampHeal - UNITS.shield.atk, '둘째 바퀴부터는 온 피해');
}

// ---------- 제한 시간 ----------
{
  const { g, run, join, room, said, view, table } = world();
  const a = join('A'), b = join('B');
  room(a, 'host'); room(b, 'join', table(a).id);
  const t = table(a);
  run(TURN.turnS - 1);
  check(t.turn === 0 && (view(a)?.left ?? 0) <= 1000 && (view(a)?.left ?? 0) > 0, `${TURN.turnS - 1}초가 지나도 아직 내 차례 (남은 1초)`);
  g.notices = [];
  run(1.1);
  check(t.turn === 1 && said(a, 'roomTimeout') && said(b, 'roomTimeout') && view(b)?.turn === 1 && (view(b)?.left ?? 0) > (TURN.turnS - 1) * 1000, '시간이 다 되면 차례가 넘어가고 두 사람에게 알린다 (새 차례는 다시 30초)');
  run(TURN.turnS * 2 * TURN.rounds + 5);
  check(t.st === 'over' && t.why === 'rounds' && t.win === -2, '아무도 두지 않으면 차례 수를 다 써서 비긴다');
  check(a.duelRec[2] === 1 && b.duelRec[2] === 1, '비김이 전적에 남는다');
}

// ---------- 컴퓨터 상대 ----------
{
  const { g, run, join, room, cmd, view, table } = world();
  const a = join('A');
  room(a, 'cpu');
  const t = table(a);
  check(t.st === 'play' && view(a)?.seats[1].cpu === 1 && view(a)?.me === 0, '컴퓨터와 두기: 바로 시작하고 내가 왼쪽에서 먼저 둔다');
  // 사람은 늘 차례를 넘긴다: 컴퓨터가 다가와 쳐서 끝까지 둔다
  let guard = 0, cpuHits = 0;
  while (t.st === 'play' && guard++ < 400) {
    if (t.turn === 0) room(a, 'pass');
    g.events = [];
    run(1);
    cpuHits += g.events.filter((e) => e[0] === 'fx').length;
  }
  check(t.st === 'over' && t.win === 1 && t.why === 'ko' && cpuHits > 0, `가만히 있는 사람을 컴퓨터가 끝까지 쳐서 이긴다 (${t.round}차례, 친 수 ${cpuHits})`);
  check(a.duelRec[1] === 1 && view(a)?.st === 'over' && view(a)?.win === 1, '진 판이 전적과 결과 창의 값에 남는다');
  // 다시 하기: 컴퓨터 상대는 곧바로, 자리를 돌려 (이번에는 컴퓨터가 왼쪽에서 먼저)
  room(a, 'again');
  check(t.st === 'play' && t.round === 1 && view(a)?.me === 1 && mine(t, 0).length === 3 && t.ents.size === 6 && [...g.ents.values()].filter((e) => e.kind === 'unit').length === 6, '다시 하기: 컴퓨터 상대는 곧바로 새 판 (자리를 돌리고 말을 새로 놓는다)');
  // 사람도 컴퓨터의 수(aiStep)로 두면 끝까지 간다
  guard = 0;
  while (t.st === 'play' && guard++ < 2000) {
    if (t.turn === 1) {
      const st = aiStep(t.data.units, 1, undefined, t.round === 1);
      cmd(a, st.a === 'end' ? {} : st.a === 'move' ? { a: 'move', u: st.u, c: st.c, r: st.r } : { a: 'hit', u: st.u, to: st.t });
      if (st.a === 'end') room(a, 'pass');
    }
    run(0.5);
  }
  check(t.st === 'over', `컴퓨터 수 대 컴퓨터: 판이 끝난다 (${t.why}, 이긴 자리 ${t.win}, ${t.round}차례)`);
  room(a, 'again'); room(a, 'resign');
  check(t.st === 'over' && t.why === 'resign' && t.win !== view(a)?.me, '기권하면 상대가 이긴다');
  room(a, 'leave');
  check(!g.duels.tableOf(a) && g.rooms.count === 0 && [...g.ents.values()].every((e) => e.kind !== 'unit') && g.rules.speed(a) > 0 && Math.hypot(a.x - LOBBY.x, a.z - LOBBY.z) <= LOBBY.r + 0.01, '대기실로: 판이 닫히고 말이 치워지고 대기실에 서서 다시 걷는다');
  // 혼자 기다리면 컴퓨터가 앉는다
  const b = join('B');
  room(b, 'host');
  run(TURN.cpuAfterS - 1);
  check(table(b).st === 'wait', `기다리는 판: ${TURN.cpuAfterS}초 전에는 사람을 기다린다`);
  run(1.1);
  check(table(b).st === 'play' && view(b)?.seats[1].cpu === 1, `${TURN.cpuAfterS}초 동안 아무도 오지 않으면 컴퓨터가 앉는다 (혼자면 컴퓨터)`);
}

// ---------- 컴퓨터끼리의 승률 (첫 바퀴 보정의 까닭) ----------
{
  /** 규칙만으로 한 판 (rng로 컴퓨터의 수를 조금씩 흔든다): 이긴 편 */
  const play = (seed: number, opener: boolean): number => {
    let s = seed;
    const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let id = 1;
    const us: Unit[] = startUnits().map((u) => ({ ...u, id: id++ }));
    let turn: 0 | 1 = 0, round = 1;
    for (let guard = 0; guard < 3000; guard++) {
      const soft = opener && round === 1 && turn === 1;
      const st = aiStep(us, turn, rng, soft);
      if (st.a === 'move') { const u = us.find((x) => x.id === st.u)!; u.c = st.c; u.r = st.r; u.moved = true; }
      else if (st.a === 'hit') {
        const u = us.find((x) => x.id === st.u)!, t = us.find((x) => x.id === st.t)!;
        t.hp -= damage(u, t, u, soft); u.acted = u.moved = true;
        const k = knockout(us); if (k >= 0) return k;
      }
      if (st.a === 'end' || !anyAction(us, turn)) {
        for (const u of alive(us)) if (u.side === turn && isLamp(u.c, u.r)) u.hp = Math.min(UNITS[u.type].hp, u.hp + TURN.lampHeal);
        turn = turn === 0 ? 1 : 0; if (turn === 0) round++;
        if (round > TURN.rounds) return byHp(us);
        for (const u of us) if (u.side === turn) { u.moved = false; u.acted = false; }
      }
    }
    return -1;
  };
  const rate = (opener: boolean) => { const n = 400; let first = 0, done = 0; for (let i = 0; i < n; i++) { const w = play(1000 + i * 7919, opener); if (w === 0) first++; if (w === 0 || w === 1) done++; } return { first: first / done, done }; };
  const before = rate(false), after = rate(true);
  check(before.first < 0.25, `보정이 없으면 나중 편이 크게 유리하다 (먼저 두는 편의 승률 ${(before.first * 100).toFixed(0)}%, 400판: 먼저 다가간 편이 먼저 맞는다)`);
  check(after.first > 0.4 && after.first < 0.6 && after.done >= 390, `첫 바퀴 보정이 있으면 한쪽으로 쏠리지 않는다 (먼저 두는 편의 승률 ${(after.first * 100).toFixed(0)}%, 400판)`);
}

// ---------- 끊김과 돌아옴 ----------
{
  const { g, run, join, room, said, view, table, drop } = world();
  const a = join('A', 'key-a-0123456789abcdef'), b = join('B');
  room(a, 'host'); room(b, 'join', table(a).id);
  const t = table(a);
  g.notices = [];
  drop(a);
  check(said(b, 'roomFoeLeft') && view(b)?.seats[0].away === 1 && t.st === 'play', '상대가 끊기면 알리고 판은 그대로 기다린다');
  run(TURN.turnS + 1);
  check(t.turn === 1, '끊긴 사람의 차례도 시간이 다 되면 넘어간다');
  const a2 = join('A', 'key-a-0123456789abcdef');
  check(g.duels.tableOf(a2) === t && view(a2)?.me === 0 && said(a2, 'roomBack') && said(b, 'roomFoeBack') && view(b)?.seats[0].away === 0 && a2.layer === t.layer, '같은 저장 키로 다시 들어오면 그 판의 자리(층)로 돌아온다');
  const seat = seatPos(0, 0);
  check(Math.hypot(a2.x - seat.x, a2.z - seat.z) < 0.01, '돌아온 사람은 판의 자리에 선다');
  g.notices = [];
  drop(a2);
  run(TURN.graceS + 1);
  check(t.st === 'over' && t.win === 1 && t.why === 'left' && said(b, 'roomResult') && b.duelRec[0] === 1, `${TURN.graceS}초 안에 돌아오지 않으면 진 것으로 친다`);
  g.notices = [];
  room(b, 'again');
  check(said(b, 'roomFoeGone') && t.st === 'over', '떠난 상대와는 다시 할 수 없다');
  const ents = [...t.ents];
  room(b, 'leave');
  check(g.rooms.count === 0 && ents.every((id) => !g.ents.has(id)), '남은 사람도 떠나면 판이 닫히고 말이 치워진다');
  const c = join('C');
  room(c, 'host');
  drop(c);
  check(g.rooms.count === 0 && (g.state().rooms as RoomLobby).rows.length === 0, '기다리던 사람이 끊기면 그 판은 닫힌다');
  const guest = g.players.spawn('guest', false);
  room(guest, 'cpu');
  check(g.duels.tableOf(guest)?.st === 'play', '손님도 컴퓨터와 둘 수 있다');
}

// ---------- 사람끼리 다시 하기 ----------
{
  const { join, room, said, view, table } = world();
  const a = join('A'), b = join('B');
  room(a, 'host'); room(b, 'join', table(a).id);
  const t = table(a);
  room(a, 'resign');
  check(a.duelRec[1] === 1 && b.duelRec[0] === 1, '기권: 진 사람과 이긴 사람의 전적');
  room(a, 'again');
  check(said(a, 'roomAgainWait') && t.st === 'over' && view(b)?.seats[0].again === 1, '사람끼리는 한쪽만 누르면 기다린다');
  room(b, 'again');
  check(t.st === 'play' && view(b)?.me === 0 && view(a)?.me === 1 && t.turn === 0, '둘 다 누르면 자리를 바꿔 새 판 (이번에는 B가 왼쪽에서 먼저 둔다)');
  const sa = seatPos(0, 1);
  check(Math.hypot(a.x - sa.x, a.z - sa.z) < 0.01, '자리를 바꾸면 사람도 반대편 자리로 옮겨진다');
}

// ---------- 판의 저장 (서버를 다시 켜도 판이 이어진다) ----------
{
  const w = world();
  const a = w.join('A', 'key-save-a-0123456789'), b = w.join('B', 'key-save-b-0123456789');
  w.room(a, 'host'); w.room(b, 'join', w.table(a).id);
  const t = w.table(a), sh = mine(t, 0).find((u) => u.type === 'shield')!;
  w.cmd(a, { a: 'move', u: sh.id, c: 3, r: 3 });
  w.room(a, 'pass');
  const saved = JSON.parse(JSON.stringify(w.g.exportWorld()));
  const w2 = world();
  w2.g.importWorld(saved);
  const [r] = w2.g.rooms.all() as Room<Board>[];
  check(!!r && r.st === 'play' && r.turn === 1 && r.round === 1 && r.data.units.length === 6 && r.data.units.some((u) => u.type === 'shield' && u.side === 0 && u.c === 3 && u.r === 3) && r.ents.size === 6, '서버를 다시 켜면 두던 판이 말의 칸·차례와 함께 되살아난다');
  const b2 = w2.join('B', 'key-save-b-0123456789');
  check(w2.table(b2) === r && w2.view(b2)?.me === 1 && w2.view(b2)?.turn === 1 && w2.said(b2, 'roomBack') && w2.duel(b2)?.units.length === 6, '같은 저장 키로 들어오면 그 판, 자기 차례로 돌아온다');
  const a2 = w2.join('A', 'key-save-a-0123456789');
  check(w2.table(a2) === r && !!w2.view(a2)?.seats.every((s) => s.away === 0), '둘 다 돌아오면 끊김 표시가 없다');
  // 끝난 판은 저장하지 않는다
  w.room(a, 'resign');
  const w3 = world();
  w3.g.importWorld(JSON.parse(JSON.stringify(w.g.exportWorld())));
  const a3 = w3.join('A', 'key-save-a-0123456789');
  check(w3.g.rooms.count === 0 && !w3.table(a3) && Math.hypot(a3.x - LOBBY.x, a3.z - LOBBY.z) <= LOBBY.r + 0.01, '끝난 판은 저장하지 않는다: 다시 켠 뒤에는 대기실에 선다');
}

// ---------- 전적의 저장 ----------
{
  const { g, join, room } = world();
  const a = join('A');
  room(a, 'cpu'); room(a, 'resign');
  const saver = g.saves.find((s) => s.name === 'duel')!;
  const raw = JSON.parse(JSON.stringify(saver.save(a)));
  const fresh = g.players.spawn('A2', false);
  saver.load(fresh, raw);
  check(fresh.duelRec.join() === '0,1,0' && g.rules.touched!(a) && g.rules.touched!(fresh), '전적은 캐릭터 저장으로 왕복한다 (전적이 있으면 저장할 캐릭터)');
  for (const bad of [null, 5, { rec: 'x' }, { rec: [-3, 1e12, 'q'] }]) saver.load(fresh, bad);
  check(fresh.duelRec.join() === '0,10000000,0', '깨진 저장은 범위로 자르거나 0으로 읽는다');
}
