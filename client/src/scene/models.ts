// 캐릭터 모델(임시 도형)과 동작. 나중에 실제 에셋으로 바꿀 때 이 파일만 고친다.
// 몬스터 종류별 생김새와 무기·갑옷의 겉모습은 게임이 등록한다 (registerMonsterModel, registerBlade, registerArmor). 여기에는 기본 모델만 있다.
// 약속: 발이 원점, +Z를 바라본다. 사람형 키는 약 2.1.
import * as THREE from 'three';

export interface Rig { ll: THREE.Group; rl: THREE.Group; la: THREE.Group; ra: THREE.Group }
/** 사람형은 rig, 슬라임과 위습은 blob, 늑대는 legs를 움직인다. */
export interface Model { root: THREE.Group; rig?: Rig; blob?: THREE.Mesh; legs?: THREE.Group[]; float?: number; blade?: THREE.Mesh; armor?: THREE.Group; flashing?: boolean }

const mats = new Map<number, THREE.MeshStandardMaterial>();
const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
/** 맞는 순간 모델 전체를 하얗게 번쩍인다. 재질은 여럿이 나눠 쓰므로 색을 바꾸지 않고 잠깐 갈아 끼웠다 되돌린다. */
export function setFlash(m: Model, on: boolean): void {
  if (!!m.flashing === on) return;
  m.flashing = on;
  m.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (on) { if (mesh.material !== WHITE) { mesh.userData.mat = mesh.material; mesh.material = WHITE; } }
    else if (mesh.userData.mat) { mesh.material = mesh.userData.mat as THREE.Material; mesh.userData.mat = undefined; }
  });
}

/** 색마다 재질 하나를 나눠 쓴다. */
export function mat(color: number): THREE.MeshStandardMaterial {
  let m = mats.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true }); mats.set(color, m); }
  return m;
}
export function part(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

const G = {
  leg: new THREE.BoxGeometry(0.28, 0.7, 0.28), body: new THREE.BoxGeometry(0.8, 0.8, 0.45), head: new THREE.BoxGeometry(0.56, 0.56, 0.56),
  arm: new THREE.BoxGeometry(0.24, 0.7, 0.24), sword: new THREE.BoxGeometry(0.1, 1.15, 0.16),
  plate: new THREE.BoxGeometry(0.9, 0.62, 0.55), pad: new THREE.BoxGeometry(0.34, 0.2, 0.34), belt: new THREE.BoxGeometry(0.86, 0.14, 0.5),
  bow: new THREE.BoxGeometry(0.08, 1.7, 0.14), quiver: new THREE.BoxGeometry(0.22, 0.62, 0.18), lamp: new THREE.BoxGeometry(0.2, 0.26, 0.2),
  staff: new THREE.BoxGeometry(0.1, 1.9, 0.1), orb: new THREE.IcosahedronGeometry(0.2, 0), hat: new THREE.ConeGeometry(0.42, 0.7, 5),
  slime: new THREE.IcosahedronGeometry(0.8, 0), eye: new THREE.BoxGeometry(0.13, 0.16, 0.08),
};
const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc766 });
const wispMat = new THREE.MeshBasicMaterial({ color: 0xbfefff });

/** 어깨나 엉덩이를 축으로 흔들리는 팔다리 */
export function limb(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, drop: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(part(geo, m, 0, -drop, 0));
  return pivot;
}

/** 사람형 캐릭터. armed: true면 검, 'bow'면 활과 화살통, 'staff'면 지팡이와 고깔모자, false면 빈손(마을 주민). */
export function makeHumanoid(cloth: number, armed: boolean | 'bow' | 'staff' = true, skin = 0xf0c9a0): Model {
  const root = new THREE.Group();
  const pants = mat(0x3b3a4a), cm = mat(cloth);
  const rig: Rig = { ll: limb(G.leg, pants, -0.2, 0.7, 0, 0.35), rl: limb(G.leg, pants, 0.2, 0.7, 0, 0.35), la: limb(G.arm, cm, -0.54, 1.48, 0, 0.35), ra: limb(G.arm, cm, 0.54, 1.48, 0, 0.35) };
  root.add(rig.ll, rig.rl, rig.la, rig.ra, part(G.body, cm, 0, 1.1, 0), part(G.head, mat(skin), 0, 1.8, 0));
  let blade: THREE.Mesh | undefined;
  if (armed === 'bow') {
    blade = part(G.bow, mat(0xd8dde0), 0, -0.6, 0.32); // 왼손에 세워 든 활
    rig.la.add(blade);
    root.add(part(G.quiver, mat(0x6b4a2e), 0.18, 1.25, -0.33));
  } else if (armed === 'staff') {
    blade = part(G.staff, mat(0x8a6a44), 0, -0.45, 0.3); // 오른손에 세워 든 지팡이. 끝의 구슬이 빛난다
    blade.add(new THREE.Mesh(G.orb, wispMat));
    blade.children[0].position.set(0, 1.05, 0);
    rig.ra.add(blade);
    root.add(part(G.hat, cm, 0, 2.4, 0));
  } else if (armed) {
    blade = part(G.sword, mat(0xd8dde0), 0, -0.7, 0.5);
    blade.rotation.x = Math.PI / 2;
    rig.ra.add(blade);
  }
  const lamp = new THREE.Mesh(G.lamp, lampMat); // 허리춤의 등불: 실제 광원이 아니라 빛나는 재질
  lamp.position.set(-0.46, 0.92, 0.1);
  root.add(lamp);
  return { root, rig, blade };
}

