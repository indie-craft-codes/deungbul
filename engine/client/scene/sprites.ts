// 유닛 그림 (art2): 영웅·적을 3D 모델 대신 그림을 붙인 판(빌보드: 늘 카메라를 본다)으로 그린다. 게임이 useSprites로 켜고(기본 꺼짐),
// 그림이 등록된 유닛만 바뀐다(engine/client/art.ts): 영웅 'unit:<영웅 id>' → 없으면 'portrait:<영웅 id>'(투명 배경 초상), 적 'unit:<몬스터 id>' → 'enemy:<몬스터 id>'.
// 그림이 없는 유닛은 지금의 3D 모델 그대로다.
// 스프라이트 시트 'sheet:<id>' (artfix)가 있으면 한 장 대신 그것으로 움직인다: id는 영웅·몬스터·직업·변신(캐릭터 정의) 모두 같은 체계.
//   기본 배치(SHEET_DEFAULT): 4열 × 4행, 투명 배경, 옆모습 오른쪽 보기, 발 기준선 같음 (scripts/art-sheet.mjs가 칸마다 발밑 가운데로 맞춘다)
//     1행 대기 4프레임(느리게 반복) · 2행 걷기 4프레임(걸음에 맞춰) · 3행 공격 4프레임(예비→휘두름→타격→회복) · 4행 맞음·비틀·무릎·쓰러짐
//     맞음은 4행의 앞 2프레임을 짧게, 쓰러짐은 4행 4프레임을 차례로 틀고 끝에서 멈춘 뒤 흐려진다.
//   게임은 칸마다 setSheets({ <id>: { cols, rows, idle: { row, frames, fps, loop }, …, base, scale } })로 덮어쓴다. 앞·뒤 보기(front·back)는 메타의 자리만 (쿼터뷰라 지금은 좌우만 뒤집는다).
//   들판(울림골 같은 MMORPG 쪽): useSprites({ field: true })면 사람(직업 'sheet:<직업 id>', 변신하면 'sheet:<캐릭터 id>')과 들판 몬스터('sheet:<몬스터 id>')도
//   시트가 있을 때 3D 대신 시트 빌보드로 그린다 (playerSprite·unitSprite). 시트가 없으면 지금 그대로.
//   발밑이 기준(판의 아래 가운데가 땅), 발밑에 둥근 그림자, 걷는 방향이 화면의 왼쪽이면 좌우를 뒤집는다(그림은 오른쪽을 본다고 친다: face로 바꾼다),
//   걸을 때 통통, 공격할 때 살짝 뛰기, 맞으면 하얗게 번쩍(틀의 recoil이 흔든다), 쓰러지면 기울며 흐려진다. 이름표·체력 막대·피해 숫자는 그림의 높이에 맞춘다.
//   단계의 우두머리(STAGES의 boss)는 boss배 크게. 단계 전투를 보는 동안은 전투 화면 키트(hud/battle.ts)가 카메라를 당겨 사람 키가 battlePx쯤 되게, 싸움이 위 띠와 아래 카드 줄 사이에 오게 한다.
import * as THREE from 'three';
import { artUrl } from '../art';
import { STAGES } from '../../shared/defs';
import type { Model } from './models';

