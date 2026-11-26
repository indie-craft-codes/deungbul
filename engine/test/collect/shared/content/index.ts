// 수집형·방치형 모듈의 시험용 내용("영웅 들판"): 틀의 roster, gacha, squad, stages와 던전 열쇠를 쓰는 가장 작은 내용. 운영하는 게임이 아니다.
// 영웅 여섯(등급 셋, 역할 넷), 상시 배너 하나(천장 50, 10번 뽑기의 희귀 보장)와 기간 한정 픽업 배너 둘(반반, 천장 공유), 영웅 선택권,
// 장 둘 × 단계 다섯(다섯째마다 우두머리. 소탕권으로 소탕, 오프라인 진행), 열쇠를 쓰는 금광 던전 하나(열쇠로 소탕).
// 영웅의 성장도 모두 켠다: 기술 레벨, 각성 세 단계, 영웅 장비(칸 넷, 세트 둘, 단계·던전에서 떨어짐), 진영 셋의 시너지, 앞줄·뒷줄 둘씩의 진형.
// 단계 밖도 켠다: 금광은 메뉴에서 바로 들어가고(fromMenu) 안에서 대장도 대신 싸우며(auto) 끝나면 단계로 돌아간다(returnAfterDungeon),
// 돌아왔을 때의 창(IDLE.popup), 재료(별가루)로 영웅의 조각 얻기(HERO_RULES.trade), 쓰지 않는 틀의 단추 감추기(HUD.hide).
// 이 내용 위에서 틀만의 타입 검사(engine/test/collect/tsconfig.json)와 서버·화면 셈의 시험(engine/test/collect/*.test.ts), 그리고 화면(npx vite build -c engine/test/collect/vite.config.ts)이 돈다.
// 별칭 @game이 이 폴더를 가리키는 것은 engine/test/collect/tsconfig.json과 vite.config.ts뿐이다.
import type { BannerDef, ChapterDef, GachaRules, HeroDef, HeroRoleDef, HeroRules, IdleCtx, SquadRules, StageDef, StageRules } from '@engine/shared/defs/collect';
import type { HeroGearRules } from '@engine/shared/defs/herogrow';
import type { HudRules } from '@engine/shared/defs/hud';
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { CurrencyDef } from '@engine/shared/defs/economy';
import type { Reward } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import { GEAR_BASE, HERO_RULES as BASE_HERO_RULES } from '@engine/shared/defaults';
import type { ModuleId } from '@engine/shared/modules';

/** 쓸 모듈: 수집형의 넷과 그 의존, 방치 보상(우편), 열쇠 던전(던전은 일일·장비에 기댄다), 영웅 장비 */
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'items', 'gear', 'mail', 'daily', 'idle', 'dungeon', 'roster', 'gacha', 'squad', 'stages', 'herogear'];
export const GUEST_NAME = 'Captain';
/** 두 번째 재화(sparks)는 이 게임의 '보석': 뽑기와 열쇠를 산다. 단계를 깨면 생긴다 */
export const CURRENCIES: Readonly<Record<'gold' | 'sparks' | 'exp', CurrencyDef>> = { gold: { tradable: false }, sparks: { tradable: false }, exp: { tradable: false } };
/** 집으로(H)는 쓰지 않는다: 단계가 곧 자리다 */
export const HOME_KEY = false;
export const CAMERA = { dist: 46, zoom: 1.05, zoomMin: 0.6, zoomMax: 1.3, gate: 1.05 };
/** 쓰지 않는 틀의 단추: 가방(던전 → 장비 → 아이템의 의존으로 딸려 온다)과 '가까운 대상 공격'(단계와 금광에서 서버가 대신 싸운다). B와 Tab은 그대로 */
export const HUD: HudRules = { hide: ['bag', 'attackNearest'] };

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

