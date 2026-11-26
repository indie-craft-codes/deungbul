// 달무리 원정대의 내용: 떠도는 하늘섬에 떨어진 달 조각을 찾아 나선 원정대. 대장(플레이어) 한 사람이 영웅 넷을 이끌고
// 장 셋 × 단계 열(다섯째마다 우두머리)을 차례로 깬다. 영웅은 월석(두 번째 재화 sparks)으로 '달빛 소환'에서 모은다.
// 열쇠 던전 둘: 황금 광맥(골드), 별의 샘(별정수: 영웅의 조각으로 바꾸는 재료, server/essence.ts).
// 틀이 읽는 이름(계약)과 이 게임만의 수치(STARTER, ESSENCE, DUNGEON_GATE …)가 함께 있다. 틀은 계약의 이름만 읽는다.
import type { BannerDef, ChapterDef, HeroDef, HeroRoleDef, HeroRules, IdleCtx, StageDef } from '@engine/shared/defs/collect';
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { CurrencyDef } from '@engine/shared/defs/economy';
import type { DailyDef, Reward } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import { GEAR_BASE } from '@engine/shared/defaults';
import type { ModuleId } from '@engine/shared/modules';

/**
 * 쓸 모듈: 수집형의 넷(roster, gacha, squad, stages)과 그 의존(economy, combat → classes), 대장의 레벨(growth),
 * 방치 보상(idle → mail), 열쇠 던전(dungeon → combat, mail, daily, gear → items). 파티·길드·거래소·순위·자동 사냥·성장 탭은 쓰지 않는다.
 */
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'items', 'gear', 'mail', 'daily', 'idle', 'dungeon', 'roster', 'gacha', 'squad', 'stages'];
export const GUEST_NAME = 'Vanguard';
/** 금화(gold)와 월석(sparks)은 사고팔 수 없다 (거래소가 없다) */
export const CURRENCIES: Readonly<Record<'gold' | 'sparks' | 'exp', CurrencyDef>> = { gold: { tradable: false }, sparks: { tradable: false }, exp: { tradable: false } };
/** H(집으로)는 쓰지 않는다: 단계가 곧 자리다 */
export const HOME_KEY = false;
export const CAMERA = { dist: 46, zoom: 0.95, zoomMin: 0.6, zoomMax: 1.3, gate: 1.0 };
/** 채널 하나 (혼자 하는 게임에 가깝다) */
export const CHANNEL = { count: 1, soft: 60, hard: 120, switchCdS: 10, calmS: 5, tellS: 10, tellBusyS: 2 };

// ---------- 맵: 하늘섬의 야영지(들판) 하나와 던전 둘 ----------
/** 단계의 자리: 야영지 북쪽 */
export const ARENA = { x: 0, z: -14 };
/** 던전의 문 둘: 처음 자리(야영지 가운데)의 양옆. 처음 자리에서 둘 다 닿는다 (PORTAL_REACH) */
export const GATES = { goldvein: { x: -3, z: 6 }, starwell: { x: 3, z: 6 } } as const;
export const MAP: MapDef = {
  areas: [
    { id: 'camp', x0: -44, x1: 44, z0: -44, z1: 44 },
    { id: 'goldvein', x0: 200, x1: 236, z0: -16, z1: 16 },
    { id: 'starwell', x0: 300, x1: 336, z0: -16, z1: 16 },
  ],
  edge: 2,
  seed: 77,
  spawn: { x: 0, z: 8 },
  obstacles: [],
  scatter: [
    { kind: 'tree', count: 36, x0: -54, x1: 54, pad: 10, s0: 0.8, s1: 0.7 },
    { kind: 'rock', count: 18, x0: -42, x1: 42, pad: -4, s0: 0.6, s1: 0.9 },
  ],
  // 야영지와 단계의 자리는 비워 둔다
  isFree: (x, z) => Math.hypot(x, z - 8) > 12 && Math.hypot(x - ARENA.x, z - ARENA.z) > 18,
  portals: { goldvein: GATES.goldvein, starwell: GATES.starwell },
  portalClear: 3,
};
export const PORTAL_REACH = 5;

