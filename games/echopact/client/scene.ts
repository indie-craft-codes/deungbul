// 이 게임의 겉모습: 땅과 잎의 색, 울림 샘, 미니맵의 바탕, 몬스터의 코드 모델, 이 게임이 더한 부품 '울림 고리'. 모델·소리 파일은 없다.
import * as THREE from 'three';
import { AREAS } from '@engine/shared/world';
import type { MonsterId } from '@engine/shared/defs';
import { type Look, limb, lookGeo, mat, type Model, onFrame, part, registerLookPart, registerMonsterModel, setMapPaint, view } from '@engine/client';
import { ARENA, WELL } from '../shared/content/pact';

const stone = new THREE.Color(0xa8a49a), grass = [new THREE.Color(0x7fa86a), new THREE.Color(0x6a9460)];
const LEAVES = [0x4f8a5a, 0x6aa070, 0x3f7a6a, 0x8ab070];
/** 샘의 물빛: 프레임마다 조금씩 밝아졌다 어두워진다 */
const water = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.1, 18), new THREE.MeshBasicMaterial({ color: 0x7fd0ff }));

/** 지형의 겉모습 (startClient의 look) */
export const look: Look = {
  // 샘 둘레와 단계의 자리는 돌바닥, 그 밖은 풀빛
  ground: (x, z, j, c) => {
    if (Math.hypot(x - WELL.x, z - WELL.z) < 7 || Math.hypot(x - ARENA.x, z - ARENA.z) < 10) c.copy(stone).lerp(grass[0], j * 0.25);
    else c.copy(grass[0]).lerp(grass[1], j);
  },
  leaf: (_x, _z, k) => LEAVES[Math.floor(k * LEAVES.length) % LEAVES.length],
  scenery: (scene) => {
    const well = new THREE.Group();
    // 돌 테두리 여덟, 물, 가운데 떠 있는 종
    for (let i = 0; i < 8; i++) well.add(part(new THREE.BoxGeometry(0.7, 0.55, 0.45), mat(0x9a968c), Math.cos(i * 0.785) * WELL.r, 0.27, Math.sin(i * 0.785) * WELL.r));
    water.position.y = 0.35;
    well.add(water);
    const bell = part(new THREE.ConeGeometry(0.45, 0.7, 8, 1, true), mat(0xd8b060), 0, 2.4, 0);
    well.add(bell, part(new THREE.SphereGeometry(0.12, 8, 6), mat(0xd8b060), 0, 2.05, 0));
    for (const s of [-1, 1]) well.add(part(new THREE.BoxGeometry(0.18, 2.9, 0.18), mat(0x6a5a4a), s * 1.1, 1.45, 0), part(new THREE.BoxGeometry(2.4, 0.16, 0.2), mat(0x6a5a4a), 0, 2.9, 0));
    well.position.set(WELL.x, 0, WELL.z);
    scene.add(well);
  },
};

/** 들판의 네발짐승: 크기와 털빛, 뿔 */
const BEASTS: Partial<Record<MonsterId, { fur: number; size: number; horn: number }>> = {
  mossling: { fur: 0x6a9a4a, size: 0.55, horn: 0 },
  thornboar: { fur: 0x7b5a44, size: 1.05, horn: 0.3 },
  stonehorn: { fur: 0x8a8a90, size: 1.7, horn: 0.6 },
};
function beast(type: string): Model {
  const b = BEASTS[type as MonsterId] ?? { fur: 0x888888, size: 1, horn: 0 }, fur = mat(b.fur), dark = mat(0x2f2a24), root = new THREE.Group(), legs: THREE.Group[] = [];
  const inner = new THREE.Group();
  inner.add(part(new THREE.BoxGeometry(0.75, 0.7, 1.35), fur, 0, 0.95, 0), part(new THREE.BoxGeometry(0.55, 0.5, 0.55), fur, 0, 1.15, 0.88));
  if (b.horn) for (const x of [-0.2, 0.2]) { const h = part(new THREE.ConeGeometry(0.07, b.horn, 5), mat(0xe8e0d0), x, 1.5, 1.0); h.rotation.x = 0.6; inner.add(h); }
  for (const x of [-0.14, 0.14]) inner.add(part(new THREE.BoxGeometry(0.09, 0.09, 0.05), dark, x, 1.22, 1.16));
  for (const [x, z] of [[-0.25, 0.48], [0.25, 0.48], [-0.25, -0.48], [0.25, -0.48]]) { const leg = limb(new THREE.BoxGeometry(0.18, 0.6, 0.18), dark, x, 0.6, z, 0.3); legs.push(leg); inner.add(leg); }
  inner.scale.setScalar(b.size);
  root.add(inner);
  return { root, legs };
}
/** 단계의 메아리 무리: 떠 있는 울림 (몸통, 빛나는 눈, 머리 위의 고리). 우두머리는 크게 */
const SPIRITS: Partial<Record<MonsterId, { color: number; size: number }>> = {
  wisp: { color: 0x9ad0ff, size: 0.7 },
  hollowkin: { color: 0x8a7aa0, size: 1.0 },
  shadeshot: { color: 0x4a4a6a, size: 0.95 },
  bellgolem: { color: 0xb08a50, size: 2.0 },
  echowarden: { color: 0x6a5aa0, size: 2.3 },
};
function spirit(type: string): Model {
  const s = SPIRITS[type as MonsterId] ?? { color: 0x9a9aff, size: 1 }, root = new THREE.Group(), inner = new THREE.Group();
  const body = part(new THREE.ConeGeometry(0.55, 1.5, 7), mat(s.color), 0, 1.05, 0);
  body.rotation.x = Math.PI;
  inner.add(body, part(new THREE.SphereGeometry(0.42, 10, 8), mat(s.color), 0, 1.95, 0));
  for (const x of [-0.15, 0.15]) inner.add(part(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }), x, 2.0, 0.36));
  const ring = part(new THREE.TorusGeometry(0.34, 0.05, 6, 16), mat(0xffe08a), 0, 2.55, 0);
  ring.rotation.x = Math.PI / 2;
  inner.add(ring);
  inner.scale.setScalar(s.size);
  root.add(inner);
  return { root, blob: body };
}

export function initScene(): void {
  for (const type of Object.keys(BEASTS)) registerMonsterModel(type, beast);
  for (const type of Object.keys(SPIRITS)) registerMonsterModel(type, spirit);
  view.setMood({ sky: 0xb8d4e8, hemi: 2.0, sun: 2.2, fogNear: 58, fogFar: 125 });
  setMapPaint((b) => { for (const a of AREAS) b.quad(a.x0, a.z0, a.x1, a.z1, '#58784a'); b.disc(WELL.x, WELL.z, 7, '#9a968c'); });
  onFrame((now) => { (water.material as THREE.MeshBasicMaterial).color.setHSL(0.55, 0.8, 0.68 + Math.sin(now / 600) * 0.06); });
  // 이 게임이 더한 모자 '울림 고리' (내용의 LOOK_RULES.add): 머리 위에 뜬 금빛 고리. 모양은 lookGeo로 나눠 쓴다 (같은 겉모습은 구운 모양을 함께 쓴다)
  registerLookPart('hat', 'halo', ({ head, mats }) => {
    const ring = part(lookGeo('haloRing', () => new THREE.TorusGeometry(0.3, 0.045, 6, 18)), mats.accent, 0, head.h + 0.28, 0);
    ring.rotation.x = Math.PI / 2;
    head.head.add(ring);
  });
}