// ---------- 아이템: 무기 하나 (장비는 떨어뜨리지 않는다), 영웅의 성장 재료 셋 (단계를 깨면 생긴다), 소탕권과 영웅 선택권 (지니고만 있는 것: 거래소에 올릴 수 없다) ----------
/** 종류를 넓혀 적는다 (무기와 재료뿐인 좁은 타입이면 틀의 '갑옷인가' 확인이 컴파일되지 않는다) */
export const ITEMS: Readonly<Record<'oakblade' | 'skillbook' | 'awakenstone' | 'gearstone' | 'sweepticket' | 'herochoice' | 'stardust', ItemDef>> = {
  oakblade: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  /** 기술서: 기술 레벨 */
  skillbook: { kind: 'mat', price: 0 },
  /** 각성석: 각성 */
  awakenstone: { kind: 'mat', price: 0 },
  /** 강화석: 영웅 장비의 강화 (분해하면 돌아온다) */
  gearstone: { kind: 'mat', price: 0, max: 999 },
  /** 소탕권 */
  sweepticket: { kind: 'token', price: 0, max: 999 },
  /** 영웅 선택권 */
  herochoice: { kind: 'token', price: 0, max: 99 },
  /** 별가루: 금광의 보상. 가진 영웅의 조각으로 바꾼다 (HERO_RULES.trade) */
  stardust: { kind: 'mat', price: 0, max: 999 },
};
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
  /** 돌아왔을 때 받은 방치 보상(과 오프라인 진행)을 가운데 창으로 알린다 */
  popup: true,
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
/** 영웅 여섯: 일반 둘, 희귀 둘, 전설 둘 (등급은 틀의 기본 HERO_RARITIES: 0 일반, 1 희귀, 2 전설). 진영(tag) 셋: 숲 둘, 불씨 둘, 물결 둘 */
export const HEROES: Readonly<Record<string, HeroDef>> = {
  ironwall: { name: 'heroIronwall', rarity: 0, role: 'guard', atk: 9, hp: 220, tag: 'grove' },
  swiftarrow: { name: 'heroSwiftarrow', rarity: 0, role: 'bowman', atk: 11, hp: 130, tag: 'grove' },
  cinderwitch: { name: 'heroCinderwitch', rarity: 1, role: 'pyro', atk: 15, hp: 140, tag: 'ember' },
  dawnpriest: { name: 'heroDawnpriest', rarity: 1, role: 'cleric', atk: 8, hp: 170, tag: 'tide' },
  stormblade: { name: 'heroStormblade', rarity: 2, role: 'guard', atk: 20, hp: 320, cloth: 0x3a3a7a, tag: 'tide' },
  starseer: { name: 'heroStarseer', rarity: 2, role: 'pyro', atk: 24, hp: 180, cloth: 0x7a3aa0, tag: 'ember' },
};

