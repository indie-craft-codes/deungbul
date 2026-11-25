// 모델 파일(glTF/GLB)을 읽고 복제하고 움직인다. 무엇을 어디에 쓸지는 등록표(engine/client/assets.ts)가, 코드 모델과 바꿔 끼우는 일은 scene/models.ts가 한다.
// 같은 파일은 한 번만 읽고 엔티티마다 복제한다 (뼈대가 있는 모델은 SkeletonUtils.clone: 뼈를 엔티티마다 따로 가져야 따로 움직인다).
// 읽기에 실패하면 콘솔에 경고 한 줄을 남기고 null을 돌려준다: 부르는 쪽은 코드 모델을 그대로 둔다.
// 게임이 모델 파일을 등록하는 함수(registerMonsterAsset, registerHumanoidAsset, registerWeaponAsset)도 여기 있다: 처음 등록할 때 이 도구를 scene/models.ts에 끼운다.
// 그래서 모델 파일을 하나도 등록하지 않는 게임(등불지기)의 번들에는 이 파일과 three.js의 애니메이션·읽기 코드가 들어가지 않는다.
// 읽는 도구(GLTFLoader, SkeletonUtils)는 처음 파일을 읽을 때 불러온다 (따로 된 조각).
import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  ANIM_STATES, clipTable, clipsFor, cuts, fitLift, fitScale, registerHumanoidAsset as addHumanoid, registerMonsterAsset as addMonster, registerWeaponAsset as addWeapon,
  type AnimState, type HumanoidAsset, type ModelAsset, type ModelFit, type WeaponAsset,
} from '../assets';
import { setFileTools } from './models';

/** 읽은 파일 하나: 장면, 클립들, 뼈대가 있는가, 쉬는 자세의 경계 상자 */
export interface Source { scene: THREE.Object3D; clips: THREE.AnimationClip[]; skinned: boolean; box: THREE.Box3 }

let loader: Promise<GLTFLoader> | null = null;
/** SkeletonUtils.clone: 읽는 도구와 함께 불러온다 (파일을 다 읽은 뒤에만 복제하므로 그때는 늘 있다) */
let cloneSkinned: ((o: THREE.Object3D) => THREE.Object3D) | null = null;
function tools(): Promise<GLTFLoader> {
  loader ??= Promise.all([import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/utils/SkeletonUtils.js')])
    .then(([g, su]) => { cloneSkinned = su.clone; return new g.GLTFLoader(); });
  return loader;
}
const copy = (src: Source): THREE.Object3D => (src.skinned && cloneSkinned ? cloneSkinned(src.scene) : src.scene.clone());
const pending = new Map<string, Promise<Source | null>>();
/** 다 읽은 파일 (실패는 null): 이미 읽은 것은 기다리지 않고 바로 복제한다 */
const loaded = new Map<string, Source | null>();

/** 파일을 읽는다. 같은 주소는 한 번만 (미리 불러오기와 엔티티가 같은 약속을 나눠 쓴다) */
export function loadSource(url: string): Promise<Source | null> {
  let p = pending.get(url);
  if (p) return p;
  p = tools().then((l) => l.loadAsync(url)).then((g) => {
    let skinned = false;
    g.scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true; });
    g.scene.updateMatrixWorld(true);
    const src: Source = { scene: g.scene, clips: g.animations, skinned, box: new THREE.Box3().setFromObject(g.scene) };
    loaded.set(url, src);
    return src;
  }, (err: unknown) => {
    console.warn(`[에셋] 모델 파일을 읽지 못해 코드 모델을 씁니다: ${url} (${err instanceof Error ? err.message : String(err)})`);
    loaded.set(url, null);
    return null;
  });
  pending.set(url, p);
  return p;
}
/** 이미 읽은 파일이면 그것을 (실패했으면 null), 아직이면 undefined */
export const sourceNow = (url: string): Source | null | undefined => loaded.get(url);

