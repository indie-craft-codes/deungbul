// 달무리 원정대의 내용: 떠도는 하늘섬에 떨어진 달 조각을 찾아 나선 원정대. 대장(플레이어) 한 사람이 영웅 넷을 이끌고
// 장 셋 × 단계 열(다섯째마다 우두머리)을 차례로 깬다. 영웅은 월석(두 번째 재화 sparks)으로 '달무리 소환'·'서리별 소환'과 기간 한정 '월식 소환'(픽업)에서 모은다.
// 열쇠 던전 둘: 황금 광맥(골드, 영웅 장비), 별의 샘(별정수: 영웅의 조각으로 바꾸는 재료 HERO_RULES.trade, 별자리 서책: 기술 레벨, 달 조각: 각성).
// 열쇠 던전은 메뉴에서 바로 들어가고(fromMenu) 안에서도 대장이 대신 싸우며(auto) 끝나면 단계로 돌아간다(returnAfterDungeon).
// 영웅의 성장: 영웅 장비(칸 셋, 세트 둘), 기술 레벨, 각성, 진영 셋의 시너지, 앞줄·뒷줄. 소탕(소탕권·열쇠), 오프라인 단계 진행, 돌아왔을 때의 창(IDLE.popup).
// 틀이 읽는 이름(계약)과 이 게임만의 수치(STARTER, STARTER_HEROES, stageScale …)가 함께 있다. 틀은 계약의 이름만 읽는다.
import type { BannerDef, ChapterDef, GachaRules, HeroDef, HeroRoleDef, HeroRules, IdleCtx, SquadRules, StageDef, StageRules } from '@engine/shared/defs/collect';
import type { HeroGearRules } from '@engine/shared/defs/herogrow';
import type { HudRules } from '@engine/shared/defs/hud';
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
 * 방치 보상(idle → mail), 열쇠 던전(dungeon → combat, mail, daily, gear → items), 영웅 장비(herogear). 파티·길드·거래소·순위·자동 사냥·성장 탭은 쓰지 않는다.
 */
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'items', 'gear', 'mail', 'daily', 'idle', 'dungeon', 'roster', 'gacha', 'squad', 'stages', 'herogear'];
export const GUEST_NAME = 'Vanguard';
/** 금화(gold)와 월석(sparks)은 사고팔 수 없다 (거래소가 없다) */
export const CURRENCIES: Readonly<Record<'gold' | 'sparks' | 'exp', CurrencyDef>> = { gold: { tradable: false }, sparks: { tradable: false }, exp: { tradable: false } };
/** H(집으로)는 쓰지 않는다: 단계가 곧 자리다 */
export const HOME_KEY = false;
export const CAMERA = { dist: 46, zoom: 0.95, zoomMin: 0.6, zoomMax: 1.3, gate: 1.0 };
/**
 * 쓰지 않는 틀의 단추를 감춘다: 가방(던전 → 장비 → 아이템의 의존으로 딸려 온다. 재료는 영웅 탭과 영웅 상세에 보인다)과
 * '가까운 대상 공격'(단계와 열쇠 던전에서 서버가 대신 싸운다). 감출 뿐이라 B·Tab 키는 그대로다
 */
export const HUD: HudRules = { hide: ['bag', 'attackNearest'] };
/** 채널 하나 (혼자 하는 게임에 가깝다) */
export const CHANNEL = { count: 1, soft: 60, hard: 120, switchCdS: 10, calmS: 5, tellS: 10, tellBusyS: 2 };

// ---------- 맵: 하늘섬의 야영지(들판) 하나와 던전 둘 ----------
/** 단계의 자리: 야영지 북쪽 */
export const ARENA = { x: 0, z: -14 };
/** 던전의 문 둘: 처음 자리(야영지 가운데)의 양옆 (메뉴에서 들어가면 틀이 문 앞을 거쳐 들어간다) */
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
// 들판의 무리(CAMPS)는 적지 않는다: 틀의 기본(빈 표)이다. 싸움은 단계와 던전에서만

