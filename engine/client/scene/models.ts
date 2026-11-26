// 캐릭터 모델(코드로 만든 도형)과 동작. 몬스터 종류별 생김새와 무기·갑옷의 겉모습은 게임이 등록한다 (registerMonsterModel, registerBlade, registerArmor). 여기에는 기본 모델만 있다.
// 모델 파일(glTF/GLB)도 같은 자리에서 고른다: 게임이 등록표(engine/client/assets.ts의 registerMonsterAsset, registerHumanoidAsset, registerWeaponAsset)에 적으면
// 코드 모델을 먼저 세우고, 파일이 다 읽히면 그 모델의 안을 파일의 것으로 바꿔 끼운다 (swapIn). 읽지 못하면 코드 모델이 그대로 남는다. 읽고 복제하는 일은 scene/gltf.ts.
// 약속: 발이 원점, +Z를 바라본다. 사람형 키는 약 2.1.
import * as THREE from 'three';
import { armorHit, humanoidAsset, monsterAsset, nameList, pickClip, weaponAsset, type AnimState, type HumanoidArmor, type ModelAsset } from '../assets';
import type { Animator, Instance, Source } from './gltf';

export interface Rig { ll: THREE.Group; rl: THREE.Group; la: THREE.Group; ra: THREE.Group }
/**
 * 사람형은 rig, 슬라임과 위습은 blob, 늑대는 legs를 움직인다.
 * 모델 파일로 바꿔 끼운 모델은 asset이 참이고 anim(클립이 있을 때)으로 움직인다: rig·legs·blob은 비운다.
 * hand와 weapon은 사람형의 손 모양 id와 든 무기 (무기 모델 파일을 고를 때 쓴다), gear는 칼날 자리에 놓인 무기 모델
 */
export interface Model {
  root: THREE.Group; rig?: Rig; blob?: THREE.Mesh; legs?: THREE.Group[]; float?: number; blade?: THREE.Mesh; armor?: THREE.Group; flashing?: boolean; head?: THREE.Mesh;
  asset?: boolean; anim?: Animator; hand?: string; weapon?: string; gear?: THREE.Object3D;
  /** 입은 갑옷 id (setArmor가 적는다: 모델 파일로 바꿔 끼운 뒤 다시 입힌다) */
  armorId?: string;
  /** 모델 파일의 사람에서 갑옷을 보일 곳 (HumanoidAsset.armor로 찾은 것) */
  fileArmor?: FileArmor;
}
/** 파일의 사람에서 갑옷을 칠할 메시들(본래 재질과 칠할 칸)과 덧대기를 붙일 노드(쉬는 자세의 자리를 되돌리는 행렬) */
interface FileArmor { meshes: { mesh: THREE.Mesh; base: THREE.Material | THREE.Material[]; slots: boolean[] }[]; node?: THREE.Object3D; rest?: THREE.Matrix4 }

const mats = new Map<number, THREE.MeshStandardMaterial>();
const WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff });
/** 무기 모델을 얹은 칼날: 칼날 자신은 그리지 않고 그 아래에 붙은 무기 모델만 그린다 (visible을 끄면 자식도 숨는다) */
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
/** 맞는 순간 모델 전체를 하얗게 번쩍인다. 재질은 여럿이 나눠 쓰므로 색을 바꾸지 않고 잠깐 갈아 끼웠다 되돌린다. */
export function setFlash(m: Model, on: boolean): void {
  if (!!m.flashing === on) return;
  m.flashing = on;
  m.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.material === HIDDEN) return;
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
  bow: new THREE.BoxGeometry(0.08, 1.7, 0.14), quiver: new THREE.BoxGeometry(0.22, 0.62, 0.18),
  staff: new THREE.BoxGeometry(0.1, 1.9, 0.1), orb: new THREE.IcosahedronGeometry(0.2, 0), hat: new THREE.ConeGeometry(0.42, 0.7, 5),
  slime: new THREE.IcosahedronGeometry(0.8, 0), eye: new THREE.BoxGeometry(0.13, 0.16, 0.08),
};
/** 빛나는 재질 (실제 광원이 아니다): 빛나는 무기의 날에 쓴다 */
const lampMat = new THREE.MeshBasicMaterial({ color: 0xffc766 });
const wispMat = new THREE.MeshBasicMaterial({ color: 0xbfefff });