export interface SpriteOpts {
  /** 영웅(수집형의 'hero' 종류)을 그림으로 (기본 true) */
  heroes?: boolean;
  /**
   * 이 유닛은 그림 대신 3D로 (참이면 unitSprite가 null: 모델 파일(registerMonsterAsset, 영웅은 registerHumanoidAsset(파일, 'hero:<id>'))이나 코드 모델).
   * 부를 때마다 묻는다 (설정으로 켜고 끄는 시범에 쓴다: 바뀐 것은 다음에 나타나는 유닛부터). kind는 'hero'·'m'·'p'
   */
  skip?: (kind: string, type: string) => boolean;
  /** 적: true 모두, 'stage' 단계(장·물결·우두머리)에 나오는 몬스터만 (들판의 3D 짐승은 그대로), false 없음 (기본 'stage') */
  enemies?: boolean | 'stage';
  /** 그림의 높이 = 3D 모델 높이(종류의 h, 몬스터의 h) × scale (기본 1.6: 초상은 위아래에 여백이 있다) */
  scale?: number;
  /** 그림 속 인물이 보는 쪽 (기본 'right'). 걸어가는 쪽이 반대면 뒤집는다 */
  face?: 'left' | 'right';
  /** 단계의 우두머리 그림은 이만큼 더 크게 (기본 1.4) */
  boss?: number;
  /**
   * 단계 전투를 보는 동안 보통 유닛(영웅)의 키가 화면에서 몇 px쯤 되게 카메라를 당길까 (그림 판의 높이: 그림 속 인물은 보통 그 85%쯤. 폰 세로 844px 높이 기준, 화면 높이에 따라 0.7~1.35배. 기본 150).
   * 0이면 카메라를 건드리지 않는다 (예전처럼 나를 비춘다)
   */
  battlePx?: number;
  /** 들판의 사람(직업·변신)과 들판 몬스터도 시트('sheet:<id>')가 있으면 시트 빌보드로 (기본 false: 들판은 3D) */
  field?: boolean;
}

/** 시트의 한 동작: 행(0부터), 프레임 수, 초당 프레임, 반복하는가, 그 행의 몇째 칸부터(기본 0) */
export interface SheetAnim { row: number; frames: number; fps: number; loop?: boolean; start?: number }
/** 시트 한 장의 배치. 주지 않은 칸은 SHEET_DEFAULT */
export interface SheetMeta {
  cols?: number; rows?: number;
  idle?: SheetAnim; walk?: SheetAnim; attack?: SheetAnim; hurt?: SheetAnim; die?: SheetAnim;
  /** 앞·뒤 보기 (나중의 확장 칸: 지금은 쓰지 않는다) */
  front?: SheetAnim; back?: SheetAnim;
  /** 칸의 아래에서 발밑까지 (칸 높이의 비율, art-sheet.mjs가 맞춘 시트는 0.03) */
  base?: number;
  /** 칸의 높이 = 3D 모델 높이 × scale (기본 1.5: 칸에는 휘두른 무기의 자리가 있다) */
  scale?: number;
  /** 시트 속 인물이 보는 쪽 (기본 'right') */
  face?: 'left' | 'right';
}
export const SHEET_DEFAULT = {
  cols: 4, rows: 4,
  idle: { row: 0, frames: 4, fps: 4, loop: true },
  walk: { row: 1, frames: 4, fps: 8, loop: true },
  attack: { row: 2, frames: 4, fps: 10, loop: false },
  hurt: { row: 3, frames: 2, fps: 10, loop: false },
  die: { row: 3, frames: 4, fps: 6, loop: false },
  base: 0.03, scale: 1.5, face: 'right',
} as const satisfies SheetMeta;
type Sheet = Required<Omit<SheetMeta, 'front' | 'back'>> & Pick<SheetMeta, 'front' | 'back'>;
const sheetMeta = new Map<string, SheetMeta>();
/** 시트의 배치를 칸마다 덮어쓴다 (게임이 init에서). 같은 id를 다시 주면 뒤의 것이 이긴다 */
export function setSheets(table: Readonly<Record<string, SheetMeta>>): void { for (const [id, m] of Object.entries(table)) sheetMeta.set(id, m); }
/** 그 id의 시트 배치 (덮어쓴 것 + 기본) */
export const sheetOf = (id: string): Sheet => ({ ...SHEET_DEFAULT, ...sheetMeta.get(id) }) as Sheet;
/** 시트 판의 상태 (scene/models.ts의 Model.sprite.sheet) */
export interface SheetRun { meta: Sheet; tex: THREE.Texture; frame: number; hurtAt: number; flash: boolean }
let opts: Required<SpriteOpts> | null = null;
let stageFoes: Set<string> | null = null;
let stageBosses: Set<string> | null = null;

/** 유닛 그림을 켠다 (게임이 init에서 한 번). 켜지 않으면 아무것도 바뀌지 않는다 */
export function useSprites(o: SpriteOpts = {}): void { opts = { heroes: true, enemies: 'stage', scale: 1.6, face: 'right', boss: 1.4, battlePx: 150, field: false, skip: () => false, ...o }; stageFoes = null; stageBosses = null; }
/** 켰는가 */
export const spritesOn = (): boolean => !!opts;

