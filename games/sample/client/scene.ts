// 이 게임의 겉모습: 땅과 잎의 색, 모닥불, 미니맵의 바탕, 몬스터와 장비의 모델. 틀(scene/view.ts, scene/models.ts)에는 기본 모양만 있다.
import * as THREE from 'three';
import { BONFIRE } from '../shared/content/bonfire';
import type { MonsterId } from '@engine/shared/defs';
import { AREAS } from '@engine/shared/world';
import { limb, type Look, mat, type Model, onFrame, part, registerArmor, registerBlade, registerMonsterModel, setMapPaint, view } from '@engine/client';
import { G } from './bonfire';

const dirt = new THREE.Color(0xa98d62), grass = [new THREE.Color(0x8aa35a), new THREE.Color(0x76904e)];
const LEAVES = [0xc9722e, 0xd9a03a, 0x9a6a2e, 0x7f8f3e];
/** 불꽃: 온기에 따라 커진다 (initScene의 프레임 처리) */
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 5), new THREE.MeshBasicMaterial({ color: 0xff9a3a }));

/** 지형의 겉모습 (startClient의 look): 땅의 삼각형 색, 나무의 잎 색, 건물 */
export const look: Look = {
  // 야영지 둘레는 흙바닥, 그 밖은 가을 풀빛
  ground: (x, z, j, c) => { if (Math.hypot(x - BONFIRE.x, z - BONFIRE.z) < 9) c.copy(dirt); else c.copy(grass[0]).lerp(grass[1], j); },
  leaf: (_x, _z, k) => LEAVES[Math.floor(k * LEAVES.length) % LEAVES.length],
  scenery: (scene) => {
    const fire = new THREE.Group();
    for (let i = 0; i < 6; i++) fire.add(part(new THREE.DodecahedronGeometry(0.34, 0), mat(0x8f9590), Math.cos(i * 1.05) * BONFIRE.r, 0.2, Math.sin(i * 1.05) * BONFIRE.r));
    for (const r of [0.4, 1.9]) { const log = part(new THREE.CylinderGeometry(0.14, 0.14, 1.8, 5), mat(0x6b4a2e), 0, 0.3, 0); log.rotation.set(Math.PI / 2, 0, r); fire.add(log); }
    fire.add(flame);
    fire.position.set(BONFIRE.x, 0, BONFIRE.z);
    scene.add(fire);
  },
};

/** 네발짐승: 종류마다 크기와 털빛만 다르다. legs를 돌려주면 틀이 걷는 동작을 입힌다 */
const BEASTS: Record<MonsterId, { fur: number; size: number; ear: number }> = {
  rabbit: { fur: 0xd9cdb8, size: 0.55, ear: 0.7 },
  boar: { fur: 0x7b5a44, size: 1.1, ear: 0.2 },
  bear: { fur: 0x5a4030, size: 1.9, ear: 0.25 },
};
function beast(type: string): Model {
  const b = BEASTS[type as MonsterId], fur = mat(b.fur), dark = mat(0x2f241c), root = new THREE.Group(), legs: THREE.Group[] = [];
  root.add(part(new THREE.BoxGeometry(0.7, 0.7, 1.4), fur, 0, 0.95, 0), part(new THREE.BoxGeometry(0.55, 0.5, 0.6), fur, 0, 1.2, 0.9));
  for (const x of [-0.18, 0.18]) root.add(part(new THREE.BoxGeometry(0.12, b.ear, 0.1), fur, x, 1.45 + b.ear / 2, 0.8), part(new THREE.BoxGeometry(0.1, 0.1, 0.06), dark, x, 1.28, 1.21));
  for (const [x, z] of [[-0.25, 0.5], [0.25, 0.5], [-0.25, -0.5], [0.25, -0.5]]) { const leg = limb(new THREE.BoxGeometry(0.18, 0.6, 0.18), dark, x, 0.6, z, 0.3); legs.push(leg); root.add(leg); }
  // 크기는 안쪽 묶음에 준다: 틀이 죽는 연출에서 바깥 root의 크기를 바꾼다
  const inner = new THREE.Group();
  inner.add(...root.children);
  inner.scale.setScalar(b.size);
  root.add(inner);
  return { root, legs };
}

export function initScene(): void {
  for (const type of Object.keys(BEASTS)) registerMonsterModel(type, beast);
  registerBlade('axe2', { color: 0xffd9a0, scale: 1.25, glow: false });
  registerArmor('coat', { color: 0x8a6a48, pads: false });
  // 분위기: 저녁 빛 (하늘과 안개의 색, 두 빛의 세기, 안개의 거리)
  view.setMood({ sky: 0xd9b48a, hemi: 1.9, sun: 2.1, fogNear: 52, fogFar: 115 });
  // 미니맵의 바탕: 지역은 풀빛, 야영지는 흙빛
  setMapPaint((b) => { for (const a of AREAS) b.quad(a.x0, a.z0, a.x1, a.z1, '#5d7040'); b.disc(BONFIRE.x, BONFIRE.z, 9, '#8a744e'); });
  onFrame((now) => { flame.visible = G.heat > 0; flame.scale.setScalar(0.5 + G.heat / 100); flame.position.y = 0.4 + 0.8 * flame.scale.y + Math.sin(now / 120) * 0.04; });
}
