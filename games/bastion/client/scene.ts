// 이 게임의 겉모습: 땅과 잎의 색, 우물과 돌담, 미니맵의 바탕, 몬스터와 장비의 모델.
import * as THREE from 'three';
import { WALL, WELL } from '../shared/content/waves';
import { MAP } from '../shared/content';
import type { MonsterId } from '@engine/shared/defs';
import { AREAS } from '@engine/shared/world';
import { defaultHumanoid, limb, type Look, mat, type Model, onFrame, part, registerArmor, registerBlade, registerMonsterModel, registerShot, setHumanoidBody, setMapPaint, view } from '@engine/client';
import { G } from './waves';

const dirt = new THREE.Color(0xb59a6a), path = new THREE.Color(0xa58a5c), grass = [new THREE.Color(0x7fa35a), new THREE.Color(0x6a8e4a)];
const LEAVES = [0x4f8a3a, 0x6aa046, 0x3f7a40, 0x8aaa4a];
/** 우물의 물: 내구에 따라 맑거나 흐려진다 */
const water = new THREE.Mesh(new THREE.CylinderGeometry(WELL.r * 0.75, WELL.r * 0.75, 0.05, 10), new THREE.MeshBasicMaterial({ color: 0x5ab4e0 }));
const CLEAR = new THREE.Color(0x5ab4e0), MUD = new THREE.Color(0x5a4630);

export const look: Look = {
  // 담 안은 흙마당, 네 문으로 난 길, 그 밖은 풀빛
  ground: (x, z, j, c) => {
    const r = Math.hypot(x - WELL.x, z - WELL.z);
    if (r < WALL.r + 1) c.copy(dirt);
    else if (Math.abs(x) < 2.6 || Math.abs(z) < 2.6) c.copy(path);
    else c.copy(grass[0]).lerp(grass[1], j);
  },
  leaf: (_x, _z, k) => LEAVES[Math.floor(k * LEAVES.length) % LEAVES.length],
  scenery: (scene) => {
    // 우물: 돌로 쌓은 둥근 벽, 물, 지붕 기둥 둘과 지붕
    const well = new THREE.Group(), stone = mat(0x9a9488), wood = mat(0x7a5434);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; well.add(part(new THREE.BoxGeometry(0.7, 0.8, 0.45), stone, Math.cos(a) * WELL.r, 0.4, Math.sin(a) * WELL.r)); well.children[i].rotation.y = -a + Math.PI / 2; }
    water.position.y = 0.55; well.add(water);
    for (const x of [-WELL.r, WELL.r]) well.add(part(new THREE.BoxGeometry(0.18, 2.4, 0.18), wood, x, 1.2, 0));
    const roof = part(new THREE.ConeGeometry(WELL.r * 1.5, 0.9, 4), mat(0xa04a2e), 0, 2.75, 0);
    roof.rotation.y = Math.PI / 4;
    well.add(roof);
    well.position.set(WELL.x, 0, WELL.z);
    scene.add(well);
    // 돌담: 내용의 장애물(tag 'wall')마다 돌기둥 하나, 이웃끼리 낮은 담으로 잇는다
    const posts = MAP.obstacles.filter((o) => o.tag === 'wall');
    for (const o of posts) scene.add(part(new THREE.BoxGeometry(1.4, 1.5, 1.4), mat(0x8c867a), o.x, 0.75, o.z));
    // 문 기둥: 동서남북의 두 쪽에 깃발
    for (let g = 0; g < 4; g++) {
      for (const s of [-1, 1]) {
        const a = g * (Math.PI / 2) + s * (WALL.gateHalf + 0.05), x = WELL.x + Math.cos(a) * WALL.r, z = WELL.z + Math.sin(a) * WALL.r;
        scene.add(part(new THREE.BoxGeometry(0.2, 3.4, 0.2), wood, x, 1.7, z), part(new THREE.BoxGeometry(0.08, 0.7, 1.0), mat(0x3a6ab0), x, 2.9, z + 0.5 * s * Math.cos(a)));
      }
    }
  },
};

