// 이 게임의 맵: 범위, 구역, 등탑과 마을, 몬스터 빈터, 길, 나무와 바위를 뿌리는 규칙.
// 다른 맵(또는 다른 게임)으로 바꾸려면 이 파일을 갈아 끼운다. 틀 쪽(engine/shared/world.ts)은 여기의 MAP을 읽어 월드를 만든다.
//
// 월드는 동서로 긴 직사각형이고, 서쪽부터 첫 구역(첫불 마을과 등불 들판), 두 번째 구역(잿빛 숲), 세 번째 구역(잿불 고원)이다.
// 구역마다 등탑이 하나씩 있다. 구역을 더하려면 범위를 넓히고 TOWERS, CLEARINGS, MAP의 scatter에 더한다.
// 이미 있는 구역의 나무·바위가 그대로 있게 하려면: 있는 scatter 줄의 범위를 숫자 그대로 두고(MAX_X 같은 이름을 쓰던 곳은 그때의 숫자로 바꿔 적는다)
// 새 줄은 맨 뒤에 더한다. 새 빈터·등탑 터·길이 예전 나무 자리와 겹치지 않는지도 본다 (난수를 쓰는 차례가 바뀌면 맵 전체가 바뀐다)
// 맵 정의의 모양(MapDef)은 틀에 있다: engine/shared/defs/map.ts
import type { MapDef } from '@engine/shared/defs/map';

/** 월드의 범위 */
// 2026-11-25: 잿불 고원을 더하며 MAX_X 180 → 252. 동쪽의 던전 지역(crypt, x 260부터)과 겹치지 않게 그 앞에서 멈춘다
export const MIN_X = -60, MAX_X = 252, MIN_Z = -60, MAX_Z = 60;
/** 가장자리에서 이만큼 안쪽까지만 갈 수 있다 (MAP.edge) */
const edge = 2;

/** 던전 안의 기둥 (모든 인스턴스가 같은 지형을 쓴다) */
export const PILLARS: readonly { x: number; z: number; r: number }[] = [
  { x: 276, z: -9, r: 1.6 }, { x: 276, z: 9, r: 1.6 }, { x: 290, z: -22, r: 1.6 }, { x: 290, z: 22, r: 1.6 },
  { x: 304, z: -9, r: 1.6 }, { x: 304, z: 9, r: 1.6 }, { x: 318, z: -14, r: 2 }, { x: 318, z: 14, r: 2 },
];

/**
 * 구역: 0 등불 들판(첫불 마을 포함), 1 잿빛 숲, 2 잿불 고원.
 * x가 ZONE_SPLIT보다 작으면 첫 구역, ZONE_SPLIT2보다 작으면 두 번째 구역이다.
 * 들판 동쪽 너머의 던전(x가 DUNGEON_X 이상)은 예전처럼 잿빛 숲의 구역으로 친다: 지하묘의 문이 잿빛 숲에 있다
 */
export const ZONE_SPLIT = 62;
export const ZONE_SPLIT2 = 186;
/** 이 x부터는 들판이 아니라 던전 지역이다 (MAP.areas의 crypt는 260부터. 들판 가장자리의 장식 나무는 그 앞에서 멈춘다) */
const DUNGEON_X = 259;
export const ZONE_COUNT = 3;
export const zoneOf = (x: number): number => (x < ZONE_SPLIT ? 0 : x < ZONE_SPLIT2 || x >= DUNGEON_X ? 1 : 2);

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
  { id: 'ember', x: 220, z: -3.2, r: 1.4, spawn: { x: 220, z: 3 }, start: 0, floor: 0 },
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
  // 잿불 고원. 잿빛 숲의 나무를 뿌리는 범위(x 196까지)에서 빈터의 반경(9.5)보다 멀리 둔다: 예전 나무가 빈터에 걸려 빠지지 않게
  { x: 208, z: -28 },
  { x: 210, z: 26 },
  { x: 236, z: -30 },
  { x: 238, z: 24 },
  { x: 226, z: 46 },
  { x: 238, z: -48 }, // 잿불 거상의 자리
];

/** 길 위인가: 마을에서 잿불 고원 끝까지 가는 동서 큰길, 그리고 등탑마다 지나는 남북 길 */
export function onPath(x: number, z: number, half: number): boolean {
  if (Math.abs(z) < half && x > -44 && x < MAX_X - 4) return true;
  if (Math.abs(x) < half && z > -40 && z < 30) return true;
  for (let i = 1; i < TOWERS.length; i++) if (Math.abs(x - TOWERS[i].x) < half && z > -30 && z < 30) return true;
  return false;
}