/** 어깨나 엉덩이를 축으로 흔들리는 팔다리 */
export function limb(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, drop: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.add(part(geo, m, 0, -drop, 0));
  return pivot;
}

/** 사람형 모델에 게임이 덧붙이는 꾸밈. 사람형을 만들 때마다 맨 끝에 불린다 (플레이어, 상인, 게임이 세운 NPC 모두). 등록하지 않으면 덧붙는 것이 없다 */
let humanoidDeco: ((root: THREE.Group) => void) | null = null;
export function setHumanoidDeco(fn: (root: THREE.Group) => void): void { humanoidDeco = fn; }

/**
 * 손 모양 하나를 만드는 법: 사람형의 뼈대(rig)와 몸(root), 옷의 재질을 받아 손에 든 것을 붙이고, 무기의 겉모습(registerBlade)이 바뀌는
 * 부분(칼날, 활대, 지팡이)을 돌려준다. 돌려준 것이 없으면 무기의 겉모습은 바뀌지 않는다. 손 모양의 id는 직업 정의의 hand다.
 */
export type HandBuilder = (m: { root: THREE.Group; rig: Rig; cloth: THREE.Material }) => THREE.Mesh | undefined;
const HANDS = new Map<string, HandBuilder>();
/** 손 모양을 등록한다 (틀에는 sword, bow, staff가 있다. 같은 id로 등록하면 틀의 것을 바꾼다). 직업 정의의 hand가 이 id를 고른다 */
export function registerHand(id: string, build: HandBuilder): void { HANDS.set(id, build); }
// 틀의 손 모양 셋
registerHand('sword', ({ rig }) => {
  const blade = part(G.sword, mat(0xd8dde0), 0, -0.7, 0.5);
  blade.rotation.x = Math.PI / 2;
  rig.ra.add(blade);
  return blade;
});
registerHand('bow', ({ root, rig }) => {
  const blade = part(G.bow, mat(0xd8dde0), 0, -0.6, 0.32); // 왼손에 세워 든 활
  rig.la.add(blade);
  root.add(part(G.quiver, mat(0x6b4a2e), 0.18, 1.25, -0.33));
  return blade;
});
registerHand('staff', ({ root, rig, cloth }) => {
  const blade = part(G.staff, mat(0x8a6a44), 0, -0.45, 0.3); // 오른손에 세워 든 지팡이. 끝의 구슬이 빛난다
  blade.add(new THREE.Mesh(G.orb, wispMat));
  blade.children[0].position.set(0, 1.05, 0);
  rig.ra.add(blade);
  root.add(part(G.hat, cloth, 0, 2.4, 0));
  return blade;
});

/**
 * 사람형의 겉모습을 정하는 값: 옷 색, 손 모양(''이면 빈손), 살갗 색, 직업(아는 때만: 직업별 사람 모델 파일을 고른다).
 * 편성의 영웅(엔티티 종류 hero)이면 영웅 id(hero)와 등급 번호(rarity)도 온다: setHumanoidBody가 영웅마다·등급마다 다르게 그릴 수 있다
 */
export interface HumanoidLook { cloth: number; hand: string; skin: number; cls?: string; hero?: string; rarity?: number }
/**
 * 사람형 모델을 통째로 바꾼다 (플레이어, 상인, 게임이 세운 NPC, 사람형 몬스터 모두). 등록하지 않으면 틀의 네모난 사람이다.
 * 걷는 동작은 돌려준 모델의 rig(다리 둘, 팔 둘)로, 무기의 겉모습은 blade로, 갑옷은 rig가 있을 때 틀의 자리에 덧댄다
 */
let humanoidBody: ((look: HumanoidLook) => Model) | null = null;
export function setHumanoidBody(fn: (look: HumanoidLook) => Model): void { humanoidBody = fn; }

/**
 * 손 모양 하나를 몸에 붙이고 무기의 겉모습이 바뀌는 부분을 돌려준다. 사람형을 통째로 바꾼 게임(setHumanoidBody)이 자기 몸에 손을 붙일 때 부른다.
 * hand가 빈 문자열이면 빈손. 모르는 손 모양은 검으로
 */
