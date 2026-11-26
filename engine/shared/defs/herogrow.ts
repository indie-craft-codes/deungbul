// 영웅의 성장 (수집형의 선택 칸): 영웅 장비(herogear 모듈), 기술 레벨, 각성, 시너지(같은 진영), 진형(앞줄·뒷줄), 그리고 한 가지 전투력 셈.
// 모두 게임이 내용에 적어야 켜진다: HERO_RULES.skill · awaken · gear · power, HeroDef.tag, SQUAD_RULES.synergy · rows. 적지 않은 게임은 예전과 글자까지 같다.
// 서버(engine/server/game/systems/roster.ts, squad.ts, herogear.ts)와 화면(engine/client/hud/herogrow*.ts)이 여기의 함수로만 셈한다:
// 영웅의 최종 능력치(heroFull), 편성의 시너지·전투력(squadView), 진형(arrangeRows)은 이 한 곳의 셈이라 화면과 서버가 어긋날 수 없다.
import { HERO_RULES as HERO_RULES_IN, SQUAD_RULES as SQUAD_RULES_IN } from '../content';
import { heroDef, heroStats, type Coin, type HeroRules, type OwnedHero, type SquadRules } from './collect';
import type { Reward } from './growth';

// 게임의 내용은 자기 타입 그대로 오므로(engine/shared/content.ts) 선택 칸을 읽으려면 틀의 타입으로 넓혀 읽는다
const HR: HeroRules = HERO_RULES_IN;
const SR: SquadRules = SQUAD_RULES_IN;

/** 능력치에 더하는 덤: 공격·체력에 더하는 수(atk, hp), 비율(atkPct, hpPct: 0.1이면 +10%), 주는 피해(dmg: 0.1이면 +10%), 받는 피해를 줄이는 비율(guard: 0.2면 −20%) */
export interface HeroBonus { atk?: number; hp?: number; atkPct?: number; hpPct?: number; dmg?: number; guard?: number }
/** 성장의 값: 재화(cur, n)와 가방의 재료(items: 아이템 id → 수). 모두 치를 수 있어야 치른다 */
export interface HeroCost { cur?: Coin; n?: number; items?: Readonly<Record<string, number>> }

/** 기술 레벨 (HERO_RULES.skill): 역할의 기술(HeroRoleDef.skill)을 재료로 올린다 */
export interface HeroSkillRules {
  /** 그 별·각성에서 오를 수 있는 기술 레벨의 상한 */
  maxLv: (stars: number, awaken: number) => number;
  /** 지금 기술 레벨에서 하나 올리는 값 (지금 레벨, 등급 번호) */
  cost: (lv: number, rarity: number) => HeroCost;
  /** 기술 레벨 하나마다 기술의 피해·회복이 늘어나는 비율 (0.1이면 레벨마다 +10%: 전투의 기술 배율 skillScale에 곱한다) */
  per: number;
}
/** 각성 한 단계: 별이 최대인 영웅이 조각(shards)과 값(cost)을 치르고 오른다 */
export interface AwakenStep {
  /** 치르는 조각 (그 영웅의 것) */
  shards: number;
  /** 함께 치르는 재화·재료 (없으면 조각만) */
  cost?: HeroCost;
  /** 이 단계의 공격·체력 배율 (누적이 아니라 이 단계에서의 값: 1.1, 1.2 …) */
  mul: number;
  /** 이 단계에서 열리는 패시브: 이름의 문장 키와 덤. 열린 패시브는 뒤의 단계에서도 남는다 */
  passive?: { name: string; bonus: HeroBonus };
}
/** 각성 (HERO_RULES.awaken) */
export interface HeroAwakenRules { steps: readonly AwakenStep[] }

