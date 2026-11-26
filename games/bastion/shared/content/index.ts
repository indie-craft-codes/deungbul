// 이 게임(돌담 마을)의 내용: 틀의 내용 계약(engine/shared/contract.ts)이 요구하는 이름들.
// 틀은 이 파일을 별칭 @game/shared/content로 읽는다. 틀에서는 타입만 가져온다 (값은 기본값 묶음 defaults에서만).
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';
import type { ForgeDef, Recipe } from '@engine/shared/defs/craft';
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import type { DailyDef } from '@engine/shared/defs/growth';
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { MapDef } from '@engine/shared/defs/map';
import type { MonsterDef, MonsterId } from '@engine/shared/defs/monsters';
import { CHANNEL as CHANNEL_BASE, GEAR_BASE } from '@engine/shared/defaults';
import { WALL, WELL } from './waves';


// ---------- 쓸 모듈 (engine/shared/modules.ts) ----------
// 마을 방어: 거래소·길드는 쓰지 않고(예전에는 메뉴에서 감추기만 했다) 던전이 없다
import type { ModuleId } from '@engine/shared/modules';
export const MODULES: readonly ModuleId[] = ['economy', 'growth', 'classes', 'combat', 'build', 'items', 'gear', 'mail', 'daily', 'idle', 'party', 'rank', 'away'];
export const GUEST_NAME = 'Villager';
/** 채널은 하나: 마을과 우물은 하나뿐이고 모두가 같은 물결을 함께 막는다 */
export const CHANNEL = { ...CHANNEL_BASE, count: 1 };

// ---------- 맵: 돌담 마을과 바깥 들 ----------
export const SHOPS: readonly { x: number; z: number }[] = [{ x: 5, z: -4 }];
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [
  { x: -30, z: 28, types: ['sludge', 'sludge', 'sludge'] },
  { x: 30, z: -28, types: ['burrower', 'burrower', 'sludge'] },
];
/** 문(동서남북) 자리가 아닌가: 돌담의 기둥은 문 자리를 비운다 */
const notGate = (a: number) => { const k = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2); return k > WALL.gateHalf && k < Math.PI / 2 - WALL.gateHalf; };
const POSTS = Array.from({ length: Math.round((Math.PI * 2) / WALL.step) }, (_, i) => i * WALL.step).filter(notGate)
  .map((a) => ({ x: WELL.x + Math.cos(a) * WALL.r, z: WELL.z + Math.sin(a) * WALL.r, r: WALL.post, tag: 'wall' }));
export const MAP: MapDef = {
  areas: [{ id: 'village', x0: -45, x1: 45, z0: -45, z1: 45 }],
  edge: 2,
  seed: 23,
  spawn: { x: 0, z: 4 },
  obstacles: [{ x: WELL.x, z: WELL.z, r: WELL.r, tag: 'well' }, ...POSTS],
  scatter: [
    { kind: 'tree', count: 60, x0: -56, x1: 56, pad: 12, s0: 0.8, s1: 0.8 },
    { kind: 'rock', count: 16, x0: -42, x1: 42, pad: -2, s0: 0.6, s1: 0.9 },
  ],
  // 마을과 담 바깥 둘레, 네 문으로 오는 길, 무리의 자리는 비워 둔다
  isFree: (x, z) => Math.hypot(x, z) > 20 && Math.abs(x) > 5 && Math.abs(z) > 5 && CAMPS.every((c) => Math.hypot(x - c.x, z - c.z) > 8),
  portals: {},
  portalClear: 0,
};

// ---------- 직업과 기술: 둘 다 범위, 느려짐·기절, 강화를 하나씩 ----------
export const SKILL_DEFS = {
  bash: { cd: 5, range: 2.9, effect: { kind: 'hit', dmg: [24, 32], stun: 1.5 } },
  quake: { cd: 9, radius: 4.5, effect: { kind: 'area', at: 'self', dmg: [14, 20], slow: 2 } },
  rally: { cd: 22, radius: 7, effect: { kind: 'buff', mod: 'damage', value: 0.4, dur: 8, allies: true }, color: 0xffc85a },
  needle: { cd: 4, range: 11, effect: { kind: 'hit', dmg: [26, 36] } },
  spore: { cd: 9, range: 11, radius: 4, effect: { kind: 'area', at: 'target', dmg: [12, 18], slow: 4 } },
  bark: { cd: 24, radius: 7, effect: { kind: 'buff', mod: 'guard', value: 0.35, dur: 10, allies: true }, color: 0x9ad06a },
} as const satisfies Record<string, SkillDef>;
export const CLASSES = {
  warden: { hp: 220, range: 2.3, basic: [11, 16], skills: ['bash', 'quake', 'rally'], hand: 'sword' },
  herbalist: { hp: 170, range: 9, basic: [9, 13], skills: ['needle', 'spore', 'bark'], hand: 'staff', shot: 'bolt' },
} as const satisfies Record<string, ClassDef>;
export const DEFAULT_CLASS: ClassId = 'warden';

// ---------- 몬스터: 물결로 몰려오고, 바깥 들에도 조금 산다 ----------
export const MONSTERS = {
  sludge: { hp: 60, dmg: [3, 5], speed: 3.6, exp: 12, gold: [2, 4], aggro: 6, h: 1.3 },
  burrower: { hp: 45, dmg: [4, 6], speed: 5.2, exp: 14, gold: [3, 5], aggro: 6, h: 1.2 },
  // 멀리서 독침을 뱉는다 (틀의 싸우는 법 'ranged', 날아가는 것은 화면의 registerShot('spit'))
  spitter: { hp: 70, dmg: [5, 8], speed: 3.4, exp: 18, gold: [4, 6], aggro: 8, h: 1.4, behavior: 'ranged', range: 8, shot: 'spit' },
  brute: { hp: 260, dmg: [10, 14], speed: 2.6, exp: 50, gold: [10, 16], aggro: 6, h: 2.4 },
} as const satisfies Record<string, MonsterDef>;

// ---------- 아이템과 상점 ----------
export const ITEMS = {
  blade1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  blade2: { kind: 'weapon', price: 70, damage: 1.3, tier: 2 },
  vest: { kind: 'armor', price: 80, guard: 0.88, tier: 1 },
  tea: { kind: 'potion', price: 10, heal: 70 },
} as const satisfies Record<string, ItemDef>;
export const START_WEAPON: ItemId = 'blade1';
export const SHOP_STOCK: readonly ItemId[] = ['tea', 'blade2', 'vest'];
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {};
export const FORGES: readonly ForgeDef[] = [];
export const RECIPES: readonly Recipe[] = [];
export const GEAR = { ...GEAR_BASE, weaponFor: (lv: number): ItemId => (lv >= 3 ? 'blade2' : 'blade1'), armorFor: (): ItemId => 'vest' };

// ---------- 일일 임무. 'wave'는 이 게임의 규칙이 센다 ----------
export const DAILIES = {
  kill20: { kind: 'kill', n: 20, r: { gold: 40, exp: 100 } },
  defend1: { kind: 'wave', n: 1, r: { gold: 50 } },
} as const satisfies Record<string, DailyDef>;

export const DUNGEONS = {} as const satisfies Record<string, DungeonDef>;