/** 단계 전투의 카메라가 맞출 사람 키(px, 폰 세로 기준). 그림을 켜지 않았거나 0이면 0 (hud/battle.ts) */
export const spriteBattlePx = (): number => opts?.battlePx ?? 0;
/** 단계의 우두머리 종류 */
function bosses(): Set<string> {
  if (!stageBosses) { stageBosses = new Set(); for (const s of STAGES) if (s.def.boss) stageBosses.add(s.def.boss.type); }
  return stageBosses;
}
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
function texOf(url: string, onReady: (t: THREE.Texture) => void): THREE.Texture {
  let e = tex.get(url);
  if (!e) {
    const entry: { t: THREE.Texture; ready: boolean; waits: (() => void)[] } = { t: new THREE.Texture(), ready: false, waits: [] };
    entry.t = new THREE.TextureLoader().load(url, () => { entry.ready = true; for (const f of entry.waits.splice(0)) f(); });
    entry.t.colorSpace = THREE.SRGBColorSpace;
    tex.set(url, e = entry);
  }
  // 이미 읽힌 그림이면 바로 부른다: 부르는 쪽은 돌려받기 전의 변수를 쓰면 안 된다 (받은 t를 쓴다)
  if (e.ready) onReady(e.t); else e.waits.push(() => onReady(e!.t));
  return e.t;
}
const shadowGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });

/** 그 유닛의 시트 ('sheet:<id>'). 켜지 않았거나 없으면 undefined. 들판 몬스터는 field를 켠 게임만 (enemies가 true면 모두) */
function unitSheet(kind: string, type: string): string | undefined {
  if (!opts) return undefined;
  if (kind === 'hero') return opts.heroes ? artUrl(`sheet:${type}`) : undefined;
  if (kind === 'm') return opts.enemies && (opts.enemies === true || opts.field || foes().has(type)) ? artUrl(`sheet:${type}`) : undefined;
  return undefined;
}

/** 시트 판의 모델 (h: 3D 모델의 높이, k: 더 곱할 배율) */
function sheetSprite(id: string, url: string, h: number, k: number): Model {
  const meta = sheetOf(id), H = h * meta.scale * k;
  const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, meta.base);
  s.scale.set(H, H, 1);
  // 텍스처는 판마다 하나씩(칸을 고르는 offset이 판마다 다르다): 그림은 함께 쓴다
  // 판마다 텍스처 하나(칸을 고르는 offset이 판마다 다르다: 그림은 함께 쓴다). 그림이 읽히기 전에는 판을 감춘다 (빈 텍스처를 올리지 않게)
  const run: SheetRun = { meta, tex: new THREE.Texture(), frame: -1, hurtAt: -1e9, flash: false };
  s.visible = false;
  texOf(url, (t) => {
    const img = t.image as { width?: number; height?: number } | undefined;
    if (img?.width && img.height) s.scale.x = H * ((img.width / meta.cols) / (img.height / meta.rows));
    run.tex = t.clone();
    run.tex.repeat.set(1 / meta.cols, 1 / meta.rows);
    run.frame = -1;
    setFrame(run, meta.idle, 0);
    mat.map = run.tex; mat.needsUpdate = true;
    s.visible = true;
  });
  const root = new THREE.Group();
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.scale.setScalar(H * 0.16);
  shadow.position.y = 0.03;
  root.add(shadow, s);
  return { root, sprite: { s, mat, h: H * 0.92, w: Math.abs(s.scale.x), right: meta.face === 'right', flip: false, sheet: run } };
}
/** 칸 하나를 고른다 (동작의 i째 프레임) */
function setFrame(run: SheetRun, a: SheetAnim, i: number): void {
  const n = Math.max(1, a.frames), f = a.loop ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i));
  const col = (a.start ?? 0) + f, key = a.row * 64 + col;
  if (run.frame === key) return;
  run.frame = key;
  run.tex.offset.set(col / run.meta.cols, 1 - (a.row + 1) / run.meta.rows);
}

