// 이 게임(모닥불 사냥터)의 내용: 틀의 내용 계약(engine/shared/contract.ts)이 요구하는 이름들.
// 틀은 이 파일을 별칭 @game/shared/content로 읽는다. 틀에서는 타입만 가져온다 (값은 기본값 묶음 defaults에서만).
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { ForgeDef, Recipe } from '@engine/shared/defs/craft';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { DailyDef } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import { GEAR_BASE } from '@engine/shared/defaults';
import { BONFIRE } from './bonfire';

// 수치의 기본값(전투, 장비, 강화, 길드, 거래소 …)은 틀의 것을 그대로 받는다. 바꿀 이름만 아래에 직접 적는다
export * from '@engine/shared/defaults';
export const GUEST_NAME = 'Camper';

// ---------- 맵: 지역 하나 ----------
export const SHOPS: readonly { x: number; z: number }[] = [{ x: 3, z: 2 }];
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [
  { x: -22, z: 14, types: ['rabbit', 'rabbit', 'rabbit', 'rabbit'] },
  { x: 20, z: 18, types: ['boar', 'boar', 'boar'] },
  { x: -24, z: -22, types: ['rabbit', 'rabbit', 'boar'] },
  { x: 24, z: -24, types: ['bear', 'boar'] },
];
export const MAP: MapDef = {
  areas: [{ id: 'glade', x0: -40, x1: 40, z0: -40, z1: 40 }],
  edge: 2,
  seed: 11,
  spawn: { x: 0, z: 2 },
  obstacles: [{ x: BONFIRE.x, z: BONFIRE.z, r: BONFIRE.r, tag: 'bonfire' }],
  scatter: [
    { kind: 'tree', count: 70, x0: -52, x1: 52, pad: 12, s0: 0.8, s1: 0.7 },
    { kind: 'rock', count: 14, x0: -38, x1: 38, pad: -2, s0: 0.6, s1: 0.9 },
  ],
  // 야영지 둘레와 몬스터가 사는 자리는 비워 둔다
  isFree: (x, z) => Math.hypot(x, z) > 13 && CAMPS.every((c) => Math.hypot(x - c.x, z - c.z) > 8),
  portals: {},
  portalClear: 0,
};

// ---------- 직업과 기술 ----------
export const SKILL_DEFS = {
  chop: { cd: 4, range: 2.9, effect: { kind: 'hit', dmg: [26, 34] } },
  sweep: { cd: 8, radius: 4, effect: { kind: 'area', at: 'self', dmg: [13, 19] } },
  aim: { cd: 5, range: 11, effect: { kind: 'hit', dmg: [28, 38] } },
  snare: { cd: 9, range: 11, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [10, 15], slow: 3 } },
  rest: { cd: 15, effect: { kind: 'heal', amount: 60 }, color: 0x7fd68a },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  woodcutter: { hp: 200, range: 2.3, basic: [10, 15], skills: ['chop', 'sweep', 'rest'], hand: 'axe' },
  hunter: { hp: 170, range: 9, basic: [9, 13], skills: ['aim', 'snare', 'rest'], hand: 'bow', shot: 'arrow' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'woodcutter';

// ---------- 몬스터 ----------
export const MONSTERS = {
  rabbit: { hp: 45, dmg: [2, 4], speed: 4.0, exp: 10, gold: [2, 4], aggro: 0, h: 1.4 },
  boar: { hp: 110, dmg: [6, 9], speed: 4.6, exp: 24, gold: [5, 9], aggro: 6, h: 1.8 },
  bear: { hp: 320, dmg: [10, 15], speed: 3.8, exp: 70, gold: [15, 24], aggro: 7, h: 2.8 },
} as const satisfies Record<string, MonsterDef>;

// ---------- 아이템과 상점. 대장간과 제작은 없다 ----------
export const ITEMS = {
  axe1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  axe2: { kind: 'weapon', price: 60, damage: 1.25, tier: 2 },
  coat: { kind: 'armor', price: 80, guard: 0.88, tier: 1 },
  stew: { kind: 'potion', price: 12, heal: 80 },
  // 장작: 멧돼지와 곰이 떨어뜨리는 재료. 모닥불에 넣는다 (server/bonfire.ts)
  log: { kind: 'mat', price: 0 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'axe1';
export const SHOP_STOCK: readonly ItemId[] = ['stew', 'axe2', 'coat'];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {
  boar: { id: 'log', chance: 0.6 },
  bear: { id: 'log', chance: 1 },
};
export const FORGES: readonly ForgeDef[] = [];
export const RECIPES: readonly Recipe[] = [];
export const GEAR = { ...GEAR_BASE, weaponFor: (lv: number): ItemId => (lv >= 3 ? 'axe2' : 'axe1'), armorFor: (): ItemId => 'coat' };

// ---------- 일일 임무. 'feed'는 이 게임의 규칙이 센다 ----------
export const DAILIES = {
  kill20: { kind: 'kill', n: 20, r: { gold: 40, exp: 100 } },
  feed5: { kind: 'feed', n: 5, r: { gold: 30 } },
} as const satisfies Record<string, DailyDef>;

// ---------- 던전은 없다 ----------
export const DUNGEONS = {} as const satisfies Record<string, DungeonDef>;
