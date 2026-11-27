// 수집형·방치형 화면의 셈 (영웅 탭, 뽑기의 확률표, 편성, 단계 막대, 던전 열쇠): 화면 요소도 three.js도 읽지 않는다 (시험 engine/test/collect/client.test.ts가 그대로 읽는다).
// 그리는 것은 hud/collect.ts(메뉴 탭과 영웅의 겉모습)와 hud/stagebar.ts(단계 막대). 확률은 서버와 같은 셈(engine/shared/defs/collect.ts)이다.
import {
  BANNER_TABLE, heroIds, HERO_RARITIES, HERO_RULES, STAGES, gearOn, growthOf, heroDef, heroFull, heroTradeShards, heroTrades, rarityDef, rarityOdds, waveCount, BANNER_IDS, effectiveOdds, pityKey, pityMates, pullOdds, stageSweepable, sweepMax,
  type BannerDef, type HeroGearPiece, type HeroesMe, type Odds, type Reward, type StageMe, type StageRun, type GachaMe, type SweepRule,
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

/**
 * 영웅 탭의 줄들: 가진 영웅이 먼저(등급이 높은 것부터, 전투력이 큰 것부터), 그다음 없는 영웅(등급이 높은 것부터). money는 레벨 업에 치를 재화의 보유량.
 * 공격·체력·전투력은 서버와 같은 heroFull(각성·기술 레벨, gear를 주면 낀 영웅 장비까지)이다: 성장이 없는 게임에서는 heroStats·heroPower와 같다
 */
export function heroRows(me: HeroesMe, money: number, squad: readonly string[] = [], gear: readonly HeroGearPiece[] = []): HeroRow[] {
  const rows = heroIds().map((id): HeroRow => {
    const d = heroDef(id), h = me[id], owned = !!h;
    const lv = h?.[0] ?? 1, stars = h?.[1] ?? rarityDef(d.rarity).stars, shards = h?.[2] ?? 0;
    const maxLv = HERO_RULES.maxLv(stars), s = heroFull(id, h ? growthOf(h) : { lv, stars }, gearOn(gear, id));
    const starNeed = stars >= HERO_RULES.maxStars ? 0 : HERO_RULES.starCost(stars);
    const levelCost = lv >= maxLv ? 0 : HERO_RULES.levelCost(lv, d.rarity);
    return {
      id, owned, rarity: d.rarity, lv, maxLv, stars, shards, starNeed, atk: s.atk, hp: s.hp, power: s.power, levelCost,
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
/**
 * 배너의 공개 확률표 전부: 등급별, 영웅별, 천장에 닿은 뽑기, 10번 뽑기의 열째(보장). 합은 언제나 1이다.
 * 픽업이 있으면 픽업의 줄(평소·확정의 확률, 실효 확률)과 확정일 때의 표(sure)도. 모든 표는 서버가 뽑는 셈(pullOdds) 그대로다
 */
export interface RateTable {
  rarity: { rarity: number; p: number }[];
  heroes: RateRow[];
  pity: RateRow[];
  ten: RateRow[];
  /** 픽업: 영웅, 등급, 그 등급 안의 몫, 평소의 확률, 확정일 때의 확률, 실효 확률(천장·반반 포함, 1번 뽑기의 오랜 평균). 없으면 null */
  pickup: { hero: string; rarity: number; share: number; p: number; sureP: number; effective: number } | null;
  /** 반반에서 진 다음(확정)의 확률표 (반반이 없으면 빈 목록) */
  sure: RateRow[];
  /** 영웅마다의 실효 확률 (천장이나 픽업이 있을 때. 없으면 빈 목록: 평소의 확률과 같다) */
  effective: RateRow[];
}
const byRate = (a: Odds, c: Odds) => c.rarity - a.rarity || c.p - a.p || a.hero.localeCompare(c.hero);
/** 실효 확률은 셈이 조금 무거워 배너마다 한 번만 (내용은 바뀌지 않는다) */
const effCache = new Map<BannerDef, Odds[]>();
export function rateTable(b: BannerDef): RateTable {
  const odds = pullOdds(b);
  const pk = b.pickup ? odds.find((o) => o.hero === b.pickup!.hero) : undefined;
  let eff = effCache.get(b);
  if (!eff && (b.pity || pk)) effCache.set(b, eff = effectiveOdds(b));
  const sure = b.fiftyFifty && pk ? pullOdds(b, -1, true) : [];
  return {
    rarity: rarityOdds(odds).map((p, rarity) => ({ rarity, p })).filter((x) => x.p > 0).reverse(),
    heroes: [...odds].sort(byRate),
    pity: b.pity ? [...pullOdds(b, b.pity.rarity)].sort(byRate) : [],
    ten: b.tenAtLeast !== undefined ? [...pullOdds(b, b.tenAtLeast)].sort(byRate) : [],
    pickup: pk ? { hero: pk.hero, rarity: pk.rarity, share: pk.p / odds.filter((o) => o.rarity === pk.rarity).reduce((s, o) => s + o.p, 0), p: pk.p, sureP: sure.find((o) => o.hero === pk.hero)?.p ?? pk.p, effective: eff?.find((o) => o.hero === pk.hero)?.p ?? pk.p } : null,
    sure: [...sure].sort(byRate),
    effective: eff ? [...eff].sort(byRate) : [],
  };
}
/**
 * 뽑기 탭에 보일 배너 (BANNERS의 차례): 서버가 열린 배너(GachaMe.open)를 보냈으면 그것만, 아직 받지 않았으면 기간이 없는 배너만.
 * 기간이 있는 배너가 없는 게임(서버가 open을 보내지 않는다)은 모두다 (예전과 같다)
 */
export function openBanners(me: Pick<GachaMe, 'open'> | null): string[] {
  const open = me?.open;
  return BANNER_IDS.filter((id) => (open ? Object.hasOwn(open, id) : BANNER_TABLE[id].start === undefined && BANNER_TABLE[id].end === undefined));
}
/** 배너의 천장 상태: 지금 셈(무리면 함께 센 것), 반반의 확정, 천장을 함께 쓰는 다른 배너들 */
export function bannerPity(id: string, me: Pick<GachaMe, 'pity' | 'sure'> | null): { count: number; sure: boolean; mates: string[] } {
  const key = pityKey(id);
  return { count: me?.pity[key] ?? 0, sure: !!me?.sure?.[key], mates: pityMates(id).filter((x) => x !== id) };
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
  // 대기실(모드의 단계 모드: 몬스터 없이 서 있다)은 단계 밖처럼 보인다
  if (!r || r.state === 'lobby') {
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

// ---------- 단계 밖: 메뉴에서 던전 들어가기, 재료로 영웅 키우기, 돌아왔을 때의 창 ----------
/** 메뉴에서 들어가는 던전의 한 줄: 남은 열쇠(또는 오늘 남은 횟수)와 그 상한, 들어갈 수 있는가와 못 들어가는 까닭 (lv: 레벨이 모자람, none: 열쇠·횟수가 없음, in: 이미 던전 안) */
export interface DungeonGoView { n: number; cap: number; key: boolean; can: boolean; why: '' | 'lv' | 'none' | 'in' }
/**
 * 메뉴의 던전 줄 (DungeonDef.fromMenu): 열쇠 던전은 내 열쇠(keys), 하루 횟수 던전은 오늘 쓴 횟수(used)로 셈한다. lv는 내 레벨, inside는 지금 던전 안인가.
 * 서버(dungeon.ts의 go)가 막는 것과 같은 조건이다: 레벨, 열쇠나 횟수, 던전 안
 */
export function dungeonGoView(def: Pick<DungeonDef, 'key' | 'minLv' | 'perDay'>, id: string, keys: KeysMe | null, used: number, lv: number, inside: boolean): DungeonGoView {
  const k = keyView(def, id, keys);
  const n = k ? k.n : Math.max(0, def.perDay - used), cap = k ? k.cap : def.perDay;
  const why = inside ? 'in' : lv < def.minLv ? 'lv' : n <= 0 ? 'none' : '';
  return { n, cap, key: !!k, can: why === '', why };
}

/** 재료 교환의 단추 하나 (HERO_RULES.trade): 아이템, 한 번에 드는 수, 얻는 조각, 가진 수, 지금 할 수 있는가 */
export interface TradeView { item: string; cost: number; shards: number; have: number; can: boolean }
/** 그 영웅에게 쓸 수 있는 재료 교환들 (가진 영웅만: 없으면 빈 목록). items는 내 가방의 아이템 수 */
export function tradeViews(id: string, owned: boolean, items: Readonly<Record<string, number>>): TradeView[] {
  const d = heroDef(id);
  if (!owned || !d) return [];
  return Object.entries(heroTrades()).flatMap(([item, t]) => {
    const cost = Math.floor(t.cost(d.rarity)), shards = heroTradeShards(t, d.rarity), have = items[item] ?? 0;
    return cost > 0 && shards > 0 ? [{ item, cost, shards, have, can: have >= cost }] : [];
  });
}

/** 돌아왔을 때의 창에 보일 줄: 재화(보상에 적힌 차례)와 아이템, 장비 수 (0인 것은 빼고) */
export function idleBackLines(r: Reward): { what: string; n: number }[] {
  const out: { what: string; n: number }[] = [];
  for (const [k, n] of Object.entries(r)) if (typeof n === 'number' && n > 0) out.push({ what: k, n });
  for (const [id, n] of Object.entries(r.items ?? {})) if (n > 0) out.push({ what: id, n });
  if (r.gear?.length) out.push({ what: 'gear', n: r.gear.length });
  return out;
}
