// 대국 시스템 (서버 없이 틀의 게임 위에서, 정해진 시계): 판 열기·짝짓기, 차례와 명령의 검사, 제한 시간, 컴퓨터 상대가 끝까지, 끊김과 돌아옴, 기권·다시 하기, 전적의 저장.
import { BOARDS, TURN, UNITS } from '../shared/content/board';
import { aiStep, seatPos, type Unit } from '../shared/rules';
import type { MeState, TableRow } from '../shared/stepstone';
import { installStepstone } from '../server/stepstone';
import { type Ent, Game } from '@engine/server';
import { check } from '@engine/testing';

function world() {
  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [installStepstone], now: () => clock });
  const run = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) { clock += 50; g.tick(0.05); } };
  let n = 0;
  /** 저장 키가 있는 사람 (끊겼다 돌아오는 것을 보려고) */
  const join = (name: string, pid = `key-${name}-${++n}-abcdefghijkl`) => { const p = g.players.spawn(name, false, null, pid); g.fire('playerJoined', p); return p; };
  const cmd = (p: Ent, m: Record<string, unknown>) => g.command(p, { t: 'duel', ...m });
  const said = (p: Ent, k: string) => g.notices.some((x) => x.id === p.id && x.k === k);
  const view = (p: Ent) => g.personal.find((x) => x.name === 'duel')!.state(p) as MeState['duel'];
  const table = (p: Ent) => g.duels.tableOf(p)!;
  return { g, run, join, cmd, said, view, table, clock: () => clock };
}
const ids = (us: Unit[], side: 0 | 1) => us.filter((u) => u.side === side && u.hp > 0);

// ---------- 내용: 핵심만 ----------
{
  const { g } = world();
  check(g.modules.size === 0 && !g.commands.has('attack') && g.commands.has('duel') && Object.keys(g.state()).join() === 'tables', '고른 모듈이 없다: 틀의 전투 명령이 없고, 공유 상태는 대기실의 판 목록뿐');
}

// ---------- 판 열기와 짝짓기 ----------
{
  const { g, join, cmd, said, view, table } = world();
  const a = join('A'), b = join('B'), c = join('C');
  cmd(a, { a: 'quick' });
  check(said(a, 'duelWait') && view(a)?.st === 'wait' && (g.state().tables as TableRow[]).length === 1, '빠른 대국: 기다리는 판이 없으면 판을 열고 기다린다');
  const seat = seatPos(table(a).board, 0);
  check(Math.hypot(a.x - seat.x, a.z - seat.z) < 0.01 && g.events.some((e) => e[0] === 'r' && e[1] === a.id), '판을 연 사람은 그 판의 왼쪽 자리로 옮겨진다 (화면에 바로 옮김을 알린다)');
  check(g.rules.speed(a) === 0 && g.rules.speed(c) > 0, '판에 앉은 사람은 걷지 않는다');
  cmd(b, { a: 'quick' });
  const t = table(a);
  check(table(b) === t && t.st === 'play' && view(a)?.me === 0 && view(b)?.me === 1 && said(b, 'duelStart'), '다음 사람의 빠른 대국은 기다리던 판에 들어가 바로 시작한다 (판을 연 사람이 왼쪽, 먼저 둔다)');
  check(view(a)?.units.length === 6 && [...g.ents.values()].filter((e) => e.kind === 'unit').length === 6, '말 여섯이 월드에 놓인다 (엔티티 종류 unit)');
  g.notices = [];
  cmd(c, { a: 'join', id: t.id });
  check(said(c, 'duelGone') && !g.duels.tableOf(c), '찬 판에는 들어갈 수 없다');
  cmd(a, { a: 'host' });
  check(said(a, 'duelBusy'), '앉아 있는 사람은 판을 또 열지 못한다');
  // 판이 다 차면
  const more = Array.from({ length: BOARDS.length * 2 }, (_, i) => join(`P${i}`));
  g.notices = [];
  for (const p of more) cmd(p, { a: 'host' });
  check(g.duels.count === BOARDS.length && more.some((p) => said(p, 'duelNoBoard')), `대국판(${BOARDS.length})이 다 차면 판을 열 수 없다`);
}

