// 에셋(모델·소리 파일)의 등록표와 고르는 규칙. 게임이 파일을 등록하고, 틀의 화면(scene/models.ts, scene/gltf.ts, sound.ts, preload.ts)이 여기서 고른다.
// 등록하지 않은 것은 지금처럼 코드 모델과 합성음을 쓴다: 이 표가 비어 있으면 화면은 예전과 같다.
// 이 파일은 three.js도 화면 요소도 읽지 않는다 (node의 시험이 그대로 읽는다: engine/test/fx/assets.test.ts).

// ---------- 애니메이션: 상태와 클립 이름 ----------
/** 엔티티의 동작 상태. 서 있기, 걷기, 공격, 맞음, 쓰러짐 */
export type AnimState = 'idle' | 'walk' | 'attack' | 'hit' | 'die';
export const ANIM_STATES: readonly AnimState[] = ['idle', 'walk', 'attack', 'hit', 'die'];
/** 상태 → 모델 파일 안의 클립 이름 */
export type ClipMap = Record<AnimState, string>;
/** 틀의 기본 클립 이름 */
export const DEFAULT_CLIPS: Readonly<ClipMap> = { idle: 'idle', walk: 'walk', attack: 'attack', hit: 'hit', die: 'die' };
let clipNames: ClipMap = { ...DEFAULT_CLIPS };
/** 모든 모델에 쓰는 클립 이름을 바꾼다 (예: 그림 도구가 'Run'으로 내보냈으면 { walk: 'Run' }). 모델마다 다르면 등록할 때 clips로 */
export function setClipNames(map: Partial<ClipMap>): void { clipNames = { ...clipNames, ...map }; }
/** 한 모델의 상태 → 클립 이름 표: 틀의 기본 ← setClipNames ← 그 모델의 clips */
export function clipTable(own?: Partial<ClipMap>): ClipMap { return { ...clipNames, ...own }; }

/**
 * 파일 안의 클립 이름들에서 원하는 이름을 고른다. 같은 이름 → 대소문자만 다른 이름 → 'Armature|walk'처럼 '|' 뒤가 같은 이름.
 * 없으면 null: 그 상태는 틀의 코드 흔들기로 돌아간다
 */
export function pickClip(want: string, names: readonly string[]): string | null {
  if (!want) return null;
  if (names.includes(want)) return want;
  const w = want.toLowerCase();
  return names.find((n) => n.toLowerCase() === w) ?? names.find((n) => n.toLowerCase().split('|').pop() === w) ?? null;
}
/** 상태마다 고른 클립 이름 (없는 상태는 빠진다) */
export function clipsFor(table: ClipMap, names: readonly string[]): Partial<ClipMap> {
  const out: Partial<ClipMap> = {};
  for (const s of ANIM_STATES) { const n = pickClip(table[s], names); if (n) out[s] = n; }
  return out;
}
/** 한 번 도는 동작의 우선순위: 쓰러짐은 무엇에도 끊기지 않고, 공격은 맞음에 끊기지 않는다 */
export const SHOT_RANK: Readonly<Record<AnimState, number>> = { idle: 0, walk: 0, hit: 1, attack: 2, die: 3 };
/** 지금 도는 한 번짜리 동작(now)이 있을 때 새 동작(next)을 시작하는가 */
export const cuts = (now: AnimState | null, next: AnimState): boolean => !now || SHOT_RANK[next] >= SHOT_RANK[now];

/**
 * 믹서를 몇 프레임마다 갱신하는가: 가까운 것은 매 프레임, 멀수록 드물게, 화면 밖은 가장 드물게 (건너뛴 시간은 모아서 한 번에 넘긴다).
 * dist는 카메라가 따라가는 곳(내 캐릭터)에서의 거리
 */
export function mixerEvery(dist: number, onScreen: boolean): number {
  if (!onScreen) return 8;
  return dist < 22 ? 1 : dist < 40 ? 2 : 4;
}

