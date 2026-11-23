// 길찾기. 서버가 판정에 쓰고, 클라이언트가 자기 캐릭터의 예측에 같은 코드를 쓴다.
// 월드를 1칸짜리 격자로 나눠 막힌 칸을 표시해 두고, 곧장 갈 수 있으면 곧장 가고 아니면 A*로 돌아가는 길을 찾는다.
import { stepToward, type Body } from './sim';
import { AREAS, BODY_R, EDGE, GRID, type Obstacle } from './world';

export interface Point { x: number; z: number }

const MIN_X = GRID.x0, MIN_Z = GRID.z0; // 격자는 모든 지역을 감싼다. 지역 밖의 칸은 막힌 칸이다
const W = GRID.x1 - GRID.x0, H = GRID.z1 - GRID.z0; // 가로와 세로의 칸 수 (칸 크기 1)
/** 충돌 반경보다 조금 넉넉하게 막아서, 찾은 길이 장애물에 스치지 않게 한다 */
const MARGIN = 0.2;
/** 한 번의 탐색에서 살펴보는 칸의 상한. 넘으면 길이 없는 것으로 본다 */
const MAX_VISITS = 20000;
const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

const cellX = (x: number) => Math.min(W - 1, Math.max(0, Math.floor(x - MIN_X)));
const cellZ = (z: number) => Math.min(H - 1, Math.max(0, Math.floor(z - MIN_Z)));
const centerX = (i: number) => i + MIN_X + 0.5;
const centerZ = (i: number) => i + MIN_Z + 0.5;

export class NavGrid {
  private readonly blocked = new Uint8Array(W * H);
  // 탐색마다 배열을 새로 만들지 않으려고, 이번 탐색에서 쓴 칸인지를 번호(stamp)로 가린다
  private readonly cost = new Float32Array(W * H);
  private readonly from = new Int32Array(W * H);
  private readonly seen = new Uint32Array(W * H);
  private readonly done = new Uint32Array(W * H);
  private stamp = 0;

  constructor(obstacles: readonly Obstacle[]) {
    // 지역의 가장자리와 지역 밖은 막힌 것으로 친다
    for (let iz = 0; iz < H; iz++) {
      for (let ix = 0; ix < W; ix++) {
        const x = centerX(ix), z = centerZ(iz);
        if (!AREAS.some((a) => x >= a.x0 + EDGE && x <= a.x1 - EDGE && z >= a.z0 + EDGE && z <= a.z1 - EDGE)) this.blocked[iz * W + ix] = 1;
      }
    }
    for (const o of obstacles) {
      const r = o.r + BODY_R + MARGIN;
      for (let iz = cellZ(o.z - r); iz <= cellZ(o.z + r); iz++) {
        for (let ix = cellX(o.x - r); ix <= cellX(o.x + r); ix++) {
          if (Math.hypot(centerX(ix) - o.x, centerZ(iz) - o.z) < r) this.blocked[iz * W + ix] = 1;
        }
      }
    }
  }

  isBlocked(x: number, z: number): boolean { return this.blocked[cellZ(z) * W + cellX(x)] === 1; }

