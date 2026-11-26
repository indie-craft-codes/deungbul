// 부하 측정에서 고친 뜨거운 길이 예전과 같은 답을 내는가 (docs/infra.md '부하와 장시간'):
//   1. 장애물 밀어내기(shared/sim.ts의 resolve)가 칸 색인으로 '닿는 것이 없음'을 먼저 보는데, 예전처럼 목록 전체를 차례대로 훑은 결과와 자리·돌려준 장애물까지 같다
//   2. 측정 구간의 값(net/ops.ts의 pushCapped)은 읽는 쪽이 없어도 상한을 넘지 않는다
//   3. 엔티티의 상태 글자(net/snapshot.ts의 buildFrame)를 재료가 같으면 다시 쓰는데, 바뀐 것의 표시와 글자는 예전(글자로 견주기)과 같다
import { resolve } from '../../shared/sim';
import { BODY_R, buildWorld, clampInto, type Obstacle } from '../../shared/world';
import { pushCapped } from '../../server/net/ops';
import { buildFrame } from '../../server/net/snapshot';
import { Game } from '../../server/game/game';
import { check } from '../harness';

/** 예전의 resolve: 목록 전체를 차례대로 */
function oldResolve(b: { x: number; z: number; face: number }, obstacles: readonly Obstacle[]): Obstacle | null {
  let hit: Obstacle | null = null;
  for (const o of obstacles) {
    const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz), min = o.r + BODY_R;
    if (d < min && d > 1e-4) { b.x = o.x + (dx / d) * min; b.z = o.z + (dz / d) * min; hit = o; }
  }
  clampInto(b);
  return hit;
}

{
  const world = buildWorld();
  // 장애물이 몰린 곳도 보게 겹친 장애물 몇을 더한 목록 (월드의 것은 건드리지 않는다)
  const obs: Obstacle[] = [...world.obstacles, { x: 3, z: 3, r: 1.2 }, { x: 4, z: 3.5, r: 1.5 }, { x: 3.6, z: 4.4, r: 0.8 }, { x: -20.3, z: 7.7, r: 6 }];
  let a = 12345;
  const rnd = () => { a = (a * 1103515245 + 12345) >>> 0; return a / 4294967296; };
  let same = 0, touched = 0;
  const N = 60000;
  for (let i = 0; i < N; i++) {
    // 절반은 장애물 가까이(닿거나 막 닿지 않는 자리), 절반은 아무 데나
    let x: number, z: number;
    if (i % 2) { const o = obs[Math.floor(rnd() * obs.length)], ang = rnd() * Math.PI * 2, d = o.r + BODY_R + (rnd() - 0.6) * 1.2; x = o.x + Math.cos(ang) * d; z = o.z + Math.sin(ang) * d; }
    else { x = (rnd() - 0.5) * 400; z = (rnd() - 0.5) * 400; }
    const b1 = { x, z, face: 0 }, b2 = { x, z, face: 0 };
    const h1 = resolve(b1, obs), h2 = oldResolve(b2, obs);
    if (b1.x === b2.x && b1.z === b2.z && h1 === h2) same++;
    if (h2) touched++;
  }
  check(same === N && touched > N / 10, `장애물 밀어내기: 자리 ${N}곳(그 가운데 밀린 것 ${touched})에서 칸 색인을 쓴 것과 목록 전체를 훑은 것의 자리·장애물이 모두 같다 (장애물 ${obs.length}개)`);
  // 장애물이 적으면 색인을 쓰지 않는다, 장애물 목록이 길어지면 색인을 다시 만든다
  const few: Obstacle[] = [{ x: 0, z: 0, r: 2 }];
  const b = { x: 1, z: 0, face: 0 };
  check(resolve(b, few) === few[0] && Math.abs(b.x - (2 + BODY_R)) < 1e-9, '장애물이 몇 안 되는 목록은 예전 그대로 밀어낸다');
  const grow: Obstacle[] = obs.slice(0, 40);
  resolve({ x: 0, z: 0, face: 0 }, grow);
  grow.push({ x: 150, z: 150, r: 3 });
  const c = { x: 151, z: 150, face: 0 };
  check(resolve(c, grow) === grow[grow.length - 1], '장애물 목록에 더한 장애물도 밀어낸다 (길이가 바뀌면 색인을 다시 만든다)');
}

{
  const a: number[] = [];
  for (let i = 0; i < 1000; i++) pushCapped(a, i, 100);
  check(a.length <= 100 && a.length >= 50 && a[a.length - 1] === 999 && a[0] > 850, `측정 값의 목록은 상한(100)을 넘지 않고 최근 값을 남긴다 (${a.length}개, ${a[0]}~${a[a.length - 1]})`);
}

{
  // 상태 글자: 서 있으면 바뀐 것으로 치지 않고, 조금이라도(둘째 자리) 움직이거나 체력이 바뀌면 바뀐 것
  const g = new Game({ plugins: [] });
  const p = g.players.spawn('Hot', false);
  p.x = 10.001; p.z = 5;
  const f1 = buildFrame(g.ents.values());
  const f2 = buildFrame(g.ents.values());
  p.x = 10.003; // 둘째 자리 아래: 글자가 같다
  const f3 = buildFrame(g.ents.values());
  p.x = 10.013;
  const f4 = buildFrame(g.ents.values());
  p.hp -= 1;
  const f5 = buildFrame(g.ents.values());
  const f6 = buildFrame(g.ents.values(), () => undefined, { hp: false, weapon: true, cls: true }); // 체력 칸을 뺀 줄
  check(f1.changed.has(p.id) && !f2.changed.has(p.id) && !f3.changed.has(p.id) && f4.changed.has(p.id) && f5.changed.has(p.id) && f6.changed.has(p.id),
    '상태 글자의 바뀜: 처음, 둘째 자리가 바뀜, 체력이 바뀜, 칸이 달라짐은 바뀐 것이고 그대로나 둘째 자리 아래의 움직임은 아니다');
  check(f2.state.get(p.id) === f1.state.get(p.id) && f4.state.get(p.id) === `[${p.id},${Math.round(p.x * 100) / 100},${Math.round(p.z * 100) / 100},${Math.round(p.face * 100) / 100},0,${Math.ceil(p.hp + 1)}]` && !f6.state.get(p.id)!.endsWith(`,${Math.ceil(p.hp)}]`),
    '상태 글자는 예전과 같은 모양이다 ([id, x, z, 방향, 이동, 체력]: 체력 칸을 빼면 없다)');
}