/** 영웅 장비의 칸 하나: id와 이름의 문장 키 */
export interface HeroGearSlotDef { id: string; name: string }
/** 영웅 장비 하나 (표의 id로 저장된다) */
export interface HeroGearDef {
  /** 이름의 문장 키 */
  name: string;
  /** 칸 (HeroGearRules.slots의 id) */
  slot: string;
  /** 등급 번호 (HERO_RARITIES의 차례: 색과 이름을 같이 쓴다) */
  rarity: number;
  /** 강화 0의 공격·체력 */
  atk?: number; hp?: number;
  /** 세트 (HeroGearRules.sets의 id) */
  set?: string;
}
/** 세트: 같은 영웅이 같은 세트를 n개 이상 끼면 그 단의 덤 (2세트·4세트 …). 여러 단이 함께 켜진다 */
export interface HeroGearSetDef { name: string; tiers: readonly { n: number; bonus: HeroBonus }[] }
/** 떨어지는 표: chance의 확률로 n번(기본 1) 무게(w)대로 하나씩 */
export interface HeroGearDrop { chance: number; n?: number; pool: readonly { id: string; w: number }[] }
/** 영웅 장비 (HERO_RULES.gear: herogear 모듈이 읽는다) */
export interface HeroGearRules {
  slots: readonly HeroGearSlotDef[];
  items: Readonly<Record<string, HeroGearDef>>;
  sets?: Readonly<Record<string, HeroGearSetDef>>;
  enhance: {
    /** 강화의 상한 (등급 번호) */
    max: (rarity: number) => number;
    /** 지금 강화에서 하나 올리는 값 */
    cost: (lv: number, rarity: number) => HeroCost;
    /** 강화 하나마다 바탕 공격·체력이 늘어나는 비율 */
    per: number;
    /** 성공 확률 (없으면 늘 성공). 실패해도 값은 치르고 강화는 그대로 */
    chance?: (lv: number, rarity: number) => number;
  };
  /** 분해하면 받는 것 (없으면 분해가 없다) */
  salvage?: (rarity: number, lv: number) => Reward;
  /** 가질 수 있는 장비의 수 (낀 것 포함). 가득 차면 떨어진 것을 줍지 못한다 */
  bag: number;
  /** 떨어지는 곳: 단계를 깰 때(단계 id, 없으면 '*')와 던전을 끝낼 때(던전 id, 없으면 '*') */
  drops?: { stage?: Readonly<Record<string, HeroGearDrop>>; dungeon?: Readonly<Record<string, HeroGearDrop>> };
}

/** 진형 (SQUAD_RULES.rows): 앞줄과 뒷줄의 자리 수, 앞줄이 몬스터를 끄는 거리, 줄마다의 덤(싸움에서만: 전투력에는 넣지 않는다) */
export interface SquadRowRules {
  front: number; back: number;
  /** 앞줄 영웅은 이 거리(m) 안에서 주인이나 뒷줄을 노리는 몬스터를 자기에게 돌린다 (0이면 끌지 않는다) */
  taunt: number;
  frontBonus?: HeroBonus; backBonus?: HeroBonus;
}
/** 시너지 하나 (SQUAD_RULES.synergy의 키가 HeroDef.tag): 편성에 그 태그의 영웅이 n 이상이면 그 단의 덤. 가장 높은 단 하나만 켜진다 */
export interface SynergyDef {
  /** 이름의 문장 키 */
  name: string;
  tiers: readonly { n: number; bonus: HeroBonus }[];
  /** 덤을 편성 모두가 받는다 (없으면 그 태그의 영웅만) */
  all?: boolean;
}
/** 전투력 셈에 넘기는 것 (HERO_RULES.power): 최종 공격·체력·주는 피해·받는 피해와 성장의 단계들 */
export interface PowerIn { atk: number; hp: number; dmg: number; guard: number; lv: number; stars: number; awaken: number; skill: number; rarity: number; gear: number }

/** 영웅 장비 한 점 (사람마다): 번호, 표의 id, 강화, 낀 영웅(없으면 '') */
export interface HeroGearPiece { uid: number; id: string; lv: number; hero: string }
/** 개인 상태 'hgear': 가진 장비 [번호, id, 강화, 낀 영웅]과 가질 수 있는 수 */
export interface HeroGearMe { items: [uid: number, id: string, lv: number, hero: string][]; cap: number }
/** 켜진 시너지 하나 (개인 상태 'squad'의 syn): 태그, 편성의 그 태그 수, 켜진 단의 번호(−1이면 아직) */
export interface SynergyMe { tag: string; n: number; tier: number }

