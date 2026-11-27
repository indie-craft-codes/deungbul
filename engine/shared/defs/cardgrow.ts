// 수집형 카드의 공통 손질 (HERO_RULES.cards: 게임이 적은 칸만 켜진다. 적지 않은 게임은 예전과 글자까지 같다. 조사와 표는 docs/collect-gaps.md).
//   넘친 조각  overflow   별(과 각성)이 최대인 카드가 받는 조각을 정한 비율로 아이템(메아리 계약 '메아리 결정')으로 바꾼다. 남은 조각도 [바꾸기]로
//   합성      fuse       같은 등급 카드의 조각을 need개 써서 한 단계 위 등급의 무작위 카드 하나. 확률은 확률표의 단일 원본(defs/odds.ts의 'fuse:<등급>' 표)
//   환원      reset      키운 레벨(과 기술 레벨)을 1로 되돌리고 쓴 값의 refund 비율을 돌려받는다. 별·각성은 되돌리지 않는다
//   잠금      lock       잠근 카드는 합성의 재료·환원에서 빠진다
//   일괄 성장  bulk       레벨을 여러 번(최대까지) 한꺼번에, 올릴 수 있는 별을 모두
//   추천 편성  auto       편성 탭의 [추천 편성]: 전투력이 큰 카드부터 빈 자리를 채운다 (화면의 셈: 서버는 편성 명령 그대로)
// 범용 조각(선택 조각)은 재료 교환(HERO_RULES.trade)의 칸 only(등급)로 한다: 그 등급의 카드에만 쓰는 아이템 (engine/shared/defs/collect.ts의 HeroTrade).
// 서버(engine/server/game/systems/cardgrow.ts)와 화면(engine/client/hud/cardgrow.ts)이 여기의 함수로만 셈한다.
import { BANNERS, HERO_RULES as HERO_RULES_IN } from '../content';
import { heroDef, heroIds, type BannerDef, type HeroRules, type OwnedHero } from './collect';
import { awakenMax, awakenOf, skillOf, type HeroCost } from './herogrow';
import type { OddsTableDef } from './odds';

const HR: HeroRules = HERO_RULES_IN;

/** 카드의 공통 손질 (HERO_RULES.cards) */
export interface CardRules {
  /** 넘친 조각: 다 키운 카드의 조각 하나를 rate(등급)개의 item으로 (소수는 버린다). 아이템은 가방에 (한도를 넘는 몫은 조각으로 남는다) */
  overflow?: { item: string; rate: (rarity: number) => number };
  /**
   * 합성: from 등급(없으면 가장 높은 등급을 뺀 모두)의 카드의 조각 need(등급)개 → 한 단계 위 등급의 카드 하나 (pool: 뽑기 판에 있는 그 등급의 카드, 같은 확률).
   * 조각은 잠그지 않은 그 등급의 카드에서, 다 키운 카드 → 조각이 많은 카드 차례로 가져간다. names: 표의 이름(문장 키, 등급마다). 없으면 틀의 '카드 합성'
   */
  fuse?: { need: (rarity: number) => number; from?: readonly number[]; names?: readonly string[] };
  /** 환원: 레벨(과 기술 레벨)을 1로 되돌리고 그동안 쓴 값의 refund(0~1) 비율을 돌려준다 (1이면 무료 초기화). 별·각성·조각은 그대로 */
  reset?: { refund: number };
  /** 잠금 (합성의 재료·환원에서 빠진다) */
  lock?: boolean;
  /** 일괄 성장 (레벨 n번·최대까지, 별 모두) */
  bulk?: boolean;
  /** 편성 탭의 추천 편성 단추 */
  auto?: boolean;
}

/** 내용의 카드 손질 (없으면 null) */
export const cardRules = (): CardRules | null => HR.cards ?? null;
/** 일괄 성장의 한 번에 올리는 레벨의 상한 (최대까지도 이 수 안에서) */
export const BULK_MAX = 100;

