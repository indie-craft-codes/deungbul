// 버섯 동굴(cave)의 내용: 틀의 내용 계약이 요구하는 이름들. 틀에서는 타입만 가져온다 (값은 defaults에서만).
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { ForgeDef, Recipe } from '@engine/shared/defs/craft';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { DailyDef } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import { GEAR_BASE } from '@engine/shared/defaults';


// ---------- 쓸 모듈 (engine/shared/modules.ts) ----------
// 협동 던전: 틀의 모듈을 모두 쓴다 (거래소·길드도 메뉴에 그대로 있다)
import { RPG_MODULES } from '@engine/shared/modules';
export const MODULES = RPG_MODULES;
export const GUEST_NAME = 'Caver';

// ---------- 맵: 들판(버섯 굴) 하나와 던전(깊은 굴) 하나 ----------
/** 던전의 문: DungeonDef.portal과 MAP.portals에 같이 쓴다 */
export const DEEP_DOOR = { x: 0, z: -30 };
/** 캠프(야영 불빛): 일어나는 자리 */
export const CAMP = { x: 0, z: 4 };
export const SHOPS: readonly { x: number; z: number }[] = [{ x: 4, z: 2 }];
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [
  { x: -22, z: 14, types: ['sporeling', 'sporeling', 'sporeling'] },
  { x: 22, z: 16, types: ['puffcap', 'puffcap'] },
  { x: -22, z: -16, types: ['lurker', 'lurker'] },
  { x: 22, z: -18, types: ['puffcap', 'sporeling', 'lurker'] },
];
export const MAP: MapDef = {
  areas: [
    { id: 'hollow', x0: -40, x1: 40, z0: -40, z1: 40 },
    { id: 'deep', x0: 200, x1: 240, z0: -15, z1: 15 },
  ],
  edge: 2,
  seed: 31,
  spawn: { x: 0, z: 4 },
  obstacles: [],
  scatter: [
    { kind: 'tree', count: 50, x0: -52, x1: 52, pad: 12, s0: 0.8, s1: 0.7 },
    { kind: 'rock', count: 30, x0: -38, x1: 38, pad: -2, s0: 0.6, s1: 1.1 },
  ],
  isFree: (x, z) => Math.hypot(x, z) > 12 && CAMPS.every((c) => Math.hypot(x - c.x, z - c.z) > 8),
  portals: { deep: DEEP_DOOR },
  portalClear: 5,
};

// ---------- 직업과 기술 ----------
export const SKILL_DEFS = {
  smash: { cd: 4, range: 2.9, effect: { kind: 'hit', dmg: [26, 34], stun: 1 } },
  quake: { cd: 8, radius: 4, effect: { kind: 'area', at: 'self', dmg: [13, 19] } },
  glowshot: { cd: 5, range: 11, effect: { kind: 'hit', dmg: [28, 38] } },
  sporecloud: { cd: 9, range: 11, radius: 3.5, effect: { kind: 'dot', dps: 6, dur: 5, area: true } },
  mend: { cd: 15, effect: { kind: 'heal', amount: 60 }, color: 0x7fd68a },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  digger: { hp: 210, range: 2.3, basic: [10, 15], skills: ['smash', 'quake', 'mend'], hand: 'sword' },
  glimmer: { hp: 160, range: 9, basic: [9, 13], skills: ['glowshot', 'sporecloud', 'mend'], hand: 'staff', shot: 'bolt' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'digger';

// ---------- 몬스터: 달아나는 것, 쏘는 것, 게임이 등록한 싸우는 법(lunge) ----------
export const MONSTERS = {
  sporeling: { hp: 90, dmg: [2, 4], speed: 4.2, exp: 10, gold: [2, 4], aggro: 0, h: 1.2, behavior: 'flee', fleeAt: 0.5 },
  puffcap: { hp: 80, dmg: [4, 6], speed: 3.6, exp: 18, gold: [4, 7], aggro: 9, h: 1.8, behavior: 'ranged', range: 9, shot: 'spore' },
  lurker: { hp: 120, dmg: [7, 10], speed: 4.6, exp: 26, gold: [5, 9], aggro: 7, h: 1.6, behavior: 'lunge' },
  mycelord: { hp: 1400, dmg: [12, 18], speed: 3.4, exp: 400, gold: [80, 120], aggro: 10, h: 3.6, behavior: 'ranged', range: 8, shot: 'spore' },
} as const satisfies Record<string, MonsterDef>;

// ---------- 아이템과 상점 ----------
export const ITEMS = {
  pick1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  pick2: { kind: 'weapon', price: 60, damage: 1.25, tier: 2 },
  cap: { kind: 'armor', price: 80, guard: 0.88, tier: 1 },
  broth: { kind: 'potion', price: 12, heal: 80 },
  spore: { kind: 'mat', price: 0 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'pick1';
export const SHOP_STOCK: readonly ItemId[] = ['broth', 'pick2', 'cap'];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {
  puffcap: { id: 'spore', chance: 0.5 },
};
export const FORGES: readonly ForgeDef[] = [];
export const RECIPES: readonly Recipe[] = [];
export const GEAR = { ...GEAR_BASE, weaponFor: (lv: number): ItemId => (lv >= 3 ? 'pick2' : 'pick1'), armorFor: (): ItemId => 'cap' };

export const DAILIES = {
  kill15: { kind: 'kill', n: 15, r: { gold: 40, exp: 100 } },
} as const satisfies Record<string, DailyDef>;

export const DUNGEONS = {
  deep: {
    portal: DEEP_DOOR,
    entry: { x: 205, z: 0 },
    minLv: 1,
    perDay: 3,
    timeS: 600,
    exitS: 30,
    packs: [
      { type: 'lurker', x: 215, z: 0, n: 3 },
      { type: 'puffcap', x: 225, z: -6, n: 2 },
    ],
    boss: { type: 'mycelord', x: 234, z: 0 },
    reward: { gold: 120, exp: 400 },
    dropRar: 2, dropLv: 3,
  },
} as const satisfies Record<string, DungeonDef>;