// ---------- 켜졌는가 ----------
/** 영웅 장비의 표 (없으면 null) */
export const heroGearRules = (): HeroGearRules | null => HR.gear ?? null;
/** 기술 레벨·각성이 켜졌는가 (개인 상태 heroes와 저장의 칸이 길어진다) */
export const heroGrowthOn = (): boolean => !!HR.skill || !!HR.awaken;
/** 영웅의 성장을 하나라도 켰는가 (화면의 '자세히'와 영웅 상세 창) */
export const heroDetailOn = (gearModule: boolean): boolean => heroGrowthOn() || (gearModule && !!heroGearRules());

// ---------- 덤 ----------
export const NO_BONUS: Readonly<Required<HeroBonus>> = { atk: 0, hp: 0, atkPct: 0, hpPct: 0, dmg: 0, guard: 0 };
/** 덤들을 더한다 (guard는 곱으로 합친다: 0.2와 0.2면 0.36) */
export function sumBonus(list: readonly (HeroBonus | undefined)[]): Required<HeroBonus> {
  const o = { ...NO_BONUS };
  let keep = 1;
  for (const b of list) {
    if (!b) continue;
    o.atk += b.atk ?? 0; o.hp += b.hp ?? 0; o.atkPct += b.atkPct ?? 0; o.hpPct += b.hpPct ?? 0; o.dmg += b.dmg ?? 0;
    if (b.guard) keep *= 1 - Math.min(0.9, b.guard);
  }
  o.guard = 1 - keep;
  return o;
}
/** 덤의 칸 가운데 0이 아닌 것들 (화면의 글) */
export const bonusParts = (b: HeroBonus): [keyof HeroBonus, number][] => (Object.keys(NO_BONUS) as (keyof HeroBonus)[]).filter((k) => !!b[k]).map((k) => [k, b[k]!]);

// ---------- 영웅 하나의 성장 단계 ----------
export const skillOf = (h: Pick<OwnedHero, 'skill'>): number => Math.max(1, h.skill ?? 1);
export const awakenOf = (h: Pick<OwnedHero, 'awaken'>): number => Math.max(0, h.awaken ?? 0);
/** 그 별·각성의 기술 레벨 상한 (기술 레벨이 꺼져 있으면 1) */
export const skillMax = (stars: number, awaken: number): number => (HR.skill ? Math.max(1, Math.floor(HR.skill.maxLv(stars, awaken))) : 1);
/** 각성의 단계 수 (꺼져 있으면 0) */
export const awakenMax = (): number => HR.awaken?.steps.length ?? 0;
/** 각성의 공격·체력 배율과 열린 패시브들 */
export function awakenBonus(aw: number): { mul: number; passives: { name: string; bonus: HeroBonus }[] } {
  const steps = HR.awaken?.steps ?? [];
  const n = Math.min(aw, steps.length);
  return { mul: n > 0 ? steps[n - 1].mul : 1, passives: steps.slice(0, n).flatMap((s) => (s.passive ? [s.passive] : [])) };
}
/** 기술의 피해·회복에 곱하는 기술 레벨의 배율 */
export const skillMul = (skill: number): number => 1 + (HR.skill?.per ?? 0) * (Math.max(1, skill) - 1);

// ---------- 영웅 장비 ----------
export const heroGearDef = (id: string): HeroGearDef | undefined => { const r = heroGearRules(); return r && Object.hasOwn(r.items, id) ? r.items[id] : undefined; };
export const isHeroGearId = (v: unknown): v is string => typeof v === 'string' && !!heroGearDef(v);
/** 강화한 장비 한 점의 공격·체력: 바탕 × (1 + per × 강화) */
export function gearStats(id: string, lv: number): { atk: number; hp: number } {
  const d = heroGearDef(id), k = 1 + (heroGearRules()?.enhance.per ?? 0) * Math.max(0, lv);
  return d ? { atk: Math.round((d.atk ?? 0) * k), hp: Math.round((d.hp ?? 0) * k) } : { atk: 0, hp: 0 };
}
/** 장비 한 점의 전투력 (영웅과 같은 무게: 공격 × 4 + 체력 ÷ 2). 장비 창의 견주기에 쓴다 */
export const heroGearPower = (id: string, lv: number): number => { const s = gearStats(id, lv); return Math.round(s.atk * 4 + s.hp / 2); };
/** 강화의 상한 */
export const gearMaxLv = (id: string): number => { const d = heroGearDef(id), r = heroGearRules(); return d && r ? Math.max(0, Math.floor(r.enhance.max(d.rarity))) : 0; };
/** 강화의 성공 확률 (0~1) */
export const gearChance = (id: string, lv: number): number => { const d = heroGearDef(id), c = heroGearRules()?.enhance.chance; return d && c ? Math.max(0, Math.min(1, c(lv, d.rarity))) : 1; };
/** 그 영웅이 낀 장비 */
export const gearOn = <T extends Pick<HeroGearPiece, 'hero'>>(all: readonly T[], hero: string): T[] => all.filter((x) => x.hero === hero);
/** 켜진 세트들: 세트마다 낀 수와 켜진 단들 */
export function setBonuses(worn: readonly Pick<HeroGearPiece, 'id'>[]): { set: string; n: number; on: { n: number; bonus: HeroBonus }[] }[] {
  const sets = heroGearRules()?.sets ?? {}, count = new Map<string, number>();
  for (const x of worn) { const s = heroGearDef(x.id)?.set; if (s && Object.hasOwn(sets, s)) count.set(s, (count.get(s) ?? 0) + 1); }
  return [...count].map(([set, n]) => ({ set, n, on: sets[set].tiers.filter((t) => n >= t.n) }));
}