/** 다 키운 카드인가: 별이 최대이고, 각성이 있는 게임이면 각성도 최대 (더 받는 조각이 쓸모없다) */
export const cardMaxed = (h: Pick<OwnedHero, 'stars' | 'awaken'>): boolean => h.stars >= HR.maxStars && (!HR.awaken || awakenOf(h) >= awakenMax());
/** 넘친 조각 n개를 바꾼 수 (넘친 조각이 꺼져 있으면 0) */
export function overflowGot(rarity: number, n: number): number {
  const o = cardRules()?.overflow;
  return o && n > 0 ? Math.max(0, Math.floor(n * Math.max(0, o.rate(rarity)))) : 0;
}

// ---------- 합성 ----------
/** 합성할 수 있는 등급들 (한 단계 위 등급에 카드가 있어야 한다) */
export function fuseFrom(): number[] {
  const f = cardRules()?.fuse;
  if (!f) return [];
  const all = heroIds().map((id) => heroDef(id).rarity), top = Math.max(-1, ...all);
  const list = f.from ?? Array.from({ length: Math.max(0, top) }, (_, i) => i);
  return list.filter((r) => r >= 0 && r < top && fusePool(r + 1).length > 0);
}
/** 합성이 주는 카드들 (그 등급의, 뽑기 판에 무게가 있는 카드. 배너가 없는 게임은 그 등급의 카드 모두) */
export function fusePool(rarity: number): string[] {
  const banners: readonly BannerDef[] = Object.values(BANNERS as Readonly<Record<string, BannerDef>>);
  const inPool = new Set(banners.flatMap((b) => b.pool.filter((s) => s.w > 0).map((s) => s.hero)));
  return heroIds().filter((id) => heroDef(id).rarity === rarity && (!banners.length || inPool.has(id)));
}
/** 합성 한 번의 조각 (그 등급) */
export const fuseNeed = (rarity: number): number => Math.max(1, Math.floor(cardRules()?.fuse?.need(rarity) ?? 1));
/** 합성 표의 id */
export const fuseTableId = (rarity: number): string => `fuse:${rarity}`;
/** 합성의 확률표 (그 등급에서 한 단계 위의 카드마다 같은 확률). 합성이 없거나 줄 카드가 없으면 null */
export function fuseTable(rarity: number): OddsTableDef | null {
  if (!fuseFrom().includes(rarity)) return null;
  const pool = fusePool(rarity + 1), p = 1 / pool.length;
  return {
    id: fuseTableId(rarity), kind: 'combine', name: cardRules()?.fuse?.names?.[rarity] ?? 'oddsFuse',
    steps: [{ key: `r${rarity}`, when: [{ k: 'base' }], outcomes: pool.map((id) => ({ id, p, r: rarity + 1 })) }],
  };
}
/** 합성의 표 모두 */
export const fuseTables = (): OddsTableDef[] => fuseFrom().flatMap((r) => { const t = fuseTable(r); return t ? [t] : []; });
/**
 * 합성 한 번에 조각을 가져갈 카드와 수 (그 등급, 잠그지 않은 카드): 다 키운 카드 먼저, 그다음 조각이 많은 카드부터. 모자라면 null.
 * heroes는 id → 카드, locked는 잠근 카드
 */