/**
 * 잿불 고원으로 늘인 동서 큰길 가운데 잿빛 숲의 나무를 뿌리던 범위(x 176~196) 안의 토막.
 * 뿌릴 때(isFree) 거르면 난수의 차례가 바뀌어 맵 전체가 달라지므로, 뿌린 뒤에 치운다 (MAP.clearAfter)
 */
const newRoadInOldRange = (x: number, z: number): boolean => Math.abs(z) < 3.6 && x >= 176 && x < 196;

/** 나무나 바위를 놓아도 되는 자리인가 (마을, 등탑 터, 길, 연못, 빈터는 비워 둔다) */
export function isFree(x: number, z: number): boolean {
  if (Math.hypot(x, z) < 16) return false; // 첫불 마을
  for (let i = 1; i < TOWERS.length; i++) if (Math.hypot(x - TOWERS[i].x, z - TOWERS[i].z) < 11) return false; // 등탑 터
  if (onPath(x, z, 3.6) && !newRoadInOldRange(x, z)) return false;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 3) return false;
  for (const c of CLEARINGS) if (Math.hypot(x - c.x, z - c.z) < 9.5) return false;
  return true;
}

/** 집이 길을 막는 반경 */
const HOUSE_R = 3.3;

/**
 * 이 게임의 맵 정의. 틀은 이것만 읽는다.
 * obstacles의 순서(연못, 등탑, 집, 던전의 기둥)와 scatter의 순서는 바꾸지 않는다: 맵 전체의 배치와 충돌 판정이 달라진다 (games/deungbul/test/split.test.ts의 맵 지문)
 */
export const MAP: MapDef = {
  // 0번은 들판(위의 범위)이다
  areas: [
    { id: 'field', x0: MIN_X, x1: MAX_X, z0: MIN_Z, z1: MAX_Z },
    { id: 'crypt', x0: 260, x1: 340, z0: -40, z1: 40 }, // 잿빛 지하묘 (던전)
  ],
  edge,
  seed: 20261123,
  spawn: { x: 0, z: 3 }, // 첫불 마을의 등탑 앞
  obstacles: [
    { x: POND.x, z: POND.z, r: POND.r, tag: 'pond' },
    ...TOWERS.map((t) => ({ x: t.x, z: t.z, r: t.r, tag: 'tower' })),
    ...HOUSES.map((h) => ({ x: h[0], z: h[1], r: HOUSE_R, tag: 'house' })),
    ...PILLARS.map((c) => ({ x: c.x, z: c.z, r: c.r, tag: 'pillar' })),
  ],
  scatter: [
    // 나무는 화면 밖까지 이어지도록 범위보다 조금 넓게, 바위는 범위 안에만
    { kind: 'tree', count: 150, x0: MIN_X - 16, x1: ZONE_SPLIT, pad: 16, s0: 0.8, s1: 0.7 }, // 등불 들판: 듬성듬성
    // 잿빛 숲: 빽빽하고 크다. 범위의 끝은 들판이 x 180까지이던 때의 숫자 그대로 둔다 (이 숫자가 바뀌면 그 뒤의 나무와 바위가 모두 자리를 옮긴다)
    { kind: 'tree', count: 300, x0: ZONE_SPLIT, x1: 196, pad: 16, s0: 0.9, s1: 0.9 },
    { kind: 'rock', count: 36, x0: MIN_X + edge, x1: ZONE_SPLIT, pad: -edge, s0: 0.6, s1: 1.1 },
    { kind: 'rock', count: 44, x0: ZONE_SPLIT, x1: 178, pad: -edge, s0: 0.7, s1: 1.3 },
    // 잿불 고원 (2026-11-25에 뒤에 더함): 나무는 듬성듬성, 바위는 많고 크다. 나무는 던전 지역(DUNGEON_X) 앞에서 멈춘다
    { kind: 'tree', count: 90, x0: 196, x1: DUNGEON_X - 1, pad: 16, s0: 0.8, s1: 0.8 },
    { kind: 'rock', count: 48, x0: 178, x1: MAX_X - edge, pad: -edge, s0: 0.8, s1: 1.5 },
  ],
  isFree,
  portals: {
    crypt: { x: 128.5, z: 2 },
    // 깊은 곳의 문: 지하묘 문에서 남쪽으로 조금 (두 문의 거리가 문에 닿는 거리보다 넉넉히 멀다)
    crypt_deep: { x: 128.5, z: -16 },
  },
  portalClear: 9,
  clearAfter: newRoadInOldRange,
};
