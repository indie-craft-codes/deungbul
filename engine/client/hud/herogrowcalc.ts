// 영웅의 성장 화면의 셈 (영웅 상세의 탭들, 영웅 장비 창과 강화, 편성의 진형과 시너지): 화면 요소도 three.js도 읽지 않는다 (시험 engine/test/collect/client.test.ts가 그대로 읽는다).
// 그리는 것은 hud/herogrow.ts. 능력치·전투력·시너지·진형은 서버와 같은 셈(engine/shared/defs/herogrow.ts)이다: 화면의 전투력과 서버의 편성 전투력이 같다.
import {
  HERO_IDS, HERO_RULES, SQUAD_RULES, arrangeRows, awakenBonus, awakenMax, gearChance, gearMaxLv, gearOn, gearStats, growthOf, heroDef, heroFull, heroGearDef, heroGearPower, heroGearRules,
  heroRole, heroStats, setBonuses, skillMax, skillMul, squadView, synergyDef,
  type AwakenStep, type HeroBonus, type HeroCost, type HeroFull, type HeroGearPiece, type HeroRules, type HeroesMe, type SquadRules, type SynergyMe,
} from '../../shared/defs';

/** 내용의 규칙 (게임이 적은 타입 그대로 오므로 선택 칸을 읽으려고 틀의 타입으로 넓힌다) */
const HR: HeroRules = HERO_RULES;
const SR: SquadRules = SQUAD_RULES;

/** 영웅 상세의 탭: 레벨, 별, 각성(켠 게임), 기술(켠 게임), 장비(herogear를 고르고 표가 있는 게임) */
export type DetailTab = 'level' | 'star' | 'awaken' | 'skill' | 'gear';
export function detailTabs(gearModule: boolean): DetailTab[] {
  return ['level', 'star', ...(HR.awaken ? ['awaken' as const] : []), ...(HR.skill ? ['skill' as const] : []), ...(gearModule && heroGearRules() ? ['gear' as const] : [])];
}

/** 값의 한 칸: 재화, 재료, 조각과 필요한 수·가진 수 */
export interface CostPart { kind: 'cur' | 'item' | 'shards'; id: string; need: number; have: number; ok: boolean }
/** 재화와 재료를 가진 것 (화면의 내 상태에서) */
export interface Wallet { gold: number; sparks: number; items: Readonly<Record<string, number>> }
export function costParts(c: HeroCost | undefined, w: Wallet, shards?: { id: string; need: number; have: number }): CostPart[] {
  const out: CostPart[] = [];
  if (shards && shards.need > 0) out.push({ kind: 'shards', id: shards.id, need: shards.need, have: shards.have, ok: shards.have >= shards.need });
  if (c?.cur && c.n && c.n > 0) { const have = c.cur === 'gold' ? w.gold : w.sparks; out.push({ kind: 'cur', id: c.cur, need: c.n, have, ok: have >= c.n }); }
  for (const [id, n] of Object.entries(c?.items ?? {})) if (n > 0) { const have = w.items[id] ?? 0; out.push({ kind: 'item', id, need: n, have, ok: have >= n }); }
  return out;
}
const allOk = (parts: readonly CostPart[]) => parts.every((x) => x.ok);

