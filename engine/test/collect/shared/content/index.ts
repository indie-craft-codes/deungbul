// 수집형·방치형 모듈의 시험용 내용("영웅 들판"): 틀의 roster, gacha, squad, stages와 던전 열쇠를 쓰는 가장 작은 내용. 운영하는 게임이 아니다.
// 영웅 여섯(등급 셋, 역할 넷), 배너 하나(천장 50, 10번 뽑기의 희귀 보장), 장 둘 × 단계 다섯(다섯째마다 우두머리), 열쇠를 쓰는 금광 던전 하나.
// 이 내용 위에서 틀만의 타입 검사(engine/test/collect/tsconfig.json)와 서버·화면 셈의 시험(engine/test/collect/*.test.ts), 그리고 화면(npx vite build -c engine/test/collect/vite.config.ts)이 돈다.
// 별칭 @game이 이 폴더를 가리키는 것은 engine/test/collect/tsconfig.json과 vite.config.ts뿐이다.
import type { BannerDef, ChapterDef, HeroDef, HeroRoleDef, IdleCtx, StageDef } from '@engine/shared/defs/collect';
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { CurrencyDef } from '@engine/shared/defs/economy';
import type { Reward } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import { GEAR_BASE } from '@engine/shared/defaults';
import type { ModuleId } from '@engine/shared/modules';

/** 쓸 모듈: 수집형의 넷과 그 의존, 방치 보상(우편), 열쇠 던전(던전은 일일·장비에 기댄다) */
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'items', 'gear', 'mail', 'daily', 'idle', 'dungeon', 'roster', 'gacha', 'squad', 'stages'];
export const GUEST_NAME = 'Captain';
/** 두 번째 재화(sparks)는 이 게임의 '보석': 뽑기와 열쇠를 산다. 단계를 깨면 생긴다 */
export const CURRENCIES: Readonly<Record<'gold' | 'sparks' | 'exp', CurrencyDef>> = { gold: { tradable: false }, sparks: { tradable: false }, exp: { tradable: false } };
/** 집으로(H)는 쓰지 않는다: 단계가 곧 자리다 */
export const HOME_KEY = false;
export const CAMERA = { dist: 46, zoom: 1.05, zoomMin: 0.6, zoomMax: 1.3, gate: 1.05 };

// ---------- 맵: 들판 하나(가운데가 단계의 자리, 북동쪽에 들판 무리, 남동쪽에 금광 문)와 금광 ----------
const PORTAL = { x: 26, z: -26 };
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [{ x: -26, z: -20, types: ['slime', 'slime', 'slime', 'wolf'] }];
export const MAP: MapDef = {
  areas: [
    { id: 'heath', x0: -50, x1: 50, z0: -50, z1: 50 },
    { id: 'goldmine', x0: 200, x1: 244, z0: -18, z1: 18 },
  ],
  edge: 2,
  seed: 41,
  spawn: { x: 0, z: -6 },
  obstacles: [],
  scatter: [
    { kind: 'tree', count: 40, x0: -58, x1: 58, pad: 10, s0: 0.8, s1: 0.7 },
    { kind: 'rock', count: 14, x0: -48, x1: 48, pad: -4, s0: 0.6, s1: 0.8 },
  ],
  // 가운데(단계의 자리와 처음 자리), 무리, 문 둘레는 비워 둔다
  isFree: (x, z) => Math.hypot(x, z - 8) > 20 && CAMPS.every((c) => Math.hypot(x - c.x, z - c.z) > 9) && Math.hypot(x - PORTAL.x, z - PORTAL.z) > 6,
  portals: { goldmine: PORTAL },
  portalClear: 5,
};

