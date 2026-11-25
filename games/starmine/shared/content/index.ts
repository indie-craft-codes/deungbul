// 이 게임(별가루 광산)의 내용: 틀의 내용 계약(engine/shared/contract.ts)이 요구하는 이름들.
// 틀은 이 파일을 별칭 @game/shared/content로 읽는다. 틀에서는 타입만 가져온다 (값은 기본값 묶음 defaults에서만).
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { ForgeDef, Recipe } from '@engine/shared/defs/craft';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { DailyDef, Reward } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import { GEAR_BASE } from '@engine/shared/defaults';
import { DRILL } from './drill';

export * from '@engine/shared/defaults';
export const GUEST_NAME = 'Digger';

// ---------- 맵: 광산 앞 골짜기 하나 ----------
export const SHOPS: readonly { x: number; z: number }[] = [{ x: 6, z: 0 }];
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [
  { x: -18, z: 12, types: ['snail', 'snail', 'snail', 'snail'] },
  { x: 18, z: 14, types: ['bat', 'bat', 'snail', 'bat'] },
  { x: -22, z: -20, types: ['pebble', 'pebble', 'snail'] },
  { x: 24, z: -22, types: ['golem', 'pebble'] },
];
export const MAP: MapDef = {
  areas: [{ id: 'hollow', x0: -42, x1: 42, z0: -40, z1: 40 }],
  edge: 2,
  seed: 37,
  spawn: { x: 0, z: 3 },
  obstacles: [{ x: DRILL.x, z: DRILL.z, r: DRILL.r, tag: 'drill' }],
  scatter: [
    { kind: 'rock', count: 46, x0: -54, x1: 54, pad: 12, s0: 0.8, s1: 1.1 },
    { kind: 'tree', count: 30, x0: -54, x1: 54, pad: 12, s0: 0.6, s1: 0.5 },
  ],
  // 광산 입구 둘레와 몬스터가 사는 자리는 비워 둔다
  isFree: (x, z) => Math.hypot(x, z + 3) > 13 && CAMPS.every((c) => Math.hypot(x - c.x, z - c.z) > 8),
  portals: {},
  portalClear: 0,
};

// ---------- 직업과 기술: 여섯 효과를 모두 쓴다 ----------
export const SKILL_DEFS = {
  smash: { cd: 4, range: 2.9, effect: { kind: 'hit', dmg: [26, 34], stun: 1 } },
  tunnel: { cd: 7, range: 9, effect: { kind: 'dash', dist: 7, dmg: [16, 22] } },
  stoneskin: { cd: 18, effect: { kind: 'buff', mod: 'guard', value: 0.35, dur: 8 }, color: 0xb8a48a },
  starfall: { cd: 6, range: 11, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [18, 26], slow: 2 } },
  dust: { cd: 9, range: 11, radius: 3, effect: { kind: 'dot', dps: 7, dur: 5, area: true } },
  mend: { cd: 14, effect: { kind: 'heal', amount: 70 }, color: 0x9fd8ff },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  miner: { hp: 210, range: 2.3, basic: [10, 15], skills: ['smash', 'tunnel', 'stoneskin'], hand: 'pick' },
  seer: { hp: 165, range: 9, basic: [9, 13], skills: ['starfall', 'dust', 'mend'], hand: 'staff', shot: 'mote' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'miner';

// ---------- 몬스터 ----------
export const MONSTERS = {
  snail: { hp: 50, dmg: [2, 4], speed: 2.6, exp: 11, gold: [2, 5], aggro: 0, h: 1.2 },
  bat: { hp: 60, dmg: [3, 5], speed: 5.2, exp: 14, gold: [3, 6], aggro: 0, h: 1.6, behavior: 'flee', fleeAt: 0.35 },
  pebble: { hp: 90, dmg: [5, 8], speed: 3.6, exp: 22, gold: [5, 9], aggro: 9, h: 1.5, behavior: 'ranged', range: 8, shot: 'pebble' },
  golem: { hp: 340, dmg: [10, 15], speed: 3.0, exp: 75, gold: [15, 25], aggro: 6, h: 3.0, sparks: [3, 6] },
} as const satisfies Record<string, MonsterDef>;

// ---------- 아이템과 상점. 대장간과 제작은 없다 ----------
export const ITEMS = {
  pick1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  pick2: { kind: 'weapon', price: 70, damage: 1.25, tier: 2 },
  apron: { kind: 'armor', price: 80, guard: 0.88, tier: 1 },
  tea: { kind: 'potion', price: 10, heal: 80 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'pick1';
export const SHOP_STOCK: readonly ItemId[] = ['tea', 'pick2', 'apron'];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {};
export const FORGES: readonly ForgeDef[] = [];
export const RECIPES: readonly Recipe[] = [];
export const GEAR = { ...GEAR_BASE, weaponFor: (lv: number): ItemId => (lv >= 3 ? 'pick2' : 'pick1'), armorFor: (): ItemId => 'apron' };

// ---------- 날마다: 출석(이레째에 별가루)과 일일 임무. 'collect'는 이 게임의 채굴기가 센다 ----------
export const ATTEND: readonly Reward[] = [{ gold: 30 }, { gold: 40 }, { sparks: 20 }, { gold: 60 }, { gold: 80 }, { sparks: 40 }, { gold: 150, sparks: 60 }];
export const DAILIES = {
  kill20: { kind: 'kill', n: 20, r: { gold: 40, exp: 100 } },
  collect3: { kind: 'collect', n: 3, r: { gold: 30 } },
} as const satisfies Record<string, DailyDef>;

export const DUNGEONS = {} as const satisfies Record<string, DungeonDef>;