/** 영웅 상세의 모습: 지금의 최종 값(장비까지, 시너지는 편성 탭에서), 레벨·별·각성·기술의 다음 단계와 값, 누를 수 있는가 */
export interface HeroDetail {
  id: string; owned: boolean; rarity: number;
  lv: number; maxLv: number; stars: number; maxStars: number; shards: number;
  full: HeroFull;
  /** 장비 없이 (레벨·별만의 바탕) */
  base: { atk: number; hp: number };
  level: { cost: CostPart[]; can: boolean; max: boolean };
  star: { cost: CostPart[]; can: boolean; max: boolean };
  awaken: { on: boolean; n: number; max: number; mul: number; needStars: boolean; next: AwakenStep | null; cost: CostPart[]; can: boolean; passives: { name: string; bonus: HeroBonus }[] };
  skill: { on: boolean; has: string; lv: number; max: number; pct: number; nextPct: number; cost: CostPart[]; can: boolean };
}
export function heroDetail(id: string, me: HeroesMe, gear: readonly HeroGearPiece[], w: Wallet): HeroDetail {
  const d = heroDef(id), t = me[id], owned = !!t, h = growthOf(t ?? [1, 1, 0]);
  const maxLv = HR.maxLv(h.stars), full = heroFull(id, h, gearOn(gear, id));
  const levelMax = h.lv >= maxLv, starMax = h.stars >= HR.maxStars;
  const level = levelMax ? [] : costParts({ cur: HR.levelCur, n: HR.levelCost(h.lv, d.rarity) }, w);
  const star = starMax ? [] : costParts(undefined, w, { id, need: HR.starCost(h.stars), have: h.shards });
  const aw = Math.min(h.awaken ?? 0, awakenMax()), next = HR.awaken?.steps[aw] ?? null, a = awakenBonus(aw);
  const needStars = h.stars < HR.maxStars;
  const awCost = next ? costParts(next.cost, w, { id, need: next.shards, have: h.shards }) : [];
  const sk = h.skill ?? 1, skMax = skillMax(h.stars, aw), role = heroRole(id).skill ?? '';
  const skCost = HR.skill && sk < skMax ? costParts(HR.skill.cost(sk, d.rarity), w) : [];
  const pct = (lv: number) => Math.round((skillMul(lv) - 1) * 100);
  return {
    id, owned, rarity: d.rarity, lv: h.lv, maxLv, stars: h.stars, maxStars: HR.maxStars, shards: h.shards, full, base: heroStats(id, h.lv, h.stars),
    level: { cost: level, can: owned && !levelMax && allOk(level), max: levelMax },
    star: { cost: star, can: owned && !starMax && allOk(star), max: starMax },
    awaken: { on: !!HR.awaken, n: aw, max: awakenMax(), mul: a.mul, needStars, next, cost: awCost, can: owned && !!next && !needStars && allOk(awCost), passives: a.passives },
    skill: { on: !!HR.skill, has: role, lv: sk, max: skMax, pct: pct(sk), nextPct: pct(sk + 1), cost: skCost, can: owned && !!HR.skill && !!role && sk < skMax && allOk(skCost) },
  };
}

// ---------- 영웅 장비 ----------
/** 장비 창의 한 줄 */
export interface GearRow { uid: number; id: string; lv: number; hero: string; slot: string; rarity: number; set: string; atk: number; hp: number; power: number; maxLv: number }
export function gearRow(x: HeroGearPiece): GearRow {
  const d = heroGearDef(x.id), s = gearStats(x.id, x.lv);
  return { uid: x.uid, id: x.id, lv: x.lv, hero: x.hero, slot: d?.slot ?? '', rarity: d?.rarity ?? 0, set: d?.set ?? '', atk: s.atk, hp: s.hp, power: heroGearPower(x.id, x.lv), maxLv: gearMaxLv(x.id) };
}
/** 장비 창의 줄들: 칸의 차례, 그 안에서 등급·강화가 높은 것부터 */
export function gearRows(all: readonly HeroGearPiece[]): GearRow[] {
  const slots = (heroGearRules()?.slots ?? []).map((s) => s.id);
  return all.map(gearRow).sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot) || b.rarity - a.rarity || b.power - a.power || a.uid - b.uid);
}
/** 영웅의 장비 탭: 칸마다 낀 것과 낄 수 있는 것(다른 영웅이 낀 것도: 끼면 그 영웅에게서 빠진다. 전투력이 큰 것부터) */
export function slotViews(hero: string, all: readonly HeroGearPiece[]): { slot: string; name: string; worn: GearRow | null; pick: GearRow[] }[] {
  return (heroGearRules()?.slots ?? []).map((s) => {
    const rows = all.map(gearRow).filter((r) => r.slot === s.id);
    return { slot: s.id, name: s.name, worn: rows.find((r) => r.hero === hero) ?? null, pick: rows.filter((r) => r.hero !== hero).sort((a, b) => b.power - a.power || a.uid - b.uid) };
  });
}
/** 그 영웅의 세트: 세트마다 낀 수와 단들(켜졌는가) */
export function setViews(hero: string, all: readonly HeroGearPiece[]): { set: string; name: string; n: number; tiers: { n: number; bonus: HeroBonus; on: boolean }[] }[] {
  const sets = heroGearRules()?.sets ?? {};
  return setBonuses(gearOn(all, hero)).map((s) => ({ set: s.set, name: sets[s.set].name, n: s.n, tiers: sets[s.set].tiers.map((t) => ({ n: t.n, bonus: t.bonus, on: s.n >= t.n })) }));
}
/** 강화 창: 지금과 다음의 공격·체력, 값, 확률, 누를 수 있는가 */
export interface EnhanceView { max: boolean; now: { atk: number; hp: number }; next: { atk: number; hp: number }; cost: CostPart[]; chance: number; can: boolean }
export function enhanceView(x: HeroGearPiece, w: Wallet): EnhanceView {
  const r = heroGearRules(), d = heroGearDef(x.id), max = x.lv >= gearMaxLv(x.id);
  const cost = !max && r && d ? costParts(r.enhance.cost(x.lv, d.rarity), w) : [];
  return { max, now: gearStats(x.id, x.lv), next: gearStats(x.id, max ? x.lv : x.lv + 1), cost, chance: gearChance(x.id, x.lv), can: !max && allOk(cost) };
}

