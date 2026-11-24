// 수치의 기본값 묶음: 내용 계약(contract.ts)의 이름 가운데 게임의 id가 들지 않는 것들.
// 새 게임은 자기 내용 통로(shared/content/index.ts)에서 `export * from '@engine/shared/defaults'` 한 줄로 받아 두고,
// 바꾸고 싶은 이름만 같은 이름으로 직접 내보낸다 (직접 내보낸 이름이 export *로 온 이름을 가린다).
// 받는 것만으로 채워지지 않는 것은 게임의 id가 드는 이름이다: MAP, CLASSES, DEFAULT_CLASS, SKILL_DEFS, MONSTERS, CAMPS, ITEMS,
// START_WEAPON, SHOPS, SHOP_STOCK, FORGES, RECIPES, DROPS, GEAR(아래 GEAR_BASE에 무기·갑옷의 바탕을 더해 만든다), DAILIES, DUNGEONS.
//
// 이 파일은 값을 아무 데서도 가져오지 않는다 (타입만): 게임의 내용 파일이 틀에서 값을 읽어도 되는 곳은 여기 하나다.
// 틀의 도우미(defs/*.ts)는 게임의 내용을 읽으므로, 내용 파일이 그 도우미의 값을 읽으면 초기화 순서가 꼬인다.
// 수치는 등불지기에서 쓰던 잠정값이다. 등불지기는 이 파일을 쓰지 않고 자기 값을 갖는다.
import type { CurrencyDef } from './defs/economy';
import type { Reward } from './defs/growth';

// ---------- 직업과 전투 ----------
/** 직업마다 기술 칸의 수. 화면의 기술 단추와 단축키(1~3)가 셋에 맞춰져 있다 */
export const SKILL_SLOTS = 3;
export const HP_PER_LEVEL = 15;
export const ATTACK_CD = 1.0;
export const COMBAT = { critChance: 0.15, critMult: 1.8, regenAfterS: 5, regenPerS: 4 };
export const SLOW_FACTOR = 0.5;
export const REJOIN_KEEP_S = 300;
export const GUEST_NAME = 'Guest';

// ---------- 몬스터 ----------
export const MONSTER_ATTACK_RANGE = 1.9;
export const MONSTER_ATTACK_CD = 1.6;
export const LEASH = 18;
export const RESPAWN_S = 8;
export const MONSTER_AI = { loseRange: 26, homeSpeed: 1.5, wanderSpeed: 1.3 };
/** 필드 보스의 규칙. 보스(MonsterDef.boss)가 없는 게임에서는 읽히지 않는다 */
export const BOSS = { hpPerPlayer: 0.6, maxScale: 10, countRange: 36, countS: 20, slamEveryS: 8, slamWarnS: 1.2, slamRadius: 5, slamDmg: [28, 38] as readonly [number, number] };

// ---------- 상점과 제작 ----------
export const SHOP_REACH = 5;
export const POTION_MAX = 10;
export const POTION_CD = 8;
export const MAT_MAX = 99;
export const SMITHY_REACH = 4;

// ---------- 장비와 성장 ----------
// 아래 넷(STATS, GEAR_SLOTS, RARITIES, BUILD_STATS)의 id는 틀의 낱말이다: 틀의 문장(engine/client/i18n)이 이 id로 이름을 갖고 있다.
// 다른 id를 쓰려면 틀의 언어 파일도 함께 고쳐야 하므로, 새 게임은 그대로 받는 것이 보통이다.
export const STATS = { dmg: { base: 3 }, guard: { base: 2 }, crit: { base: 2 }, hp: { base: 12 } } as const;
export const GEAR_SLOTS = ['weapon', 'armor', 'ring', 'amulet', 'charm'] as const;
export const RARITIES = [
  { id: 'common', weight: 70, opts: 1, mult: 1 },
  { id: 'uncommon', weight: 22, opts: 2, mult: 1.3 },
  { id: 'rare', weight: 7, opts: 3, mult: 1.7 },
  { id: 'epic', weight: 1, opts: 4, mult: 2.2 },
] as const;
export const BUILD_STATS = ['pow', 'vit', 'luck'] as const;
/**
 * GEAR에서 게임의 아이템 id가 들지 않는 부분. 게임은 떨어지는 무기와 갑옷의 바탕을 더해 GEAR를 만든다:
 *   export const GEAR = { ...GEAR_BASE, weaponFor: (lv: number): ItemId => …, armorFor: (lv: number): ItemId => … };
 */