/** 재질 이름과 색마다 하나를 나눠 쓴다 (같은 털빛의 몬스터 여럿이 재질 하나) */
const tinted = new Map<string, THREE.Material>();
function paint(root: THREE.Object3D, colors: Record<string, number>): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const swap = (m: THREE.Material): THREE.Material => {
      const c = colors[m.name];
      if (c === undefined || !(m as THREE.MeshStandardMaterial).color) return m;
      const key = `${m.uuid}:${c}`;
      let t = tinted.get(key);
      if (!t) { t = m.clone(); (t as THREE.MeshStandardMaterial).color.setHex(c); tinted.set(key, t); }
      return t;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

/** 복제 하나: 틀의 약속(발이 원점, +Z)에 맞춘 묶음(object), 그 안의 복제(model), 움직임(anim, 클립이 하나도 없으면 없다) */
export interface Instance { object: THREE.Group; model: THREE.Object3D; anim?: Animator }

/** 읽은 파일을 복제해 크기·발 높이·방향·그림자를 맞춘다. colors: 재질 이름 → 색 */
export function instantiate(src: Source, asset: ModelAsset, colors: Record<string, number> = {}): Instance {
  const model = copy(src);
  const all = { ...asset.tint, ...colors };
  if (Object.keys(all).length) paint(model, all);
  shade(model, asset);
  const object = fitGroup(src.box, asset);
  object.add(model);
  return { object, model, anim: src.clips.length ? new Animator(model, src.clips, asset) : undefined };
}

function shade(model: THREE.Object3D, fit: { shadow?: boolean }): void {
  const cast = fit.shadow !== false;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = cast;
    // 뼈대로 움직이는 메시는 쉬는 자세의 경계로 잘려 사라지지 않게 한다 (작은 모델이라 그리는 값이 적다)
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false;
  });
}

/** 크기·발 높이·방향을 담은 묶음 */
function fitGroup(box: THREE.Box3, fit: ModelFit): THREE.Group {
  const g = new THREE.Group();
  const s = fitScale(box.max.y - box.min.y, fit);
  g.scale.setScalar(s);
  g.position.y = fitLift(box.min.y, s, fit);
  g.rotation.y = THREE.MathUtils.degToRad(fit.turn ?? 0);
  return g;
}

/** 무기 모델 하나: 가운데를 원점에, 긴 쪽(Y)을 length에 맞춘다 */
export function instantiateWeapon(src: Source, asset: { height?: number; turn?: number; shadow?: boolean; tint?: Record<string, number> }, length: number): THREE.Group {
  const model = copy(src);
  if (asset.tint) paint(model, asset.tint);
  shade(model, asset);
  const size = src.box.getSize(new THREE.Vector3()), mid = src.box.getCenter(new THREE.Vector3());
  const s = (asset.height ?? length) / Math.max(1e-6, size.y);
  const g = new THREE.Group();
  model.position.copy(mid).multiplyScalar(-1);
  g.add(model);
  g.scale.setScalar(s);
  g.rotation.y = THREE.MathUtils.degToRad(asset.turn ?? 0);
  return g;
}

/** 뼈 이름으로 찾는다 */
export const findNode = (root: THREE.Object3D, name: string): THREE.Object3D | undefined => root.getObjectByName(name);

/**
 * 모델 하나의 움직임. 바탕은 서 있기와 걷기(반복), 그 위에 공격·맞음·쓰러짐을 한 번씩 섞는다 (SHOT_RANK의 우선순위).
 * 없는 상태의 클립은 없는 대로 둔다: has()로 묻고, 부르는 쪽(models.ts의 animate)이 틀의 코드 흔들기로 채운다.
 * 갱신은 몇 프레임마다 모아서 한다 (멀거나 화면 밖이면: assets.ts의 mixerEvery)
 */