// ---------- 아이템: 대장의 무기 하나, 영웅을 키우는 재료 넷, 소탕권과 영웅 선택권 (대장의 장비는 떨어뜨리지 않는다) ----------
export const ITEMS = {
  moonblade: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  /** 별정수: 별의 샘과 방치 보상에서. 가진 영웅의 조각으로 바꾼다 (HERO_RULES.trade) */
  essence: { kind: 'mat', price: 0, max: 999 },
  /** 별자리 서책: 기술 레벨 (별의 샘, 일일 임무) */
  starchart: { kind: 'mat', price: 0, max: 999 },
  /** 달 조각: 각성 (우두머리 단계를 처음 깰 때, 별의 샘) */
  moonshard: { kind: 'mat', price: 0, max: 99 },
  /** 운철: 영웅 장비의 강화 (단계를 깰 때마다, 분해하면 돌아온다) */
  starsteel: { kind: 'mat', price: 0, max: 999 },
  /** 소탕권: 깬 단계를 싸우지 않고 끝낸다 (처음 받는 것, 일일 임무, 출석) */
  sweepticket: { kind: 'token', price: 0, max: 999 },
  /** 전설 영웅 선택권: 출석 7일째 */
  herochoice: { kind: 'token', price: 0, max: 9 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'moonblade';
export const SHOPS: readonly { x: number; z: number }[] = [];
export const SHOP_STOCK: readonly ItemId[] = [];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {};
export const GEAR = { ...GEAR_BASE, dropChance: 0, weaponFor: (): ItemId => 'moonblade', armorFor: (): ItemId => 'moonblade' };

// ---------- 일일 임무와 출석: 월석의 샘 ----------
/** 임무: 처치는 틀이 센다(kill). 단계 깨기(stage)와 열쇠 던전(keyrun)은 이 게임이 센다: 소탕도 그 횟수만큼 (server/dalmuri.ts) */
export const DAILIES = {
  hunt: { kind: 'kill', n: 120, r: { sparks: 150, gold: 300, items: { starchart: 2 } } },
  clears: { kind: 'stage', n: 15, r: { sparks: 150, items: { sweepticket: 3 } } },
  keyrun: { kind: 'keyrun', n: 2, r: { sparks: 100, gold: 500 } },
} as const satisfies Record<string, DailyDef>;
/** 출석: 이어서 접속한 날마다 (3일째에 소탕권, 7일째에 전설 영웅 선택권) */
export const ATTEND: readonly Reward[] = [{ sparks: 200 }, { sparks: 100, gold: 500 }, { sparks: 150, items: { sweepticket: 5 } }, { sparks: 150, gold: 800 }, { sparks: 200 }, { sparks: 200, gold: 1200 }, { sparks: 300, items: { herochoice: 1 } }];

// ---------- 방치 보상: 깬 단계의 수(ctx.stage)로 커진다. 12시간까지 ----------
export const IDLE = {
  minMin: 10, maxMin: 720,
  /** 돌아왔을 때 받은 방치 보상과 오프라인 진행을 가운데 창 하나로 알린다 (받기는 그 우편을 받는다: 틀의 hud/idleback.ts) */
  popup: true,
  reward: (minutes: number, lv: number, ctx: IdleCtx): Reward => idleReward(minutes, lv, ctx.stage),
};
/** 방치 보상의 셈 (시험도 쓴다): 분마다 금화 6 + 단계마다 4, 경험치, 월석은 10분마다 단계 수의 1/3, 5단계부터 별정수 */
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
 * 영웅 열둘: 일반 넷(역할마다 하나), 희귀 다섯, 전설 셋. 옷 색은 영웅마다 따로 (같은 역할 안에서 등급이 높을수록 짙고 화려하게).
 * 등급의 꾸밈(희귀: 망토, 전설: 관과 빛고리)은 화면(client/scene.ts)이 틀이 넘기는 등급(setHeroModel)으로 얹는다.
 * 진영(tag) 셋, 넷씩: 해(sun), 달(moon), 별(star). 같은 진영을 모으면 시너지 (SQUAD_RULES.synergy)
 */
export const HEROES: Readonly<Record<string, HeroDef>> = {
  anvil: { name: 'heroAnvil', rarity: 0, role: 'guardian', atk: 9, hp: 230, cloth: 0x6f86a8, tag: 'sun' },
  reed: { name: 'heroReed', rarity: 0, role: 'ranger', atk: 12, hp: 130, cloth: 0x7a9a5a, tag: 'moon' },
  ember: { name: 'heroEmber', rarity: 0, role: 'mystic', atk: 13, hp: 120, cloth: 0xa0705a, tag: 'sun' },
  dew: { name: 'heroDew', rarity: 0, role: 'healer', atk: 8, hp: 150, cloth: 0xc8c8b0, tag: 'moon' },
  stoneheart: { name: 'heroStoneheart', rarity: 1, role: 'guardian', atk: 12, hp: 320, cloth: 0x3a5a8a, tag: 'star' },
  hawkeye: { name: 'heroHawkeye', rarity: 1, role: 'ranger', atk: 17, hp: 170, cloth: 0x2f6f3f, tag: 'sun' },
  frostshot: { name: 'heroFrostshot', rarity: 1, role: 'ranger', atk: 16, hp: 180, cloth: 0x4aa0b8, tag: 'star' },
  sparkhand: { name: 'heroSparkhand', rarity: 1, role: 'mystic', atk: 19, hp: 160, cloth: 0x6a3a9a, tag: 'star' },
  willow: { name: 'heroWillow', rarity: 1, role: 'healer', atk: 11, hp: 210, cloth: 0xa8c890, tag: 'moon' },
  moonshield: { name: 'heroMoonshield', rarity: 2, role: 'guardian', atk: 17, hp: 460, cloth: 0x1f2f6a, tag: 'moon' },
  starfall: { name: 'heroStarfall', rarity: 2, role: 'mystic', atk: 27, hp: 220, cloth: 0x3a1a6a, tag: 'star' },
  dawnsaint: { name: 'heroDawnsaint', rarity: 2, role: 'healer', atk: 15, hp: 300, cloth: 0xf0d890, tag: 'sun' },
};

// ---------- 영웅 장비 (herogear): 칸 셋(무기·갑옷·부적), 일반 셋, 세트 둘(달빛·성휘, 셋씩), 전설 무기 하나 ----------
const gearPool = (ids: readonly string[], w: number) => ids.map((id) => ({ id, w }));
const COMMON_GEAR = ['ironedge', 'quiltcoat', 'pebblecharm'], RARE_GEAR = ['lunarblade', 'lunarmail', 'lunarcharm', 'astralstaff', 'astralrobe', 'astralcharm'];
/** 우두머리 단계를 깰 때마다: 희귀 하나 확정. 2장부터는 전설 무기(월식검)도 (희귀 하나의 1/5 무게) */
const BOSS_DROP = { chance: 1, pool: gearPool(RARE_GEAR, 5) }, BOSS_DROP2 = { chance: 1, pool: [...gearPool(RARE_GEAR, 5), { id: 'eclipseblade', w: 1 }] };
export const HERO_GEAR: HeroGearRules = {
  slots: [{ id: 'weapon', name: 'hgSlotWeapon' }, { id: 'armor', name: 'hgSlotArmor' }, { id: 'charm', name: 'hgSlotCharm' }],
  items: {
    ironedge: { name: 'hgIronedge', slot: 'weapon', rarity: 0, atk: 5 },
    quiltcoat: { name: 'hgQuiltcoat', slot: 'armor', rarity: 0, hp: 50 },
    pebblecharm: { name: 'hgPebblecharm', slot: 'charm', rarity: 0, atk: 2, hp: 20 },
    lunarblade: { name: 'hgLunarblade', slot: 'weapon', rarity: 1, atk: 9, hp: 15, set: 'lunar' },
    lunarmail: { name: 'hgLunarmail', slot: 'armor', rarity: 1, hp: 100, set: 'lunar' },
    lunarcharm: { name: 'hgLunarcharm', slot: 'charm', rarity: 1, atk: 3, hp: 40, set: 'lunar' },
    astralstaff: { name: 'hgAstralstaff', slot: 'weapon', rarity: 1, atk: 12, set: 'astral' },
    astralrobe: { name: 'hgAstralrobe', slot: 'armor', rarity: 1, atk: 2, hp: 60, set: 'astral' },
    astralcharm: { name: 'hgAstralcharm', slot: 'charm', rarity: 1, atk: 5, set: 'astral' },
    eclipseblade: { name: 'hgEclipseblade', slot: 'weapon', rarity: 2, atk: 20, hp: 30 },
  },
  sets: {
    lunar: { name: 'setLunar', tiers: [{ n: 2, bonus: { hpPct: 0.12 } }, { n: 3, bonus: { guard: 0.12 } }] },
    astral: { name: 'setAstral', tiers: [{ n: 2, bonus: { atkPct: 0.1 } }, { n: 3, bonus: { dmg: 0.15 } }] },
  },
  enhance: {
    max: (r) => 5 + r * 5,
    cost: (lv, r) => ({ cur: 'gold', n: 60 * (lv + 1) * (r + 1), items: { starsteel: 1 + Math.floor(lv / 3) } }),
    per: 0.12,
    chance: (lv) => (lv < 3 ? 1 : Math.max(0.5, 1 - (lv - 2) * 0.1)),
  },
  salvage: (r, lv) => ({ items: { starsteel: 1 + r * 2 + Math.floor(lv / 2) } }),
  bag: 60,
  drops: {
    stage: { '*': { chance: 0.3, pool: [...gearPool(COMMON_GEAR, 10), ...gearPool(RARE_GEAR, 1)] }, '1-5': BOSS_DROP, '1-10': BOSS_DROP, '2-5': BOSS_DROP2, '2-10': BOSS_DROP2, '3-5': BOSS_DROP2, '3-10': BOSS_DROP2 },
    dungeon: { goldvein: { chance: 0.5, pool: gearPool(RARE_GEAR, 1) } },
  },
};
/**
 * 별 6까지, 별마다 레벨 상한 +10, 레벨 값은 금화(레벨이 오를수록 가파르게, 등급마다 비싸게), 별 값은 조각(별 × 10), 레벨마다 +9%, 별마다 +25%.
 * 더하여 기술 레벨(별자리 서책), 각성(별 6에서 조각·금화·달 조각), 영웅 장비, 별정수 → 조각.
 * 전투력은 틀의 기본 셈(공격 × 4 + 체력 ÷ 2에 성장을 넣은 것)을 그대로 쓴다: 단계의 권장 전투력(stageRec)이 그 셈에 맞춰져 있다
 */
export const HERO_RULES: HeroRules = {
  maxStars: 6, maxLv: (stars) => 10 + stars * 10, levelCur: 'gold',
  levelCost: (lv, rarity) => Math.round(25 * Math.pow(lv, 1.4) * (1 + rarity * 0.5)),
  starCost: (stars) => stars * 10, grow: 0.09, starMul: 0.25,
  /** 기술 레벨: 상한 1 + 별 + 각성 × 2, 값은 금화(100 × 레벨 × (등급 + 1))와 서책(레벨만큼), 레벨마다 기술의 피해·회복 +10% */
  skill: { maxLv: (stars, aw) => 1 + stars + aw * 2, cost: (lv, r) => ({ cur: 'gold', n: 100 * lv * (r + 1), items: { starchart: lv } }), per: 0.1 },
  /** 각성 세 단계: 조각 20·40·80, 금화 5천·1만·2만, 달 조각 1·2·4. 1단계 '달빛 장막'(받는 피해 −8%), 3단계 '보름달'(주는 피해 +12%) */
  awaken: {
    steps: [
      { shards: 20, cost: { cur: 'gold', n: 5000, items: { moonshard: 1 } }, mul: 1.12, passive: { name: 'passiveMoonveil', bonus: { guard: 0.08 } } },
      { shards: 40, cost: { cur: 'gold', n: 10000, items: { moonshard: 2 } }, mul: 1.25 },
      { shards: 80, cost: { cur: 'gold', n: 20000, items: { moonshard: 4 } }, mul: 1.4, passive: { name: 'passiveFullmoon', bonus: { dmg: 0.12 } } },
    ],
  },
  gear: HERO_GEAR,
  /** 별정수 일반 3 · 희귀 6 · 전설 15개로 그 등급의 조각 한 묶음(5 · 10 · 25) */
  trade: { essence: { cost: (r) => [3, 6, 15][r] ?? 15 } },
};
const pool = (w: Record<string, number>) => Object.entries(w).map(([hero, n]) => ({ hero, w: n }));
/** 달무리 소환의 판 (월식 소환도 같은 무게) */
const HALO_POOL = pool({ anvil: 1800, reed: 1800, ember: 1800, dew: 1800, stoneheart: 500, hawkeye: 500, frostshot: 500, sparkhand: 500, willow: 500, moonshield: 100, starfall: 100, dawnsaint: 100 });
/** 월식 소환(기간 한정 픽업)이 열리는 때 (서버 시계, UTC): 11월 20일부터 3주씩 달방패 → 별비 → 새벽 성녀 */
const DAY = 86400000, ECLIPSE_FROM = Date.UTC(2026, 10, 20), ECLIPSE_DAYS = 21;
/** 월식 소환 하나: 달무리 소환과 같은 판(전설 3%)에서 픽업 영웅이 전설의 반(1.5%), 반반, 천장 60을 셋이 함께 센다(pityGroup eclipse) */
const eclipse = (name: string, hero: string, k: number): BannerDef => ({
  name, cur: 'sparks', one: 100, ten: 900, pool: HALO_POOL,
  pity: { after: 60, rarity: 2 }, tenAtLeast: 1,
  pickup: { hero, share: 0.5 }, fiftyFifty: true, pityGroup: 'eclipse',
  start: ECLIPSE_FROM + k * ECLIPSE_DAYS * DAY, end: ECLIPSE_FROM + (k + 1) * ECLIPSE_DAYS * DAY,
});
/**
 * 배너. 값은 모두 월석 100 / 10번 900 (현금은 없다).
 * - 달무리 소환(늘): 열둘 모두. 일반 72%(18%씩), 희귀 25%(5%씩), 전설 3%(1%씩). 전설이 60번째까지 나오지 않으면 60번째는 전설, 10번의 열째는 희귀 이상.
 * - 서리별 소환(늘, 두 번째): 궁수·술사만 일곱. 일반 70%, 희귀 26%, 전설 4%(별비 하나). 천장 50, 10번 보장 희귀.
 * - 월식 소환(기간 한정 픽업 셋, 3주씩 차례로): 위 eclipse.
 */
export const BANNERS: Readonly<Record<string, BannerDef>> = {
  halo: {
    name: 'bannerHalo', cur: 'sparks', one: 100, ten: 900,
    pool: HALO_POOL,
    pity: { after: 60, rarity: 2 },
    tenAtLeast: 1,
  },
  froststar: {
    name: 'bannerFroststar', cur: 'sparks', one: 100, ten: 900,
    pool: pool({ reed: 3500, ember: 3500, hawkeye: 900, frostshot: 900, sparkhand: 800, starfall: 400 }),
    pity: { after: 50, rarity: 2 },
    tenAtLeast: 1,
  },
  eclipseMoon: eclipse('bannerEclipseMoon', 'moonshield', 0),
  eclipseStar: eclipse('bannerEclipseStar', 'starfall', 1),
  eclipseDawn: eclipse('bannerEclipseDawn', 'dawnsaint', 2),
};
/** 전설 영웅 선택권: 전설 셋 가운데 하나 (가졌으면 그 조각 한 묶음) */
export const GACHA_RULES: GachaRules = { history: 50, select: { herochoice: ['moonshield', 'starfall', 'dawnsaint'] } };
/**
 * 넷이 싸운다: 앞줄 둘(받는 피해 −20%, 둘레 9m의 적을 끈다), 뒷줄 둘(주는 피해 +8%).
 * 진영의 시너지: 해 둘이면 공격 +8%, 셋이면 공격 +12%·체력 +8% / 달 둘이면 편성 모두 받는 피해 −8% / 별 둘이면 주는 피해 +10%, 넷이면 +20%
 */
export const SQUAD_RULES: SquadRules = {
  size: 4, seek: 14, leash: 22, reviveS: 7, regen: 0.06, autoFill: true,
  rows: { front: 2, back: 2, taunt: 9, frontBonus: { guard: 0.2 }, backBonus: { dmg: 0.08 } },
  synergy: {
    sun: { name: 'synSun', tiers: [{ n: 2, bonus: { atkPct: 0.08 } }, { n: 3, bonus: { atkPct: 0.12, hpPct: 0.08 } }] },
    moon: { name: 'synMoon', tiers: [{ n: 2, bonus: { guard: 0.08 } }], all: true },
    star: { name: 'synStar', tiers: [{ n: 2, bonus: { dmg: 0.1 } }, { n: 4, bonus: { dmg: 0.2 } }] },
  },
};

// ---------- 장과 단계: 장 셋 × 열. 다섯째와 열째는 우두머리 ----------
/** 장마다의 졸개 (붙는 것, 빠른 것, 쏘는 것)와 우두머리 둘 */
const FOES: readonly { a: MonsterId; b: MonsterId; c: MonsterId; boss: readonly [MonsterId, MonsterId] }[] = [
  { a: 'mossling', b: 'thornwolf', c: 'sporecaster', boss: ['mossking', 'elderroot'] },
  { a: 'cinderimp', b: 'ashhound', c: 'slinger', boss: ['magmabrute', 'ashwyrm'] },
  { a: 'frostwisp', b: 'icewarden', c: 'shardarcher', boss: ['frostgiant', 'moonlich'] },
];
/** 단계의 세기: 단계마다 13%씩 (3장 끝 1.13^29 ≈ 34배) */
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
    // 깰 때마다(소탕도): 금화·경험치·월석과 운철(장마다 하나씩 더). 처음 깰 때: 월석·금화, 우두머리 단계는 달 조각 하나
    reward: { gold: 60 + k * 30, exp: 40 + k * 20, sparks: 10 + Math.floor(k / 2), items: { starsteel: 1 + ch } },
    first: { sparks: boss ? 200 : 100, gold: 100 + k * 40, ...(boss ? { items: { moonshard: 1 } } : {}) },
    rec: stageRec(k, boss),
    timeS: boss ? 150 : 90,
  };
}
export const CHAPTERS: readonly ChapterDef[] = [
  { name: 'chapterMoss', stages: Array.from({ length: 10 }, (_, n) => stage(0, n)) },
  { name: 'chapterAsh', stages: Array.from({ length: 10 }, (_, n) => stage(1, n)) },
  { name: 'chapterFrost', stages: Array.from({ length: 10 }, (_, n) => stage(2, n)) },
];
/**
 * 단계는 야영지 북쪽에서. 접속하면 바로 지금 단계로 (방치형).
 * 소탕: 소탕권 하나에 한 번, 한 번에 열 번까지. 오프라인 진행: 편성의 전투력이 권장 이상인 단계를 15분에 하나, 12시간까지, 한 번에 10단계까지.
 * 열쇠 던전을 끝내거나 스스로 나오면 3초 뒤 지금 단계로
 */
