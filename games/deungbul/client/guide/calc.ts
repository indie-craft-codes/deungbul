// 도감의 계산: 내용 정의(shared/content)의 수치로 확률, 기대값, 범위를 구한다. 화면(DOM)도 문장도 모른다.
import {
  CAMPS, DROPS, DUNGEONS, ENHANCE, GEAR, GEAR_SLOTS, LEVEL, MONSTERS, RAID, RARITIES, RECIPES, RESPAWN_S, SHOP_STOCK, STATS, STAT_IDS, START_WEAPON,
  ITEMS, clearRar, gearScore, needFor, sellPrice, type Gear, type GearSlot, type ItemId, type MonsterDef, type MonsterId, type Stat,
} from '@engine/shared/defs';
import { zoneOf } from '@engine/shared/world';
import { optRange } from './rules';

export const MONSTER_IDS = Object.keys(MONSTERS) as MonsterId[];
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const DROP_IDS = Object.keys(DROPS) as MonsterId[];

export const avg = (r: readonly [number, number]): number => (r[0] + r[1]) / 2;

// ---------- 장비 ----------
/** 등급마다 나올 확률 (합은 1) */
export function rarityShares(): number[] {
  const sum = RARITIES.reduce((s, r) => s + r.weight, 0);
  return RARITIES.map((r) => r.weight / sum);
}
/** 가장 낮은 등급이 정해진 굴림(던전 보상)의 등급별 확률: 그보다 낮게 나온 것은 그 등급으로 올린다 */
export function raritySharesFrom(minRar: number): number[] {
  // 평소의 등급 확률을, 서버가 등급을 올리는 그 함수(clearRar)에 등급마다 넣어 옮겨 담는다
  const out = RARITIES.map(() => 0);
  rarityShares().forEach((p, rolled) => { out[clearRar({ dropRar: minRar }, rolled)] += p; });
  return out;
}

/** 장비 레벨의 범위 (가장 약한 몬스터와 가장 센 몬스터가 떨어뜨리는 것) */
export const GEAR_LV_MIN = GEAR.levelOf(0);
export const GEAR_LV_MAX = GEAR.levelOf(Number.MAX_SAFE_INTEGER);
export const gearLevels = (): number[] => Array.from({ length: GEAR_LV_MAX - GEAR_LV_MIN + 1 }, (_, i) => GEAR_LV_MIN + i);

/** 그 몬스터 한 마리가 (한 사람에게) 장비를 떨어뜨릴 확률 */
export const gearChance = (def: MonsterDef): number => (def.boss ? 1 : GEAR.dropChance);
/** 떨어진 장비가 그 칸일 확률 (칸은 고르게 나온다) */
export const slotChance = (): number => 1 / GEAR_SLOTS.length;

/** +from에서 +to까지 올리는 데 드는 골드의 기대값: 단계마다 (한 번의 값 ÷ 성공 확률)을 더한다 */
export function enhanceExpected(to: number, rar: number, from = 0): number {
  let sum = 0;
  for (let plus = from; plus < to; plus++) sum += ENHANCE.gold(plus, rar) / ENHANCE.rate(plus);
  return sum;
}
/** +from에서 +to까지 올리는 데 필요한 시도 횟수의 기대값 */
export function enhanceTries(to: number, from = 0): number {
  let sum = 0;
  for (let plus = from; plus < to; plus++) sum += 1 / ENHANCE.rate(plus);
  return sum;
}

/** 크기가 k인 부분집합 전부 */
function subsets<T>(list: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (list.length < k) return [];
  const [head, ...rest] = list;
  return [...subsets(rest, k - 1).map((s) => [head, ...s]), ...subsets(rest, k)];
}
/**
 * 그 등급·장비 레벨로 떨어진 장비(강화 0)의 파는 값 범위. 붙을 수 있는 옵션 조합을 모두 따져 가장 싼 것과 비싼 것을 구한다.
 * base가 있으면(무기, 갑옷) 바탕의 등급 값이 더해진다. 범위를 구하지 못하면 null
 */
