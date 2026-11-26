// 달무리 원정대의 겉모습: 하늘섬 야영지의 땅, 던전 둘의 바닥, 단계의 자리(달무리 원), 몬스터의 코드 모델(낮은 다각형),
// 영웅의 등급 꾸밈(희귀: 망토, 전설: 관과 빛고리. 틀이 넘기는 영웅의 등급으로: setHeroModel), 몬스터의 날아가는 것(포자·불씨·얼음 조각), 미니맵의 바탕.
import * as THREE from 'three';
import { AREAS } from '@engine/shared/world';
import { defaultHumanoid, fitZoom, type Look, limb, mat, type Model, myStage, part, registerMonsterModel, registerShot, setCameraAim, setHeroModel, setMapPaint, view } from '@engine/client';
import { CAMERA } from '@engine/shared/defs';
import { ARENA, GATES } from '../shared/content';

const grass = [new THREE.Color(0x6f9a6a), new THREE.Color(0x5e8a62)];
const stone = new THREE.Color(0x8f8c84), gold = new THREE.Color(0xb59a4a), well = new THREE.Color(0x4a6a9a);
const LEAVES = [0x5f8f7a, 0x7aa88a, 0x9ab8c8, 0x6a7fa8];

export const look: Look = {
  ground: (x, z, j, c) => {
    if (x > 280) c.copy(well).lerp(stone, 0.4 * j);
    else if (x > 180) c.copy(gold).lerp(stone, 0.5 * j);
    else if (Math.hypot(x - ARENA.x, z - ARENA.z) < 12) c.copy(stone).lerp(grass[0], 0.25 + 0.2 * j);
    else c.copy(grass[0]).lerp(grass[1], j);
  },
  leaf: (_x, _z, k) => LEAVES[Math.floor(k * LEAVES.length) % LEAVES.length],
  scenery: (scene) => {
    // 단계의 자리: 바닥의 달무리 고리
    const ring = new THREE.Mesh(new THREE.RingGeometry(10.6, 11.4, 48), new THREE.MeshBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(ARENA.x, 0.03, ARENA.z);
    scene.add(ring);
    // 던전의 문 둘: 돌기둥 두 개와 빛나는 판 (금빛, 푸른빛)
    for (const [id, g] of Object.entries(GATES)) {
      const color = id === 'goldvein' ? 0xf0c040 : 0x7fb8ff, gate = new THREE.Group();
      for (const dx of [-1.1, 1.1]) gate.add(part(new THREE.BoxGeometry(0.4, 2.6, 0.4), mat(0x7a7468), dx, 1.3, 0));
      gate.add(part(new THREE.BoxGeometry(2.8, 0.35, 0.5), mat(0x7a7468), 0, 2.7, 0));
      gate.add(new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.3), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide })).translateY(1.25));
      gate.position.set(g.x, 0, g.z);
      scene.add(gate);
    }
  },
};

