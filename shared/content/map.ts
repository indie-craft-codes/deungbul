// 이 게임의 맵: 범위, 구역, 등탑과 마을, 몬스터 빈터, 길, 나무와 바위를 뿌리는 규칙.
// 다른 맵(또는 다른 게임)으로 바꾸려면 이 파일을 갈아 끼운다. 엔진 쪽(shared/world.ts)은 여기 값을 읽어 월드를 만든다.
//
// 월드는 동서로 긴 직사각형이고, 서쪽이 첫 구역(첫불 마을과 등불 들판), 동쪽이 두 번째 구역(잿빛 숲)이다.
// 구역마다 등탑이 하나씩 있다. 구역을 더하려면 범위를 넓히고 TOWERS, CLEARINGS, SCATTER에 더한다.

/** 월드의 범위 */
export const MIN_X = -60, MAX_X = 180, MIN_Z = -60, MAX_Z = 60;
/** 가장자리에서 이만큼 안쪽까지만 갈 수 있다 */
export const EDGE = 2;

/**
 * 걸어 다닐 수 있는 지역들. 0번은 들판(위의 범위)이고, 나머지는 던전처럼 따로 떨어진 곳이다.
 * 지역 사이는 걸어서 넘을 수 없고 문(shared/content/dungeons.ts)으로만 오간다. 지역을 더하려면 여기에 네모를 더한다.
 */
export interface Area { id: string; x0: number; x1: number; z0: number; z1: number }
export const AREAS: readonly Area[] = [
  { id: 'field', x0: MIN_X, x1: MAX_X, z0: MIN_Z, z1: MAX_Z },
  { id: 'crypt', x0: 260, x1: 340, z0: -40, z1: 40 }, // 잿빛 지하묘 (던전)
];
/** 그 자리가 속한 지역의 번호. 어느 지역도 아니면 -1 */
export const areaAt = (x: number, z: number): number => AREAS.findIndex((a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1);
/** 모든 지역을 감싸는 범위: 길찾기 격자가 이만큼을 덮는다 */
export const GRID = {
  x0: Math.min(...AREAS.map((a) => a.x0)), x1: Math.max(...AREAS.map((a) => a.x1)),
  z0: Math.min(...AREAS.map((a) => a.z0)), z1: Math.max(...AREAS.map((a) => a.z1)),
};
/** 던전으로 들어가는 문의 자리 (들판). 이 둘레에는 나무와 바위를 두지 않는다 */
export const PORTALS: Readonly<Record<string, { x: number; z: number }>> = {
  crypt: { x: 128.5, z: 2 },
};
/** 문 둘레에서 나무와 바위를 치우는 반경 */
export const PORTAL_CLEAR = 9;

/** 던전 안의 기둥 (모든 인스턴스가 같은 지형을 쓴다) */
export const PILLARS: readonly { x: number; z: number; r: number }[] = [
  { x: 276, z: -9, r: 1.6 }, { x: 276, z: 9, r: 1.6 }, { x: 290, z: -22, r: 1.6 }, { x: 290, z: 22, r: 1.6 },
  { x: 304, z: -9, r: 1.6 }, { x: 304, z: 9, r: 1.6 }, { x: 318, z: -14, r: 2 }, { x: 318, z: 14, r: 2 },
];

/** 구역: 0 등불 들판(첫불 마을 포함), 1 잿빛 숲 (그 너머의 던전도 잿빛 숲의 구역으로 친다). x가 이 값보다 작으면 첫 구역이다 */
export const ZONE_SPLIT = 62;
export const ZONE_COUNT = 2;
export const zoneOf = (x: number): number => (x < ZONE_SPLIT ? 0 : 1);

export interface TowerDef {
  /** 이름은 언어 파일에 있다 (towers[id]) */
  id: string;
  x: number; z: number; r: number;
  /** 이 등탑에서 다시 일어나는 자리 */
  spawn: { x: number; z: number };
  /** 처음 밝기. 0이면 꺼진 채로 시작한다: 서버 전체가 불씨를 모아 밝혀야 한다 */
  start: number;
  /** 습격에 져도 이 아래로는 내려가지 않는다 */
  floor: number;
}
/** 구역마다 등탑 하나. 순서가 구역 번호다 */
export const TOWERS: readonly TowerDef[] = [
  { id: 'first', x: 0, z: -3.2, r: 1.4, spawn: { x: 0, z: 3 }, start: 40, floor: 15 },
  { id: 'ash', x: 120, z: -3.2, r: 1.4, spawn: { x: 120, z: 3 }, start: 0, floor: 0 },
];
/** 첫불 마을의 등탑 (처음 접속하는 곳) */
export const TOWER = TOWERS[0];

/** '마을로' 단추가 데려다주는 자리: 등탑 창이 열리는 거리 안 */
export const TOWN = { x: TOWER.x - 1, z: TOWER.z + 4 };

export const POND = { x: 18, z: -10, r: 7 };
export const HOUSES: readonly (readonly [number, number, number])[] = [
  [-10, -8, 0xb5533c],
  [9, -9, 0x3f6f8f],
  [-9, 9, 0x8a5a9e],
  [10, 8, 0xc08a2e],
];
// 몬스터가 사는 빈터와 퀘스트 장소. 나무를 심지 않는다. 번호로 참조하므로 순서를 바꾸지 않고 뒤에 더한다.
export const CLEARINGS = [
  { x: -24, z: 16 },
  { x: -12, z: -30 },
  { x: 26, z: 22 },
  { x: 36, z: -32 },
  { x: -32, z: -9 }, // 옛 대장간 터
  { x: 31, z: -13 }, // 옛 약초밭 (연못 동쪽)
  // 잿빛 숲
  { x: 86, z: -26 },
  { x: 96, z: 24 },
  { x: 142, z: -28 },
  { x: 152, z: 26 },
  { x: 166, z: -24 },
  { x: 168, z: 20 }, // 잿빛 트롤의 자리
];

/** 길 위인가: 마을에서 잿빛 숲 끝까지 가는 동서 큰길, 그리고 등탑마다 지나는 남북 길 */
export function onPath(x: number, z: number, half: number): boolean {
  if (Math.abs(z) < half && x > -44 && x < MAX_X - 4) return true;
  if (Math.abs(x) < half && z > -40 && z < 30) return true;
  return Math.abs(x - TOWERS[1].x) < half && z > -30 && z < 30;
}

/** 나무나 바위를 놓아도 되는 자리인가 (마을, 등탑 터, 길, 연못, 빈터는 비워 둔다) */
export function isFree(x: number, z: number): boolean {
  if (Math.hypot(x, z) < 16) return false; // 첫불 마을
  for (let i = 1; i < TOWERS.length; i++) if (Math.hypot(x - TOWERS[i].x, z - TOWERS[i].z) < 11) return false; // 등탑 터
  if (onPath(x, z, 3.6)) return false;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) return false;
  for (const c of CLEARINGS) if (Math.hypot(x - c.x, z - c.z) < 9.5) return false;
  return true;
}

