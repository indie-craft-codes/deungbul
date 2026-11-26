// 이동과 충돌. 서버가 판정에 쓰고, 클라이언트가 자기 캐릭터의 예측에 같은 코드를 쓴다.
import { BODY_R, clampInto, type Obstacle } from './world';

export interface Body { x: number; z: number; face: number }

/**
 * 장애물 목록의 칸 색인: 닿는 장애물이 하나도 없는 흔한 경우를 목록 전체를 훑지 않고 알아내려고 (resolve).
 * 장애물마다 가운데가 든 칸(OBS_CELL m)에 번호를 넣는다. 목록은 만든 뒤 바꾸지 않는다고 본다(월드의 장애물): 길이가 바뀌면 다시 만든다
 */
interface ObsIndex { n: number; reach: number; cells: Map<number, number[]> }
const OBS_CELL = 8;
const obsIndex = new WeakMap<readonly Obstacle[], ObsIndex>();
const obsKey = (cx: number, cz: number) => cx * 65536 + cz;
function indexOf(obstacles: readonly Obstacle[]): ObsIndex {
  let ix = obsIndex.get(obstacles);
  if (ix && ix.n === obstacles.length) return ix;
  let maxR = 0;
  const cells = new Map<number, number[]>();
  obstacles.forEach((o, i) => {
    maxR = Math.max(maxR, o.r);
    const k = obsKey(Math.floor(o.x / OBS_CELL), Math.floor(o.z / OBS_CELL));
    const l = cells.get(k);
    if (l) l.push(i); else cells.set(k, [i]);
  });
  // 닿을 수 있는 가장 먼 가운데 (가장 큰 반지름 + 몸) 에 넉넉히 1m
  ix = { n: obstacles.length, reach: maxR + BODY_R + 1, cells };
  obsIndex.set(obstacles, ix);
  return ix;
}
/** 지금 자리에서 밀어낼 장애물이 하나라도 있는가 (resolve의 첫 밀어내기의 조건 그대로) */
function touchesAny(b: Body, obstacles: readonly Obstacle[], ix: ObsIndex): boolean {
  const x0 = Math.floor((b.x - ix.reach) / OBS_CELL), x1 = Math.floor((b.x + ix.reach) / OBS_CELL);
  const z0 = Math.floor((b.z - ix.reach) / OBS_CELL), z1 = Math.floor((b.z + ix.reach) / OBS_CELL);
  for (let cx = x0; cx <= x1; cx++) {
    for (let cz = z0; cz <= z1; cz++) {
      const l = ix.cells.get(obsKey(cx, cz));
      if (!l) continue;
      for (const i of l) {
        const o = obstacles[i], d = Math.hypot(b.x - o.x, b.z - o.z);
        if (d < o.r + BODY_R && d > 1e-4) return true;
      }
    }
  }
  return false;
}

/** 장애물(원) 밖으로 밀어내고 월드 한계 안에 둔다. 밀어낸 장애물이 있으면 돌려준다. */
export function resolve(b: Body, obstacles: readonly Obstacle[]): Obstacle | null {
  // 지금 자리에 닿는 장애물이 없으면 아래의 차례대로 밀어내기도 아무것도 하지 않는다(처음 밀기 전에는 자리가 그대로다): 목록 전체를 훑지 않는다.
  // 닿는 것이 있으면 예전처럼 목록 전체를 차례대로 (밀린 자리가 다음 장애물의 판정에 쓰이므로 차례가 결과다)
  if (obstacles.length > 16 && !touchesAny(b, obstacles, indexOf(obstacles))) { clampInto(b); return null; }
  let hit: Obstacle | null = null;
  for (const o of obstacles) {
    const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz), min = o.r + BODY_R;
    if (d < min && d > 1e-4) {
      b.x = o.x + (dx / d) * min;
      b.z = o.z + (dz / d) * min;
      hit = o;
    }
  }
  clampInto(b);
  return hit;
}

/**
 * 목표를 향해 한 걸음 움직인다. 도착하면 true.
 * 장애물에 막히면 그 둘레를 따라 돌아간다. 길찾기는 아니다: 볼록한 장애물 하나를 돌아가는 정도다.
 */
export function stepToward(b: Body, tx: number, tz: number, speed: number, dt: number, obstacles: readonly Obstacle[]): boolean {
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  if (d < 0.06) return true;
  const s = Math.min(d, speed * dt), ux = dx / d, uz = dz / d;
  const ox = b.x, oz = b.z;
  b.x += ux * s;
  b.z += uz * s;
  b.face = Math.atan2(dx, dz);
  const hit = resolve(b, obstacles);
  if (hit) {
    const got = Math.hypot(b.x - ox, b.z - oz);
    // 거의 못 나아갔다. 목표가 그 장애물 안이면 돌아가도 소용없으니 그대로 둔다 (막힘 판정이 멈춰 준다)
    const targetInside = Math.hypot(tx - hit.x, tz - hit.z) < hit.r + BODY_R;
    if (got < s * 0.6 && !targetInside) {
      const nx = b.x - hit.x, nz = b.z - hit.z, nl = Math.hypot(nx, nz) || 1;
      let sx = -nz / nl, sz = nx / nl; // 둘레 방향
      if (sx * ux + sz * uz < -0.05) { sx = -sx; sz = -sz; } // 목표 쪽으로 도는 방향을 고른다 (정면이면 한쪽으로 정한다)
      b.x += sx * (s - got);
      b.z += sz * (s - got);
      resolve(b, obstacles);
    }
  }
  return d - s < 0.06;
}