/** 무기의 겉모습: 칼날의 색과 크기, 빛나는가(등불처럼 빛나는 재질로 바꾼다) */
export interface BladeLook { color: number; scale: number; glow: boolean }
// 무기별 칼날 모양은 게임이 등록한다. 등록되지 않은 무기는 기본 모양으로 그린다
const BLADES = new Map<string, BladeLook>();
const PLAIN_BLADE: BladeLook = { color: 0xd8dde0, scale: 1, glow: false };
export function registerBlade(id: string, look: BladeLook): void { BLADES.set(id, look); }
/** 든 무기에 맞춰 칼날 모양을 바꾼다. */
export function setBlade(m: Model, weapon: string): void {
  if (!m.blade) return;
  const b = BLADES.get(weapon) ?? PLAIN_BLADE;
  m.blade.material = b.glow ? lampMat : mat(b.color);
  m.blade.scale.setScalar(b.scale);
}

/** 갑옷의 겉모습: 가슴받이와 허리띠의 색, 어깨받이가 붙는가 */
export interface ArmorLook { color: number; pads: boolean }
// 갑옷별 모습은 게임이 등록한다. 등록되지 않은 갑옷은 덧대지 않는다
const ARMORS = new Map<string, ArmorLook>();
export function registerArmor(id: string, look: ArmorLook): void { ARMORS.set(id, look); }
/** 입은 갑옷에 맞춰 몸에 덧댄다. 빈 문자열이면 벗긴다. */
export function setArmor(m: Model, armor: string): void {
  if (m.armor) { m.root.remove(m.armor); m.armor = undefined; }
  const a = ARMORS.get(armor);
  if (!a || !m.rig) return;
  const g = new THREE.Group(), am = mat(a.color);
  g.add(part(G.plate, am, 0, 1.2, 0), part(G.belt, mat(0x3b2a1a), 0, 0.78, 0));
  if (a.pads) g.add(part(G.pad, am, -0.56, 1.56, 0), part(G.pad, am, 0.56, 1.56, 0));
  m.root.add(g);
  m.armor = g;
}

export type MonsterBuilder = (type: string) => Model;
// 몬스터 종류별 생김새는 게임이 등록한다. type은 MONSTERS의 키
const MONSTER_MODELS = new Map<string, MonsterBuilder>();
export function registerMonsterModel(type: string, build: MonsterBuilder): void { MONSTER_MODELS.set(type, build); }

/** 기본 몬스터 모델: 눈이 달린 말랑한 덩어리 */
export function makeBlob(): Model {
  const root = new THREE.Group();
  const blob = part(G.slime, mat(0x7ccf5a), 0, 0.6, 0);
  blob.scale.y = 0.75;
  root.add(blob, part(G.eye, mat(0x1a1f22), -0.26, 0.72, 0.66), part(G.eye, mat(0x1a1f22), 0.26, 0.72, 0.66));
  return { root, blob };
}

/** 몬스터 모델. type은 MONSTERS의 키. 등록되지 않은 종류는 기본 모델로 그린다. */
export function makeMonster(type: string): Model {
  return (MONSTER_MODELS.get(type) ?? makeBlob)(type);
}

/**
 * 한 프레임의 동작. phase는 계속 늘어나는 값, swing은 공격 동작의 남은 정도(1에서 0으로).
 * scale은 죽을 때 줄어드는 연출에 쓴다.
 */
export function animate(m: Model, x: number, z: number, face: number, walking: boolean, phase: number, dt: number, swing = 0, scale = 1): void {
  const r = m.root;
  let d = face - r.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  r.rotation.y += d * Math.min(1, dt * 12);
  r.position.set(x, 0, z);
  r.scale.setScalar(scale);
  const sw = walking ? Math.sin(phase) * 0.75 : 0;
  const k = Math.min(1, dt * 18);
  if (m.rig) {
    m.rig.ll.rotation.x += (sw - m.rig.ll.rotation.x) * k;
    m.rig.rl.rotation.x += (-sw - m.rig.rl.rotation.x) * k;
    m.rig.la.rotation.x += (-sw * 0.8 - m.rig.la.rotation.x) * k;
    if (swing > 0) m.rig.ra.rotation.x = -2.3 * Math.sin(Math.PI * swing);
    else m.rig.ra.rotation.x += (sw * 0.8 - m.rig.ra.rotation.x) * k;
  } else if (m.legs) {
    m.legs[0].rotation.x = sw; m.legs[3].rotation.x = sw; m.legs[1].rotation.x = -sw; m.legs[2].rotation.x = -sw;
    r.position.y = swing > 0 ? Math.sin(Math.PI * swing) * 0.35 : 0; // 덤벼들 때 살짝 뛴다
  } else if (m.blob) {
    if (m.float) m.blob.position.y = m.float + Math.sin(phase * 0.35) * 0.2;
    else { m.blob.scale.y = 0.75 + Math.sin(phase * 0.4) * 0.07; r.position.y = walking ? Math.abs(Math.sin(phase * 0.6)) * 0.35 : 0; }
    if (swing > 0) r.position.y += Math.sin(Math.PI * swing) * 0.3;
  }
}