// ---------- 차례와 명령의 검사 ----------
{
  const { g, join, cmd, said, view, table } = world();
  const a = join('A'), b = join('B');
  cmd(a, { a: 'host' }); cmd(b, { a: 'join', id: table(a).id });
  const t = table(a), mine = ids(t.units, 0), theirs = ids(t.units, 1);
  g.notices = [];
  cmd(b, { a: 'move', u: theirs[0].id, c: 4, r: 3 });
  check(said(b, 'duelNotTurn') && theirs[0].c === 5, '내 차례가 아니면 둘 수 없다');
  g.notices = [];
  const shield = mine.find((u) => u.type === 'shield')!;
  cmd(a, { a: 'move', u: theirs[0].id, c: 4, r: 3 });
  cmd(a, { a: 'move', u: shield.id, c: 4, r: 3 });
  cmd(a, { a: 'move', u: shield.id, c: 1.5, r: 3 });
  cmd(a, { a: 'move', u: shield.id, c: '2', r: 3 });
  check(g.notices.filter((n) => n.k === 'duelBad').length === 4 && shield.c === 1, '남의 말, 너무 먼 칸, 수가 아닌 칸은 거절한다');
  cmd(a, { a: 'move', u: shield.id, c: 3, r: 3 });
  check(shield.c === 3 && shield.r === 3 && shield.moved && !!view(a)?.units.some((r) => r[0] === shield.id && r[3] === 3 && (r[6] & 1) === 1), '걷기: 자리가 바뀌고 걸었음이 개인 상태에 실린다');
  g.notices = [];
  cmd(a, { a: 'move', u: shield.id, c: 3, r: 2 });
  check(said(a, 'duelBad'), '한 차례에 두 번 걷지 못한다');
  cmd(a, { a: 'end' });
  check(t.turn === 1 && view(b)?.turn === 1, '차례 넘기기: 상대의 차례가 된다');
  check(shield.hp === UNITS.shield.hp, '등불돌 위에서 차례를 마쳐도 다치지 않았으면 그대로');
  // 오른쪽 방패돌이 다가와 등불돌의 방패돌을 친다
  const theirShield = theirs.find((u) => u.type === 'shield')!;
  cmd(b, { a: 'move', u: theirShield.id, c: 4, r: 3 });
  cmd(b, { a: 'hit', u: theirShield.id, to: shield.id });
  check(shield.hp === UNITS.shield.hp - UNITS.shield.atk && theirShield.acted && view(a)?.fx[3] === UNITS.shield.atk, '치기: 피해가 들고, 친 말은 그 차례를 마치고, 두 사람의 연출 값(fx)이 바뀐다');
  cmd(b, { a: 'end' });
  check(t.turn === 0 && t.round === 2, '두 편이 한 번씩 두면 차례 수가 오른다');
  cmd(a, { a: 'end' });
  check(shield.hp === UNITS.shield.hp - UNITS.shield.atk + TURN.lampHeal, '등불돌 위에서 차례를 마치면 체력 1을 되찾는다');
}

// ---------- 제한 시간 ----------
{
  const { g, run, join, cmd, said, view, table } = world();
  const a = join('A'), b = join('B');
  cmd(a, { a: 'host' }); cmd(b, { a: 'join', id: table(a).id });
  const t = table(a);
  run(TURN.turnS - 1);
  check(t.turn === 0 && view(a)?.left === 1, `${TURN.turnS - 1}초가 지나도 아직 내 차례 (남은 1초)`);
  g.notices = [];
  run(1.1);
  check(t.turn === 1 && said(a, 'duelTimeout') && said(b, 'duelTimeout') && view(b)?.turn === 1 && view(b)?.left === TURN.turnS, '시간이 다 되면 차례가 넘어가고 두 사람에게 알린다 (새 차례는 다시 30초)');
  run(TURN.turnS * 2 * TURN.rounds + 5);
  check(t.st === 'over' && t.why === 'rounds' && t.win === 2, '아무도 두지 않으면 차례 수를 다 써서 비긴다');
  check(a.duelRec[2] === 1 && b.duelRec[2] === 1, '비김이 전적에 남는다');
}

