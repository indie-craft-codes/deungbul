// 유닛 그림 (art2): 영웅·적을 3D 모델 대신 그림을 붙인 판(빌보드: 늘 카메라를 본다)으로 그린다. 게임이 useSprites로 켜고(기본 꺼짐),
// 그림이 등록된 유닛만 바뀐다(engine/client/art.ts): 영웅 'unit:<영웅 id>' → 없으면 'portrait:<영웅 id>'(투명 배경 초상), 적 'unit:<몬스터 id>' → 'enemy:<몬스터 id>'.
// 그림이 없는 유닛은 지금의 3D 모델 그대로다.
//   발밑이 기준(판의 아래 가운데가 땅), 발밑에 둥근 그림자, 걷는 방향이 화면의 왼쪽이면 좌우를 뒤집는다(그림은 오른쪽을 본다고 친다: face로 바꾼다),
//   걸을 때 통통, 공격할 때 살짝 뛰기, 맞으면 하얗게 번쩍(틀의 recoil이 흔든다), 쓰러지면 기울며 흐려진다. 이름표·체력 막대·피해 숫자는 그림의 높이에 맞춘다.
import * as THREE from 'three';
import { artUrl } from '../art';
import { STAGES } from '../../shared/defs';
import type { Model } from './models';

export interface SpriteOpts {
  /** 영웅(수집형의 'hero' 종류)을 그림으로 (기본 true) */
  heroes?: boolean;
  /** 적: true 모두, 'stage' 단계(장·물결·우두머리)에 나오는 몬스터만 (들판의 3D 짐승은 그대로), false 없음 (기본 'stage') */
  enemies?: boolean | 'stage';
  /** 그림의 높이 = 3D 모델 높이(종류의 h, 몬스터의 h) × scale (기본 1.6: 초상은 위아래에 여백이 있다) */
  scale?: number;
  /** 그림 속 인물이 보는 쪽 (기본 'right'). 걸어가는 쪽이 반대면 뒤집는다 */
  face?: 'left' | 'right';
}
let opts: Required<SpriteOpts> | null = null;
let stageFoes: Set<string> | null = null;

/** 유닛 그림을 켠다 (게임이 init에서 한 번). 켜지 않으면 아무것도 바뀌지 않는다 */
export function useSprites(o: SpriteOpts = {}): void { opts = { heroes: true, enemies: 'stage', scale: 1.6, face: 'right', ...o }; stageFoes = null; }
/** 켰는가 */
export const spritesOn = (): boolean => !!opts;

/** 단계에 나오는 몬스터 종류 (물결·우두머리) */
function foes(): Set<string> {
  if (!stageFoes) { stageFoes = new Set(); for (const s of STAGES) { for (const w of s.def.waves.flat()) stageFoes.add(w.type); if (s.def.boss) stageFoes.add(s.def.boss.type); } }
  return stageFoes;
}
/** 그 유닛의 그림 (kind: 'hero' 영웅, 'm' 몬스터). 켜지 않았거나 그림이 없으면 undefined */
export function unitArt(kind: string, type: string): string | undefined {
  if (!opts) return undefined;
  if (kind === 'hero') return opts.heroes ? artUrl(`unit:${type}`) ?? artUrl(`portrait:${type}`) : undefined;
  if (kind === 'm') {
    if (!opts.enemies || (opts.enemies === 'stage' && !foes().has(type))) return undefined;
    return artUrl(`unit:${type}`) ?? artUrl(`enemy:${type}`);
  }
  return undefined;
}

/** 그림마다 한 장의 텍스처 (다 읽히면 기다리던 판들의 비율을 맞춘다) */
const tex = new Map<string, { t: THREE.Texture; ready: boolean; waits: (() => void)[] }>();
function texOf(url: string, onReady: () => void): THREE.Texture {
  let e = tex.get(url);
  if (!e) {
    const entry: { t: THREE.Texture; ready: boolean; waits: (() => void)[] } = { t: new THREE.Texture(), ready: false, waits: [] };
    entry.t = new THREE.TextureLoader().load(url, () => { entry.ready = true; for (const f of entry.waits.splice(0)) f(); });
    entry.t.colorSpace = THREE.SRGBColorSpace;
    tex.set(url, e = entry);
  }
  if (e.ready) onReady(); else e.waits.push(onReady);
  return e.t;
}
const shadowGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

/** 그림 판의 모델 (h: 3D 모델의 높이). 켜지 않았거나 그림이 없으면 null */
export function unitSprite(kind: string, type: string, h: number): Model | null {
  const url = unitArt(kind, type);
  if (!url || !opts) return null;
  const H = h * opts.scale;
  const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0.02); // 발밑 (초상의 아래 여백을 조금 먹는다)
  s.scale.set(H, H, 1); // 그림은 정사각형으로 친다 (초상 512×512). 다른 비율이면 읽은 뒤 맞춘다
  const t = texOf(url, () => { const img = t.image as { width?: number; height?: number } | undefined; if (img?.width && img.height) s.scale.x = H * (img.width / img.height); });
  mat.map = t; mat.needsUpdate = true;
  const root = new THREE.Group();
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.scale.setScalar(H * 0.2);
  shadow.position.y = 0.03;
  root.add(shadow, s);
  return { root, sprite: { s, mat, h: H * 0.92, w: Math.abs(s.scale.x), right: opts.face === 'right', flip: false } };
}

/** 카메라의 오른쪽(땅 위): 쿼터뷰(카메라 방향 (1, 1.25, 1))에서 (1, 0, -1)/√2, yaw만큼 돈다 */
let yawOf: () => number = () => 0;
export function setSpriteYaw(fn: () => number): void { yawOf = fn; }

/** 그림 판의 움직임 (scene/models.ts의 animate가 부른다) */
export function animateSprite(m: Model, x: number, z: number, face: number, walking: boolean, phase: number, swing: number, scale: number): void {
  const sp = m.sprite!, r = m.root;
  r.position.set(x, 0, z);
  r.rotation.y = 0;
  r.scale.setScalar(1);
  // 화면의 왼쪽으로 가면 뒤집는다 (멈춰 있으면 마지막 쪽)
  const yaw = yawOf(), rx = Math.cos(yaw) * 0.7071 + Math.sin(yaw) * -0.7071, rz = -Math.sin(yaw) * 0.7071 + Math.cos(yaw) * -0.7071;
  const dot = Math.sin(face) * rx + Math.cos(face) * rz;
  if (Math.abs(dot) > 0.2) sp.flip = (dot < 0) === sp.right;
  const dying = sp.die ?? 1;
  const w = Math.abs(sp.s.scale.x) || sp.w;
  // 맞음·덤빔의 크기(recoil의 scale)는 판을 조금 납작하게, 쓰러짐은 크기 대신 기울며 흐려진다
  const k = dying < 1 ? 1 : scale;
  sp.s.scale.x = (sp.flip ? -1 : 1) * w;
  sp.s.scale.y = (sp.h / 0.92) * k;
  let y = 0;
  if (walking) y += Math.abs(Math.sin(phase * 0.5)) * 0.12;
  if (swing > 0) y += Math.sin(Math.PI * swing) * 0.25;
  sp.s.position.y = y;
  sp.mat.rotation = dying < 1 ? (1 - dying) * (sp.flip ? 1.1 : -1.1) : 0;
  sp.mat.opacity = dying < 1 ? Math.max(0, dying) : 1;
  sp.mat.color.setScalar(m.flashing ? 2.6 : 1);
}