export const STAGE_RULES: StageRules = {
  arena: ARENA, radius: 10, waveGapS: 1.5, nextS: 3, retryS: 4, timeS: 90, leaderAuto: true, enterOnJoin: true,
  sweep: { cost: { item: 'sweepticket', n: 1 }, max: 10 },
  offline: { perStageS: 900, maxH: 12, maxStages: 10 },
  returnAfterDungeon: 3,
};

// ---------- 열쇠 던전 둘: 열쇠 하루 2개(2개까지), 월석으로 하루 2번 더 ----------
// 메뉴('단계' 탭 끝의 던전 줄, '원정' 탭)에서 바로 들어가고(fromMenu) 안에서도 대장이 대신 싸운다(auto). 끝낸 적이 있으면 열쇠로 소탕(한 번에 둘까지)
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
    sweep: { max: 2 },
    fromMenu: true,
    auto: true,
  },
  starwell: {
    portal: GATES.starwell,
    entry: { x: 306, z: 0 },
    minLv: 8, perDay: 2, timeS: 150, exitS: 6,
    packs: [{ type: 'wellsprite', x: 313, z: -3, n: 4 }, { type: 'wellsprite', x: 319, z: 3, n: 4 }],
    boss: { type: 'wellguardian', x: 326, z: 0 },
    reward: { gold: 300, exp: 200, items: { essence: 10, starchart: 3, moonshard: 1 } },
    dropRar: 0, dropLv: 1,
    gear: false,
    key: { refill: 2, cap: 2, buy: { cur: 'sparks', cost: 80, perDay: 2 } },
    sweep: { max: 2 },
    fromMenu: true,
    auto: true,
  },
} as const satisfies Record<string, DungeonDef>;

// ---------- 이 게임만의 수치 (틀은 읽지 않는다) ----------
/** 처음 온 대장이 받는 것: 월석(1번 뽑기 네 번), 금화, 소탕권 셋. 처음 영웅 둘은 server/dalmuri.ts */
export const STARTER: Reward = { sparks: 400, gold: 300, items: { sweepticket: 3 } };
export const STARTER_HEROES: readonly string[] = ['anvil', 'reed'];