// ---------- 컴퓨터 상대 ----------
{
  const { g, run, join, cmd, view, table } = world();
  const a = join('A');
  cmd(a, { a: 'cpu' });
  const t = table(a);
  check(t.st === 'play' && view(a)?.cpu.join() === '0,1' && view(a)?.me === 0, '컴퓨터와 두기: 바로 시작하고 내가 왼쪽에서 먼저 둔다');
  // 사람은 늘 차례를 넘긴다: 컴퓨터가 다가와 쳐서 끝까지 둔다
  let guard = 0, cpuHits = 0;
  while (t.st === 'play' && guard++ < 400) {
    if (t.turn === 0) cmd(a, { a: 'end' });
    const before = t.fx[0];
    run(1);
    if (t.fx[0] !== before) cpuHits++;
  }
  check(t.st === 'over' && t.win === 1 && t.why === 'ko' && cpuHits > 0, `가만히 있는 사람을 컴퓨터가 끝까지 쳐서 이긴다 (${t.round}차례, 친 수 ${cpuHits})`);
  check(a.duelRec[1] === 1 && view(a)?.st === 'over' && view(a)?.win === 1, '진 판이 전적과 결과 창의 값에 남는다');
  // 다시 하기: 컴퓨터 상대는 곧바로
  cmd(a, { a: 'again' });
  check(t.st === 'play' && t.round === 1 && ids(t.units, 0).length === 3 && [...g.ents.values()].filter((e) => e.kind === 'unit').length === 6, '다시 하기: 컴퓨터 상대는 곧바로 새 판 (말을 새로 놓는다)');
  // 사람도 컴퓨터의 수(aiStep)로 두면: 끝까지 가고, 한 판이 몇 차례인지 본다
  guard = 0;
  while (t.st === 'play' && guard++ < 2000) {
    if (t.turn === 0) {
      const st = aiStep(t.units, 0);
      cmd(a, st.a === 'end' ? { a: 'end' } : st.a === 'move' ? { a: 'move', u: st.u, c: st.c, r: st.r } : { a: 'hit', u: st.u, to: st.t });
    }
    run(0.5);
  }
  check(t.st === 'over', `컴퓨터 수 대 컴퓨터: 판이 끝난다 (${t.why}, 이긴 편 ${t.win}, ${t.round}차례)`);
  // 기권
  cmd(a, { a: 'again' });
  cmd(a, { a: 'resign' });
  check(t.st === 'over' && t.win === 1 && t.why === 'resign', '기권하면 상대가 이긴다');
  cmd(a, { a: 'lobby' });
  check(!g.duels.tableOf(a) && g.duels.count === 0 && [...g.ents.values()].every((e) => e.kind !== 'unit') && g.rules.speed(a) > 0, '대기실로: 판이 닫히고 말이 치워지고 다시 걷는다');
}