// ---------- 몬스터 ----------
/** 덩어리(이끼뭉치·도깨비불·정령): 색과 크기. blob은 틀이 통통 튀게 한다 */
function blob(color: number, size: number, glow = false): Model {
  const root = new THREE.Group(), inner = new THREE.Group();
  const body = part(new THREE.IcosahedronGeometry(0.75, 0), glow ? new THREE.MeshBasicMaterial({ color }) : mat(color), 0, 0.75, 0);
  for (const x of [-0.25, 0.25]) body.add(part(new THREE.BoxGeometry(0.12, 0.16, 0.06), mat(0x1a1a22), x, 0.15, 0.66));
  inner.add(body); inner.scale.setScalar(size); root.add(inner);
  return { root, blob: body };
}
/** 네발짐승(늑대·사냥개·딱정벌레): 털빛과 크기, 뿔 */
function beast(fur: number, size: number, horn = 0): Model {
  const f = mat(fur), dark = mat(0x2a2420), root = new THREE.Group(), inner = new THREE.Group(), legs: THREE.Group[] = [];
  inner.add(part(new THREE.BoxGeometry(0.7, 0.6, 1.3), f, 0, 0.9, 0), part(new THREE.BoxGeometry(0.5, 0.45, 0.55), f, 0, 1.15, 0.85));
  if (horn) for (const x of [-0.18, 0.18]) inner.add(part(new THREE.ConeGeometry(0.08, horn, 4), mat(0xe8e0c8), x, 1.5, 0.9));
  for (const [x, z] of [[-0.25, 0.45], [0.25, 0.45], [-0.25, -0.45], [0.25, -0.45]]) { const leg = limb(new THREE.BoxGeometry(0.16, 0.6, 0.16), dark, x, 0.6, z, 0.3); legs.push(leg); inner.add(leg); }
  inner.scale.setScalar(size); root.add(inner);
  return { root, legs };
}
/** 두 발로 선 것(술사·꼬마·궁수·거인·군주): 몸 색, 크기, 머리 장식 */
function biped(cloth: number, size: number, hand: string, crown = 0): Model {
  const m = defaultHumanoid({ cloth, hand, skin: 0x8a9a7a });
  if (crown) m.head?.add(part(new THREE.ConeGeometry(0.34, 0.5, 5), mat(crown), 0, 0.5, 0));
  const inner = new THREE.Group();
  inner.add(...m.root.children); inner.scale.setScalar(size); m.root.add(inner);
  return m;
}
/** 골렘(금고 골렘, 샘지기, 늙은 뿌리): 돌덩이 몸 */
function golem(color: number, size: number, eye: number): Model {
  const root = new THREE.Group(), inner = new THREE.Group(), c = mat(color), legs: THREE.Group[] = [];
  inner.add(part(new THREE.DodecahedronGeometry(0.9, 0), c, 0, 1.6, 0), part(new THREE.DodecahedronGeometry(0.5, 0), c, 0, 2.6, 0.1));
  inner.add(part(new THREE.BoxGeometry(0.4, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: eye }), 0, 2.65, 0.5));
  for (const [x, z] of [[-0.45, 0.2], [0.45, 0.2], [-0.45, -0.2], [0.45, -0.2]]) { const leg = limb(new THREE.BoxGeometry(0.35, 0.8, 0.35), c, x, 0.8, z, 0.4); legs.push(leg); inner.add(leg); }
  inner.scale.setScalar(size); root.add(inner);
  return { root, legs };
}
const MODELS: Record<string, () => Model> = {
  mossling: () => blob(0x6a9a4a, 0.8), thornwolf: () => beast(0x5a6a3a, 1, 0.3), sporecaster: () => biped(0x7a8a3a, 0.8, 'staff'),
  mossking: () => blob(0x4a7a3a, 2.2), elderroot: () => golem(0x6a5030, 1.2, 0x9aff6a),
  cinderimp: () => biped(0xb04a2a, 0.65, 'sword'), ashhound: () => beast(0x5a5050, 1.05, 0.4), slinger: () => biped(0x8a3a2a, 0.8, 'staff'),
  magmabrute: () => golem(0x7a3020, 1.1, 0xffa040), ashwyrm: () => beast(0x3a3438, 2.0, 0.8),
  frostwisp: () => blob(0xbfe8ff, 0.65, true), icewarden: () => biped(0x6a9ac8, 1.0, 'sword', 0xdff4ff), shardarcher: () => biped(0x7aa8d8, 0.85, 'bow'),
  frostgiant: () => biped(0x9ac8e8, 1.7, 'sword', 0xdff4ff), moonlich: () => biped(0x2a2a5a, 1.5, 'staff', 0xc8c8ff),
  goldbeetle: () => beast(0xd8a830, 0.7, 0.2), vaultgolem: () => golem(0xb89a40, 1.2, 0xfff0a0),
  wellsprite: () => blob(0x7fb8ff, 0.7, true), wellguardian: () => golem(0x4a6a9a, 1.2, 0xbfe8ff),
};

// ---------- 영웅의 등급 꾸밈 ----------
export function initScene(): void {
  for (const [type, fn] of Object.entries(MODELS)) registerMonsterModel(type, fn);
  // 편성의 영웅만: 틀의 사람형(영웅의 옷 색·손 모양)에 등급의 꾸밈을 얹는다. 발밑의 등급 고리와 크기는 틀이 그 뒤에 얹는다
  setHeroModel(({ rarity: r, look: lk }) => {
    const m = defaultHumanoid(lk);
    if (r >= 1) {
      // 희귀 이상: 등의 망토 (옷보다 짙게)
      const cape = part(new THREE.BoxGeometry(0.8, 1.0, 0.08), mat(r >= 2 ? 0x8a1a2a : 0x2a3a5a), 0, 1.2, -0.3);
      m.root.add(cape);
    }
    if (r >= 2) {
      // 전설: 금관과 머리 위의 빛고리
      m.head?.add(part(new THREE.CylinderGeometry(0.28, 0.32, 0.18, 6), mat(0xf0c040), 0, 0.36, 0));
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 18), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
      halo.rotation.x = Math.PI / 2; halo.position.y = 0.62;
      m.head?.add(halo);
    }
    return m;
  });
  registerShot('spore', { shape: 'ball', color: 0x9ad04a, size: 0.6 });
  registerShot('ember', { shape: 'ball', color: 0xff7a3a, size: 0.6 });
  registerShot('shard', { shape: 'stick', color: 0xcfefff, size: 0.8 });
  // 단계 안에서는 단계의 자리 전체를 비춘다 (폰 세로에서도 영웅·적이 함께 보이게). 들판·던전은 틀의 기본(나)
  setCameraAim((me) => (me && myStage()?.run ? { x: ARENA.x, z: ARENA.z + 2, zoom: Math.min(CAMERA.zoomMax, Math.max(1, fitZoom(ARENA.x - 11, ARENA.z - 11, ARENA.x + 11, ARENA.z + 11))) } : null));
  view.setMood({ sky: 0xb8c8e8, hemi: 1.9, sun: 2.0, fogNear: 60, fogFar: 140 });
  setMapPaint((b) => {
    for (const a of AREAS) b.quad(a.x0, a.z0, a.x1, a.z1, a.id === 'camp' ? '#5f8a62' : a.id === 'goldvein' ? '#8a7a40' : '#3f5a80');
    b.disc(ARENA.x, ARENA.z, 11, '#8a8880');
  });
}