// ---------- 모델 ----------
/** 모델을 틀의 약속(발이 원점, +Z를 바라본다)에 맞추는 값 */
export interface ModelFit {
  /** 키를 이 높이로 맞춘다 (모델의 경계 상자 높이 기준). 주지 않으면 scale */
  height?: number;
  /** 크기 배율 (height가 없을 때. 기본 1) */
  scale?: number;
  /** 바닥을 땅에 붙인 뒤 더 올리는 높이 (기본 0. 떠 있는 것은 양수) */
  lift?: number;
  /** 바닥을 땅에 붙이는가 (경계 상자의 바닥을 0에. 기본 true. false면 파일의 원점을 그대로 발로 쓴다) */
  ground?: boolean;
  /** 모델을 돌리는 각(도, 위에서 보아 반시계). 파일의 앞이 +Z가 아니면 맞춘다 (앞이 -Z면 180) */
  turn?: number;
  /** 그림자를 드리우는가 (기본 true) */
  shadow?: boolean;
}
/** 모델 파일 하나 (glTF/GLB) */
export interface ModelAsset extends ModelFit {
  /** 파일의 주소. 게임의 client/public/에 두면 './models/a.glb' */
  url: string;
  /** 상태 → 클립 이름 (이 모델만. 빠진 상태는 setClipNames와 틀의 기본 이름) */
  clips?: Partial<ClipMap>;
  /** 상태마다 재생 빠르기 (기본 1) */
  speed?: Partial<Record<AnimState, number>>;
  /** 상태 사이를 섞는 시간(초, 기본 0.2) */
  fade?: number;
  /** 재질 이름 → 색: 같은 파일을 털빛만 바꿔 여러 몬스터에 쓴다 */
  tint?: Record<string, number>;
}
/** 사람 모델 파일 */
export interface HumanoidAsset extends ModelAsset {
  /**
   * 틀의 손 모양(검·활·지팡이, 게임이 registerHand로 등록한 것)을 붙일 뼈 이름: 어깨에 있는 팔 뼈. 주면 손 모양과 무기의 겉모습(registerBlade, registerWeaponAsset)이 그대로 붙는다.
   * 뼈의 쉬는 자세가 틀의 팔(rig.ra, rig.la)과 같아야 맞는다: 회전 없이 어깨에, 팔이 아래로. 틀의 사람과 같은 크기(어깨 높이 약 1.48)면 손 모양의 자리가 그대로 맞는다
   */
  arms?: { left: string; right: string };
  /** 사람마다 다른 색을 칠할 재질 이름: 옷(HumanoidLook.cloth), 살갗(skin). 여러 재질이면 목록 */
  paint?: { cloth?: string | readonly string[]; skin?: string | readonly string[] };
  /**
   * 입은 갑옷(registerArmor)을 이 모델에 보이는 법. 없으면 파일의 사람에는 갑옷이 보이지 않는다 (예전과 같다).
   * 이름이 모델에 없으면 그 부분은 아무것도 하지 않는다 (콘솔에 경고 한 줄)
   */
  armor?: HumanoidArmor;
}
/** 파일의 사람에 갑옷을 보이는 법: 칠하기와 덧대기 (둘 다 써도 된다) */
export interface HumanoidArmor {
  /**
   * 갑옷의 색(ArmorLook.color)으로 칠할 이름들: 메시·노드의 이름(그 아래의 메시 모두)이나 재질의 이름. 갑옷을 벗으면 본래의 색(paint의 옷 색 포함)으로 돌아간다.
   * 이름은 같은 이름 → 대소문자만 다른 이름 → 'Armature|torso'처럼 '|' 뒤가 같은 이름의 차례로 맞춘다
   */
  tint?: readonly string[];
  /**
   * 틀의 갑옷 덧대기(가슴받이·허리띠, pads면 어깨받이: 코드 사람과 같은 모양)를 붙일 뼈·노드의 이름. 쉬는 자세에서 코드 사람과 같은 자리(모델 원점 기준)에 놓이고 그 뼈를 따라 움직인다.
   * 틀의 사람과 같은 크기(키 약 2.1, 가슴 높이 약 1.2)로 만든 모델에 맞는다
   */
  attach?: string;
}
/** 이름 하나 또는 목록을 목록으로 */
export const nameList = (v: string | readonly string[] | undefined): string[] => (v === undefined ? [] : typeof v === 'string' ? [v] : [...v]);
/**
 * 갑옷을 칠할 곳인가: 메시에서 모델의 맨 위까지의 노드 이름들(nodes) 가운데 하나나 재질의 이름(material)이 tint의 이름과 맞으면
 * 'node'(메시 전체를 칠한다) 또는 'material'(그 재질만), 맞는 것이 없으면 null
 */