// ---------- 시너지와 진형 ----------
const SYN: Readonly<Record<string, SynergyDef>> = SR.synergy ?? {};
/** 편성의 시너지: 시너지마다 그 태그의 수와 켜진 단(가장 높은 것 하나, 없으면 −1). 편성에 그 태그가 하나라도 있는 것만 */
export function synergyOf(ids: readonly string[]): SynergyMe[] {
  const out: SynergyMe[] = [];
  for (const [tag, def] of Object.entries(SYN)) {
    const n = ids.filter((id) => heroDef(id)?.tag === tag).length;
    if (!n) continue;
    let tier = -1;
    def.tiers.forEach((t, i) => { if (n >= t.n) tier = i; });
    out.push({ tag, n, tier });
  }
  return out;
}
export const synergyDef = (tag: string): SynergyDef | undefined => (Object.hasOwn(SYN, tag) ? SYN[tag] : undefined);
/** 그 영웅이 시너지에서 받는 덤들 */
export function synergyFor(id: string, syn: readonly SynergyMe[]): HeroBonus[] {
  const tag = heroDef(id)?.tag;
  return syn.filter((s) => s.tier >= 0 && (SYN[s.tag].all || s.tag === tag)).map((s) => SYN[s.tag].tiers[s.tier].bonus);
}
/**
 * 진형: 편성(ids)과 뒷줄에 두고 싶은 영웅(back)으로 실제 뒷줄을 정한다 (편성의 차례로). 진형이 없으면 늘 빈 목록.
 * 한 줄이 넘치면 넘친 영웅(그 줄의 뒤쪽)을 다른 줄의 빈자리로 옮긴다
 */
export function arrangeRows(ids: readonly string[], back: readonly string[]): string[] {
  const rows = SR.rows;
  if (!rows) return [];
  const b = ids.filter((id) => back.includes(id)), f = ids.filter((id) => !back.includes(id));
  while (f.length > rows.front && b.length < rows.back) b.push(f.pop()!);
  while (b.length > rows.back && f.length < rows.front) f.push(b.pop()!);
  return ids.filter((id) => b.includes(id));
}
/** 그 영웅의 줄의 덤 (진형이 없으면 없다) */
export const rowBonus = (id: string, back: readonly string[]): HeroBonus | undefined => (SR.rows ? (back.includes(id) ? SR.rows.backBonus : SR.rows.frontBonus) : undefined);

