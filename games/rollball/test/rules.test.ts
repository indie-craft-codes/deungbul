// 굴림공의 규칙 시험: 팀 고르기와 균형, 공의 물리(밀기, 차기, 마찰, 벽 안에 머묾), 골과 공 되돌리기, 판의 끝, 실제 접속 둘로 골 넣기.
// 실행: node scripts/game.mjs test rollball (npm test도 함께 돌린다)
import { PITCH } from '../shared/content/pitch';
import type { PitchState } from '../shared/rollball';
import { installRollball } from '../server/rollball';
import { type Ent, Game, MemoryStore, startServer } from '@engine/server';
import { check, connect, until } from '@engine/testing';

const { halfW: W, halfH: H, ballR: R } = PITCH;

function world() {
  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [installRollball], now: () => clock });
  const run = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 20); i++) { clock += 50; g.tick(0.05); } };
  const at = (p: Ent, x: number, z: number) => { p.x = x; p.z = z; p.moving = false; p.path = null; };
  const said = (p: Ent, k: string) => g.notices.some((n) => n.id === p.id && n.k === k);
  const heard = (k: string) => g.announces.some((n) => n.k === k);
  return { g, run, at, said, heard, ball: g.pitch.ball, v: () => g.pitch.spin() };
}

// ---------- 내용: 고른 모듈이 없다 ----------
{
  const { g } = world();
  check(g.modules.size === 0 && !g.commands.has('attack') && !g.commands.has('buy') && Object.keys(g.state()).join() === 'pitch',
    '모듈을 하나도 고르지 않았다: 전투·상점 명령이 없고, 공유 상태는 경기 하나뿐이다');
  check([...g.ents.values()].filter((e) => e.kind === 'ball').length === 1 && g.pitch.ball.x === 0 && g.pitch.ball.z === 0, '공 하나가 가운데에 놓인다');
}

// ---------- 팀 고르기와 균형 ----------
{
  const { g, said } = world();
  const [p1, p2, p3, p4] = ['a', 'b', 'c', 'd'].map((n) => g.players.spawn(n, false));
  g.command(p1, { t: 'team', side: 0 });
  check(g.pitch.side.get(p1.id) === 0 && said(p1, 'teamJoined'), '빈 경기장에서는 아무 팀이나 고른다');
  g.notices = [];
  g.command(p2, { t: 'team', side: 0 });
  check(!g.pitch.side.has(p2.id) && said(p2, 'teamFull'), '사람이 더 많은 팀으로는 갈 수 없다 (1 : 0에서 노을로)');
  g.command(p2, { t: 'team', side: 1 });
  g.command(p3, { t: 'team', side: 0 });
  check(g.pitch.side.get(p2.id) === 1 && g.pitch.side.get(p3.id) === 0 && g.pitch.count(0) === 2 && g.pitch.count(1) === 1, '같은 수이면 어느 팀으로나 간다 (2 : 1)');
  g.notices = [];
  g.command(p4, { t: 'team', side: 0 });
  check(!g.pitch.side.has(p4.id) && said(p4, 'teamFull'), '2 : 1에서 많은 쪽으로는 못 간다');
  g.command(p3, { t: 'team', side: 1 });
  check(g.pitch.side.get(p3.id) === 1, '팀을 바꿀 때는 나를 빼고 센다 (1 : 1에서 물결로 옮긴다)');
  for (const bad of [2, -1, '0', null, 0.5]) g.command(p4, { t: 'team', side: bad });
  check(!g.pitch.side.has(p4.id), '이상한 팀 번호는 무시한다');
  g.fire('playerLeft', p1.id);
  check(!g.pitch.side.has(p1.id) && !(p1.id in g.pitch.state().teams), '나가면 팀에서 빠진다');
}