// ---------- 영웅 장비 (herogear): 칸 넷, 일반 넷, 세트 둘(선봉·비전, 넷씩), 전설 무기 하나 ----------
const gearPool = (ids: readonly string[], w: number) => ids.map((id) => ({ id, w }));
const COMMON_GEAR = ['bronzeblade', 'leathercoat', 'leathercap', 'woodcharm'], RARE_GEAR = ['vgblade', 'vgplate', 'vghelm', 'vgcharm', 'arwand', 'arrobe', 'arhood', 'archarm'];
export const HERO_GEAR: HeroGearRules = {
  slots: [{ id: 'weapon', name: 'hgSlotWeapon' }, { id: 'armor', name: 'hgSlotArmor' }, { id: 'helm', name: 'hgSlotHelm' }, { id: 'charm', name: 'hgSlotCharm' }],
  items: {
    bronzeblade: { name: 'hgBronzeblade', slot: 'weapon', rarity: 0, atk: 6 },
    leathercoat: { name: 'hgLeathercoat', slot: 'armor', rarity: 0, hp: 60 },
    leathercap: { name: 'hgLeathercap', slot: 'helm', rarity: 0, atk: 1, hp: 30 },
    woodcharm: { name: 'hgWoodcharm', slot: 'charm', rarity: 0, atk: 2, hp: 20 },
    vgblade: { name: 'hgVgblade', slot: 'weapon', rarity: 1, atk: 10, hp: 20, set: 'vanguard' },
    vgplate: { name: 'hgVgplate', slot: 'armor', rarity: 1, hp: 120, set: 'vanguard' },
    vghelm: { name: 'hgVghelm', slot: 'helm', rarity: 1, atk: 2, hp: 60, set: 'vanguard' },
    vgcharm: { name: 'hgVgcharm', slot: 'charm', rarity: 1, atk: 4, hp: 40, set: 'vanguard' },
    arwand: { name: 'hgArwand', slot: 'weapon', rarity: 1, atk: 14, set: 'arcane' },
    arrobe: { name: 'hgArrobe', slot: 'armor', rarity: 1, atk: 3, hp: 70, set: 'arcane' },
    arhood: { name: 'hgArhood', slot: 'helm', rarity: 1, atk: 4, hp: 30, set: 'arcane' },
    archarm: { name: 'hgArcharm', slot: 'charm', rarity: 1, atk: 6, set: 'arcane' },
    dawnedge: { name: 'hgDawnedge', slot: 'weapon', rarity: 2, atk: 24, hp: 40 },
  },
  sets: {
    vanguard: { name: 'setVanguard', tiers: [{ n: 2, bonus: { hpPct: 0.15 } }, { n: 4, bonus: { guard: 0.15 } }] },
    arcane: { name: 'setArcane', tiers: [{ n: 2, bonus: { atkPct: 0.12 } }, { n: 4, bonus: { dmg: 0.2 } }] },
  },
  enhance: {
    max: (r) => 5 + r * 5,
    cost: (lv, r) => ({ cur: 'gold', n: 80 * (lv + 1) * (r + 1), items: { gearstone: 1 + Math.floor(lv / 3) } }),
    per: 0.15,
    chance: (lv) => (lv < 3 ? 1 : Math.max(0.4, 1 - (lv - 2) * 0.1)),
  },
  salvage: (r, lv) => ({ items: { gearstone: 1 + r * 2 + Math.floor(lv / 2) } }),
  bag: 60,
  drops: {
    stage: {
      '*': { chance: 0.6, pool: [...gearPool(COMMON_GEAR, 10), ...gearPool(RARE_GEAR, 2)] },
      '1-5': { chance: 1, n: 2, pool: [...gearPool(RARE_GEAR, 5), { id: 'dawnedge', w: 1 }] },
      '2-5': { chance: 1, n: 3, pool: [...gearPool(RARE_GEAR, 5), { id: 'dawnedge', w: 2 }] },
    },
    dungeon: { goldmine: { chance: 1, pool: gearPool(RARE_GEAR, 1) } },
  },
};
/** 영웅의 성장: 틀의 기본(별 6, 레벨 상한 10 + 별 × 10 …)에 기술 레벨, 각성 세 단계, 영웅 장비를 더한다 */
export const HERO_RULES: HeroRules = {
  ...BASE_HERO_RULES,
  /** 기술 레벨: 상한은 1 + 별 + 각성 × 2, 값은 골드와 기술서, 레벨마다 기술의 피해·회복 +12% */
  skill: { maxLv: (stars, aw) => 1 + stars + aw * 2, cost: (lv, r) => ({ cur: 'gold', n: 150 * lv * (r + 1), items: { skillbook: lv } }), per: 0.12 },
  /** 각성: 별 6에서 조각과 각성석으로. 1단계에 '강철 피부'(받는 피해 −10%), 3단계에 '분노'(주는 피해 +15%) */
  awaken: {
    steps: [
      { shards: 20, cost: { cur: 'gold', n: 3000, items: { awakenstone: 1 } }, mul: 1.15, passive: { name: 'passiveSteel', bonus: { guard: 0.1 } } },
      { shards: 40, cost: { cur: 'gold', n: 6000, items: { awakenstone: 2 } }, mul: 1.3 },
      { shards: 80, cost: { cur: 'gold', n: 12000, items: { awakenstone: 4 } }, mul: 1.5, passive: { name: 'passiveFury', bonus: { dmg: 0.15 } } },
    ],
  },
  gear: HERO_GEAR,
  /** 재료로 영웅 키우기: 별가루 일반 3 · 희귀 6 · 전설 15개로 그 등급의 조각 한 묶음(5 · 10 · 25) */
  trade: { stardust: { cost: (r) => [3, 6, 15][r] ?? 15 } },
};
/** 한정 배너가 열리는 때 (서버 시계): 별똥별은 11월 20일부터 2주, 폭풍은 그다음 2주 (UTC) */
const DAY = 86400000, LIMITED_FROM = Date.UTC(2026, 10, 20);
/** 한정 배너의 판: 상시와 같은 무게 (전설 3%). 픽업이 전설의 반을 갖는다 */
const LIMITED_POOL = [
  { hero: 'ironwall', w: 375 }, { hero: 'swiftarrow', w: 375 },
  { hero: 'cinderwitch', w: 110 }, { hero: 'dawnpriest', w: 110 },
  { hero: 'stormblade', w: 15 }, { hero: 'starseer', w: 15 },
];
/**
 * 배너 셋. 새벽의 부름(상시): 보석 100 / 10번 900. 일반 75%, 희귀 22%, 전설 3%. 전설이 50번째까지 나오지 않으면 50번째는 전설, 10번 뽑기의 열째는 희귀 이상 보장.
 * 별똥별·폭풍(기간 한정 픽업): 전설 3% 가운데 픽업이 반(1.5%), 반반(픽업이 아닌 전설이 나오면 다음 전설은 픽업 확정), 천장 60, 둘이 천장과 확정을 함께 센다(limited)
 */
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
  starfall: {
    name: 'bannerStarfall', cur: 'sparks', one: 120, ten: 1080, pool: LIMITED_POOL,
    pity: { after: 60, rarity: 2 }, tenAtLeast: 1,
    pickup: { hero: 'starseer', share: 0.5 }, fiftyFifty: true, pityGroup: 'limited',
    start: LIMITED_FROM, end: LIMITED_FROM + 14 * DAY,
  },
  stormcall: {
    name: 'bannerStormcall', cur: 'sparks', one: 120, ten: 1080, pool: LIMITED_POOL,
    pity: { after: 60, rarity: 2 }, tenAtLeast: 1,
    pickup: { hero: 'stormblade', share: 0.5 }, fiftyFifty: true, pityGroup: 'limited',
    start: LIMITED_FROM + 14 * DAY, end: LIMITED_FROM + 28 * DAY,
  },
};
/** 영웅 선택권: 전설 둘 가운데 하나를 고른다 */
export const GACHA_RULES: GachaRules = { history: 50, select: { herochoice: ['stormblade', 'starseer'] } };
/** 넷이 싸운다: 앞줄 둘(받는 피해 −25%, 둘레 9m의 적을 끈다), 뒷줄 둘(주는 피해 +10%). 진영 셋의 시너지 (물결은 편성 모두가 받는다) */
export const SQUAD_RULES: SquadRules = {
  size: 4, seek: 13, leash: 22, reviveS: 8, regen: 0.06, autoFill: true,
  rows: { front: 2, back: 2, taunt: 9, frontBonus: { guard: 0.25 }, backBonus: { dmg: 0.1 } },
  synergy: {
    grove: { name: 'synGrove', tiers: [{ n: 2, bonus: { atkPct: 0.1 } }, { n: 3, bonus: { atkPct: 0.15, hpPct: 0.1 } }] },
    ember: { name: 'synEmber', tiers: [{ n: 2, bonus: { dmg: 0.12 } }] },
    tide: { name: 'synTide', tiers: [{ n: 2, bonus: { guard: 0.1 } }], all: true },
  },
};

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
    reward: { gold: 40 + k * 20, exp: 30 + k * 15, sparks: 30 + k * 5, items: { gearstone: 2 + ch, skillbook: 1 } },
    first: { sparks: 100, ...(n === 4 ? { items: { awakenstone: 1 } } : {}) },
    rec: Math.round(250 * scale * (n === 4 ? 1.6 : 1)),
    // 마지막 장의 우두머리(2-5)는 소탕할 수 없다
    ...(ch === 1 && n === 4 ? { sweep: false } : {}),
  };
};
export const CHAPTERS: readonly ChapterDef[] = [
  { name: 'chapterMeadow', stages: [0, 1, 2, 3, 4].map((n) => stage(0, n)) },
  { name: 'chapterRidge', stages: [0, 1, 2, 3, 4].map((n) => stage(1, n)) },
];
/**
 * 단계는 들판 가운데(0, 10)에서. 접속하면 바로 지금 단계로 들어간다 (방치형).
 * 소탕: 소탕권 하나에 한 번, 한 번에 열 번까지. 오프라인 진행: 편성의 전투력이 권장 이상인 단계를 10분에 하나, 12시간까지, 한 번에 20단계까지
 */