// ---------- 진형과 시너지 ----------
/** 편성 탭의 진형: 앞줄과 뒷줄(편성의 차례), 그 자리 수 (진형이 없으면 null) */
export function formation(ids: readonly string[], back: readonly string[]): { front: string[]; back: string[]; frontMax: number; backMax: number } | null {
  const rows = SR.rows;
  if (!rows) return null;
  const b = arrangeRows(ids, back);
  return { front: ids.filter((id) => !b.includes(id)), back: b, frontMax: rows.front, backMax: rows.back };
}
/** 그 영웅의 줄을 바꾼 뒷줄 목록 (옮겨 갈 줄이 가득이면 그대로) */
export function toggleRow(ids: readonly string[], back: readonly string[], id: string): string[] {
  const rows = SR.rows, cur = arrangeRows(ids, back);
  if (!rows || !ids.includes(id)) return cur;
  const toBack = !cur.includes(id), front = ids.length - cur.length;
  if (toBack ? cur.length >= rows.back : front >= rows.front) return cur;
  return arrangeRows(ids, toBack ? [...cur, id] : cur.filter((x) => x !== id));
}
/** 편성 탭의 시너지: 내용의 시너지마다 이름, 편성의 수, 단들(켜졌는가). 편성에 그 태그가 없는 것도 (가진 영웅에 그 태그가 있으면) 보인다 */
export function synergyRows(syn: readonly SynergyMe[], owned: readonly string[]): { tag: string; name: string; n: number; tier: number; tiers: { n: number; bonus: HeroBonus; on: boolean }[] }[] {
  const tags = [...new Set([...syn.map((s) => s.tag), ...owned.map((id) => heroDef(id)?.tag ?? '').filter((t) => !!synergyDef(t))])];
  return tags.map((tag) => {
    const def = synergyDef(tag)!, s = syn.find((x) => x.tag === tag), n = s?.n ?? 0, tier = s?.tier ?? -1;
    return { tag, name: def.name, n, tier, tiers: def.tiers.map((t, i) => ({ n: t.n, bonus: t.bonus, on: i === tier })) };
  }).sort((a, b) => b.tier - a.tier || b.n - a.n || a.tag.localeCompare(b.tag));
}
/** 그 영웅의 태그 (없으면 '') */
export const heroTag = (id: string): string => heroDef(id)?.tag ?? '';
/** 화면에서 셈한 편성의 전투력: 서버의 개인 상태 squad.power와 같다 (같은 squadView) */
export const squadPowerOf = (me: HeroesMe, ids: readonly string[], back: readonly string[], gear: readonly HeroGearPiece[]): number =>
  squadView(ids, back, Object.fromEntries(Object.entries(me).map(([id, t]) => [id, growthOf(t)])), gear).power;
/** 영웅 하나의 전투력 (장비·각성·기술 레벨까지): 영웅 탭과 상세가 쓴다 */
export const heroPowerOf = (id: string, me: HeroesMe, gear: readonly HeroGearPiece[]): number => { const t = me[id]; return t ? heroFull(id, growthOf(t), gearOn(gear, id)).power : 0; };
/** 영웅의 수 (가진 것과 없는 것) */
export const heroCount = (): number => HERO_IDS.length;
