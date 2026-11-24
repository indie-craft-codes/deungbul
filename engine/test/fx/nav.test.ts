// 길찾기 (서버 없이 공용 코드만 돌린다. 시험용 내용 위에서)
import { NavGrid, walk, type Walker } from '../../shared/nav';
import { PLAYER_SPEED } from '../../shared/world';
import { SPOTS } from '@game/shared/content';
import { Game } from '../../server/game/game';
import { check } from '../harness';

{
  // 벽: 원을 촘촘히 세워 만든 긴 담. 둘레를 따라 미끄러지는 것만으로는 넘지 못하고, 끝을 돌아가야 한다
  const wall = Array.from({ length: 17 }, (_, i) => ({ x: 0, z: -8 + i, r: 0.8 }));
  const nav = new NavGrid(wall);
  const route = nav.find(-5, 0, 5, 0);
  const legs = route ? [{ x: -5, z: 0 }, ...route] : [];
  const length = legs.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - legs[i].x, q.z - legs[i].z), 0);
  check(!!route && route[route.length - 1].x === 5 && route[route.length - 1].z === 0 && length > 18 && length < 30, `담을 돌아가는 길을 찾는다 (길이 ${length.toFixed(1)}, 거쳐 가는 점 ${route?.length})`);
  check(legs.slice(1).every((q, i) => nav.clear(legs[i].x, legs[i].z, q.x, q.z)), '찾은 길의 모든 구간이 막힌 곳을 지나지 않는다');
  const w: Walker = { x: -5, z: 0, face: 0, tx: 5, tz: 0, moving: true, stuck: 0, path: null, pgx: 0, pgz: 0, pat: 0 };
  let t = 0;
  while (w.moving && t < 12) { walk(w, PLAYER_SPEED, 0.05, wall, nav, t); t += 0.05; }
  check(!w.moving && Math.hypot(w.x - 5, w.z) < 0.1 && t < 6, `담 너머까지 실제로 걸어서 도착한다 (${t.toFixed(1)}초)`);

  // 사방이 막힌 곳: 길이 없으면 없다고 한다
  const ring = Array.from({ length: 24 }, (_, i) => ({ x: 20 + Math.cos(i / 24 * 6.2832) * 5, z: Math.sin(i / 24 * 6.2832) * 5, r: 0.9 }));
  check(new NavGrid(ring).find(-5, 0, 20, 0) === null, '사방이 막힌 곳으로 가는 길은 없다');

  // 실제 월드: 아무 두 곳 사이의 길을 찾고, 걸리는 시간을 잰다
  const g = new Game();
  // 나무에 사방이 막힌 손바닥만 한 틈이 생길 수 있다. 걸어서 들어갈 수 없는 곳이라 문제는 아니지만,
  // 무작위로 그 틈이 뽑히면 길이 없다고 나오므로, 가운데에서 닿는 곳만 고른다. 닿지 않는 곳이 늘어나지 않는지는 따로 센다.
  let pockets = 0;
  const free = () => { for (;;) { const x = (Math.random() - 0.5) * 110, z = (Math.random() - 0.5) * 110; if (g.nav.isBlocked(x, z)) continue; if (g.nav.find(0, 6, x, z)) return { x, z }; pockets++; } };
  let found = 0, worst = 0;
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) {
    const from = free(), to = free(), s0 = performance.now();
    if (g.nav.find(from.x, from.z, to.x, to.z)) found++;
    worst = Math.max(worst, performance.now() - s0);
  }
  const avg = (performance.now() - t0) / 300;
  check(pockets <= 3, `가운데에서 닿지 않는 틈은 거의 없다 (600곳 가운데 ${pockets}곳)`);
  check(found === 300 && avg < 5, `실제 월드에서 아무 두 곳이나 길이 이어진다 (300번, 평균 ${avg.toFixed(2)}ms, 최대 ${worst.toFixed(1)}ms)`);
  const end = g.nav.find(0, 6, SPOTS.pool.x, SPOTS.pool.z);
  const last = end?.[end.length - 1];
  check(!!last && Math.hypot(last.x - SPOTS.pool.x, last.z - SPOTS.pool.z) > SPOTS.pool.r && Math.hypot(last.x - SPOTS.pool.x, last.z - SPOTS.pool.z) < SPOTS.pool.r + 3, '막힌 곳을 찍으면 가장 가까운 열린 자리까지 간다');

  // 쫓아가기: 움직이는 목표를 따라가도 길을 계속 다시 세운다
  const p = g.players.spawn('chaser', false);
  p.x = -20; p.z = 9; p.path = null;
  let goal = { x: -2, z: 14 };
  for (let i = 0; i < 20 * 8; i++) {
    goal = { x: goal.x + 0.02, z: goal.z };
    g.movement.goTo(p, goal.x, goal.z);
    g.tick(0.05);
    if (Math.hypot(p.x - goal.x, p.z - goal.z) < 0.5) break;
  }
  check(Math.hypot(p.x - goal.x, p.z - goal.z) < 0.6, '기둥 너머에서 움직이는 목표를 쫓아가 닿는다');
}