export function armorHit(tint: readonly string[], nodes: readonly string[], material: string): 'node' | 'material' | null {
  for (const want of tint) if (pickClip(want, nodes)) return 'node';
  for (const want of tint) if (material && pickClip(want, [material])) return 'material';
  return null;
}
/** 무기 모델 파일: 손 모양이 돌려준 부분(칼날·도끼날·활대·지팡이)의 자리에 놓이고 그 부분을 숨긴다. 위가 +Y, 가운데가 그 자리에 온다 */
export interface WeaponAsset {
  url: string;
  /** 긴 쪽(Y)의 길이. 기본은 숨기는 부분의 길이 */
  height?: number;
  /** 돌리는 각(도, Y축) */
  turn?: number;
  shadow?: boolean;
  tint?: Record<string, number>;
}

const MONSTER_FILES = new Map<string, ModelAsset>();
const HUMAN_FILES = new Map<string, HumanoidAsset>();
const WEAPON_FILES = new Map<string, WeaponAsset>();
/** 몬스터 종류(MONSTERS의 키)에 모델 파일을 쓴다. 코드 모델(registerMonsterModel)은 파일을 읽는 동안과 읽지 못했을 때 보인다 */
export function registerMonsterAsset(type: string, asset: ModelAsset): void { MONSTER_FILES.set(type, asset); }
/** 사람 모델 파일. cls를 주면 그 직업만, 빈 문자열(기본)이면 모든 사람(직업을 정한 것이 없는 직업, 상인, NPC) */
export function registerHumanoidAsset(asset: HumanoidAsset, cls = ''): void { HUMAN_FILES.set(cls, asset); }
/** 무기 모델 파일. id는 무기 아이템의 id(그 무기만) 또는 손 모양의 id(그 손의 무기 전부: 'sword', 'bow', 'axe' …) */
export function registerWeaponAsset(id: string, asset: WeaponAsset): void { WEAPON_FILES.set(id, asset); }
export const monsterAsset = (type: string): ModelAsset | undefined => MONSTER_FILES.get(type);
/** 직업의 것 → 모두의 것 */
export const humanoidAsset = (cls = ''): HumanoidAsset | undefined => HUMAN_FILES.get(cls) ?? HUMAN_FILES.get('');
/** 무기 id의 것 → 손 모양의 것 */
export const weaponAsset = (weapon: string, hand = ''): WeaponAsset | undefined => (weapon ? WEAPON_FILES.get(weapon) : undefined) ?? (hand ? WEAPON_FILES.get(hand) : undefined);

/** 모델의 크기 배율: 높이를 주면 경계 상자의 높이(sizeY)로 나눈다 */
export function fitScale(sizeY: number, fit: ModelFit): number {
  if (fit.height !== undefined && sizeY > 1e-6) return fit.height / sizeY;
  return fit.scale ?? 1;
}
/** 모델을 올리는 높이: 바닥(minY)을 땅에 붙이고 lift를 더한다 (배율 s를 곱한 뒤의 값) */
export function fitLift(minY: number, s: number, fit: ModelFit): number {
  return (fit.ground === false ? 0 : -minY * s) + (fit.lift ?? 0);
}