export function attachHand(hand: string, m: { root: THREE.Group; rig: Rig; cloth: THREE.Material }): THREE.Mesh | undefined {
  return hand ? (HANDS.get(hand) ?? HANDS.get('sword'))?.(m) : undefined;
}

/**
 * 틀의 사람형: 네모난 몸, 팔다리 넷, 손 모양. 머리(head)도 돌려준다.
 * 조금만 바꾸려는 게임은 setHumanoidBody 안에서 이것을 부른 뒤 고친다(예: 머리를 둥근 것으로 바꾸기, 모자 얹기)
 */
export function defaultHumanoid({ cloth, hand, skin }: HumanoidLook): Model {
  const root = new THREE.Group();
  const pants = mat(0x3b3a4a), cm = mat(cloth);
  const rig: Rig = { ll: limb(G.leg, pants, -0.2, 0.7, 0, 0.35), rl: limb(G.leg, pants, 0.2, 0.7, 0, 0.35), la: limb(G.arm, cm, -0.54, 1.48, 0, 0.35), ra: limb(G.arm, cm, 0.54, 1.48, 0, 0.35) };
  const head = part(G.head, mat(skin), 0, 1.8, 0);
  root.add(rig.ll, rig.rl, rig.la, rig.ra, part(G.body, cm, 0, 1.1, 0), head);
  // 모르는 손 모양은 검으로 그린다 (게임이 registerHand를 빠뜨려도 빈손이 되지 않게)
  const blade = attachHand(hand, { root, rig, cloth: cm });
  return { root, rig, blade, head };
}

/**
 * 사람형 캐릭터. armed: true면 검, 손 모양의 id('bow', 'staff', 게임이 등록한 것)면 그것, false면 빈손(마을 주민).
 * cls는 직업 (아는 때만): 그 직업의 사람 모델 파일(registerHumanoidAsset)이 있으면 그것을, 없으면 모두의 것을, 그것도 없으면 코드 모델을 쓴다
 */
export function makeHumanoid(cloth: number, armed: boolean | string = true, skin = 0xf0c9a0, cls?: string, hero?: { hero: string; rarity: number }): Model {
  const look: HumanoidLook = { cloth, hand: armed === true ? 'sword' : armed === false ? '' : armed, skin, cls, ...hero };
  const m = (humanoidBody ?? defaultHumanoid)(look);
  humanoidDeco?.(m.root); // 게임의 꾸밈 (등불지기는 허리춤의 등불)
  m.hand = look.hand;
  const asset = humanoidAsset(cls);
  if (!asset) return m;
  const colors: Record<string, number> = {};
  for (const n of nameList(asset.paint?.cloth)) colors[n] = cloth;
  for (const n of nameList(asset.paint?.skin)) colors[n] = skin;
  return swapIn(m, asset, colors, (inst) => {
    // 손 모양을 팔 뼈에 붙인다: 뼈 아래에 틀의 팔과 같은 묶음을 두고 그것을 rig로 넘긴다 (다리는 쓰지 않으므로 빈 묶음)
    const anchor = new THREE.Group();
    topBone(inst.model).add(anchor);
    const right = asset.arms ? inst.model.getObjectByName(asset.arms.right) : undefined, left = asset.arms ? inst.model.getObjectByName(asset.arms.left) : undefined;
    if (asset.arms && (!right || !left)) console.warn(`[에셋] 사람 모델 ${asset.url}에 팔 뼈(${asset.arms.right}, ${asset.arms.left})가 없어 손 모양을 붙이지 않습니다`);
    if (right && left) {
      const rig: Rig = { ll: new THREE.Group(), rl: new THREE.Group(), la: new THREE.Group(), ra: new THREE.Group() };
      left.add(rig.la); right.add(rig.ra); anchor.add(rig.ll, rig.rl);
      m.blade = attachHand(look.hand, { root: anchor, rig, cloth: mat(cloth) });
    }
    humanoidDeco?.(anchor);
    setBlade(m, m.weapon ?? '');
    if (asset.armor) m.fileArmor = findArmor(m.root, inst.model, asset.armor, asset.url);
    setArmor(m, m.armorId ?? '');
  });
}