// ---------- 공의 물리 ----------
{
  const { g, run, at, ball, v } = world();
  const p = g.players.spawn('runner', false);
  g.command(p, { t: 'team', side: 0 });
  // 걸어서 밀기: 공의 왼쪽에서 오른쪽으로 걸어 들어간다
  at(p, -4, 0);
  g.command(p, { t: 'move', x: 6, z: 0 });
  run(1.2);
  check(v().vx > PITCH.pushMin * 0.5 && ball.x > 1, `걸어서 부딪히면 공이 걷는 쪽으로 굴러간다 (vx ${v().vx.toFixed(1)}, x ${ball.x.toFixed(1)})`);
  // 마찰: 멈춘다
  at(p, -20, 10); g.command(p, { t: 'move', x: -20, z: 10 });
  run(10);
  check(Math.hypot(v().vx, v().vz) === 0, '마찰로 공이 결국 멈춘다');
  // 차기: 멀면 아무 일도 없고, 가까우면 세게, 다시 차기까지 기다린다
  ball.x = 5; ball.z = 5; v().vx = 0; v().vz = 0;
  at(p, 5 - PITCH.kickReach - 1, 5);
  g.command(p, { t: 'kick' });
  check(v().vx === 0, '공에서 멀면 차지 못한다');
  at(p, 5 - 1.5, 5);
  g.command(p, { t: 'kick' });
  check(Math.abs(v().vx - PITCH.kickSpeed) < 1e-9 && Math.abs(v().vz) < 1e-9, '가까우면 사람 → 공 쪽으로 차는 빠르기만큼');
  v().vx = 0;
  g.command(p, { t: 'kick' });
  check(v().vx === 0, '차고 나면 잠시 다시 차지 못한다');
  // 벽: 아무리 세게 어느 쪽으로 차도 경기장 안에 머문다 (골문 밖)
  let out = 0, goals = 0;
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    ball.x = 0; ball.z = 8; v().vx = Math.cos(a) * 40; v().vz = Math.sin(a) * 40;
    g.pitch.phase = 'play';
    for (let k = 0; k < 60; k++) {
      g.pitch.roll(ball, 0.05);
      if (g.pitch.phase !== 'play') { goals++; break; }
      const inMouth = Math.abs(ball.z) < PITCH.goalHalf;
      if (Math.abs(ball.z) > H - R + 1e-9 || (!inMouth && Math.abs(ball.x) > W - R + 1e-9) || Math.abs(ball.x) > W + PITCH.netDepth) out++;
    }
  }
  check(out === 0, `공은 줄 밖으로 나가지 않는다 (200방향 × 3초, 벗어난 틱 ${out}, 골 ${goals})`);
  check(Math.hypot(v().vx, v().vz) <= PITCH.maxSpeed + 1e-9, '공의 빠르기는 상한을 넘지 않는다');
  // 벽에 튀면 방향이 바뀌고 빠르기가 준다
  g.pitch.phase = 'play';
  ball.x = 0; ball.z = H - R - 0.1; v().vx = 0; v().vz = 10;
  g.pitch.roll(ball, 0.05);
  check(v().vz < 0 && Math.abs(v().vz) < 10, '옆줄에 튀면 거꾸로, 더 느리게');
}

// ---------- 골, 공 되돌리기, 시계, 판의 끝 ----------
{
  const { g, run, at, ball, v, heard } = world();
  const left0 = g.pitch.left;
  run(2);
  check(g.pitch.left === left0, '팀이 있는 사람이 없으면 시계가 흐르지 않는다');
  const p = g.players.spawn('striker', false), q = g.players.spawn('keeper', false);
  g.command(p, { t: 'team', side: 0 });
  g.command(q, { t: 'team', side: 1 });
  at(p, -10, 10); at(q, 10, 10);
  // 노을이 오른쪽 골문에 넣는다
  ball.x = W - 3; ball.z = 0;
  at(p, W - 4.5, 0);
  g.command(p, { t: 'kick' });
  at(p, -10, 10);
  run(0.5);
  check(g.pitch.a === 1 && g.pitch.b === 0 && g.pitch.phase === 'goal' && heard('goal') && g.pitch.goals.get(p.id) === 1,
    '공이 골문 안의 골라인을 넘으면 넣은 팀에 1점, 넣은 사람의 골이 오른다');
  const ann = g.announces.find((n) => n.k === 'goal');
  check(ann?.a[0] === 0 && ann.a[1] === 'striker' && ann.a[2] === 1 && ann.a[3] === 0, '골 안내문: 팀, 넣은 사람, 점수');
  check((g.state().pitch as PitchState).a === 1, '점수는 공유 상태로 모두에게 간다');
  run(PITCH.goalPauseS + 0.2);
  check(g.pitch.phase === 'play' && ball.x === 0 && ball.z === 0 && v().vx === 0, '골 뒤 잠시 멈췄다가 공이 가운데로 돌아온다');
  // 자책골: 물결의 q가 오른쪽(자기 골문)에 넣으면 노을의 점수, q의 골은 오르지 않는다
  g.announces = [];
  ball.x = W - 3; ball.z = 1;
  at(q, W - 4.5, 1);
  g.command(q, { t: 'kick' });
  at(q, 10, 10);
  run(0.5);
  check(g.pitch.a === 2 && !g.pitch.goals.has(q.id) && g.announces.find((n) => n.k === 'goal')?.a[1] === '', '자책골은 상대 팀의 점수이고 넣은 사람의 이름이 없다');
  run(PITCH.goalPauseS + 0.2);
  // 판의 끝: 시간을 거의 다 쓴다
  g.announces = [];
  g.pitch.left = 1;
  run(1.2);
  const over = g.announces.find((n) => n.k === 'roundOver');
  check(g.pitch.phase === 'over' && over?.a[0] === 0 && over.a[1] === 2 && over.a[2] === 0, '시간이 다 되면 판이 끝나고 점수가 많은 팀이 이긴다');
  ball.x = 3; v().vx = 10;
  run(1);
  check(ball.x === 3, '판이 끝난 동안에는 공이 움직이지 않는다');
  run(PITCH.endPauseS);
  check(g.pitch.phase === 'play' && g.pitch.round === 2 && g.pitch.a === 0 && g.pitch.b === 0 && g.pitch.left > PITCH.roundS - 2 && heard('roundStart'), '다음 판은 0 : 0, 시계는 처음부터');
  g.pitch.left = 0.5; g.announces = [];
  run(1);
  check(g.announces.find((n) => n.k === 'roundOver')?.a[0] === -1, '같은 점수면 비긴다');
}

