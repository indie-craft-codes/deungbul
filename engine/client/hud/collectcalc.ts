// 수집형·방치형 화면의 셈 (영웅 탭, 뽑기의 확률표, 편성, 단계 막대, 던전 열쇠): 화면 요소도 three.js도 읽지 않는다 (시험 engine/test/collect/client.test.ts가 그대로 읽는다).
// 그리는 것은 hud/collect.ts(메뉴 탭과 영웅의 겉모습)와 hud/stagebar.ts(단계 막대). 확률은 서버와 같은 셈(engine/shared/defs/collect.ts)이다.
import {
  BANNER_TABLE, HERO_IDS, HERO_RARITIES, HERO_RULES, STAGES, bannerOdds, heroDef, heroPower, heroStats, pityOdds, poolOdds, rarityDef, rarityOdds, stageSweepable, sweepMax, waveCount,
  type BannerDef, type HeroesMe, type Odds, type StageMe, type StageRun, type SweepRule,
} from '../../shared/defs';
import type { KeysMe } from '../../shared/defs/collect';
import type { DungeonDef } from '../../shared/defs/dungeons';

/** 영웅 탭의 한 줄 */
export interface HeroRow {
  id: string; owned: boolean; rarity: number; lv: number; maxLv: number; stars: number; shards: number;
  /** 별을 올리는 데 드는 조각 (별이 최대면 0) */
  starNeed: number;
  atk: number; hp: number; power: number;
  /** 레벨 업의 값 (최대 레벨이면 0) */
  levelCost: number;
  canLevel: boolean; canStar: boolean;
  /** 편성에 들어 있다 */
  inSquad: boolean;
}

/** 영웅 탭의 줄들: 가진 영웅이 먼저(등급이 높은 것부터, 전투력이 큰 것부터), 그다음 없는 영웅(등급이 높은 것부터). money는 레벨 업에 치를 재화의 보유량 */
export function heroRows(me: HeroesMe, money: number, squad: readonly string[] = []): HeroRow[] {
  const rows = HERO_IDS.map((id): HeroRow => {
    const d = heroDef(id), h = me[id], owned = !!h;
    const lv = h?.[0] ?? 1, stars = h?.[1] ?? rarityDef(d.rarity).stars, shards = h?.[2] ?? 0;
    const maxLv = HERO_RULES.maxLv(stars), s = heroStats(id, lv, stars);
    const starNeed = stars >= HERO_RULES.maxStars ? 0 : HERO_RULES.starCost(stars);
    const levelCost = lv >= maxLv ? 0 : HERO_RULES.levelCost(lv, d.rarity);
    return {
      id, owned, rarity: d.rarity, lv, maxLv, stars, shards, starNeed, atk: s.atk, hp: s.hp, power: heroPower(id, lv, stars), levelCost,
      canLevel: owned && levelCost > 0 && money >= levelCost, canStar: owned && starNeed > 0 && shards >= starNeed, inSquad: squad.includes(id),
    };
  });
  return rows.sort((a, b) => Number(b.owned) - Number(a.owned) || b.rarity - a.rarity || b.power - a.power || a.id.localeCompare(b.id));
}

/** 편성에서 그 영웅을 넣거나 뺀 새 목록 (가득 차 있으면 넣지 않는다: 그대로 돌려준다) */
export function squadToggle(ids: readonly string[], id: string, size: number): string[] {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return ids.length >= size ? [...ids] : [...ids, id];
}

/** 확률표의 한 줄 (공개용): 영웅, 등급, 확률(0~1) */
export type RateRow = Odds;
/** 배너의 공개 확률표 전부: 등급별, 영웅별, 천장에 닿은 뽑기, 10번 뽑기의 열째(보장). 합은 언제나 1이다 */
export interface RateTable {
  rarity: { rarity: number; p: number }[];
  heroes: RateRow[];
  pity: RateRow[];
  ten: RateRow[];
}
export function rateTable(b: BannerDef): RateTable {
  const odds = bannerOdds(b);
  return {
    rarity: rarityOdds(odds).map((p, rarity) => ({ rarity, p })).filter((x) => x.p > 0).reverse(),
    heroes: [...odds].sort((a, c) => c.rarity - a.rarity || c.p - a.p),
    pity: [...pityOdds(b)].sort((a, c) => c.rarity - a.rarity || c.p - a.p),
    ten: b.tenAtLeast !== undefined ? [...poolOdds(b.pool, b.tenAtLeast)].sort((a, c) => c.rarity - a.rarity || c.p - a.p) : [],
  };
}
/** 배너 id → 정의 (없으면 undefined) */
export const bannerOf = (id: string): BannerDef | undefined => BANNER_TABLE[id];
/** 등급의 수 */
export const RARITY_COUNT = HERO_RARITIES.length;