/** 파일의 사람에서 갑옷을 보일 곳을 찾는다 (쉬는 자세일 때: 바꿔 끼운 바로 뒤) */
function findArmor(root: THREE.Group, model: THREE.Object3D, spec: HumanoidArmor, url: string): FileArmor {
  const out: FileArmor = { meshes: [] };
  const tint = spec.tint ?? [];
  if (tint.length) {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const nodes: string[] = [];
      for (let p: THREE.Object3D | null = mesh; p && p !== model.parent; p = p.parent) if (p.name) nodes.push(p.name);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const slots = list.map((mt) => armorHit(tint, nodes, mt.name) !== null);
      if (slots.some(Boolean)) out.meshes.push({ mesh, base: mesh.material, slots });
    });
    if (!out.meshes.length) console.warn(`[에셋] 사람 모델 ${url}에 갑옷을 칠할 메시·재질(${tint.join(', ')})이 없습니다`);
  }
  if (spec.attach) {
    const names: string[] = [];
    model.traverse((o) => { if (o.name) names.push(o.name); });
    const name = pickClip(spec.attach, names);
    const node = name ? model.getObjectByName(name) : undefined;
    if (!node) console.warn(`[에셋] 사람 모델 ${url}에 갑옷을 붙일 뼈·노드(${spec.attach})가 없습니다`);
    else {
      // 노드의 쉬는 자세에서 모델 원점(root)까지 되돌리는 행렬: 덧대기를 코드 사람과 같은 자리에 두고 노드를 따라 움직이게
      root.updateMatrixWorld(true);
      const rel = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(node.matrixWorld);
      out.node = node;
      out.rest = rel.invert();
    }
  }
  return out;
}

/** 재질 하나를 갑옷 색으로 (본래 재질과 색마다 하나를 나눠 쓴다) */
const armorMats = new Map<string, THREE.Material>();
function armorMat(base: THREE.Material, color: number): THREE.Material {
  if (!(base as THREE.MeshStandardMaterial).color) return base;
  const key = `${base.uuid}:${color}`;
  let t = armorMats.get(key);
  if (!t) { t = base.clone(); (t as THREE.MeshStandardMaterial).color.setHex(color); armorMats.set(key, t); }
  return t;
}
/** 메시의 재질을 바꾼다: 번쩍이는 중(setFlash)이면 되돌릴 재질을 바꾼다 */
function putMat(mesh: THREE.Mesh, mt: THREE.Material | THREE.Material[]): void {
  if (mesh.userData.mat) mesh.userData.mat = mt;
  else mesh.material = mt;
}

/** 뼈대의 맨 위 뼈 (쓰러지는 클립이 돌리는 것). 뼈가 없으면 모델 자신 */
function topBone(model: THREE.Object3D): THREE.Object3D {
  let top: THREE.Object3D | undefined;
  model.traverse((o) => { if (!top && (o as THREE.Bone).isBone && !(o.parent as THREE.Bone | null)?.isBone) top = o; });
  return top ?? model;
}

/**
 * 코드 모델 m의 안을 모델 파일의 것으로 바꿔 끼운다. 이미 읽은 파일이면 바로, 아니면 다 읽힌 뒤에 (그동안은 코드 모델이 보인다).
 * 엔티티가 쥔 Model 객체를 그대로 고치므로 부르는 쪽은 모델을 다시 받을 필요가 없다. 읽지 못하면 아무것도 바꾸지 않는다 (경고는 gltf.ts가 한 줄)
 */
function swapIn(m: Model, asset: ModelAsset, colors: Record<string, number>, dress?: (inst: Instance) => void): Model {
  const f = files;
  if (!f) return m;
  const apply = (src: Source | null): void => {
    if (!src) return;
    const inst = f.make(src, asset, colors);
    const flash = !!m.flashing;
    setFlash(m, false);
    m.root.clear();
    m.root.add(inst.object);
    m.rig = undefined; m.legs = undefined; m.blob = undefined; m.float = undefined; m.head = undefined; m.armor = undefined; m.blade = undefined; m.gear = undefined; m.fileArmor = undefined;
    m.asset = true;
    m.anim = inst.anim;
    dress?.(inst);
    if (flash) setFlash(m, true);
  };
  const now = f.now(asset.url);
  if (now !== undefined) apply(now);
  else void f.load(asset.url).then(apply);
  return m;
}