// ---------- 소리 ----------
/** 소리 파일 하나와 그 음량(0~1, 기본 1) */
export interface SoundFile { url: string; vol: number }
const SOUND_FILES = new Map<string, SoundFile>();
const MUSIC_FILES = new Map<string, SoundFile>();
/**
 * 효과음 키에 파일(ogg, mp3, wav)을 쓴다. 틀의 키: hit(때림), crit(치명타), hurt(맞음), kill(처치), skill(기술), fanfare(좋은 소식), pickup(얻음), bad(나쁜 소식).
 * 등록하지 않은 키는 합성음을 쓴다. 게임이 새 키를 만들어 playSound(키)로 낼 수도 있다 (합성음이 없으니 파일이 있어야 들린다)
 */
export function registerSound(key: string, url: string, vol = 1): void { SOUND_FILES.set(key, { url, vol }); }
/** 배경음 하나 (반복해서 튼다). id는 게임이 정하고 setMusicPicker가 고른다 */
export function registerMusic(id: string, url: string, vol = 1): void { MUSIC_FILES.set(id, { url, vol }); }
export const soundFile = (key: string): SoundFile | undefined => SOUND_FILES.get(key);
export const musicFile = (id: string): SoundFile | undefined => MUSIC_FILES.get(id);
/** 게임이 소리 파일이나 배경음을 하나라도 등록했는가 (음량 단추를 보인다) */
export const hasAudioFiles = (): boolean => SOUND_FILES.size > 0 || MUSIC_FILES.size > 0;
export const hasMusic = (): boolean => MUSIC_FILES.size > 0;

/** 파일 하나의 형편: 읽는 중, 다 읽음, 실패 */
export type LoadState = 'loading' | 'ready' | 'failed';
/**
 * 효과음 키를 무엇으로 낼까: 'file'(등록한 파일이 다 읽혔다), 'synth'(등록하지 않았거나, 아직 읽는 중이거나, 읽지 못했다), 'none'(합성음도 없는 게임의 키)
 */
export function soundSource(key: string, state: (url: string) => LoadState | undefined, hasSynth: boolean): 'file' | 'synth' | 'none' {
  const f = SOUND_FILES.get(key);
  if (f && state(f.url) === 'ready') return 'file';
  return hasSynth ? 'synth' : 'none';
}

/** 음량 설정: 효과음과 배경음 따로 (0~1). 소리 켜고 끄기(soundBtn)와는 따로 저장한다 */
export interface Mix { sfx: number; music: number }
export const DEFAULT_MIX: Readonly<Mix> = { sfx: 0.8, music: 0.5 };
const unit = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
/** 저장해 둔 글(localStorage)에서 음량 설정을 읽는다. 없거나 깨졌으면 기본값 */
export function readMix(raw: string | null): Mix {
  if (!raw) return { ...DEFAULT_MIX };
  try {
    const o = JSON.parse(raw) as Partial<Mix> | null;
    return { sfx: unit(o?.sfx, DEFAULT_MIX.sfx), music: unit(o?.music, DEFAULT_MIX.music) };
  } catch { return { ...DEFAULT_MIX }; }
}
export const writeMix = (m: Mix): string => JSON.stringify({ sfx: unit(m.sfx, DEFAULT_MIX.sfx), music: unit(m.music, DEFAULT_MIX.music) });

// ---------- 미리 불러오기 ----------
/**
 * 접속 화면 동안 미리 읽을 파일: 모델과 효과음 (같은 주소는 한 번). 배경음은 틀 때 흘려 받으므로 넣지 않는다.
 * 무기 모델도 넣는다. 등록한 것이 없으면 빈 목록이고, 접속 화면에 진행 표시가 뜨지 않는다
 */
export function preloadList(): { models: string[]; sounds: string[] } {
  const models = new Set<string>([...MONSTER_FILES.values(), ...HUMAN_FILES.values(), ...WEAPON_FILES.values()].map((a) => a.url));
  const sounds = new Set<string>([...SOUND_FILES.values()].map((s) => s.url));
  return { models: [...models], sounds: [...sounds] };
}
