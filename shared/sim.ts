// 이동과 충돌. 서버가 판정에 쓰고, 클라이언트가 자기 캐릭터의 예측에 같은 코드를 쓴다.
import { BODY_R, clampInto, type Obstacle } from './world';

export interface Body { x: number; z: number; face: number }

/** 장애물(원) 밖으로 밀어내고 월드 한계 안에 둔다. 밀어낸 장애물이 있으면 돌려준다. */
export function resolve(b: Body, obstacles: readonly Obstacle[]): Obstacle | null {
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