export const GEAR_BASE = {
  dropChance: 0.06, bagMax: 30, guardCap: 60, optMin: 0.8, optSpan: 0.4, optPerLevel: 0.15, sellBase: 5, sellPerTier: 10,
  levelOf: (monsterExp: number): number => Math.max(1, Math.min(6, 1 + Math.floor(monsterExp / 15))),
};
export const ENHANCE = {
  max: 10, supplyMax: 5, perPlus: 0.1,
  rate: (plus: number): number => Math.max(0.2, 1 - plus * 0.1),
  gold: (plus: number, rar: number): number => 30 * (plus + 1) * (rar + 1),
};
export const BUILD = {
  pointsPerLevel: 3, pow: 1, vit: 8, luck: 0.4,
  resetGold: (lv: number): number => 30 * lv,
  skillMax: 5, skillPerLevel: 0.12,
  skillNeedLv: (lv: number): number => lv * 4,
  skillGold: (lv: number): number => 80 * lv * lv,
};
export const LEVEL = { firstNeed: 60, growth: 1.35 };
export const POWER = { perLevel: 20, perTier: 15, perSkillLevel: 10 };
export const MAIL_MAX = 30;
/** 방치 보상: 골드와 경험치만 준다 (두 번째 재화를 쓰는 게임은 sparks를 더해 자기 것을 내보낸다) */
export const IDLE = {
  minMin: 10, maxMin: 480,
  reward: (minutes: number, lv: number): Reward => ({ gold: Math.round(minutes * (1 + lv * 0.2)), exp: Math.round(minutes * (2 + lv)) }),
};
/** 출석 보상: 이어서 접속한 날 수(1~7)마다 */
export const ATTEND: readonly Reward[] = [{ gold: 30 }, { gold: 40 }, { gold: 50 }, { gold: 60 }, { gold: 80 }, { gold: 100 }, { gold: 200 }];
export const RANK = { keep: 50, show: 20, everyS: 5 };

// ---------- 던전 ----------
export const PORTAL_REACH = 4;

// ---------- 사람들 사이의 것 ----------
export const PARTY = { max: 4, inviteS: 30, reinviteS: 30, inviteRange: 30, shareRange: 30, syncS: 0.5 };
export const CHANNEL = { count: 3, soft: 30, hard: 50, switchCdS: 10, calmS: 5, tellS: 10, tellBusyS: 2 };
export const GUILD = {
  createLv: 5, createGold: 500, nameMin: 2, nameMax: 12, noticeMax: 60, maxMembers: 30, inviteS: 60, reinviteS: 30,
  expPerGuildLevel: 2000, maxLevel: 10, expPerLevel: 0.02, gives: [100, 1000] as readonly number[], noticeGapS: 5, chatGapS: 0.7,
};
export const MARKET = { maxPrice: 1_000_000, minPrice: 2, minLv: 8, listGapS: 0.4, maxListings: 8, maxTotal: 2000, hours: 48, tax: 0.05, pageSize: 20, sweepS: 5 };

// ---------- 재화 흐름 지표 (경제 장부) ----------
/** 장부가 적는 재화. 두 번째 재화(sparks)는 쓰지 않는 게임에서도 칸이 있어 0으로 적힌다 */
export const ECON_CURS = ['gold', 'sparks', 'exp'] as const;
/** 안내문으로 원인을 가리는 보상. 게임의 규칙이 틱이나 명령의 한가운데에서 재화를 주지 않으면 비워 둔다 */
/** 재화의 표: 거래 여부와 상한. 지갑(engine/server/game/systems/wallet.ts)이 읽는다 */
export const CURRENCIES: Readonly<Record<string, CurrencyDef>> = { gold: { tradable: true, max: 1e9 }, sparks: { tradable: false, max: 1e9 }, exp: { tradable: false } };
export const ECON_MOVES: readonly { cur: string; why: string; dir: '+' | '-'; as: string }[] = [
  { cur: 'gold', why: 'cmd:market:buy', dir: '-', as: 'market:out' },
  { cur: 'gold', why: 'mail:marketSold', dir: '+', as: 'market:in' },
];
export const ECON_MOVE_PREFIXES: readonly string[] = ['market:', 'cmd:market:', 'mail:market'];
export const ECON_UNKNOWN: readonly string[] = ['other', 'tick'];
export const ECON_LOST_FULL = 'lostFull';
export const ECON_HUNT = { live: 'hunt', away: 'huntAway', inst: 'huntDungeon' } as const;
export const ECON_LEVEL_MARKS: readonly number[] = [5, 10, 20];
export const ECON_FRESH_DAYS = 7;
export const ECON_WATCH = {
  sinkRatio: { min: 0.7, max: 1.0 }, holdDays: { max: 7 }, topRatio: { max: 10 }, awayShare: { max: 0.35 },
  maxEnhShare: { max: 0.3 }, unknownShare: { max: 0.01 }, minSample: 30,
} as const;
