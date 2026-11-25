// 버섯 동굴의 겉모습: 어두운 바닥, 버섯 몬스터, 깊은 굴의 바닥 색, 분위기.
import * as THREE from 'three';
import { CAMP, DEEP_DOOR } from '../shared/content';
import type { MonsterId } from '@engine/shared/defs';
import { AREAS } from '@engine/shared/world';
import { type Look, mat, type Model, part, registerMonsterModel, setMapPaint, view } from '@engine/client';

const floor = [new THREE.Color(0x3b3348), new THREE.Color(0x2e2a3a)], deep = new THREE.Color(0x24303a), camp = new THREE.Color(0x5a4a3a);
const LEAVES = [0x7ad6c0, 0x9a7ad6, 0xd67ab8];

export const look: Look = {
  ground: (x, z, j, c) => {
    if (x > 150) c.copy(deep).lerp(floor[1], j * 0.5);
    else if (Math.hypot(x - CAMP.x, z - CAMP.z) < 7) c.copy(camp);
    else c.copy(floor[0]).lerp(floor[1], j);
  },
  leaf: (_x, _z, k) => LEAVES[Math.floor(k * LEAVES.length) % LEAVES.length],
  scenery: (scene) => {
    // 깊은 굴의 문: 빛나는 버섯 두 개
    for (const dx of [-2.5, 2.5]) scene.add(part(new THREE.SphereGeometry(0.9, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9aff7a }), DEEP_DOOR.x + dx, 2, DEEP_DOOR.z));
  },
};

/** 버섯 몬스터: 줄기와 갓. blob을 돌려주면 틀이 통통 튀게 한다 */
const SHROOMS: Record<MonsterId, { cap: number; size: number }> = {
  sporeling: { cap: 0xe8d27a, size: 0.6 },
  puffcap: { cap: 0xd65a5a, size: 1.0 },
  lurker: { cap: 0x6a5ad6, size: 0.9 },
  mycelord: { cap: 0x9a3ad6, size: 2.4 },
};
function shroom(type: string): Model {
  const s = SHROOMS[type as MonsterId], root = new THREE.Group(), inner = new THREE.Group();
  const stem = part(new THREE.CylinderGeometry(0.3, 0.4, 0.9, 6), mat(0xe8e0cc), 0, 0.45, 0);
  const cap = part(new THREE.SphereGeometry(0.75, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(s.cap), 0, 0.85, 0);
  for (const x of [-0.14, 0.14]) inner.add(part(new THREE.BoxGeometry(0.08, 0.1, 0.05), mat(0x1a1a1a), x, 0.6, 0.33));
  inner.add(stem, cap);
  inner.scale.setScalar(s.size);
  root.add(inner);
  return { root, blob: cap };
}

export function initScene(): void {
  for (const type of Object.keys(SHROOMS)) registerMonsterModel(type, shroom);
  view.setMood({ sky: 0x2a2438, hemi: 1.4, sun: 1.2, fogNear: 40, fogFar: 100 });
  setMapPaint((b) => { for (const a of AREAS) b.quad(a.x0, a.z0, a.x1, a.z1, a.id === 'deep' ? '#24303a' : '#3b3348'); b.disc(CAMP.x, CAMP.z, 7, '#5a4a3a'); });
}
