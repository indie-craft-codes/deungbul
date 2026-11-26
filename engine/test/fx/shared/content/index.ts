// 틀의 시험용 내용("시험 들판"): 틀의 시험(engine/test/fx/*.test.ts)이 이 내용 위에서 돈다. 어느 게임의 것도 아니다.
// 틀이 어느 게임에도 기대지 않는다는 것을 보이려고 id와 맵은 등불지기와 예제 게임 어느 쪽과도 다르게 지었다.
// 수치는 시험이 견주는 값(체력 170, 갑옷 12% 같은 것)을 그대로 쓰도록 등불지기의 것을 따랐다: 수치를 바꾸면 시험의 기대값도 함께 고친다.
// 틀의 기능을 빠짐없이 시험하도록 계약의 선택 기능을 모두 켠다: 대장간과 제작, 잠금(needs), 던전 하나, 필드 보스, 두 번째 재화, 분해와 가방 넓히기.
// 별칭 @game이 이 폴더(engine/test/fx)를 가리키는 것은 engine/test/fx/tsconfig.json뿐이다. 뿌리의 tsconfig.json은 이 폴더를 빼고 검사한다.
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { ForgeDef, Recipe } from '@engine/shared/defs/craft';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { CurrencyDef } from '@engine/shared/defs/economy';
import type { DailyDef } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import type { TeamDef, TeamRules } from '@engine/shared/defs/teams';
import { GEAR_BASE } from '@engine/shared/defaults';
import { RPG_MODULES } from '@engine/shared/modules';

/** 쓸 모듈: 틀의 시험이라 모두 켠다 */
export const MODULES = RPG_MODULES;

export const GUEST_NAME = 'Tester';
/** 재화: 상한을 기본값(1e9)과 다르게 둔다. 틀이 상한을 박아 두지 않고 이 표에서 읽는지 시험이 보게 한다 (wallet.test) */
export const CURRENCIES: Readonly<Record<'gold' | 'sparks' | 'exp', CurrencyDef>> = { gold: { tradable: true, max: 5e10 }, sparks: { tradable: false, max: 3e9 }, exp: { tradable: false } };

// ---------- 맵: 들판 하나와 던전 하나 ----------
/** 시험이 이름으로 찾는 자리 (계약 밖이라 틀은 모른다: 시험만 읽는다) */
export const SPOTS = {
  /** 직업을 바꾸는 돌 (시험이 g.rules.canChangeClass를 이 둘레로 정한다) */
  stone: { x: 0, z: -3, r: 1.4 },
  /** 길을 막는 기둥: 이것을 정면으로 지나는 길을 걷게 한다 */
  post: { x: -9, z: 9, r: 1.8 },
  /** 들어갈 수 없는 웅덩이 */
  pool: { x: 14, z: -12, r: 4 },
};
/** 상인 둘: 상점이 여럿인 게임도 시험한다 (어느 상인 곁에서나 산다) */
export const SHOPS: readonly { x: number; z: number }[] = [{ x: -5.5, z: 3 }, { x: 30, z: 40 }];
export const SHOP_REACH = 5;
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [
  { x: -24, z: 18, types: ['mite', 'mite', 'mite', 'mite', 'mite'] },
  { x: 24, z: 18, types: ['moth', 'moth', 'moth', 'moth'] },
  { x: -26, z: -22, types: ['hound', 'hound', 'hound'] },
  { x: 26, z: -26, types: ['raider', 'raider', 'raider', 'raider', 'raider'] },
  { x: 42, z: 12, types: ['tusk', 'tusk', 'tusk', 'tusk'] },
  { x: -42, z: -4, types: ['husk', 'husk', 'husk', 'husk'] },
  { x: 40, z: -44, types: ['colossus'] },
];
const PORTAL = { x: 0, z: -48 };
export const MAP: MapDef = {
  areas: [
    { id: 'meadow', x0: -60, x1: 60, z0: -60, z1: 60 },
    { id: 'vault', x0: 200, x1: 250, z0: -20, z1: 20 },
  ],
  edge: 2,
  seed: 23,
  spawn: { x: 0, z: 3 },
  obstacles: [
    { ...SPOTS.stone, tag: 'stone' },
    { ...SPOTS.post, tag: 'post' },
    { ...SPOTS.pool, tag: 'pool' },
  ],
  scatter: [
    { kind: 'tree', count: 80, x0: -70, x1: 70, pad: 10, s0: 0.8, s1: 0.7 },
    { kind: 'rock', count: 16, x0: -56, x1: 56, pad: -4, s0: 0.6, s1: 0.9 },
  ],
  // 가운데, 무리, 상점·대장간 둘레는 비워 둔다
  isFree: (x, z) => Math.hypot(x, z) > 16 && CAMPS.every((c) => Math.hypot(x - c.x, z - c.z) > 9),
  portals: { vault: PORTAL },
  portalClear: 5,
};