export function sellRange(rar: number, lv: number, slot: GearSlot = 'ring', base?: ItemId): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (const set of subsets(STAT_IDS, Math.min(RARITIES[rar].opts, STAT_IDS.length))) {
    const ranges = set.map((s) => optRange(s, rar, lv));
    if (ranges.some((r) => !r)) return null; // 옵션 값의 범위를 구하지 못했다
    const make = (pick: 0 | 1): Gear => ({ uid: 0, slot, base, rar, lv, plus: 0, opts: set.map((s, i): [Stat, number] => [s, ranges[i]![pick]]) });
    lo = Math.min(lo, sellPrice(make(0))); hi = Math.max(hi, sellPrice(make(1)));
  }
  return [lo, hi];
}
/** 옵션 없는 기본 장비(보급형, 제작)의 파는 값 */
export const plainSell = (base: ItemId): number => {
  const def = ITEMS[base] as { kind: string; tier?: number };
  return sellPrice({ uid: 0, slot: def.kind === 'armor' ? 'armor' : 'weapon', base, rar: 0, lv: def.tier ?? 1, plus: 0, opts: [] });
};
/** 옵션 값 하나가 값어치(전투력, 파는 값)에 보태는 점수 */
export const scoreOf = (stat: Stat, value: number): number => gearScore({ uid: 0, slot: 'ring', rar: 0, lv: 1, plus: 0, opts: [[stat, value]] });
export const statBase = (stat: Stat): number => STATS[stat].base;

// ---------- 몬스터 ----------
export interface Habitat { zones: number[]; dungeons: string[]; raid: boolean }
/** 그 몬스터가 나오는 곳: 들판의 구역, 던전, 습격 */
export function habitat(id: MonsterId): Habitat {
  const zones = [...new Set(CAMPS.filter((c) => c.types.includes(id)).map((c) => zoneOf(c.x)))].sort();
  const dungeons = Object.entries(DUNGEONS).filter(([, d]) => d.boss.type === id || d.packs.some((p) => p.type === id)).map(([k]) => k);
  return { zones, dungeons, raid: RAID.types.includes(id) };
}
/** 들판에서 쓰러진 뒤 다시 나타나기까지(초). 들판에 살지 않으면 null (던전과 습격의 몬스터는 다시 나오지 않는다) */
export const respawnOf = (id: MonsterId): number | null => (habitat(id).zones.length ? (MONSTERS[id] as MonsterDef).respawn ?? RESPAWN_S : null);
/** 같은 것끼리 센다: ['a','a','b'] → [['a',2],['b',1]] */
export function tally<T>(list: readonly T[]): [T, number][] {
  const out = new Map<T, number>();
  for (const x of list) out.set(x, (out.get(x) ?? 0) + 1);
  return [...out];
}

// ---------- 습격 ----------
/** 적의 수가 한도에 닿는 인원 (적의 수와 등탑 내구의 식은 내용 정의에 있다: raidFoes, raidTowerHp) */
export const raidCapPlayers = (): number => Math.max(1, Math.ceil((RAID.max - RAID.base) / RAID.perPlayer));

// ---------- 레벨 ----------
/** 레벨 1에서 그 레벨이 될 때까지 모아야 하는 경험치의 합 */
export function expUpTo(lv: number): number {
  let sum = 0;
  for (let i = 1; i < lv; i++) sum += needFor(i);
  return sum;
}
/** 필요 경험치가 레벨마다 늘어나는 비율 (예: 0.35) */
export const levelGrowth = (): number => LEVEL.growth - 1;

// ---------- 아이템 ----------
/** 그 아이템을 얻는 길 */
export interface Sources { start: boolean; shop: boolean; craft: boolean; mat: MonsterId[]; gearLv: number[] }
export function sourcesOf(id: ItemId): Sources {
  const lvs = gearLevels();
  return {
    start: id === START_WEAPON,
    shop: SHOP_STOCK.includes(id) && ITEMS[id].price > 0,
    craft: RECIPES.some((r) => r.id === id),
    mat: DROP_IDS.filter((m) => DROPS[m]?.id === id),
    gearLv: lvs.filter((lv) => GEAR.weaponFor(lv) === id || GEAR.armorFor(lv) === id),
  };
}
/** 그 장비 레벨의 장비를 떨어뜨리는 몬스터 */
export const monstersOfGearLv = (lv: number): MonsterId[] => MONSTER_IDS.filter((m) => GEAR.levelOf(MONSTERS[m].exp) === lv);