export const STAGE_RULES: StageRules = {
  arena: { x: 0, z: 10 }, radius: 9, waveGapS: 1.5, nextS: 3, retryS: 4, timeS: 90, leaderAuto: true, enterOnJoin: true,
  sweep: { cost: { item: 'sweepticket', n: 1 }, max: 10 },
  offline: { perStageS: 600, maxH: 12, maxStages: 20 },
  /** 금광을 끝내거나 스스로 나오면 2초 뒤 지금 단계로 */
  returnAfterDungeon: 2,
};

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
    reward: { gold: 600, exp: 120, items: { stardust: 4 } },
    dropRar: 0, dropLv: 1,
    gear: false,
    key: { refill: 2, cap: 2, buy: { cur: 'sparks', cost: 50, perDay: 2 } },
    // 한 번이라도 끝냈으면 열쇠 하나로 소탕 (한 번에 다섯까지)
    sweep: { max: 5 },
    // 메뉴(단계 탭)에서 바로 들어가고, 안에서는 대장도 서버가 대신 싸운다
    fromMenu: true,
    auto: true,
  },
} as const satisfies Record<string, DungeonDef>;
export const PORTAL_REACH = 5;

// ---------- 이 '게임'만의 것 (틀은 읽지 않는다) ----------
/** 처음 온 사람이 받는 것: 보석(10번 뽑기 두 번 남짓)과 골드, 소탕권 다섯과 영웅 선택권 하나 */
export const STARTER: Reward = { sparks: 2000, gold: 1500, items: { sweepticket: 5, herochoice: 1 } };