// ---------- 직업과 기술 ----------
export const SKILL_DEFS = {
  strike: { cd: 4, range: 2.9, effect: { kind: 'hit', dmg: [28, 36] } },
  spin: { cd: 8, radius: 4.2, effect: { kind: 'area', at: 'self', dmg: [14, 20] } },
  snipe: { cd: 5, range: 11, effect: { kind: 'hit', dmg: [30, 40] } },
  rain: { cd: 9, range: 11, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [12, 18] } },
  flare: { cd: 4, range: 10, effect: { kind: 'hit', dmg: [34, 46] } },
  chill: { cd: 10, range: 10, radius: 4, effect: { kind: 'area', at: 'target', dmg: [10, 15], slow: 4 }, color: 0x8fd8ff },
  soothe: { cd: 12, radius: 7, effect: { kind: 'heal', amount: 45, allies: true }, color: 0x7fd68a },
  rest: { cd: 15, effect: { kind: 'heal', amount: 60 }, color: 0x7fd68a },
  // 직업에 들지 않은 기술: 틀의 효과 종류를 빠짐없이 시험한다 (skills.test가 g.combat.cast로 낸다)
  rally: { cd: 20, radius: 6, effect: { kind: 'buff', mod: 'damage', value: 0.5, dur: 6, allies: true } },
  ward: { cd: 20, effect: { kind: 'buff', mod: 'guard', value: 0.4, dur: 5 } },
  zeal: { cd: 20, effect: { kind: 'buff', mod: 'crit', value: 1, dur: 5 } },
  charge: { cd: 8, range: 10, effect: { kind: 'dash', dist: 8, dmg: [10, 10], stun: 2 } },
  bash: { cd: 6, range: 3, effect: { kind: 'hit', dmg: [5, 5], stun: 1.5, slow: 3 } },
  venom: { cd: 8, range: 10, effect: { kind: 'dot', dps: 5, dur: 4 } },
  quake: { cd: 12, range: 10, radius: 4, effect: { kind: 'dot', dps: 3, dur: 3, area: true } },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  knight: { hp: 200, range: 2.3, basic: [10, 15], skills: ['strike', 'spin', 'rest'], hand: 'sword' },
  ranger: { hp: 170, range: 9, basic: [9, 13], skills: ['snipe', 'rain', 'rest'], hand: 'bow', shot: 'arrow' },
  sage: { hp: 150, range: 8, basic: [11, 15], skills: ['flare', 'chill', 'soothe'], hand: 'staff', shot: 'bolt' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'knight';
export const HP_PER_LEVEL = 15;

// ---------- 몬스터 ----------
export const MONSTERS = {
  mite: { hp: 60, dmg: [3, 6], speed: 3.0, exp: 12, sparks: [1, 1], gold: [2, 4], aggro: 0, h: 1.7 },
  moth: { hp: 40, dmg: [2, 5], speed: 4.2, exp: 10, sparks: [1, 2], gold: [2, 5], aggro: 0, h: 2.3 },
  hound: { hp: 110, dmg: [6, 10], speed: 5.0, exp: 25, sparks: [2, 3], gold: [5, 9], aggro: 7, h: 1.9 },
  tusk: { hp: 150, dmg: [7, 11], speed: 4.6, exp: 32, sparks: [2, 3], gold: [6, 10], aggro: 6, h: 1.9 },
  raider: { hp: 95, dmg: [5, 8], speed: 4.4, exp: 22, sparks: [1, 3], gold: [6, 12], aggro: 8, h: 2.0 },
  husk: { hp: 190, dmg: [9, 13], speed: 3.8, exp: 45, sparks: [3, 4], gold: [10, 16], aggro: 7, h: 2.7 },
  colossus: { hp: 1600, dmg: [14, 20], speed: 3.4, exp: 300, sparks: [10, 14], gold: [80, 120], aggro: 9, h: 5.0, boss: true, respawn: 300 },
  warden: { hp: 2600, dmg: [16, 24], speed: 3.6, exp: 500, sparks: [12, 16], gold: [120, 160], aggro: 10, h: 4.2 },
  // 싸우는 법(behavior)의 시험용: 떨어져서 쏘는 것, 체력이 낮으면 달아나는 것, 게임이 등록한 것. 빈터(CAMPS)에는 두지 않는다
  slinger: { hp: 80, dmg: [4, 6], speed: 4.0, exp: 18, sparks: [1, 2], gold: [4, 8], aggro: 9, h: 1.8, behavior: 'ranged', range: 7, shot: 'arrow' },
  skulk: { hp: 120, dmg: [4, 7], speed: 4.8, exp: 20, sparks: [1, 2], gold: [4, 8], aggro: 6, h: 1.6, behavior: 'flee', fleeAt: 0.4 },
  bouncer: { hp: 120, dmg: [4, 7], speed: 4.0, exp: 20, sparks: [1, 2], gold: [4, 8], aggro: 6, h: 1.6, behavior: 'shove' },
} as const satisfies Record<string, MonsterDef>;

// ---------- 아이템, 상점, 대장간 ----------
export const ITEMS = {
  blade1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  blade2: { kind: 'weapon', price: 60, damage: 1.2, tier: 2 },
  blade3: { kind: 'weapon', price: 180, damage: 1.45, tier: 3, needs: 'smith' },
  blade4: { kind: 'weapon', price: 0, damage: 1.75, tier: 4 },
  plate1: { kind: 'armor', price: 80, guard: 0.88, tier: 1 },
  plate2: { kind: 'armor', price: 240, guard: 0.76, tier: 2, needs: 'smith' },
  draught: { kind: 'potion', price: 15, heal: 80 },
  brew: { kind: 'potion', price: 35, heal: 160, needs: 'healer' },
  pelt: { kind: 'mat', price: 0 },
  ore: { kind: 'mat', price: 0 },
  core: { kind: 'mat', price: 0 },
  powder: { kind: 'mat', price: 0, max: 9999 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'blade1';
export const SHOP_STOCK: readonly ItemId[] = ['draught', 'brew', 'blade2', 'blade3', 'plate1', 'plate2'];
/** 대장간 하나: 열쇠 'smith'가 열려야 쓴다 (시험이 g.rules.unlocked로 정한다) */
export const FORGES: readonly ForgeDef[] = [{ x: 6, z: 3, needs: 'smith' }];
export const RECIPES: readonly Recipe[] = [
  { id: 'blade3', gold: 40, mats: { ore: 4, pelt: 2 } },
  { id: 'plate2', gold: 60, mats: { ore: 5, pelt: 6 } },
  { id: 'blade4', gold: 100, mats: { ore: 8, pelt: 5, core: 1 } },
];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {
  tusk: { id: 'pelt', chance: 0.5 },
  raider: { id: 'ore', chance: 0.4 },
  husk: { id: 'ore', chance: 0.7 },
  colossus: { id: 'core', chance: 1 },
};
export const GEAR = {
  ...GEAR_BASE,
  weaponFor: (lv: number): ItemId => (lv >= 8 ? 'blade3' : lv >= 4 ? 'blade2' : 'blade1'),
  armorFor: (lv: number): ItemId => (lv >= 6 ? 'plate2' : 'plate1'),
};
/** 분해와 가방 넓히기도 켠다 (기본값 묶음에서는 꺼져 있다) */
export const SALVAGE = { item: 'powder', dust: [1, 3, 8, 25], perPlus: 1, maxBatch: 60, autoMaxRar: 2, tellS: 10 };
export const BAG_UP = { step: 5, prices: [3000, 6000, 12000, 24000, 48000, 96000] };

// ---------- 일일 임무와 던전 ----------
export const DAILIES = {
  hunt30: { kind: 'kill', n: 30, r: { gold: 60, exp: 200 } },
  forge1: { kind: 'enhance', n: 1, r: { gold: 40 } },
} as const satisfies Record<string, DailyDef>;
export const DUNGEONS = {
  vault: {
    portal: PORTAL,
    entry: { x: 206, z: 0 },
    minLv: 8,
    perDay: 3,
    timeS: 600,
    exitS: 30,
    packs: [
      { type: 'raider', x: 218, z: 0, n: 4 },
      { type: 'husk', x: 230, z: -8, n: 3 },
    ],
    boss: { type: 'warden', x: 244, z: 0 },
    reward: { gold: 150, exp: 600, sparks: 20 },
    dropRar: 2, dropLv: 5,
  },
} as const satisfies Record<string, DungeonDef>;

// ---------- 팀 (teams 모듈: 위의 MODULES에는 없다. 시험이 GameOptions.modules로 고른다) ----------
/** 셋: 팀이 둘이 아닌 게임도 시험한다. 이름은 언어 파일 ui의 키 */
export const TEAMS: readonly TeamDef[] = [
  { id: 'red', color: 0xd04040, name: 'fxTeamRed' },
  { id: 'blue', color: 0x4060d0, name: 'fxTeamBlue' },
  { id: 'green', color: 0x40a040, name: 'fxTeamGreen' },
];
/** 시험이 규칙을 바꿔 가며 본다 (teams.test가 고쳤다가 되돌린다) */
export const TEAM_RULES: TeamRules = { balance: true, switch: true, persist: false };

// ---------- 약관·처리방침 (웹 출시의 바탕: engine/test/fx/web.test.ts가 동의를 시험한다) ----------
export const LEGAL = { terms: 'https://example.invalid/terms', privacy: 'fxPrivacyText', version: 'fx-2' };
