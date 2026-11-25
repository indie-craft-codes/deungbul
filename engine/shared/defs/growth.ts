// 성장의 틀: 장비·우편·보상·일일 임무·순위의 모양과, 게임의 수치에서 값을 구하는 도우미.
// 수치(STATS, GEAR, ENHANCE, LEVEL 등)는 게임의 내용에 있다 (@game/shared/content). 규칙은 engine/server/game/systems/의 gear, mail, idle, daily, rank가 맡는다.
import { BAG_UP, BUILD_STATS, DAILIES, ENHANCE, GEAR, GEAR_SLOTS, ITEMS, LEVEL, POWER, RARITIES, SALVAGE, STATS } from '@game/shared/content';
import { isItemId } from './items';

// ---------- 장비 ----------
/**
 * 장비 옵션과 능력치가 드는 틀의 효과: damage(공격 피해 %), guard(받는 피해 감소 %, 한도 GEAR.guardCap), crit(치명타 확률 %p), hp(최대 체력).
 * 옵션과 능력치의 id는 게임이 짓고(STATS, BUILD_STATS), 효과의 이름과 셈은 틀이 갖는다 (서버의 수치 보정 이름 ModName과 같다)
 */
export type StatMod = 'damage' | 'guard' | 'crit' | 'hp';
export const STAT_MODS: readonly StatMod[] = ['damage', 'guard', 'crit', 'hp'];
/** 효과의 합(%, %p, 체력)을 수치 보정의 값으로: damage와 guard는 곱하는 값, crit과 hp는 더하는 값 */
export function modValue(mod: StatMod, sum: number): number {
  switch (mod) {
    case 'damage': return 1 + sum / 100;
    case 'guard': return 1 - Math.min(GEAR.guardCap, sum) / 100;
    case 'crit': return sum / 100;
    case 'hp': return sum;
  }
}
export type Stat = keyof typeof STATS;
export const STAT_IDS = Object.keys(STATS) as Stat[];
export const isStat = (v: unknown): v is Stat => typeof v === 'string' && Object.hasOwn(STATS, v);
/** 장비 옵션이 드는 효과 */
export const statMod = (s: Stat): StatMod => (STATS as Readonly<Record<string, { mod: StatMod }>>)[s].mod;
/** 그 효과에 드는 첫 옵션 (무기와 갑옷의 바탕이 주는 기본 수치를 이 옵션으로 보여 준다). 없으면 undefined */
export const statFor = (mod: StatMod): Stat | undefined => STAT_IDS.find((s) => statMod(s) === mod);
export type GearSlot = (typeof GEAR_SLOTS)[number];
export const isGearSlot = (v: unknown): v is GearSlot => typeof v === 'string' && (GEAR_SLOTS as readonly string[]).includes(v);

/** 장비 한 점. 종류가 아니라 낱개로 다룬다 */
export interface Gear {
  /** 그 캐릭터 안에서 겹치지 않는 번호 */
  uid: number;
  slot: GearSlot;
  /** 무기와 갑옷: 바탕이 되는 아이템 (ITEMS의 키). 기본 수치와 겉모습, 이름이 여기서 나온다 */
  base?: string;
  /** 대장간에서 만든 것: 옵션은 없지만 떨어진 장비처럼 끝까지 강화된다 */
  made?: boolean;
  /** 등급 번호 (RARITIES) */
  rar: number;
  /** 장비 레벨: 떨어뜨린 몬스터가 셀수록 높다 */
  lv: number;
  /** 강화 단계 */
  plus: number;
  /** 옵션: [종류, 값] */
  opts: [Stat, number][];
  /** 잠갔다: 팔기, 분해, 거래소 올리기가 막힌다 (일괄 분해의 사고를 막는 장치). 잠그지 않은 장비에는 이 칸이 없다 */
  lock?: boolean;
}

/**
 * 떨어진 장비에 붙는 옵션 하나의 값. roll은 0 이상 1 미만의 난수다.
 * 서버의 장비 굴림(engine/server/game/systems/gear.ts의 roll)과 도감의 값 범위(가장 작은 난수와 가장 큰 난수를 넣는다)가 이 함수 하나를 쓴다
 */
export const rollOpt = (stat: Stat, rar: number, lv: number, roll: number): number =>
  Math.max(1, Math.round(STATS[stat].base * RARITIES[rar].mult * (GEAR.optMin + roll * GEAR.optSpan) * (1 + (lv - 1) * GEAR.optPerLevel)));