export class Animator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly acts = new Map<AnimState, THREE.AnimationAction>();
  private readonly fadeS: number;
  private base: AnimState = 'idle';
  private cur: THREE.AnimationAction | null = null;
  private shot: { state: AnimState; end: number } | null = null;
  private time = 0;
  private acc = 0;
  /** 갱신을 건너뛰는 차례를 엔티티마다 어긋나게 둔다 (한 프레임에 몰리지 않게) */
  private tick = Math.floor(Math.random() * 8);

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], asset: ModelAsset) {
    this.mixer = new THREE.AnimationMixer(root);
    this.fadeS = asset.fade ?? 0.2;
    const picked = clipsFor(clipTable(asset.clips), clips.map((c) => c.name));
    for (const s of ANIM_STATES) {
      const name = picked[s];
      const clip = name ? clips.find((c) => c.name === name) : undefined;
      if (!clip) continue;
      const act = this.mixer.clipAction(clip);
      act.timeScale = asset.speed?.[s] ?? 1;
      if (s === 'attack' || s === 'hit' || s === 'die') { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
      this.acts.set(s, act);
    }
    this.to(this.acts.get('idle') ?? null, 0);
  }

  /** 그 상태의 클립이 있는가 */
  has(s: AnimState): boolean { return this.acts.has(s); }
  /** 그 상태의 클립 길이(초, 빠르기를 셈한 것). 없으면 0 */
  length(s: AnimState): number { const a = this.acts.get(s); return a ? a.getClip().duration / Math.max(0.01, a.timeScale) : 0; }
  /** 쓰러짐을 다 틀었는가 (쓰러진 채 멈춰 있다) */
  get down(): boolean { return this.shot?.state === 'die'; }

  /** 바탕 동작: 걷는 중인가. 걷기 클립이 없으면 서 있기 클립을 그대로 둔다 */
  walk(on: boolean): void {
    const s: AnimState = on && this.acts.has('walk') ? 'walk' : 'idle';
    if (s === this.base) return;
    this.base = s;
    if (!this.shot) this.to(this.acts.get(s) ?? null, this.fadeS);
  }

  /** 한 번 도는 동작을 처음부터 튼다. 클립이 없으면 false (코드 흔들기로) */
  cue(s: AnimState): boolean {
    const act = this.acts.get(s);
    if (!act) return false;
    if (this.shot && !cuts(this.shot.state, s)) return true;
    this.shot = { state: s, end: this.time + this.length(s) };
    this.to(act, s === 'attack' ? Math.min(0.08, this.fadeS) : this.fadeS, true);
    return true;
  }

  /** 쓰러진 뒤 다시 일어섰다 (다시 쓰는 모델): 바탕 동작으로 */
  reset(): void { this.shot = null; this.to(this.acts.get(this.base) ?? this.acts.get('idle') ?? null, 0); }

  /** 매 프레임 부른다. every 프레임마다 한 번, 모인 시간만큼 믹서를 돌린다 */
  update(dt: number, every = 1): void {
    this.time += dt;
    this.acc += dt;
    if (++this.tick < every) return;
    this.tick = 0;
    // 한 번짜리가 끝났으면 바탕 동작으로 섞어 돌아간다 (쓰러짐은 마지막 자세로 남는다)
    if (this.shot && this.shot.state !== 'die' && this.time >= this.shot.end) {
      this.shot = null;
      this.to(this.acts.get(this.base) ?? null, this.fadeS);
    }
    this.mixer.update(this.acc);
    this.acc = 0;
  }

  private to(next: THREE.AnimationAction | null, fade: number, restart = false): void {
    const prev = this.cur;
    if (next === prev && !restart) return;
    this.cur = next;
    if (!next) { prev?.fadeOut(fade); return; }
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    if (prev && prev !== next && fade > 0) next.crossFadeFrom(prev, fade, false);
    else if (prev && prev !== next) prev.stop();
  }
}

// ---------- 게임이 부르는 등록 (입구 @engine/client가 내놓는다) ----------
let installed = false;
/** 처음 등록할 때 읽고 복제하는 도구를 모델 쪽에 끼운다 */
function install(): void {
  if (installed) return;
  installed = true;
  setFileTools({ load: loadSource, now: sourceNow, make: instantiate, weapon: instantiateWeapon });
}
/** 몬스터 종류(MONSTERS의 키)에 모델 파일을 쓴다. 코드 모델(registerMonsterModel)은 파일을 읽는 동안과 읽지 못했을 때 보인다 */
export function registerMonsterAsset(type: string, asset: ModelAsset): void { install(); addMonster(type, asset); }
/** 사람 모델 파일. cls를 주면 그 직업만, 빈 문자열(기본)이면 모든 사람(직업 것이 없는 직업, 상인, NPC) */
export function registerHumanoidAsset(asset: HumanoidAsset, cls = ''): void { install(); addHumanoid(asset, cls); }
/** 무기 모델 파일. id는 무기 아이템의 id(그 무기만) 또는 손 모양의 id(그 손의 무기 전부: 'sword', 'bow', 'axe' …) */
export function registerWeaponAsset(id: string, asset: WeaponAsset): void { install(); addWeapon(id, asset); }