// ---------- 끊김과 돌아옴 ----------
{
  const { g, run, join, cmd, said, view, table } = world();
  const a = join('A', 'key-a-0123456789abcdef'), b = join('B');
  cmd(a, { a: 'host' }); cmd(b, { a: 'join', id: table(a).id });
  const t = table(a);
  g.notices = [];
  // a의 연결이 끊긴다: 틀은 엔티티를 빼고 playerLeft(id)를 알린다
  g.fire('playerDropped', a); g.remove(a.id); g.fire('playerLeft', a.id);
  check(said(b, 'duelFoeLeft') && view(b)?.away.join() === '1,0' && t.st === 'play', '상대가 끊기면 알리고 판은 그대로 기다린다');
  run(TURN.turnS + 1);
  check(t.turn === 1, '끊긴 사람의 차례도 시간이 다 되면 넘어간다');
  // 같은 저장 키로 돌아온다
  const a2 = join('A', 'key-a-0123456789abcdef');
  check(g.duels.tableOf(a2) === t && view(a2)?.me === 0 && said(a2, 'duelBack') && said(b, 'duelFoeBack') && view(b)?.away.join() === '0,0', '같은 저장 키로 다시 들어오면 그 판의 자리로 돌아온다');
  const seat = seatPos(t.board, 0);
  check(Math.hypot(a2.x - seat.x, a2.z - seat.z) < 0.01, '돌아온 사람은 판의 자리에 선다');
  // 다시 끊기고 돌아오지 않는다
  g.notices = [];
  g.remove(a2.id); g.fire('playerLeft', a2.id);
  run(TURN.graceS + 1);
  check(t.st === 'over' && t.win === 1 && t.why === 'left' && said(b, 'duelResult') && b.duelRec[0] === 1, `${TURN.graceS}초 안에 돌아오지 않으면 진 것으로 친다`);
  g.notices = [];
  cmd(b, { a: 'again' });
  check(said(b, 'duelFoeGone') && t.st === 'over', '떠난 상대와는 다시 할 수 없다');
  cmd(b, { a: 'lobby' });
  check(g.duels.count === 0, '남은 사람도 떠나면 판이 닫힌다');
  // 판을 열고 기다리다 끊기면 판이 닫힌다
  const c = join('C');
  cmd(c, { a: 'host' });
  g.remove(c.id); g.fire('playerLeft', c.id);
  check(g.duels.count === 0 && (g.state().tables as TableRow[]).length === 0, '기다리던 사람이 끊기면 그 판은 닫힌다');
  // 손님(저장 키 없음)도 판은 둔다
  const guest = g.players.spawn('guest', false);
  cmd(guest, { a: 'cpu' });
  check(g.duels.tableOf(guest)?.st === 'play', '손님도 컴퓨터와 둘 수 있다');
}

// ---------- 사람끼리 다시 하기 ----------
{
  const { g, join, cmd, said, view, table } = world();
  const a = join('A'), b = join('B');
  cmd(a, { a: 'host' }); cmd(b, { a: 'join', id: table(a).id });
  const t = table(a);
  cmd(a, { a: 'resign' });
  check(a.duelRec[1] === 1 && b.duelRec[0] === 1, '기권: 진 사람과 이긴 사람의 전적');
  g.notices = [];
  cmd(a, { a: 'again' });
  check(said(a, 'duelAgainWait') && t.st === 'over' && view(b)?.again.join() === '1,0', '사람끼리는 한쪽만 누르면 기다린다');
  cmd(b, { a: 'again' });
  check(t.st === 'play' && view(b)?.me === 0 && view(a)?.me === 1 && t.turn === 0, '둘 다 누르면 자리를 바꿔 새 판 (이번에는 B가 왼쪽에서 먼저 둔다)');
  const sa = seatPos(t.board, 1);
  check(Math.hypot(a.x - sa.x, a.z - sa.z) < 0.01, '자리를 바꾸면 사람도 반대편 자리로 옮겨진다');
}

// ---------- 전적의 저장 ----------
{
  const { g, join, cmd } = world();
  const a = join('A');
  cmd(a, { a: 'cpu' }); cmd(a, { a: 'resign' });
  const saver = g.saves.find((s) => s.name === 'duel')!;
  const raw = JSON.parse(JSON.stringify(saver.save(a)));
  const fresh = g.players.spawn('A2', false);
  saver.load(fresh, raw);
  check(fresh.duelRec.join() === '0,1,0' && g.rules.touched!(a) && g.rules.touched!(fresh), '전적은 캐릭터 저장으로 왕복한다 (전적이 있으면 저장할 캐릭터)');
  for (const bad of [null, 5, { rec: 'x' }, { rec: [-3, 1e12, 'q'] }]) saver.load(fresh, bad);
  check(fresh.duelRec.join() === '0,10000000,0', '깨진 저장은 범위로 자르거나 0으로 읽는다');
}