/** 무기와 갑옷의 바탕이 주는 기본 수치: [종류, 값]. 무기는 공격 피해(%), 갑옷은 받는 피해 감소(%) */
export function baseOpt(g: Gear): [Stat, number] | null {
  if (!isItemId(g.base)) return null;
  const def = ITEMS[g.base] as { kind: string; damage?: number; guard?: number };
  const stat = statFor(def.kind === 'weapon' ? 'damage' : 'guard');
  if (stat === undefined) return null;
  if (def.kind === 'weapon') return [stat, Math.round(((def.damage ?? 1) - 1) * 100)];
  if (def.kind === 'armor') return [stat, Math.round((1 - (def.guard ?? 1)) * 100)];
  return null;
}
/** 바탕 아이템의 등급 (없으면 0) */
export const baseTier = (g: Gear): number => (isItemId(g.base) ? (ITEMS[g.base] as { tier?: number }).tier ?? 0 : 0);

/** 보급형인가: 상점에서 산 무기와 갑옷. 옵션이 없고 강화 한도가 낮다. 대장간에서 만든 것은 옵션은 없어도 끝까지 강화되고, 몬스터가 떨어뜨린 것은 옵션이 붙는다 */
export const isSupply = (g: Gear): boolean => g.base !== undefined && g.opts.length === 0 && !g.made;
/** 그 장비를 강화할 수 있는 한도 */
export const enhanceMax = (g: Gear): number => (isSupply(g) ? ENHANCE.supplyMax : ENHANCE.max);

/** 강화까지 반영한 옵션 값 */
export const optValue = (g: Gear, v: number): number => Math.round(v * (1 + g.plus * ENHANCE.perPlus) * 10) / 10;
/** 장비 한 점이 주는 어떤 수치의 합 */
export const gearStat = (g: Gear, stat: Stat): number => g.opts.reduce((s, [k, v]) => (k === stat ? s + optValue(g, v) : s), 0);
/** 장비의 값어치: 순위의 전투력과 파는 값에 쓴다 */
export const gearScore = (g: Gear): number => Math.round(g.opts.reduce((s, [k, v]) => s + optValue(g, v) / STATS[k].base, 0) * 10);
/**
 * 바탕 아이템(무기·갑옷)의 수치가 강화로 늘어난 만큼의 값어치. 전투력에만 더한다(바탕 자체는 powerOf의 tiers가 센다).
 * 옵션이 없는 만든 장비는 강화가 바탕의 수치만 올리므로, 이것이 없으면 강화해도 전투력이 그대로였다
 */
export const plusScore = (g: Gear): number => {
  const b = baseOpt(g);
  return b && g.plus > 0 ? Math.round(((optValue(g, b[1]) - b[1]) / STATS[b[0]].base) * 10) : 0;
};
export const sellPrice = (g: Gear): number => GEAR.sellBase + gearScore(g) + baseTier(g) * GEAR.sellPerTier;

// ---------- 낀 장비의 효과와 장비 비교 ----------
/** +from에서 +to까지 올리는 데 드는 골드의 기대값: 단계마다 (한 번의 값 ÷ 성공 확률)을 더한다. 도감의 표와 화면의 장비 비교가 이 함수 하나를 쓴다 (강화 규칙이 바뀌면 여기만 고친다) */
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

/**
 * 낀 장비들이 주는 어떤 수치의 합 (worn: 낀 장비들, 칸의 순서대로). 서버의 수치 보정(systems/gear.ts)과 화면의 장비 비교가 이 함수 하나를 쓴다.
 * 옵션은 강화 단계만큼 커지고(optValue), 무기와 갑옷의 바탕이 주는 기본 수치는 강화로 늘어난 몫만 여기에 더한다 (바탕의 배율 자체는 따로 곱해진다: gearEffect)
 */
export function wornTotal(worn: readonly Gear[], stat: Stat): number {
  let sum = 0;
  for (const it of worn) {
    sum += gearStat(it, stat);
    const base = baseOpt(it);
    if (base && base[0] === stat) sum += base[1] * it.plus * ENHANCE.perPlus;
  }
  return sum;
}
/** 낀 장비들이 그 효과에 주는 합: 그 효과에 드는 옵션들의 wornTotal을 더한다 (서버의 수치 보정과 화면의 장비 비교가 같이 쓴다) */
export const wornMod = (worn: readonly Gear[], mod: StatMod): number => STAT_IDS.reduce((s, k) => (statMod(k) === mod ? s + wornTotal(worn, k) : s), 0);
/** 낀 장비 묶음이 실제로 내는 효과. dmg: 공격 피해에 곱해지는 값, guard: 받는 피해에 곱해지는 값, crit: 치명타 확률에 더해지는 값(0~1), hp: 최대 체력에 더해지는 값 */
export interface GearEffect { dmg: number; guard: number; crit: number; hp: number }
/**
 * 낀 장비 묶음의 효과를 서버와 같은 식으로 구한다: 무기 바탕의 배율 × (1 + 공격 피해 옵션의 합 ÷ 100),
 * 갑옷 바탕의 배율 × (1 − 받는 피해 감소 옵션의 합(한도 GEAR.guardCap) ÷ 100), 치명타와 체력은 합 그대로 (systems/shop.ts와 gear.ts의 보정을 곱한 값과 같다)
 */
