// 판의 규칙만 (월드·시간 없이): 처음 자리, 걷기(바위·말·걸음 수), 치기(거리, 방패돌의 덜 받기), 다 쓰러뜨림·남은 체력, 컴퓨터끼리 끝까지 두기.
import { BOARD, BOARDS, UNITS } from '../shared/content/board';
import { aiStep, anyAction, byHp, cellAt, cellPos, damage, knockout, reach, seatPos, startUnits, targets, type Unit } from '../shared/rules';
import { check } from '@engine/testing';

let nextId = 1;
const fresh = (): Unit[] => startUnits().map((u) => ({ ...u, id: nextId++ }));
const unit = (type: Unit['type'], side: 0 | 1, c: number, r: number, hp = UNITS[type].hp): Unit => ({ id: nextId++, type, side, c, r, hp, moved: false, acted: false });

// ---------- 처음 자리 ----------
{
  const us = fresh();
  check(us.length === 6 && us.filter((u) => u.side === 0).length === 3, '말은 편마다 셋');
  const keys = new Set(us.map((u) => `${u.c},${u.r}`));
  check(keys.size === 6 && us.every((u) => !BOARD.rocks.some(([c, r]) => c === u.c && r === u.r)), '처음 자리는 겹치지 않고 바위 위가 아니다');
  check(us.filter((u) => u.side === 0).every((u) => u.c <= 1) && us.filter((u) => u.side === 1).every((u) => u.c >= 5), '왼쪽 편은 왼쪽 두 줄, 오른쪽 편은 오른쪽 두 줄에서 시작한다');
  check(us.every((u) => targets(us, u).length === 0), '처음에는 칠 수 있는 적이 없다');
}

// ---------- 걷기 ----------
{
  const r = unit('runner', 0, 3, 0);
  const s = unit('shield', 0, 0, 0);
  const all = [r, s, unit('sling', 1, 2, 0)];
  const runnerReach = reach(all, r);
  check(!runnerReach.has('3,1'), '바위 칸(3,1)에는 갈 수 없다');
  check(!runnerReach.has('2,0') && runnerReach.has('4,0') && runnerReach.has('6,0'), '말이 선 칸에는 못 가고, 날쌘돌은 세 칸까지 간다');
  check(!runnerReach.has('1,0'), '말을 지나 갈 수 없다 (2,0의 적이 길을 막는다)');
  check([...runnerReach.values()].every((p) => p.length >= 1 && p.length <= UNITS.runner.move), '길의 길이는 1에서 걸음 수까지');
  const sh = reach(all, s);
  check(sh.size > 0 && [...sh.keys()].every((k) => { const [c, rr] = k.split(',').map(Number); return c + rr <= UNITS.shield.move; }), '방패돌은 두 칸까지');
  r.moved = true;
  check(reach(all, r).size === 0, '이미 걸은 말은 더 걷지 못한다');
}

// ---------- 치기 ----------
{
  const sl = unit('sling', 0, 0, 0), near = unit('runner', 1, 1, 0), far = unit('shield', 1, 0, 3);
  const all = [sl, near, far];
  check(targets(all, sl).map((u) => u.id).join() === String(far.id), '투석돌은 붙은 적(1칸)을 못 치고 3칸 떨어진 적은 친다');
  check(damage(sl, far) === UNITS.sling.atk - 1, '방패돌은 멀리서 날아온 돌을 1 덜 받는다');
  const sh = unit('shield', 0, 1, 1);
  check(damage(sh, near) === UNITS.shield.atk, '붙어서 치는 피해는 그대로');
  const runner = unit('runner', 0, 0, 2), sh2 = unit('shield', 1, 0, 3);
  check(damage(runner, sh2) === UNITS.runner.atk, '붙어서 친 방패돌은 덜 받지 않는다');
  sl.acted = true;
  check(targets(all, sl).length === 0, '이미 친 말은 더 치지 못한다');
}

// ---------- 끝 ----------
{
  const a = unit('shield', 0, 0, 0), b = unit('runner', 1, 6, 6, 0);
  check(knockout([a, b]) === 0, '한쪽 말이 다 쓰러지면 남은 편이 이긴다');
  check(knockout(fresh()) === -1, '둘 다 남았으면 아직');
  const x = unit('shield', 0, 0, 0, 3), y = unit('sling', 1, 6, 6, 3);
  check(byHp([x, y]) === 2 && byHp([x, { ...y, hp: 2 }]) === 0, '차례를 다 쓰면 남은 체력이 많은 편, 같으면 비김');
  const lone = unit('sling', 0, 0, 0);
  lone.moved = true;
  check(!anyAction([lone, unit('runner', 1, 6, 6)], 0), '걸었고 칠 적이 없으면 할 일이 없다 (차례가 저절로 넘어간다)');
}

// ---------- 판의 자리 ----------
{
  let ok = true;
  for (let b = 0; b < BOARDS.length; b++) for (let c = 0; c < BOARD.size; c++) for (let r = 0; r < BOARD.size; r++) {
    const p = cellPos(b, c, r), back = cellAt(b, p.x + 0.4, p.z - 0.3);
    if (!back || back.c !== c || back.r !== r) ok = false;
  }
  check(ok, '칸의 가운데와 그 둘레의 점은 같은 칸으로 돌아온다 (45° 돌린 판)');
  const s0 = seatPos(0, 0), s1 = seatPos(0, 1);
  check(!cellAt(0, s0.x, s0.z) && !cellAt(0, s1.x, s1.z), '두는 사람의 자리는 판 밖이다');
}

// ---------- 컴퓨터끼리 끝까지 ----------
{
  let lengths: number[] = [], results: string[] = [], bad = 0;
  for (let game = 0; game < 4; game++) {
    const us = fresh();
    // 판마다 조금씩 다르게: 앞의 몇 수는 첫 말을 미리 걸어 둔다
    let turn: 0 | 1 = game % 2 === 0 ? 0 : 1, round = 1, steps = 0, end = '';
    while (!end && steps < 2000) {
      const st = aiStep(us, turn);
      steps++;
      if (st.a === 'end') {
        turn = turn === 0 ? 1 : 0;
        if (turn === (game % 2 === 0 ? 0 : 1)) round++;
        for (const u of us) if (u.side === turn) { u.moved = false; u.acted = false; }
        if (round > 12) end = `rounds:${byHp(us)}`;
        continue;
      }
      const u = us.find((x) => x.id === st.u)!;
      if (u.side !== turn) bad++;
      if (st.a === 'move') {
        if (!reach(us, u).has(`${st.c},${st.r}`)) bad++;
        u.c = st.c; u.r = st.r; u.moved = true;
      } else {
        const t = us.find((x) => x.id === st.t)!;
        if (!targets(us, u).includes(t)) bad++;
        t.hp -= damage(u, t); u.acted = true; u.moved = true;
        const ko = knockout(us);
        if (ko >= 0) end = `ko:${ko}`;
      }
    }
    lengths.push(round); results.push(end);
  }
  check(bad === 0, '컴퓨터는 규칙에 맞는 수만 둔다 (차례, 갈 수 있는 칸, 칠 수 있는 적)');
  check(results.every((r) => r !== ''), `컴퓨터끼리 두면 판이 끝난다 (${results.join(', ')}, 차례 ${lengths.join(', ')})`);
  lengths = []; results = [];
}