/**
 * 사람(플레이어)의 시트 판: 변신 중이면 그 캐릭터의 'sheet:<캐릭터 id>', 아니면 직업의 'sheet:<직업 id>'. field를 켜지 않았거나 시트가 없으면 null (3D 그대로)
 * h: 사람형의 키 (2.1)
 */
export function playerSprite(cls: string, morph: string | undefined, h = 2.1): Model | null {
  if (!opts?.field) return null;
  const id = morph && artUrl(`sheet:${morph}`) ? morph : cls, url = id ? artUrl(`sheet:${id}`) : undefined;
  return url ? sheetSprite(id, url, h, 1) : null;
}

/** 그림 판의 모델 (h: 3D 모델의 높이). 켜지 않았거나 그림이 없으면 null. 시트('sheet:<id>')가 있으면 그것이 먼저 */
export function unitSprite(kind: string, type: string, h: number): Model | null {
  if (opts?.skip?.(kind, type)) return null;
  const boss = kind === 'm' && bosses().has(type) ? opts?.boss ?? 1 : 1;
  const sheet = unitSheet(kind, type);
  if (sheet) return sheetSprite(type, sheet, h, boss);
  const url = unitArt(kind, type);
  if (!url || !opts) return null;
  const H = h * opts.scale * boss;
  const mat = new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.05, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, 0.02); // 발밑 (초상의 아래 여백을 조금 먹는다)
  s.scale.set(H, H, 1); // 그림은 정사각형으로 친다 (초상 512×512). 다른 비율이면 읽은 뒤 맞춘다
  mat.map = texOf(url, (t) => { const img = t.image as { width?: number; height?: number } | undefined; if (img?.width && img.height) s.scale.x = H * (img.width / img.height); });
  mat.needsUpdate = true;
  const root = new THREE.Group();
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.scale.setScalar(H * 0.2);
  shadow.position.y = 0.03;
  root.add(shadow, s);
  return { root, sprite: { s, mat, h: H * 0.92, w: Math.abs(s.scale.x), right: opts.face === 'right', flip: false } };
}

/**
 * 시트 판의 한 프레임: 쓰러짐 > 공격 > 맞음 > 걷기 > 대기. 맞음은 번쩍이 켜진 때부터 짧게, 쓰러짐은 4프레임을 틀고 끝에서 멈춘 뒤 흐려진다.
 * 판은 기울이지 않는다 (시트의 그림이 움직인다)
 */
function animateSheet(m: Model, run: SheetRun, w: number, walking: boolean, phase: number, swing: number, scale: number, dying: number): void {
  const sp = m.sprite!, meta = run.meta, now = performance.now() / 1000;
  if (m.flashing && !run.flash) run.hurtAt = now;
  run.flash = !!m.flashing;
  sp.s.scale.x = (sp.flip ? -1 : 1) * w;
  sp.s.scale.y = (sp.h / 0.92) * (dying < 1 ? 1 : Math.min(1.06, scale));
  sp.s.position.y = 0;
  sp.mat.rotation = 0;
  sp.mat.color.setScalar(m.flashing ? 1.5 : 1);
  if (dying < 1) {
    // 쓰러짐: 남은 몫의 앞 60% 동안 프레임을 다 틀고, 나머지는 마지막 칸에 멈춘 채 흐려진다
    const p = 1 - dying;
    setFrame(run, meta.die, Math.floor((p / 0.6) * meta.die.frames));
    sp.mat.opacity = p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4);
    return;
  }
  sp.mat.opacity = 1;
  const hurtT = now - run.hurtAt, hurtLen = meta.hurt.frames / Math.max(1, meta.hurt.fps);
  if (swing > 0) setFrame(run, meta.attack, Math.floor((1 - swing) * meta.attack.frames)); // swing은 1에서 0으로: 3째 프레임(타격)이 피해 숫자 무렵
  else if (hurtT < hurtLen) setFrame(run, meta.hurt, Math.floor(hurtT * meta.hurt.fps));
  else if (walking) setFrame(run, meta.walk, Math.floor(phase / (Math.PI / 2)));
  else setFrame(run, meta.idle, Math.floor(now * meta.idle.fps));
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
  if (sp.sheet) { animateSheet(m, sp.sheet, w, walking, phase, swing, scale, dying); return; }
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