// ---------- 대장(플레이어)의 직업 하나와 기술, 영웅의 기술 ----------
export const SKILL_DEFS = {
  // 대장
  cleave: { cd: 4, range: 3, effect: { kind: 'hit', dmg: [20, 28] } },
  quake: { cd: 9, radius: 4.5, effect: { kind: 'area', at: 'self', dmg: [14, 20], slow: 2 } },
  banner: { cd: 18, radius: 10, effect: { kind: 'buff', mod: 'damage', value: 0.3, dur: 7, allies: true }, color: 0xffd86a },
  // 영웅 (HERO_ROLES의 skill)
  bulwark: { cd: 7, range: 3, effect: { kind: 'hit', dmg: [10, 14], stun: 1.2 } },
  pierce: { cd: 6, range: 11, effect: { kind: 'hit', dmg: [16, 22] } },
  starfall: { cd: 7, range: 10, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [10, 15] }, color: 0x9ab8ff },
  moonlight: { cd: 8, radius: 10, effect: { kind: 'heal', amount: 22, allies: true }, color: 0xbfe8ff },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  captain: { hp: 320, range: 2.5, basic: [12, 16], skills: ['cleave', 'quake', 'banner'], hand: 'sword' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'captain';
export const HP_PER_LEVEL = 22;
export const COMBAT = { critChance: 0.12, critMult: 1.7, regenAfterS: 4, regenPerS: 6 };

// ---------- 몬스터: 장마다 졸개 셋과 우두머리 둘, 던전마다 졸개와 우두머리 ----------
export const MONSTERS = {
  // 1장 이끼 숲
  mossling: { hp: 165, dmg: [3, 5], speed: 2.8, exp: 8, gold: [3, 5], aggro: 0, h: 1.2 },
  thornwolf: { hp: 225, dmg: [4, 7], speed: 4.4, exp: 11, gold: [4, 6], aggro: 6, h: 1.5 },
  sporecaster: { hp: 180, dmg: [4, 6], speed: 3.2, exp: 11, gold: [4, 6], aggro: 9, h: 1.6, behavior: 'ranged', range: 8, shot: 'spore' },
  mossking: { hp: 2600, dmg: [10, 15], speed: 2.8, exp: 90, gold: [40, 60], aggro: 9, h: 3.2 },
  elderroot: { hp: 1700, dmg: [12, 18], speed: 2.6, exp: 120, gold: [60, 80], aggro: 9, h: 3.6 },
  // 2장 잿빛 협곡
  cinderimp: { hp: 180, dmg: [4, 6], speed: 3.8, exp: 12, gold: [5, 7], aggro: 6, h: 1.4 },
  ashhound: { hp: 240, dmg: [5, 8], speed: 4.6, exp: 14, gold: [5, 8], aggro: 6, h: 1.6 },
  slinger: { hp: 185, dmg: [5, 7], speed: 3.4, exp: 14, gold: [5, 8], aggro: 9, h: 1.6, behavior: 'ranged', range: 8, shot: 'ember' },
  magmabrute: { hp: 1800, dmg: [11, 16], speed: 2.8, exp: 150, gold: [70, 90], aggro: 9, h: 3.4 },
  ashwyrm: { hp: 2200, dmg: [13, 19], speed: 3.0, exp: 190, gold: [90, 120], aggro: 9, h: 3.8 },
  // 3장 서리 첨탑
  frostwisp: { hp: 175, dmg: [4, 6], speed: 3.6, exp: 15, gold: [6, 9], aggro: 6, h: 1.3 },
  icewarden: { hp: 270, dmg: [5, 8], speed: 3.4, exp: 17, gold: [6, 9], aggro: 6, h: 1.8 },
  shardarcher: { hp: 190, dmg: [5, 7], speed: 3.4, exp: 17, gold: [6, 9], aggro: 9, h: 1.6, behavior: 'ranged', range: 8, shot: 'shard' },
  frostgiant: { hp: 2000, dmg: [12, 17], speed: 2.6, exp: 230, gold: [100, 130], aggro: 9, h: 4.0 },
  moonlich: { hp: 2500, dmg: [14, 20], speed: 2.8, exp: 300, gold: [140, 180], aggro: 9, h: 3.8 },
  // 던전
  goldbeetle: { hp: 135, dmg: [3, 5], speed: 3.2, exp: 10, gold: [25, 35], aggro: 8, h: 1.2 },
  vaultgolem: { hp: 1350, dmg: [8, 12], speed: 2.4, exp: 80, gold: [200, 260], aggro: 10, h: 3.4 },
  wellsprite: { hp: 120, dmg: [4, 6], speed: 3.6, exp: 10, gold: [4, 6], aggro: 8, h: 1.3 },
  wellguardian: { hp: 1350, dmg: [9, 13], speed: 2.4, exp: 80, gold: [40, 60], aggro: 10, h: 3.4 },
} as const satisfies Record<string, MonsterDef>;
export const RESPAWN_S = 20;
/** 들판의 무리: 없다 (싸움은 단계와 던전에서만). 빈 표도 몬스터 id의 타입으로 적는다: 적지 않으면 틀의 기본(string의 목록)이 이 게임의 MONSTERS와 맞지 않아 타입 검사가 engine/server/game/systems/monsters.ts에서 걸린다 */
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [];

// ---------- 아이템: 무기 하나와 별정수 (장비는 떨어뜨리지 않는다) ----------
export const ITEMS = {
  moonblade: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  /** 별정수: 별의 샘에서 얻는다. 영웅의 조각으로 바꾼다 (server/essence.ts) */
  essence: { kind: 'mat' as ItemDef['kind'], price: 0 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'moonblade';
export const SHOPS: readonly { x: number; z: number }[] = [];
export const SHOP_STOCK: readonly ItemId[] = [];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {};
export const GEAR = { ...GEAR_BASE, dropChance: 0, weaponFor: (): ItemId => 'moonblade', armorFor: (): ItemId => 'moonblade' };

// ---------- 일일 임무와 출석: 월석의 샘 ----------
/** 임무: 처치는 틀이 센다(kill). 단계 깨기(stage)와 열쇠 던전(keyrun)은 이 게임이 센다 (server/dalmuri.ts) */
export const DAILIES = {
  hunt: { kind: 'kill', n: 120, r: { sparks: 150, gold: 300 } },
  clears: { kind: 'stage', n: 15, r: { sparks: 150 } },
  keyrun: { kind: 'keyrun', n: 2, r: { sparks: 100, gold: 500 } },
} as const satisfies Record<string, DailyDef>;
/** 출석: 이어서 접속한 날마다 (7일째에 크게) */
export const ATTEND: readonly Reward[] = [{ sparks: 200 }, { sparks: 100, gold: 500 }, { sparks: 150 }, { sparks: 150, gold: 800 }, { sparks: 200 }, { sparks: 200, gold: 1200 }, { sparks: 500 }];

// ---------- 방치 보상: 깬 단계의 수(ctx.stage)로 커진다. 12시간까지 ----------
export const IDLE = {
  minMin: 10, maxMin: 720,
  reward: (minutes: number, lv: number, ctx: IdleCtx): Reward => idleReward(minutes, lv, ctx.stage),
};
/** 방치 보상의 셈 (화면의 미리 보기와 시험도 쓴다): 분마다 금화 6 + 단계마다 4, 경험치, 월석은 10분마다 단계 수의 1/3 */
export function idleReward(minutes: number, lv: number, stage: number): Reward {
  return { gold: Math.round(minutes * (6 + stage * 4)), exp: Math.round(minutes * (2 + lv + stage)), sparks: Math.floor((minutes * stage) / 30), items: stage >= 5 ? { essence: Math.floor((minutes * stage) / 400) } : undefined };
}

// ---------- 영웅 ----------
/** 역할 넷: 수호(검, 붙어서 막는다), 궁수(활, 멀리서 한 줄기), 술사(지팡이, 범위), 치유사(지팡이, 아군 회복) */
export const HERO_ROLES: Readonly<Record<string, HeroRoleDef>> = {
  guardian: { name: 'roleGuardian', hand: 'sword', range: 2.2, atkCd: 1.2, speed: 4.6, skill: 'bulwark', cloth: 0x4f6fa8 },
  ranger: { name: 'roleRanger', hand: 'bow', shot: 'arrow', range: 9, atkCd: 1.3, speed: 4.6, skill: 'pierce', cloth: 0x4f8f4f },
  mystic: { name: 'roleMystic', hand: 'staff', shot: 'bolt', range: 8, atkCd: 1.6, speed: 4.4, skill: 'starfall', cloth: 0x8a4fb0 },
  healer: { name: 'roleHealer', hand: 'staff', shot: 'bolt', range: 7, atkCd: 1.6, speed: 4.4, skill: 'moonlight', cloth: 0xd8d2b8 },
};
/**
 * 영웅 열둘: 일반 넷(역할마다 하나), 희귀 다섯, 전설 셋. 옷 색은 영웅마다 따로 (같은 역할 안에서 등급이 높을수록 짙고 화려하게):
 * 화면(client/scene.ts)이 옷 색으로 영웅을 알아보고 등급의 꾸밈(희귀: 망토, 전설: 관과 빛고리)을 얹는다.
 */
export const HEROES: Readonly<Record<string, HeroDef>> = {
  anvil: { name: 'heroAnvil', rarity: 0, role: 'guardian', atk: 9, hp: 230, cloth: 0x6f86a8 },
  reed: { name: 'heroReed', rarity: 0, role: 'ranger', atk: 12, hp: 130, cloth: 0x7a9a5a },
  ember: { name: 'heroEmber', rarity: 0, role: 'mystic', atk: 13, hp: 120, cloth: 0xa0705a },
  dew: { name: 'heroDew', rarity: 0, role: 'healer', atk: 8, hp: 150, cloth: 0xc8c8b0 },
  stoneheart: { name: 'heroStoneheart', rarity: 1, role: 'guardian', atk: 12, hp: 320, cloth: 0x3a5a8a },
  hawkeye: { name: 'heroHawkeye', rarity: 1, role: 'ranger', atk: 17, hp: 170, cloth: 0x2f6f3f },
  frostshot: { name: 'heroFrostshot', rarity: 1, role: 'ranger', atk: 16, hp: 180, cloth: 0x4aa0b8 },
  sparkhand: { name: 'heroSparkhand', rarity: 1, role: 'mystic', atk: 19, hp: 160, cloth: 0x6a3a9a },
  willow: { name: 'heroWillow', rarity: 1, role: 'healer', atk: 11, hp: 210, cloth: 0xa8c890 },
  moonshield: { name: 'heroMoonshield', rarity: 2, role: 'guardian', atk: 17, hp: 460, cloth: 0x1f2f6a },
  starfall: { name: 'heroStarfall', rarity: 2, role: 'mystic', atk: 27, hp: 220, cloth: 0x3a1a6a },
  dawnsaint: { name: 'heroDawnsaint', rarity: 2, role: 'healer', atk: 15, hp: 300, cloth: 0xf0d890 },
};
/** 별 6까지, 별마다 레벨 상한 +10, 레벨 값은 금화(레벨이 오를수록 가파르게, 등급마다 비싸게), 별 값은 조각(별 × 10), 레벨마다 +9%, 별마다 +25% */
export const HERO_RULES: HeroRules = {
  maxStars: 6, maxLv: (stars) => 10 + stars * 10, levelCur: 'gold',
  levelCost: (lv, rarity) => Math.round(25 * Math.pow(lv, 1.4) * (1 + rarity * 0.5)),
  starCost: (stars) => stars * 10, grow: 0.09, starMul: 0.25,
};
const pool = (w: Record<string, number>) => Object.entries(w).map(([hero, n]) => ({ hero, w: n }));
/**
 * 배너 둘. 값은 월석 100 / 10번 900 (현금은 없다).
 * - 달무리 소환(늘): 열둘 모두. 일반 72%(18%씩), 희귀 25%(5%씩), 전설 3%(1%씩). 전설이 60번째까지 나오지 않으면 60번째는 전설, 10번의 열째는 희귀 이상.
 * - 서리별 소환(두 번째): 궁수·술사만 일곱. 일반 70%, 희귀 26%, 전설 4%(별비 하나). 천장 50, 10번 보장 희귀.
 */
export const BANNERS: Readonly<Record<string, BannerDef>> = {
  halo: {
    name: 'bannerHalo', cur: 'sparks', one: 100, ten: 900,
    pool: pool({ anvil: 1800, reed: 1800, ember: 1800, dew: 1800, stoneheart: 500, hawkeye: 500, frostshot: 500, sparkhand: 500, willow: 500, moonshield: 100, starfall: 100, dawnsaint: 100 }),
    pity: { after: 60, rarity: 2 },
    tenAtLeast: 1,
  },
  froststar: {
    name: 'bannerFroststar', cur: 'sparks', one: 100, ten: 900,
    pool: pool({ reed: 3500, ember: 3500, hawkeye: 900, frostshot: 900, sparkhand: 800, starfall: 400 }),
    pity: { after: 50, rarity: 2 },
    tenAtLeast: 1,
  },
};
export const SQUAD_RULES = { size: 4, seek: 14, leash: 22, reviveS: 7, regen: 0.06, autoFill: true };

// ---------- 장과 단계: 장 셋 × 열. 다섯째와 열째는 우두머리 ----------
/** 장마다의 졸개 (붙는 것, 빠른 것, 쏘는 것)와 우두머리 둘 */
const FOES: readonly { a: MonsterId; b: MonsterId; c: MonsterId; boss: readonly [MonsterId, MonsterId] }[] = [
  { a: 'mossling', b: 'thornwolf', c: 'sporecaster', boss: ['mossking', 'elderroot'] },
  { a: 'cinderimp', b: 'ashhound', c: 'slinger', boss: ['magmabrute', 'ashwyrm'] },
  { a: 'frostwisp', b: 'icewarden', c: 'shardarcher', boss: ['frostgiant', 'moonlich'] },
];
/** 단계의 세기: 단계마다 12%씩 (3장 끝 1.12^29 ≈ 27배) */
export const stageScale = (k: number): number => Math.round(Math.pow(1.13, k) * 100) / 100;
/** 권장 전투력: 편성 넷의 전투력 합으로 견준다. 우두머리 단계는 10% 더 */
export const stageRec = (k: number, boss: boolean): number => Math.round(380 * stageScale(k) * (boss ? 1.1 : 1));
function stage(ch: number, n: number): StageDef {
  const k = ch * 10 + n, f = FOES[ch], boss = n === 4 || n === 9;
  const waves = [
    [{ type: f.a, n: 4 + (n % 3 === 0 ? 1 : 0) }],
    [{ type: f.b, n: 3 }, { type: f.a, n: 1 + Math.floor(n / 4) }],
    [{ type: n >= 2 ? f.c : f.a, n: 3 }, { type: f.b, n: 1 + Math.floor(n / 5) }],
    ...(boss ? [[{ type: f.b, n: 2 }, { type: f.c, n: 2 }, { type: f.a, n: 1 }]] : []),
  ];
  return {
    waves,
    ...(boss ? { boss: { type: f.boss[n === 4 ? 0 : 1] } } : {}),
    scale: stageScale(k),
    reward: { gold: 60 + k * 30, exp: 40 + k * 20, sparks: 10 + Math.floor(k / 2) },
    first: { sparks: boss ? 200 : 100, gold: 100 + k * 40 },
    rec: stageRec(k, boss),
    timeS: boss ? 150 : 90,
  };
}
export const CHAPTERS: readonly ChapterDef[] = [
  { name: 'chapterMoss', stages: Array.from({ length: 10 }, (_, n) => stage(0, n)) },
  { name: 'chapterAsh', stages: Array.from({ length: 10 }, (_, n) => stage(1, n)) },
  { name: 'chapterFrost', stages: Array.from({ length: 10 }, (_, n) => stage(2, n)) },
];
/** 단계는 야영지 북쪽에서. 접속하면 바로 지금 단계로 (방치형) */
export const STAGE_RULES = { arena: ARENA, radius: 10, waveGapS: 1.5, nextS: 3, retryS: 4, timeS: 90, leaderAuto: true, enterOnJoin: true };

// ---------- 열쇠 던전 둘: 열쇠 하루 2개(2개까지), 월석으로 하루 2번 더 ----------
export const DUNGEONS = {
  goldvein: {
    portal: GATES.goldvein,
    entry: { x: 206, z: 0 },
    minLv: 6, perDay: 2, timeS: 150, exitS: 6,
    packs: [{ type: 'goldbeetle', x: 213, z: -3, n: 4 }, { type: 'goldbeetle', x: 219, z: 3, n: 4 }],
    boss: { type: 'vaultgolem', x: 226, z: 0 },
    reward: { gold: 1200, exp: 200 },
    dropRar: 0, dropLv: 1,
    gear: false,
    key: { refill: 2, cap: 2, buy: { cur: 'sparks', cost: 60, perDay: 2 } },
  },
  starwell: {
    portal: GATES.starwell,
    entry: { x: 306, z: 0 },
    minLv: 8, perDay: 2, timeS: 150, exitS: 6,
    packs: [{ type: 'wellsprite', x: 313, z: -3, n: 4 }, { type: 'wellsprite', x: 319, z: 3, n: 4 }],
    boss: { type: 'wellguardian', x: 326, z: 0 },
    reward: { gold: 300, exp: 200, items: { essence: 10 } },
    dropRar: 0, dropLv: 1,
    gear: false,
    key: { refill: 2, cap: 2, buy: { cur: 'sparks', cost: 80, perDay: 2 } },
  },
} as const satisfies Record<string, DungeonDef>;

// ---------- 이 게임만의 수치 (틀은 읽지 않는다) ----------
/** 처음 온 대장이 받는 것: 월석(1번 뽑기 다섯 번)과 금화. 처음 영웅 둘은 server/dalmuri.ts */
export const STARTER: Reward = { sparks: 400, gold: 300 };
export const STARTER_HEROES: readonly string[] = ['anvil', 'reed'];
/** 별정수 → 조각: 그 등급의 조각 한 묶음(HERO_RARITIES의 shards: 5·10·25)에 드는 별정수 */
export const ESSENCE = { item: 'essence' as ItemId, cost: [3, 6, 15] as readonly number[] };
/** 던전에서 나오면 이만큼(초) 뒤 단계로 돌아간다 */
export const RETURN_S = 3;