  /** a에서 b까지 곧장 갈 수 있는가 (선을 따라 촘촘히 짚어 본다) */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax, dz = bz - az, steps = Math.ceil(Math.hypot(dx, dz) / 0.4);
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      if (this.isBlocked(ax + dx * k, az + dz * k)) return false;
    }
    return true;
  }

  /** 그 칸이 막혀 있으면 가장 가까운 열린 칸을 찾는다. 없으면 -1 */
  private nearestFree(ix: number, iz: number): number {
    if (!this.blocked[iz * W + ix]) return iz * W + ix;
    for (let r = 1; r <= 12; r++) {
      let best = -1, bd = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // 테두리만
          const x = ix + dx, z = iz + dz;
          if (x < 0 || z < 0 || x >= W || z >= H || this.blocked[z * W + x]) continue;
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = z * W + x; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /**
   * a에서 b로 가는 길(거쳐 갈 점들)을 찾는다. 마지막 점이 도착점이다.
   * b가 막힌 곳이면 가장 가까운 열린 자리까지 간다. 길이 없으면 null.
   */
  find(ax: number, az: number, bx: number, bz: number): Point[] | null {
    const start = this.nearestFree(cellX(ax), cellZ(az));
    const goalCell = cellZ(bz) * W + cellX(bx);
    const goal = this.nearestFree(cellX(bx), cellZ(bz));
    if (start < 0 || goal < 0) return null;
    const gx = goal % W, gz = (goal - gx) / W;
    const h = (i: number) => {
      const dx = Math.abs((i % W) - gx), dz = Math.abs(Math.floor(i / W) - gz);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
    };

    const stamp = ++this.stamp;
    const heap: number[] = [], prio: number[] = []; // 작은 것이 먼저 나오는 힙
    const push = (i: number, p: number) => {
      let n = heap.length;
      heap.push(i); prio.push(p);
      while (n > 0) {
        const up = (n - 1) >> 1;
        if (prio[up] <= p) break;
        heap[n] = heap[up]; prio[n] = prio[up]; n = up;
      }
      heap[n] = i; prio[n] = p;
    };
    const pop = (): number => {
      const top = heap[0], li = heap.pop()!, lp = prio.pop()!;
      const size = heap.length;
      if (size) {
        let n = 0;
        for (;;) {
          let c = n * 2 + 1;
          if (c >= size) break;
          if (c + 1 < size && prio[c + 1] < prio[c]) c++;
          if (prio[c] >= lp) break;
          heap[n] = heap[c]; prio[n] = prio[c]; n = c;
        }
        heap[n] = li; prio[n] = lp;
      }
      return top;
    };

    this.seen[start] = stamp; this.cost[start] = 0; this.from[start] = -1;
    push(start, h(start));
    let visits = 0, found = false;
    while (heap.length) {
      const cur = pop();
      if (this.done[cur] === stamp) continue;
      this.done[cur] = stamp;
      if (cur === goal) { found = true; break; }
      if (++visits > MAX_VISITS) break;
      const cx = cur % W, cz = (cur - cx) / W;
      for (const [dx, dz, w] of DIRS) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= W || z >= H) continue;
        const ni = z * W + x;
        if (this.blocked[ni] || this.done[ni] === stamp) continue;
        // 대각선은 양옆이 모두 열려 있을 때만: 모서리를 파고들지 않는다
        if (dx && dz && (this.blocked[cz * W + x] || this.blocked[z * W + cx])) continue;
        const c = this.cost[cur] + w;
        if (this.seen[ni] === stamp && c >= this.cost[ni]) continue;
        this.seen[ni] = stamp; this.cost[ni] = c; this.from[ni] = cur;
        push(ni, c + h(ni));
      }
    }
    if (!found) return null;

    // 칸의 가운데를 잇는 길을 만들고, 도착점은 (열려 있으면) 정확한 자리로 바꾼다
    const cells: Point[] = [];
    for (let i = goal; i !== -1; i = this.from[i]) cells.push({ x: centerX(i % W), z: centerZ(Math.floor(i / W)) });
    cells.reverse();
    if (goal === goalCell) cells[cells.length - 1] = { x: bx, z: bz };

    // 곧장 갈 수 있는 구간은 건너뛰어서, 칸을 따라 꺾이는 대신 곧게 걷게 한다
    const out: Point[] = [];
    let fx = ax, fz = az, i = 0;
    while (i < cells.length) {
      let j = Math.min(cells.length - 1, i + 40);
      while (j > i && !this.clear(fx, fz, cells[j].x, cells[j].z)) j--;
      out.push(cells[j]);
      fx = cells[j].x; fz = cells[j].z;
      i = j + 1;
    }
    return out;
  }
}

/** 길을 따라 걷는 것: 목표(tx, tz)와, 그 목표로 가려고 세운 길을 갖는다 */
export interface Walker extends Body {
  tx: number; tz: number; moving: boolean; stuck: number;
  /** 거쳐 갈 점들. 아직 세우지 않았으면 null */
  path: Point[] | null;
  /** 길을 세울 때의 목표와 시각 */
  pgx: number; pgz: number; pat: number;
}

function plan(e: Walker, nav: NavGrid, clock: number): void {
  e.pgx = e.tx; e.pgz = e.tz; e.pat = clock;
  e.path = nav.clear(e.x, e.z, e.tx, e.tz) ? [{ x: e.tx, z: e.tz }] : nav.find(e.x, e.z, e.tx, e.tz) ?? [{ x: e.tx, z: e.tz }];
}

/**
 * 목표를 향해 한 틱만큼 걷는다. 도착하거나 막히면 moving이 꺼진다.
 * 목표가 크게 바뀌면 바로, 조금씩 움직이면(쫓아가는 중) 0.3초에 한 번만 길을 다시 세운다.
 */
export function walk(e: Walker, speed: number, dt: number, obstacles: readonly Obstacle[], nav: NavGrid, clock: number): void {
  const moved = Math.hypot(e.tx - e.pgx, e.tz - e.pgz);
  if (!e.path || moved > 3 || (moved > 0.01 && clock - e.pat > 0.3)) plan(e, nav, clock);
  else if (moved > 0.01 && e.path.length === 1) { e.path[0].x = e.tx; e.path[0].z = e.tz; } // 곧장 가는 중이면 움직이는 목표를 그대로 따라간다
  const path = e.path!, wp = path[0];
  const bx = e.x, bz = e.z;
  if (stepToward(e, wp.x, wp.z, speed, dt, obstacles)) {
    path.shift();
    if (!path.length) { e.moving = false; e.path = null; }
    return;
  }
  // 그래도 거의 못 움직이면 멈춘다 (움직이는 것끼리 막혔을 때 등)
  if (Math.hypot(e.x - bx, e.z - bz) < speed * dt * 0.25) { e.stuck += dt; if (e.stuck > 0.5) { e.moving = false; e.path = null; } }
  else e.stuck = 0;
}