/**
 * 모델 파일을 읽고 복제하는 도구 (scene/gltf.ts). 게임이 모델 파일을 처음 등록할 때 끼워진다:
 * 등록하지 않는 게임은 이 도구를 번들에 싣지 않는다 (three.js의 읽기·애니메이션 코드가 크다)
 */
export interface FileTools {
  load(url: string): Promise<Source | null>;
  now(url: string): Source | null | undefined;
  make(src: Source, asset: ModelAsset, colors: Record<string, number>): Instance;
  weapon(src: Source, asset: { height?: number; turn?: number; shadow?: boolean; tint?: Record<string, number> }, length: number): THREE.Group;
}
let files: FileTools | null = null;
export function setFileTools(t: FileTools): void { files = t; }
/** 모델 파일 하나를 미리 읽는다 (미리 불러오기: preload.ts). 도구가 없으면 바로 끝난다 */
export function preloadModel(url: string): Promise<unknown> { return files ? files.load(url) : Promise.resolve(null); }

/** 무기의 겉모습: 칼날의 색과 크기, 빛나는가(등불처럼 빛나는 재질로 바꾼다) */
export interface BladeLook { color: number; scale: number; glow: boolean }
// 무기별 칼날 모양은 게임이 등록한다. 등록되지 않은 무기는 기본 모양으로 그린다
const BLADES = new Map<string, BladeLook>();
const PLAIN_BLADE: BladeLook = { color: 0xd8dde0, scale: 1, glow: false };
export function registerBlade(id: string, look: BladeLook): void { BLADES.set(id, look); }
/**
 * 든 무기에 맞춰 칼날 모양을 바꾼다. 그 무기(또는 손 모양)의 무기 모델 파일(registerWeaponAsset)이 있으면 칼날 자리에 그것을 놓고 칼날을 숨긴다:
 * 읽는 동안과 읽지 못했을 때는 칼날이 그대로 보인다
 */
export function setBlade(m: Model, weapon: string): void {
  m.weapon = weapon;
  const blade = m.blade;
  if (!blade) return;
  const b = BLADES.get(weapon) ?? PLAIN_BLADE;
  const code = (): THREE.Material => (b.glow ? lampMat : mat(b.color));
  blade.scale.setScalar(b.scale);
  const wa = files ? weaponAsset(weapon, m.hand) : undefined;
  const f = files;
  if (m.gear && m.gear.userData.url !== wa?.url) { m.gear.removeFromParent(); m.gear = undefined; }
  if (!wa || !f) { blade.material = code(); return; }
  if (m.gear) { blade.material = HIDDEN; return; }
  blade.material = code();
  const put = (src: Source | null): void => {
    // 그새 무기나 몸이 바뀌었으면 놓지 않는다
    if (!src || m.blade !== blade || m.gear || weaponAsset(m.weapon ?? '', m.hand) !== wa) return;
    blade.geometry.computeBoundingBox();
    const g = f.weapon(src, wa, blade.geometry.boundingBox?.getSize(new THREE.Vector3()).y ?? 1);
    g.userData.url = wa.url;
    blade.add(g);
    blade.material = HIDDEN;
    m.gear = g;
  };
  const now = f.now(wa.url);
  if (now !== undefined) put(now);
  else void f.load(wa.url).then(put);
}

/** 갑옷의 겉모습: 가슴받이와 허리띠의 색, 어깨받이가 붙는가 */
export interface ArmorLook { color: number; pads: boolean }
// 갑옷별 모습은 게임이 등록한다. 등록되지 않은 갑옷은 덧대지 않는다
const ARMORS = new Map<string, ArmorLook>();
export function registerArmor(id: string, look: ArmorLook): void { ARMORS.set(id, look); }
/** 틀의 갑옷 덧대기: 가슴받이와 허리띠, pads면 어깨받이 (코드 사람의 자리) */
function armorGroup(a: ArmorLook): THREE.Group {
  const g = new THREE.Group(), am = mat(a.color);
  g.add(part(G.plate, am, 0, 1.2, 0), part(G.belt, mat(0x3b2a1a), 0, 0.78, 0));
  if (a.pads) g.add(part(G.pad, am, -0.56, 1.56, 0), part(G.pad, am, 0.56, 1.56, 0));
  return g;
}
/**
 * 입은 갑옷에 맞춰 몸에 덧댄다. 빈 문자열이면 벗긴다.
 * 코드 사람(rig가 있는 것)은 틀의 자리에 덧댄다. 모델 파일의 사람은 그 모델의 armor(HumanoidAsset.armor)대로 칠하고 덧댄다: 없으면 아무것도 하지 않는다
 */
