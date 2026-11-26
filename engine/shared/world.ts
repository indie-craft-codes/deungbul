// 서버와 클라이언트가 함께 쓰는 월드: 엔진 상수와, 맵 정의로 장애물을 만드는 코드.
// 같은 시드로 같은 장애물을 만들어서, 서버의 충돌 판정과 클라이언트의 그림이 항상 일치한다.
// 맵 자체(범위, 지역, 장애물, 나무 뿌리는 규칙)는 게임의 내용(@game/shared/content의 MAP)이고, 여기서는 그 모양과 거기서 꺼낸 것(defs/map.ts)만 다시 내보낸다.
// 이 파일은 그 가운데 맵 정의(MAP)와 주기·시야(NET)만 읽는다: 게임의 낱말(등불지기의 연못, 등탑 같은 것)은 모른다.
import { MAP, NET } from './content';
import { AREAS, EDGE, areaAt } from './defs/map';

export * from './defs/map';
export { MAP };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/**
 * 갈 수 있는 범위 안으로 좌표를 맞춘다: 그 점이 속한 지역(없으면 가장 가까운 지역)의 가장자리 안쪽으로 당긴다.
 * 지역 사이의 빈 곳으로는 걸어 나갈 수 없다.
 */
export function clampInto(p: { x: number; z: number }): void {
  let i = areaAt(p.x, p.z);
  if (i < 0) {
    let bd = Infinity;
    AREAS.forEach((a, k) => {
      const d = Math.hypot(p.x - clamp(p.x, a.x0, a.x1), p.z - clamp(p.z, a.z0, a.z1));
      if (d < bd) { bd = d; i = k; }
    });
  }
  const a = AREAS[i];
  p.x = clamp(p.x, a.x0 + EDGE, a.x1 - EDGE);
  p.z = clamp(p.z, a.z0 + EDGE, a.z1 - EDGE);
}
/** clampInto의 결과를 새 점으로 돌려준다 */
export const clampPoint = (x: number, z: number): { x: number; z: number } => { const p = { x, z }; clampInto(p); return p; };

/** 시야 반경: 이 안의 엔티티만 클라이언트로 보낸다. 서버의 주기와 시야는 게임이 내용의 NET으로 바꾼다 (기본값 engine/shared/defaults.ts) */
export const AOI = NET.aoi;
/** 시야에서 빠지는 반경 (경계에서 깜빡이지 않도록 조금 넓게) */
export const AOI_LEAVE = Math.max(NET.aoiLeave, NET.aoi);
export const CELL = 16; // 서버 공간 격자 한 칸의 크기
/** 서버 시뮬레이션 주기(ms) */
export const TICK_MS = NET.tickMs;
/** 몇 틱마다 스냅샷을 보내는가 */
export const SNAP_EVERY = Math.max(1, Math.round(NET.snapEvery));
export const PLAYER_SPEED = 6.2;
export const BODY_R = 0.45;
export const NAME_MAX = 12;
export const CHAT_MAX = 80;

export interface Obstacle { x: number; z: number; r: number }
export interface Deco { x: number; z: number; s: number; rot: number }
export interface World { obstacles: Obstacle[]; trees: Deco[]; rocks: Deco[] }

/** 시드 고정 난수 (mulberry32). 정수 연산만 써서 서버와 브라우저에서 결과가 같다. */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildWorld(seed = MAP.seed): World {
  const rnd = rng(seed);
  // 들판(0번 지역)의 범위: 나무와 바위는 들판에만 뿌린다
  const { x0: MIN_X, x1: MAX_X, z0: MIN_Z, z1: MAX_Z } = MAP.areas[0];
  const obstacles: Obstacle[] = MAP.obstacles.map((o) => ({ x: o.x, z: o.z, r: o.r }));

  const trees: Deco[] = [];
  const rocks: Deco[] = [];
  // 규칙마다 정해진 수만큼 뿌린다
  for (const sc of MAP.scatter) {
    const list = sc.kind === 'tree' ? trees : rocks;
    const target = list.length + sc.count;
    for (let n = 0; list.length < target && n < sc.count * 30; n++) {
      const x = sc.x0 + rnd() * (sc.x1 - sc.x0), z = MIN_Z - sc.pad + rnd() * (MAX_Z - MIN_Z + sc.pad * 2);
      const s = sc.s0 + rnd() * sc.s1, rot = rnd();
      if (MAP.isFree(x, z)) list.push({ x, z, s, rot });
    }
  }

  // 던전의 문 둘레는 비운다. 뿌릴 때 거르면 난수열이 달라져 맵 전체의 배치가 바뀌므로, 다 뿌린 뒤에 가까운 것만 뺀다
  // 게임이 정한 '뿌린 뒤에 치울 자리'(MAP.clearAfter)도 여기서 같은 까닭으로 거른다
  const clearOf = (d: Deco) => Object.values(MAP.portals).every((p) => Math.hypot(d.x - p.x, d.z - p.z) > MAP.portalClear) && !MAP.clearAfter?.(d.x, d.z);
  for (const list of [trees, rocks]) for (let i = list.length - 1; i >= 0; i--) if (!clearOf(list[i])) list.splice(i, 1);

  const inside = (d: Deco) => d.x > MIN_X - 2 && d.x < MAX_X + 2 && d.z > MIN_Z - 2 && d.z < MAX_Z + 2;
  for (const t of trees) if (inside(t)) obstacles.push({ x: t.x, z: t.z, r: 0.55 * t.s });
  for (const r of rocks) obstacles.push({ x: r.x, z: r.z, r: 0.7 * r.s });
  return { obstacles, trees, rocks };
}