export interface Scatter {
  kind: 'tree' | 'rock';
  count: number;
  /** 뿌리는 x 범위 */
  x0: number; x1: number;
  /** z 범위를 월드보다 이만큼 넓게(음수면 좁게) 잡는다 */
  pad: number;
  /** 크기: s0 + 난수 * s1 */
  s0: number; s1: number;
}
/** 나무와 바위를 뿌리는 규칙. 순서대로 같은 난수열을 쓰므로, 순서를 바꾸면 맵 전체의 배치가 달라진다 */
export const SCATTER: readonly Scatter[] = [
  // 나무는 화면 밖까지 이어지도록 범위보다 조금 넓게, 바위는 범위 안에만
  { kind: 'tree', count: 150, x0: MIN_X - 16, x1: ZONE_SPLIT, pad: 16, s0: 0.8, s1: 0.7 }, // 등불 들판: 듬성듬성
  { kind: 'tree', count: 300, x0: ZONE_SPLIT, x1: MAX_X + 16, pad: 16, s0: 0.9, s1: 0.9 }, // 잿빛 숲: 빽빽하고 크다
  { kind: 'rock', count: 36, x0: MIN_X + EDGE, x1: ZONE_SPLIT, pad: -EDGE, s0: 0.6, s1: 1.1 },
  { kind: 'rock', count: 44, x0: ZONE_SPLIT, x1: MAX_X - EDGE, pad: -EDGE, s0: 0.7, s1: 1.3 },
];
/** 맵 배치의 난수 시드 */
export const MAP_SEED = 20261123;