export function setArmor(m: Model, armor: string): void {
  m.armorId = armor;
  if (m.armor) { m.armor.removeFromParent(); m.armor = undefined; }
  const a = ARMORS.get(armor);
  const fa = m.fileArmor;
  if (fa) {
    for (const t of fa.meshes) {
      if (!a) { putMat(t.mesh, t.base); continue; }
      putMat(t.mesh, Array.isArray(t.base) ? t.base.map((b, i) => (t.slots[i] ? armorMat(b, a.color) : b)) : armorMat(t.base, a.color));
    }
    if (a && fa.node && fa.rest) {
      const holder = new THREE.Group();
      fa.rest.decompose(holder.position, holder.quaternion, holder.scale);
      holder.add(armorGroup(a));
      fa.node.add(holder);
      m.armor = holder;
    }
    return;
  }
  if (!a || !m.rig) return;
  const g = armorGroup(a);
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

/** 땅에 놓인 상자 하나 (게임의 엔티티 종류를 빨리 그릴 때: registerKind). size는 한 변(m) */
export function makeBox(color = 0x9a9a9a, size = 0.6): Model {
  const root = new THREE.Group();
  const box = part(new THREE.BoxGeometry(size, size, size), mat(color), 0, size / 2, 0);
  root.add(box);
  return { root, blob: box };
}
/** 땅 위에 떠 있는 공 하나 (게임의 엔티티 종류를 빨리 그릴 때). r은 반지름(m) */
export function makeBall(color = 0xf0c040, r = 0.4): Model {
  const root = new THREE.Group();
  const ball = part(new THREE.IcosahedronGeometry(r, 1), mat(color), 0, r + 0.05, 0);
  root.add(ball);
  return { root, blob: ball };
}

/** 몬스터 모델. type은 MONSTERS의 키. 모델 파일(registerMonsterAsset)이 있으면 그것을, 없으면 코드 모델을, 등록되지 않은 종류는 기본 모델로 그린다. */
export function makeMonster(type: string): Model {
  const m = (MONSTER_MODELS.get(type) ?? makeBlob)(type);
  const asset = monsterAsset(type);
  return asset ? swapIn(m, asset, {}) : m;
}

/** 한 번 도는 동작(공격, 맞음, 쓰러짐)을 튼다. 그 클립이 없거나 코드 모델이면 false: 틀의 코드 흔들기(swing, 줄어듦)가 그대로 맡는다 */
export function cueAnim(m: Model, s: AnimState): boolean { return m.anim?.cue(s) ?? false; }

/**
 * 한 프레임의 동작. phase는 계속 늘어나는 값, swing은 공격 동작의 남은 정도(1에서 0으로).
 * scale은 죽을 때 줄어드는 연출에 쓴다. every는 모델 파일의 믹서를 몇 프레임마다 돌리는가 (멀거나 화면 밖이면 드물게: assets.ts의 mixerEvery)
 */
export function animate(m: Model, x: number, z: number, face: number, walking: boolean, phase: number, dt: number, swing = 0, scale = 1, every = 1): void {
  const r = m.root;
  let d = face - r.rotation.y;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  r.rotation.y += d * Math.min(1, dt * 12);
  r.position.set(x, 0, z);
  r.scale.setScalar(scale);
  if (m.asset) {
    // 모델 파일: 클립이 있는 상태는 믹서가, 없는 상태는 틀의 코드 흔들기로 (걸을 때 통통 튀고, 공격할 때 살짝 뛴다)
    const a = m.anim;
    a?.walk(walking);
    let y = 0;
    if (walking && !a?.has('walk')) y = Math.abs(Math.sin(phase * 0.5)) * 0.15;
    if (swing > 0 && !a?.has('attack')) y += Math.sin(Math.PI * swing) * 0.3;
    r.position.y = y;
    a?.update(dt, every);
    return;
  }
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