export function fusePick(rarity: number, heroes: Readonly<Record<string, Pick<OwnedHero, 'stars' | 'shards' | 'awaken'>>>, locked: (id: string) => boolean): [string, number][] | null {
  let left = fuseNeed(rarity);
  const ids = Object.keys(heroes).filter((id) => heroDef(id)?.rarity === rarity && !locked(id) && heroes[id].shards > 0)
    .sort((a, b) => Number(cardMaxed(heroes[b])) - Number(cardMaxed(heroes[a])) || heroes[b].shards - heroes[a].shards || a.localeCompare(b));
  const out: [string, number][] = [];
  for (const id of ids) {
    if (left <= 0) break;
    const n = Math.min(left, heroes[id].shards);
    out.push([id, n]); left -= n;
  }
  return left > 0 ? null : out;
}
/** 그 등급의 합성에 쓸 수 있는 조각의 합 (잠그지 않은 카드) */
export function fuseHave(rarity: number, heroes: Readonly<Record<string, Pick<OwnedHero, 'shards'>>>, locked: (id: string) => boolean): number {
  return Object.keys(heroes).filter((id) => heroDef(id)?.rarity === rarity && !locked(id)).reduce((s, id) => s + heroes[id].shards, 0);
}

// ---------- 환원 ----------
/** 레벨 1에서 lv까지 쓴 값 (레벨 업의 재화) */
export function levelSpent(id: string, lv: number): number {
  let n = 0;
  const r = heroDef(id)?.rarity ?? 0;
  for (let x = 1; x < lv; x++) n += Math.max(0, HR.levelCost(x, r));
  return n;
}
/** 환원이 돌려줄 것: 재화(레벨 업·기술의 재화)와 재료. 비율의 소수는 버린다. 되돌릴 것이 없으면 null */
export function resetBack(id: string, h: Pick<OwnedHero, 'lv' | 'skill'>): { cur: Record<string, number>; items: Record<string, number> } | null {
  const rule = cardRules()?.reset;
  if (!rule || !heroDef(id)) return null;
  const sk = HR.skill ? skillOf(h) : 1;
  if (h.lv <= 1 && sk <= 1) return null;
  const k = Math.max(0, Math.min(1, rule.refund)), cur: Record<string, number> = {}, items: Record<string, number> = {};
  const add = (c: HeroCost) => {
    if (c.cur && c.n && c.n > 0) cur[c.cur] = (cur[c.cur] ?? 0) + c.n;
    for (const [it, n] of Object.entries(c.items ?? {})) if (n > 0) items[it] = (items[it] ?? 0) + n;
  };
  add({ cur: HR.levelCur, n: levelSpent(id, h.lv) });
  if (HR.skill) for (let x = 1; x < sk; x++) add(HR.skill.cost(x, heroDef(id).rarity));
  const scale = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).map(([key, n]) => [key, Math.floor(n * k)] as const).filter(([, n]) => n > 0));
  return { cur: scale(cur), items: scale(items) };
}

// ---------- 일괄 성장 ----------
/** 레벨을 n번(상한까지) 올리면: 오를 레벨의 수와 그 값. money는 가진 재화 (모자라면 살 수 있는 만큼) */
export function bulkLevel(id: string, lv: number, stars: number, n: number, money: number): { n: number; cost: number } {
  const max = HR.maxLv(stars), r = heroDef(id)?.rarity ?? 0;
  let k = 0, cost = 0;
  while (k < Math.min(n, BULK_MAX) && lv + k < max) {
    const c = HR.levelCost(lv + k, r);
    if (cost + c > money) break;
    cost += c; k++;
  }
  return { n: k, cost };
}
/** 조각으로 올릴 수 있는 별의 수와 쓸 조각 */
export function bulkStars(stars: number, shards: number): { n: number; cost: number } {
  let k = 0, cost = 0;
  while (stars + k < HR.maxStars) {
    const c = HR.starCost(stars + k);
    if (cost + c > shards) break;
    cost += c; k++;
  }
  return { n: k, cost };
}

/** 추천 편성: 가진 카드를 전투력이 큰 차례로 size개 (같으면 등급, id) */
export function autoSquad(power: Readonly<Record<string, number>>, size: number): string[] {
  return Object.keys(power).sort((a, b) => power[b] - power[a] || (heroDef(b)?.rarity ?? 0) - (heroDef(a)?.rarity ?? 0) || a.localeCompare(b)).slice(0, Math.max(0, size));
}