export function gearEffect(worn: readonly Gear[]): GearEffect {
  const mult = (slot: string, key: 'damage' | 'guard'): number => {
    const it = worn.find((x) => x.slot === slot);
    return it && isItemId(it.base) ? (ITEMS[it.base] as { damage?: number; guard?: number })[key] ?? 1 : 1;
  };
  return {
    dmg: mult('weapon', 'damage') * modValue('damage', wornMod(worn, 'damage')),
    guard: mult('armor', 'guard') * modValue('guard', wornMod(worn, 'guard')),
    crit: modValue('crit', wornMod(worn, 'crit')),
    hp: modValue('hp', wornMod(worn, 'hp')),
  };
}
/** 전투력 가운데 장비의 몫: 낀 장비의 값어치와 바탕의 등급 (powerOf의 장비 쪽) */
export const gearPower = (worn: readonly Gear[]): number => powerOf(0, worn.reduce((s, it) => s + baseTier(it), 0), [], worn);

/**
 * 장비를 바꿨을 때의 변화. dmg: 실제 공격 피해의 변화(%), guard: 실제 받는 피해의 변화(%. 음수가 좋다), crit: 치명타 확률의 변화(%p),
 * hp: 최대 체력의 변화, power: 전투력의 변화. 소수 한 자리로 맞춘다
 */
export interface GearDelta { dmg: number; guard: number; crit: number; hp: number; power: number }
const round1 = (v: number): number => { const r = Math.round(v * 10) / 10; return r === 0 ? 0 : r; };
/** worn에서 cand와 같은 칸의 장비를 cand로 바꾼 묶음 (그 칸이 비어 있었으면 더한다) */
const swapIn = (worn: readonly Gear[], cand: Gear): Gear[] => (worn.some((x) => x.slot === cand.slot) ? worn.map((x) => (x.slot === cand.slot ? cand : x)) : [...worn, cand]);
/** cand를 그 칸에 꼈을 때의 효과에서 지금(worn)의 효과를 뺀 것 */
export function gearDelta(worn: readonly Gear[], cand: Gear): GearDelta {
  const next = swapIn(worn, cand), a = gearEffect(worn), b = gearEffect(next);
  return { dmg: round1((b.dmg / a.dmg - 1) * 100), guard: round1((b.guard / a.guard - 1) * 100), crit: round1((b.crit - a.crit) * 100), hp: round1(b.hp - a.hp), power: gearPower(next) - gearPower(worn) };
}
/** 한눈에 보는 결론: 모든 수치가 좋아지거나 그대로면 better, 모두 나빠지거나 그대로면 worse, 좋아진 것과 나빠진 것이 섞였으면 mixed, 달라진 것이 없으면 same */
export type GearVerdict = 'better' | 'worse' | 'same' | 'mixed';
/** 수치마다 좋아졌는가(1), 나빠졌는가(-1), 그대로인가(0). 받는 피해는 줄어야 좋다 */
export const deltaSigns = (d: GearDelta): { dmg: number; guard: number; crit: number; hp: number } => ({ dmg: Math.sign(d.dmg), guard: Math.sign(-d.guard), crit: Math.sign(d.crit), hp: Math.sign(d.hp) });
export function gearVerdict(d: GearDelta): GearVerdict {
  const s = Object.values(deltaSigns(d)), up = s.some((v) => v > 0), down = s.some((v) => v < 0);
  return up && down ? 'mixed' : up ? 'better' : down ? 'worse' : 'same';
}
/** 강화 단계를 plus까지 올린 것으로 친 사본 (그 장비의 한도까지만. 내리지는 않는다) */
export const atPlus = (g: Gear, plus: number): Gear => ({ ...g, plus: Math.max(g.plus, Math.min(plus, enhanceMax(g))) });
/** 맞춘 비교에서 한 장비가 올라간 것: 지금 단계, 맞춘 단계, 한도에 걸려 덜 올랐는가, 거기까지 드는 골드의 기대값 */
export interface RaiseTo { from: number; to: number; capped: boolean; cost: number }
/**
 * 가방의 장비(cand)를 지금 낀 같은 칸의 장비와 견준다. 두 기준을 함께 낸다:
 *   now   지금 그대로 바꿨을 때
 *   even  두 장비를 둘 중 높은 강화 단계로 맞췄다고 쳤을 때 (강화 단계가 다르면 '그대로'의 비교는 강화한 쪽이 늘 좋아 보인다).
 *         한도가 낮은 장비(보급형)는 제 한도까지만 올린다. 단계가 이미 같거나 그 칸에 낀 것이 없으면 null
 */