// ---------- 이끄는 사람(플레이어)의 직업 하나와 기술, 영웅의 기술 ----------
export const SKILL_DEFS = {
  slash: { cd: 4, range: 2.9, effect: { kind: 'hit', dmg: [22, 30] } },
  sweep: { cd: 8, radius: 4, effect: { kind: 'area', at: 'self', dmg: [12, 18] } },
  rally: { cd: 16, radius: 8, effect: { kind: 'buff', mod: 'damage', value: 0.3, dur: 6, allies: true }, color: 0xffd24a },
  // 영웅의 기술 (HERO_ROLES의 skill)
  shieldbash: { cd: 6, range: 3, effect: { kind: 'hit', dmg: [8, 12], stun: 1 } },
  volley: { cd: 7, range: 10, radius: 3, effect: { kind: 'area', at: 'target', dmg: [6, 10] } },
  blaze: { cd: 6, range: 9, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [9, 14] }, color: 0xff8a3a },
  prayer: { cd: 9, radius: 9, effect: { kind: 'heal', amount: 18, allies: true }, color: 0x7fd68a },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  captain: { hp: 260, range: 2.4, basic: [12, 17], skills: ['slash', 'sweep', 'rally'], hand: 'sword' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'captain';
export const SKILL_SLOTS = 3;
export const HP_PER_LEVEL = 20;

// ---------- 몬스터: 단계의 물결, 우두머리 둘, 들판의 무리, 금광 ----------
export const MONSTERS = {
  slime: { hp: 60, dmg: [3, 5], speed: 2.6, exp: 8, gold: [3, 5], aggro: 0, h: 1.3 },
  wolf: { hp: 85, dmg: [4, 7], speed: 4.4, exp: 12, gold: [4, 7], aggro: 6, h: 1.6 },
  goblin: { hp: 110, dmg: [5, 8], speed: 3.8, exp: 16, gold: [5, 9], aggro: 6, h: 1.7 },
  archer: { hp: 80, dmg: [4, 7], speed: 3.6, exp: 15, gold: [5, 9], aggro: 9, h: 1.7, behavior: 'ranged', range: 8, shot: 'arrow' },
  ogre: { hp: 900, dmg: [12, 18], speed: 3.0, exp: 120, gold: [60, 90], aggro: 9, h: 3.4 },
  golem: { hp: 1600, dmg: [16, 24], speed: 2.8, exp: 220, gold: [100, 140], aggro: 9, h: 3.8 },
  coinbug: { hp: 70, dmg: [2, 4], speed: 3.4, exp: 6, gold: [20, 30], aggro: 6, h: 1.2 },
  hoarder: { hp: 700, dmg: [8, 12], speed: 2.6, exp: 60, gold: [200, 260], aggro: 9, h: 3.0 },
} as const satisfies Record<string, MonsterDef>;
export const RESPAWN_S = 20;

// ---------- 아이템: 무기 하나 (장비는 떨어뜨리지 않는다) ----------
export const ITEMS = {
  oakblade: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'oakblade';
export const SHOPS: readonly { x: number; z: number }[] = [];
export const SHOP_STOCK: readonly ItemId[] = [];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {};
export const GEAR = { ...GEAR_BASE, dropChance: 0, weaponFor: (): ItemId => 'oakblade', armorFor: (): ItemId => 'oakblade' };
export const ATTEND: readonly Reward[] = [];
export const DAILIES = {};

// ---------- 방치 보상: 깬 단계의 수(ctx.stage)로 커진다 ----------
export const IDLE = {
  minMin: 10, maxMin: 720,
  reward: (minutes: number, lv: number, ctx: IdleCtx): Reward => ({ gold: Math.round(minutes * (4 + ctx.stage * 3)), exp: Math.round(minutes * (2 + lv + ctx.stage)), sparks: Math.floor((minutes * ctx.stage) / 10) }),
};

// ---------- 영웅 ----------
/** 역할 넷: 막는 이(검, 붙어서), 활잡이(활, 쏜다), 불 마법사(지팡이, 범위), 사제(지팡이, 아군 회복) */
export const HERO_ROLES: Readonly<Record<string, HeroRoleDef>> = {
  guard: { name: 'roleGuard', hand: 'sword', range: 2.2, atkCd: 1.2, speed: 4.6, skill: 'shieldbash', cloth: 0x5b7fb0 },
  bowman: { name: 'roleBowman', hand: 'bow', shot: 'arrow', range: 9, atkCd: 1.4, speed: 4.6, skill: 'volley', cloth: 0x4f9a5a },
  pyro: { name: 'rolePyro', hand: 'staff', shot: 'bolt', range: 8, atkCd: 1.6, speed: 4.4, skill: 'blaze', cloth: 0xc0503a },
  cleric: { name: 'roleCleric', hand: 'staff', shot: 'bolt', range: 7, atkCd: 1.6, speed: 4.4, skill: 'prayer', cloth: 0xe8e0c8 },
};
/** 영웅 여섯: 일반 둘, 희귀 둘, 전설 둘 (등급은 틀의 기본 HERO_RARITIES: 0 일반, 1 희귀, 2 전설) */
export const HEROES: Readonly<Record<string, HeroDef>> = {
  ironwall: { name: 'heroIronwall', rarity: 0, role: 'guard', atk: 9, hp: 220 },
  swiftarrow: { name: 'heroSwiftarrow', rarity: 0, role: 'bowman', atk: 11, hp: 130 },
  cinderwitch: { name: 'heroCinderwitch', rarity: 1, role: 'pyro', atk: 15, hp: 140 },
  dawnpriest: { name: 'heroDawnpriest', rarity: 1, role: 'cleric', atk: 8, hp: 170 },
  stormblade: { name: 'heroStormblade', rarity: 2, role: 'guard', atk: 20, hp: 320, cloth: 0x3a3a7a },
  starseer: { name: 'heroStarseer', rarity: 2, role: 'pyro', atk: 24, hp: 180, cloth: 0x7a3aa0 },
};
/** 배너 하나: 보석 100 / 10번 900. 일반 75%, 희귀 22%, 전설 3%. 전설이 50번째까지 나오지 않으면 50번째는 전설, 10번 뽑기의 열째는 희귀 이상 보장 */
export const BANNERS: Readonly<Record<string, BannerDef>> = {
  dawn: {
    name: 'bannerDawn', cur: 'sparks', one: 100, ten: 900,
    pool: [
      { hero: 'ironwall', w: 375 }, { hero: 'swiftarrow', w: 375 },
      { hero: 'cinderwitch', w: 110 }, { hero: 'dawnpriest', w: 110 },
      { hero: 'stormblade', w: 15 }, { hero: 'starseer', w: 15 },
    ],
    pity: { after: 50, rarity: 2 },
    tenAtLeast: 1,
  },
};
export const SQUAD_RULES = { size: 4, seek: 13, leash: 22, reviveS: 8, regen: 0.06, autoFill: true };

// ---------- 장과 단계: 장 둘 × 다섯. 다섯째는 우두머리 ----------
const stage = (ch: number, n: number): StageDef => {
  const k = ch * 5 + n; // 0부터
  const scale = Math.round((1 + k * 0.18) * 100) / 100;
  const mob: MonsterId = ch === 0 ? (n < 2 ? 'slime' : 'wolf') : n < 2 ? 'goblin' : 'archer';
  const waves = [[{ type: mob, n: 3 + (n % 2) }], [{ type: mob, n: 2 }, { type: ch === 0 ? 'slime' : 'goblin', n: 2 }]];
  return {
    waves,
    ...(n === 4 ? { boss: { type: ch === 0 ? 'ogre' : 'golem' } } : {}),
    scale,
    reward: { gold: 40 + k * 20, exp: 30 + k * 15, sparks: 30 + k * 5 },
    first: { sparks: 100 },
    rec: Math.round(250 * scale * (n === 4 ? 1.6 : 1)),
  };
};
export const CHAPTERS: readonly ChapterDef[] = [
  { name: 'chapterMeadow', stages: [0, 1, 2, 3, 4].map((n) => stage(0, n)) },
  { name: 'chapterRidge', stages: [0, 1, 2, 3, 4].map((n) => stage(1, n)) },
];
/** 단계는 들판 가운데(0, 10)에서. 접속하면 바로 지금 단계로 들어간다 (방치형) */
export const STAGE_RULES = { arena: { x: 0, z: 10 }, radius: 9, waveGapS: 1.5, nextS: 3, retryS: 4, timeS: 90, leaderAuto: true, enterOnJoin: true };

// ---------- 열쇠 던전: 금광 (열쇠 하루 2개, 2개까지, 보석 50으로 하루 2번 더) ----------
export const DUNGEONS = {
  goldmine: {
    portal: PORTAL,
    entry: { x: 206, z: 0 },
    minLv: 1,
    perDay: 2,
    timeS: 180,
    exitS: 8,
    packs: [{ type: 'coinbug', x: 216, z: -4, n: 4 }, { type: 'coinbug', x: 226, z: 5, n: 4 }],
    boss: { type: 'hoarder', x: 236, z: 0 },
    reward: { gold: 600, exp: 120 },
    dropRar: 0, dropLv: 1,
    gear: false,
    key: { refill: 2, cap: 2, buy: { cur: 'sparks', cost: 50, perDay: 2 } },
  },
} as const satisfies Record<string, DungeonDef>;
export const PORTAL_REACH = 5;

// ---------- 이 '게임'만의 것 (틀은 읽지 않는다) ----------
/** 처음 온 사람이 받는 것: 보석(10번 뽑기 두 번 남짓)과 골드 */
export const STARTER: Reward = { sparks: 2000, gold: 1500 };