// ---------- 최종 능력치와 전투력 ----------
/** 영웅 하나의 최종 값: 공격·체력(장비·각성·패시브·세트·시너지까지), 주는 피해·받는 피해의 덤, 기술 레벨과 그 배율, 각성, 전투력 */
export interface HeroFull { atk: number; hp: number; dmg: number; guard: number; skill: number; skillMul: number; awaken: number; power: number }
/** 기본 전투력: (공격 × 4 × (1 + 주는 피해) + 체력 ÷ 2 ÷ (1 − 받는 피해)) × (1 + 기술 레벨의 배율 덤의 반). 성장이 하나도 없으면 heroPower와 같다 */
export function defaultPower(x: PowerIn): number {
  const sk = skillMul(x.skill) - 1;
  return Math.round((x.atk * 4 * (1 + x.dmg) + x.hp / 2 / (1 - Math.min(0.9, x.guard))) * (1 + sk / 2));
}
type Growth = Pick<OwnedHero, 'lv' | 'stars'> & Partial<Pick<OwnedHero, 'skill' | 'awaken'>>;
/**
 * 영웅 하나의 최종 값. worn은 그 영웅이 낀 장비, extra는 편성의 덤(시너지). 바탕은 heroStats(레벨과 별)이고:
 * 공격 = (바탕 × 각성 배율 + 장비의 공격 + 덤의 공격) × (1 + 덤의 공격 비율). 체력도 같다. 성장이 하나도 없으면 heroStats·heroPower와 같다
 */
export function heroFull(id: string, h: Growth, worn: readonly Pick<HeroGearPiece, 'id' | 'lv'>[] = [], extra: readonly (HeroBonus | undefined)[] = []): HeroFull {
  const base = heroStats(id, h.lv, h.stars), aw = Math.min(awakenOf(h), awakenMax()), skill = HR.skill ? skillOf(h) : 1;
  const a = awakenBonus(aw);
  const b = sumBonus([...a.passives.map((p) => p.bonus), ...setBonuses(worn).flatMap((s) => s.on.map((t) => t.bonus)), ...extra]);
  let gAtk = 0, gHp = 0;
  for (const x of worn) { const s = gearStats(x.id, x.lv); gAtk += s.atk; gHp += s.hp; }
  const atk = Math.round((base.atk * a.mul + gAtk + b.atk) * (1 + b.atkPct)), hp = Math.round((base.hp * a.mul + gHp + b.hp) * (1 + b.hpPct));
  const x: PowerIn = { atk, hp, dmg: b.dmg, guard: b.guard, lv: h.lv, stars: h.stars, awaken: aw, skill, rarity: heroDef(id)?.rarity ?? 0, gear: worn.length };
  const power = HR.power ? Math.round(HR.power(x)) : defaultPower(x);
  return { atk, hp, dmg: b.dmg, guard: b.guard, skill, skillMul: skillMul(skill), awaken: aw, power };
}

/** 편성 하나의 모습: 영웅마다의 최종 값(시너지까지)과 싸움의 줄 덤, 켜진 시너지, 편성의 전투력(영웅의 전투력의 합) */
export interface SquadView {
  heroes: Record<string, HeroFull & { back: boolean; fight: { dmg: number; guard: number } }>;
  syn: SynergyMe[];
  power: number;
}
/** 편성(ids, 뒷줄 back)과 가진 영웅(heroes), 가진 장비 전부(gear)로 편성의 모습을 셈한다. 서버의 편성 전투력과 화면이 같은 셈을 쓴다 */
export function squadView(ids: readonly string[], back: readonly string[], heroes: Readonly<Record<string, Growth>>, gear: readonly Pick<HeroGearPiece, 'id' | 'lv' | 'hero'>[] = []): SquadView {
  const syn = synergyOf(ids.filter((id) => !!heroes[id]));
  const out: SquadView['heroes'] = {};
  let power = 0;
  for (const id of ids) {
    const h = heroes[id];
    if (!h) continue;
    const f = heroFull(id, h, gearOn(gear, id), synergyFor(id, syn));
    const row = sumBonus([{ dmg: f.dmg, guard: f.guard }, rowBonus(id, back)]);
    out[id] = { ...f, back: back.includes(id), fight: { dmg: row.dmg, guard: row.guard } };
    power += f.power;
  }
  return { heroes: out, syn, power };
}

/** 개인 상태 heroes의 한 줄을 영웅의 성장으로 */
export const growthOf = (t: readonly (number | undefined)[]): Growth & { shards: number } => ({ lv: t[0] ?? 1, stars: t[1] ?? 1, shards: t[2] ?? 0, skill: t[3] ?? 1, awaken: t[4] ?? 0 });
/** 개인 상태 hgear를 장비의 목록으로 */
export const piecesOf = (me: HeroGearMe | null | undefined): HeroGearPiece[] => (me?.items ?? []).map(([uid, id, lv, hero]) => ({ uid, id, lv, hero }));