export interface GearCompare { worn: Gear | null; now: GearDelta; even: { plus: number; delta: GearDelta; cand: RaiseTo; worn: RaiseTo } | null }
export function compareGear(worn: readonly Gear[], cand: Gear): GearCompare {
  const mine = worn.find((x) => x.slot === cand.slot) ?? null, now = gearDelta(worn, cand);
  if (!mine) return { worn: null, now, even: null };
  const plus = Math.max(mine.plus, cand.plus), a = atPlus(mine, plus), b = atPlus(cand, plus);
  if (a.plus === mine.plus && b.plus === cand.plus) return { worn: mine, now, even: null };
  const raise = (it: Gear, to: Gear): RaiseTo => ({ from: it.plus, to: to.plus, capped: to.plus < plus, cost: Math.round(enhanceExpected(to.plus, it.rar, it.plus)) });
  return { worn: mine, now, even: { plus, delta: gearDelta(swapIn(worn, a), b), cand: raise(cand, b), worn: raise(mine, a) } };
}

// ---------- 분해와 가방 넓히기 ----------
/** 분해의 표 (게임의 SALVAGE). 서버의 시험이 다른 표를 넣어 볼 수 있게 모양을 따로 둔다 */
export interface SalvageDef { item: string; dust: readonly number[]; perPlus: number; maxBatch: number; autoMaxRar: number; tellS: number }
/** 이 게임에 분해가 있는가: 등급별 가루의 표가 차 있고, 나오는 아이템이 아이템의 표에 있다 */
export const salvageOn = (def: SalvageDef = SALVAGE): boolean => def.dust.length > 0 && isItemId(def.item);
/** 그 장비를 분해하면 나오는 가루: 등급별 양 + 강화 단계 × perPlus (서버의 systems/salvage.ts, 화면, 도감이 함께 쓴다) */
export const dustFor = (g: Pick<Gear, 'rar' | 'plus'>, def: SalvageDef = SALVAGE): number => (def.dust[g.rar] ?? 0) + Math.max(0, g.plus) * def.perPlus;
/** 분해할 수 있는 장비인가: 보급형(상점에서 산 것)과 잠근 것은 안 된다. 끼고 있는지는 부른 쪽이 본다 (캐릭터의 일이다) */
export const canSalvage = (g: Gear): boolean => !isSupply(g) && !g.lock;
/** 자동 분해로 고를 수 있는 값: -1은 끔, 0부터는 '이 등급 이하' (RARITIES의 번호). 가장 높은 것은 SALVAGE.autoMaxRar */
export const autoSalvageChoices = (def: SalvageDef = SALVAGE): number[] => (salvageOn(def) ? [-1, ...RARITIES.map((_, i) => i).filter((i) => i <= def.autoMaxRar)] : [-1]);
/** 가방을 n번 넓힌 캐릭터의 가방 칸 수 */
export const bagSlots = (ups: number): number => GEAR.bagMax + Math.max(0, Math.min(BAG_UP.prices.length, ups)) * BAG_UP.step;
/** n번 넓힌 캐릭터가 한 번 더 넓히는 값. 더 넓힐 수 없으면 null */
export const bagUpPrice = (ups: number): number | null => BAG_UP.prices[ups] ?? null;

// ---------- 레벨 ----------
/** 레벨이 올랐을 때의 새 필요 경험치: 지금 값에서 구한다 (서버의 engine/server/game/systems/players.ts가 레벨이 오를 때 부른다) */
export const nextNeed = (need: number): number => Math.round(need * LEVEL.growth);
/**
 * 레벨 lv에서 다음 레벨로 오르는 데 필요한 경험치.
 * 서버가 하는 대로 반올림을 단계마다 되풀이한다: 닫힌 식(firstNeed × growth^(lv−1))은 반올림이 쌓여 어긋난다
 */
export function needFor(lv: number): number {
  let need = LEVEL.firstNeed;
  for (let i = 1; i < lv; i++) need = nextNeed(need);
  return need;
}