// ---------- 실제 접속 둘: 팀을 고르고 골을 넣는다 ----------
{
  const server = await startServer(0, { store: new MemoryStore(), game: { plugins: [installRollball] } });
  const g = server.game;
  const states: PitchState[][] = [[], []], sides: number[][] = [[], []];
  const listen = (i: number) => (m: { t: string; s?: unknown; k?: string }) => {
    if (m.t === 'world') states[i].push((m.s as { pitch: PitchState }).pitch);
    if (m.t === 'me' && m.k === 'side') sides[i].push(m.s as number);
  };
  const a = await connect(server.port, 'Alpha', undefined, listen(0));
  const b = await connect(server.port, 'Beta', undefined, listen(1));
  // 차례를 지킨다: 두 연결의 명령은 어느 쪽이 먼저 처리될지 모른다 (npm test는 여러 시험을 함께 돌려 느릴 수 있다)
  a.send({ t: 'team', side: 0 });
  await until(() => a.sys.some((s) => s.startsWith('teamJoined')), 10000);
  b.send({ t: 'team', side: 0 });
  await until(() => b.sys.some((s) => s.startsWith('teamFull')), 10000);
  b.send({ t: 'team', side: 1 });
  await until(() => sides[1].at(-1) === 1 && sides[0].at(-1) === 0, 10000);
  check(sides[0].at(-1) === 0 && sides[1].at(-1) === 1 && b.sys.some((s) => s.startsWith('teamFull')), '접속한 둘이 팀을 고른다 (둘째는 같은 팀에 못 가고 다른 팀으로). 내 팀은 개인 상태로 온다');
  const ballId = g.pitch.ball.id;
  check(a.seen.has(ballId) && b.seen.has(ballId), '두 화면 모두 공(게임이 등록한 엔티티)을 본다');
  // 사람마다의 팀은 엔티티에 실려 간다 (g.playerSync): 남에게는 상태 줄의 끝, 본인에게는 you의 끝. 전투가 없어 체력 칸은 없다
  await until(() => a.youRaw[5] === 0 && b.youRaw[5] === 1 && a.lines.get(b.id)?.[5] === 1 && b.lines.get(a.id)?.[5] === 0, 10000);
  check(a.youRaw.length === 6 && a.youRaw[5] === 0 && b.youRaw[5] === 1, `내 팀이 스냅샷의 you 끝에 온다 (${JSON.stringify(b.youRaw)})`);
  check(a.lines.get(b.id)?.length === 6 && a.lines.get(b.id)?.[5] === 1 && b.lines.get(a.id)?.[5] === 0, `남의 팀이 그 사람의 상태 줄 끝에 온다: [id, x, z, 방향, 이동, 팀] (${JSON.stringify(a.lines.get(b.id))})`);
  // 알파가 공 옆으로 걸어가 차서 넣는다: 공을 골문 앞에 두고, 알파를 그 뒤에 세운다
  const pa = g.ents.get(a.id)!;
  g.pitch.ball.x = W - 4; g.pitch.ball.z = 0;
  pa.x = W - 6; pa.z = 0; pa.moving = false; pa.path = null;
  a.send({ t: 'move', x: W - 5.2, z: 0 });
  await until(() => Math.hypot(pa.x - (W - 5.2), pa.z) < 0.3, 8000);
  a.send({ t: 'kick' });
  const scored = await until(() => states[0].at(-1)?.a === 1 && states[1].at(-1)?.a === 1 && b.sys.some((s) => s.startsWith('goal:0:Alpha')), 10000);
  check(scored, `알파가 차서 골: 두 화면이 점수 1 : 0과 골 안내문을 받는다 (${b.sys.filter((s) => s.startsWith('goal')).join()})`);
  check(Math.abs(b.seen.get(ballId)!.x) > W - 1, '골 뒤 멈춘 동안 공은 골문 안에 보인다');
  await until(() => states[1].at(-1)?.phase === 'play', 10000);
  await until(() => Math.abs(b.seen.get(ballId)!.x) < 0.01, 5000);
  check(b.seen.get(ballId)!.x === 0 && b.seen.get(ballId)!.z === 0, '멈춤이 끝나면 화면의 공도 가운데로 돌아온다');
  a.ws.close();
  await until(() => !(a.id in (states[1].at(-1)?.teams ?? {})), 8000);
  check(!(a.id in (states[1].at(-1)?.teams ?? {})), '알파가 나가면 남은 화면의 팀 표에서 빠진다');
  b.ws.close();
  await server.close();
}