/** 단계 막대: 단계 id, 장 번호, 물결의 글(지금/전체), 이 물결의 진행(0~1), 우두머리 물결인가, 상태 */
export interface StageBar { id: string; ch: number; wave: number; waves: number; progress: number; boss: boolean; state: StageRun['state'] | 'out'; left: number }
export function stageBar(me: StageMe | null): StageBar | null {
  if (!me) return null;
  const r = me.run;
  if (!r) {
    const ref = STAGES.find((s) => s.id === me.cur) ?? STAGES[0];
    return ref ? { id: ref.id, ch: ref.ch, wave: 0, waves: waveCount(ref.def), progress: 0, boss: false, state: 'out', left: 0 } : null;
  }
  const ref = STAGES.find((s) => s.id === r.id);
  // 이 물결의 진행: 잡은 수 / 나온 수. 물결 사이(gap)와 깸은 가득
  const progress = r.state === 'clear' ? 1 : r.total > 0 ? (r.total - r.foes) / r.total : 0;
  return { id: r.id, ch: ref?.ch ?? 0, wave: Math.min(r.waves, r.wave + 1), waves: r.waves, progress: Math.max(0, Math.min(1, progress)), boss: r.boss, state: r.state, left: r.left };
}
/** 막대의 칸들: 물결마다 하나 (지난 것 1, 지금 것 진행, 남은 것 0). 우두머리 칸은 boss */
export function stageSegments(bar: StageBar): { fill: number; boss: boolean }[] {
  const ref = STAGES.find((s) => s.id === bar.id);
  const hasBoss = !!ref?.def.boss;
  return Array.from({ length: bar.waves }, (_, i) => {
    const now = bar.wave - 1;
    const fill = bar.state === 'clear' ? 1 : bar.state === 'out' ? 0 : i < now ? 1 : i === now ? bar.progress : 0;
    return { fill, boss: hasBoss && i === bar.waves - 1 };
  });
}

/** 단계 탭의 한 줄: id, 장, 깼는가, 갈 수 있는가(깬 단계와 그다음), 지금 단계인가, 권장 전투력, 소탕할 수 있는가(깼고 소탕이 되는 단계) */
export interface StageRow { id: string; ch: number; cleared: boolean; open: boolean; now: boolean; rec: number; boss: boolean; sweep: boolean }
export function stageRows(me: StageMe | null): StageRow[] {
  const best = me ? STAGES.findIndex((s) => s.id === me.best) : -1;
  return STAGES.map((s) => ({ id: s.id, ch: s.ch, cleared: s.i <= best, open: s.i <= best + 1, now: !!me && s.id === (me.run?.id ?? me.cur), rec: s.def.rec, boss: !!s.def.boss, sweep: s.i <= best && stageSweepable(s) }));
}

/**
 * 소탕 단추의 셈: 한 번의 값(무엇을 몇 개), 가진 것, 지금 할 수 있는 횟수(값·열쇠·한 번의 상한으로), 단추의 횟수들(×1과 할 수 있는 만큼).
 * have: 값으로 치르는 재화나 아이템의 가진 수, keys: 열쇠 던전이면 가진 열쇠 (단계는 무한). rule이 없으면 null (소탕이 없다)
 */
export interface SweepView { what: string; need: number; have: number; can: number; max: number; counts: number[] }
export function sweepView(rule: SweepRule | undefined, have: number, keys = Infinity): SweepView | null {
  if (!rule) return null;
  const c = rule.cost, need = c && c.n > 0 ? Math.ceil(c.n) : 0, what = c ? ('item' in c ? c.item : c.cur) : '';
  const max = sweepMax(rule), can = Math.max(0, Math.min(max, need > 0 ? Math.floor(have / need) : Infinity, keys));
  return { what, need, have, can, max, counts: can > 1 ? [1, can] : max > 1 ? [1, max] : [1] };
}

/** 던전 창의 열쇠 줄: 가진 수, 상한, 날마다 채워지는 수, 살 수 있으면 값과 오늘 남은 수 */
export interface KeyView { n: number; cap: number; refill: number; buy: { cur: string; cost: number; left: number } | null }
export function keyView(def: Pick<DungeonDef, 'key'>, id: string, keys: KeysMe | null): KeyView | null {
  const k = def.key;
  if (!k) return null;
  const mine = keys?.[id] ?? { n: Math.min(k.refill, k.cap), bought: 0 };
  return { n: mine.n, cap: k.cap, refill: k.refill, buy: k.buy ? { cur: k.buy.cur, cost: k.buy.cost, left: Math.max(0, k.buy.perDay - mine.bought) } : null };
}