/** 몬스터: 종류마다 생김새 */
function sludge(): Model {
  const root = new THREE.Group(), body = mat(0x6b5a3a);
  const blob = part(new THREE.DodecahedronGeometry(0.75, 0), body, 0, 0.6, 0);
  blob.scale.y = 0.7;
  root.add(blob, part(new THREE.BoxGeometry(0.14, 0.14, 0.06), mat(0xffe07a), -0.24, 0.78, 0.66), part(new THREE.BoxGeometry(0.14, 0.14, 0.06), mat(0xffe07a), 0.24, 0.78, 0.66));
  return { root, blob };
}
/** 네발짐승의 몸통: 크기와 빛깔 */
function quad(fur: number, size: number, extra?: (g: THREE.Group) => void): Model {
  const f = mat(fur), dark = mat(0x2b2520), root = new THREE.Group(), inner = new THREE.Group(), legs: THREE.Group[] = [];
  inner.add(part(new THREE.BoxGeometry(0.75, 0.6, 1.3), f, 0, 0.8, 0), part(new THREE.BoxGeometry(0.5, 0.45, 0.5), f, 0, 0.9, 0.85));
  for (const x of [-0.14, 0.14]) inner.add(part(new THREE.BoxGeometry(0.08, 0.08, 0.05), mat(0xff5a3a), x, 1.0, 1.11));
  for (const [x, z] of [[-0.25, 0.45], [0.25, 0.45], [-0.25, -0.45], [0.25, -0.45]]) { const leg = limb(new THREE.BoxGeometry(0.18, 0.5, 0.18), dark, x, 0.5, z, 0.25); legs.push(leg); inner.add(leg); }
  extra?.(inner);
  inner.scale.setScalar(size);
  root.add(inner);
  return { root, legs };
}
const MODELS: Record<MonsterId, () => Model> = {
  sludge,
  burrower: () => quad(0x8a7a6a, 0.8, (g) => g.add(part(new THREE.BoxGeometry(0.06, 0.06, 0.9), mat(0xd8c0b0), 0, 0.7, -1.0))),
  spitter: () => {
    // 두꺼비: 납작한 몸에 등의 독주머니
    const m = quad(0x5a8a3a, 0.95, (g) => { g.add(part(new THREE.SphereGeometry(0.32, 6, 4), mat(0xb0e04a), 0, 1.15, -0.1)); });
    return m;
  },
  brute: () => quad(0x6a6458, 1.9, (g) => { for (const z of [-0.4, 0, 0.4]) g.add(part(new THREE.ConeGeometry(0.22, 0.45, 4), mat(0x9a9488), 0, 1.25, z)); }),
};

export function initScene(): void {
  for (const [type, build] of Object.entries(MODELS)) registerMonsterModel(type, build);
  // 독침두꺼비가 뱉는 것: 작은 초록 방울
  registerShot('spit', { shape: 'ball', color: 0x9ae04a, size: 0.6 });
  // 사람 모델: 틀의 사람형에 짚모자를 얹는다
  setHumanoidBody((lk) => {
    const m = defaultHumanoid(lk);
    m.head?.add(part(new THREE.CylinderGeometry(0.2, 0.5, 0.16, 8), mat(0xd8b86a), 0, 0.34, 0));
    return m;
  });
  registerBlade('blade2', { color: 0xbfe0ff, scale: 1.2, glow: false });
  registerArmor('vest', { color: 0x6a7a8a, pads: true });
  view.setMood({ sky: 0xbcd8e8, hemi: 2.0, sun: 2.2, fogNear: 55, fogFar: 120 });
  setMapPaint((b) => {
    for (const a of AREAS) b.quad(a.x0, a.z0, a.x1, a.z1, '#5b7a42');
    b.quad(-2.6, -45, 2.6, 45, '#8a744e'); b.quad(-45, -2.6, 45, 2.6, '#8a744e');
    b.disc(WELL.x, WELL.z, WALL.r + 1, '#9a8460');
  });
  // 우물의 물빛: 내구가 줄면 흐려진다
  onFrame(() => { water.material.color.copy(MUD).lerp(CLEAR, G.maxHp ? G.hp / G.maxHp : 0); });
}
