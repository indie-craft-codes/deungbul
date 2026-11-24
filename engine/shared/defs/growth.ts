// 성장의 틀: 장비·우편·보상·일일 임무·순위의 모양과, 게임의 수치에서 값을 구하는 도우미.
// 수치(STATS, GEAR, ENHANCE, LEVEL 등)는 게임의 내용에 있다 (@game/shared/content). 규칙은 engine/server/game/systems/의 gear, mail, idle, daily, rank가 맡는다.
import { BAG_UP, BUILD_STATS, DAILIES, ENHANCE, GEAR, GEAR_SLOTS, ITEMS, LEVEL, POWER, RARITIES, SALVAGE, STATS } from '@game/shared/content';
import { isItemId } from './items';

// ---------- 장비 ----------
export type Stat = keyof typeof STATS;
export const STAT_IDS = Object.keys(STATS) as Stat[];
export const isStat = (v: unknown): v is Stat => typeof v === 'string' && Object.hasOwn(STATS, v);
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
 * 서버의 장비 굴림(systems/gear.ts의 roll)과 도감의 값 범위(가장 작은 난수와 가장 큰 난수를 넣는다)가 이 함수 하나를 쓴다
 */
export const rollOpt = (stat: Stat, rar: number, lv: number, roll: number): number =>
  Math.max(1, Math.round(STATS[stat].base * RARITIES[rar].mult * (GEAR.optMin + roll * GEAR.optSpan) * (1 + (lv - 1) * GEAR.optPerLevel)));
/** 무기와 갑옷의 바탕이 주는 기본 수치: [종류, 값]. 무기는 공격 피해(%), 갑옷은 받는 피해 감소(%) */
export function baseOpt(g: Gear): [Stat, number] | null {
  if (!isItemId(g.base)) return null;
  const def = ITEMS[g.base] as { kind: string; damage?: number; guard?: number };
  if (def.kind === 'weapon') return ['dmg', Math.round(((def.damage ?? 1) - 1) * 100)];
  if (def.kind === 'armor') return ['guard', Math.round((1 - (def.guard ?? 1)) * 100)];
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
export const sellPrice = (g: Gear): number => GEAR.sellBase + gearScore(g) + baseTier(g) * GEAR.sellPerTier;

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
/** 레벨이 올랐을 때의 새 필요 경험치: 지금 값에서 구한다 (서버의 systems/players.ts가 레벨이 오를 때 부른다) */
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
export type BuildStat = (typeof BUILD_STATS)[number];
export const isBuildStat = (v: unknown): v is BuildStat => typeof v === 'string' && (BUILD_STATS as readonly string[]).includes(v);

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
 * 전투력: 순위와 화면 표시에 쓴다 (서버의 systems/rank.ts와 도감이 함께 쓴다).
 * lv 캐릭터 레벨, tiers 낀 무기와 갑옷 바탕의 등급 합, skillLvs 기술마다의 강화 단계, worn 낀 장비들(값어치 gearScore가 더해진다)
 */
export function powerOf(lv: number, tiers: number, skillLvs: readonly number[], worn: readonly Gear[]): number {
  let score = skillLvs.reduce((s, n) => s + (n - 1) * POWER.perSkillLevel, 0) + lv * POWER.perLevel + tiers * POWER.perTier;
  for (const it of worn) score += gearScore(it);
  return score;
}
