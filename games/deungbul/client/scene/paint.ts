// 이 게임의 맵을 칠하는 법: 땅의 색(등탑 앞마당, 길, 물가, 구역별 풀빛), 구역별 잎 색, 미니맵의 바탕.
// 틀(scene/view.ts, hud/minimap.ts)은 여기 함수를 넘겨받아 칠하기만 한다. 맵 정의(games/deungbul/shared/content/map.ts)가 바뀌면 함께 고친다.
import * as THREE from 'three';
import { AREAS, MAX_X, MAX_Z, MIN_X, MIN_Z, POND, TOWERS, ZONE_SPLIT, onPath, zoneOf } from '../../shared/world';
import type { MapBrush } from '@engine/client/hud/minimap';

const dirt = new THREE.Color(0xb99c6c), sand = new THREE.Color(0xd0bd88), stone = new THREE.Color(0xb9aa8c);
// 구역마다 풀빛이 다르다: 등불 들판은 푸르고, 잿빛 숲은 바랜 빛이다
const grass = [[new THREE.Color(0x74ad5e), new THREE.Color(0x5f9a52)], [new THREE.Color(0x7b8f72), new THREE.Color(0x667a62)]];

/** 땅의 삼각형 하나의 색 (scene/view.ts의 Look.ground) */
export function ground(x: number, z: number, j: number, c: THREE.Color): void {
  if (TOWERS.some((t) => Math.hypot(x - t.x, z - t.z - 3.2) < 7.5)) c.copy(stone); // 등탑 앞마당
  else if (onPath(x, z, 1.9)) c.copy(dirt);
  else if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.8) c.copy(sand);
  else {
    // 구역의 경계에서는 두 빛깔을 섞어 띠가 지지 않게 한다
    const k = Math.min(1, Math.max(0, (x - (ZONE_SPLIT - 8)) / 16));
    const [a0, b0] = grass[0], [a1, b1] = grass[1];
    c.copy(a0).lerp(b0, j).lerp(new THREE.Color().copy(a1).lerp(b1, j), k);
  }
}

// 구역마다 잎의 빛깔이 다르다
const leafColors = [[0x3f8a4f, 0x4c9a52, 0x357a4a, 0x5aa45a, 0x6aa04a], [0x4f6b58, 0x5d7862, 0x47604f, 0x6a8068, 0x748a6c]];
/** 나무 한 그루의 잎 색 (scene/view.ts의 Look.leaf) */
export function leaf(x: number, _z: number, k: number): number {
  const colors = leafColors[zoneOf(x)];
  return colors[Math.floor(k * colors.length) % colors.length];
}

const MAP_COLOR = { ground: '#3d6b45', forest: '#4a5a52', pond: '#4f9fc0' };
/** 미니맵의 바탕 (hud/minimap.ts의 setMapPaint) */
export function mapPaint(b: MapBrush): void {
  // 땅: 구역마다 색이 다르다
  b.quad(MIN_X, MIN_Z, ZONE_SPLIT, MAX_Z, MAP_COLOR.ground);
  b.quad(ZONE_SPLIT, MIN_Z, MAX_X, MAX_Z, MAP_COLOR.forest);
  for (const a of AREAS.slice(1)) b.quad(a.x0, a.z0, a.x1, a.z1, '#3a3648'); // 던전 같은 따로 떨어진 지역
  b.disc(POND.x, POND.z, POND.r, MAP_COLOR.pond);
}