// ---------- 성장 선택: 능력치와 기술 강화 ----------
export type BuildStat = keyof typeof BUILD_STATS;
export const BUILD_STAT_IDS = Object.keys(BUILD_STATS) as BuildStat[];
export const isBuildStat = (v: unknown): v is BuildStat => typeof v === 'string' && Object.hasOwn(BUILD_STATS, v);
/** 능력치가 드는 효과와 점수 하나가 주는 값 */
export const buildStatDef = (k: BuildStat): { mod: StatMod; per: number } => (BUILD_STATS as Readonly<Record<string, { mod: StatMod; per: number }>>)[k];

// ---------- 우편 ----------
/**
 * 우편의 종류. 제목과 내용은 언어 파일이 만든다 (fmt.mailTitle).
 * 거래소: marketSold 팔린 값, marketExpired 기간이 지나 돌아온 물건, marketBought 산 물건(가방에 자리가 없었다), marketBack 내린 물건(가방에 자리가 없었다)
 */
export type MailKind = 'idle' | 'attend' | 'daily' | 'dungeon' | 'marketSold' | 'marketExpired' | 'marketBought' | 'marketBack';
/** 보상. gear와 items는 우편에 붙는 물건이다: 낱개 장비(uid는 받을 때 새로 붙는다)와 아이템 id별 개수 */
export interface Reward { gold?: number; exp?: number; sparks?: number; gear?: Gear[]; items?: Record<string, number> }
export interface Mail {
  id: number;
  k: MailKind;
  /** 제목에 넣을 값 (방치: 분, 출석: 며칠째, 일일: 임무 id, 던전: 던전 id, 거래소: 물건(아이템 id나 장비 칸), 수량, 값, 수수료) */
  a: (string | number)[];
  r: Reward;
}
const TRADE_MAILS: readonly string[] = ['marketSold', 'marketExpired', 'marketBought', 'marketBack'];
/** 우편에 물건(장비, 아이템)이 붙어 있는가 */
export const hasGoods = (r: Reward): boolean => !!r.gear?.length || (!!r.items && Object.keys(r.items).length > 0);
/** 밀어내면 안 되는 우편인가: 물건이 붙었거나 거래의 값이 든 우편은 다른 사람과 주고받은 것이라 사라지면 안 된다 */
export const mailKept = (m: { k: string; r: Reward }): boolean => hasGoods(m.r) || TRADE_MAILS.includes(m.k);

// ---------- 일일 임무와 출석 ----------
/** 임무의 종류. 틀이 세는 것은 'kill'(처치)과 'enhance'(강화)이고, 그 밖의 것은 게임의 규칙이 센다 (이 게임의 'offer': 불씨 바치기) */
export type DailyKind = string;
export interface DailyDef { kind: DailyKind; n: number; r: Reward }
export type DailyId = keyof typeof DAILIES;
export const DAILY_IDS = Object.keys(DAILIES) as DailyId[];
/** 임무의 정의를 문자열 id로 읽는다. 임무가 없는 게임(DAILIES = {})에서는 DailyId가 never라서 DAILIES[id]로는 아무것도 읽을 수 없다 (던전의 DUNGEON_TABLE과 같다) */
export const dailyDef = (id: string): DailyDef => (DAILIES as Readonly<Record<string, DailyDef>>)[id];

export interface DailyState {
  /** 이 진행이 속한 날 (YYYY-MM-DD) */
  day: string;
  /** 임무별 진행 수치 */
  prog: Record<string, number>;
  /** 보상을 보낸 임무 */
  got: string[];
  /** 이어서 접속한 날 수 */
  streak: number;
  /** 마지막으로 출석한 날 */
  last: string;
}

// ---------- 순위 ----------
export interface RankRow { name: string; lv: number; cls: string; power: number }
/**
 * 전투력: 순위와 화면 표시에 쓴다 (서버의 engine/server/game/systems/rank.ts와 도감이 함께 쓴다).
 * lv 캐릭터 레벨, tiers 낀 무기와 갑옷 바탕의 등급 합, skillLvs 기술마다의 강화 단계, worn 낀 장비들(값어치 gearScore가 더해진다)
 */
export function powerOf(lv: number, tiers: number, skillLvs: readonly number[], worn: readonly Gear[]): number {
  let score = skillLvs.reduce((s, n) => s + (n - 1) * POWER.perSkillLevel, 0) + lv * POWER.perLevel + tiers * POWER.perTier;
  for (const it of worn) score += gearScore(it) + plusScore(it);
  return score;
}
