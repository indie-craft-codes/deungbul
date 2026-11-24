// 성장의 틀: 드롭 장비(등급, 무작위 옵션, 강화), 우편, 방치 보상, 일일 임무와 출석, 순위.
// 수치는 모두 잠정값이다. 규칙은 server/game/systems/의 gear, mail, idle, daily, rank가 맡는다.
// 틀의 것(타입과 도우미 함수)과 이 게임의 것(표와 수치)이 한 파일에 있어 [틀] / [이 게임] 구역 주석으로 갈라 둔다 (파일은 9단계에서 갈린다).

import { ITEMS, isItemId, type ItemId } from './items';

// ---------- 장비 ----------
// ===== [이 게임] 옵션의 종류, 장비 칸, 등급 (isStat, isGearSlot 같은 판별 함수는 [틀]의 도우미) =====
/** 장비 옵션의 종류: 공격 피해(%), 받는 피해 감소(%), 치명타 확률(%p), 최대 체력 */
export const STATS = {
  dmg: { base: 3 },
  guard: { base: 2 },
  crit: { base: 2 },
  hp: { base: 12 },
} as const;
export type Stat = keyof typeof STATS;
export const STAT_IDS = Object.keys(STATS) as Stat[];
export const isStat = (v: unknown): v is Stat => typeof v === 'string' && Object.hasOwn(STATS, v);

/**
 * 장비를 끼는 칸. 무기와 갑옷도 낱개 장비다: 상점에서 사거나 대장간에서 만든 것은 옵션 없는 기본 장비이고,
 * 몬스터가 떨어뜨린 것은 등급에 따라 옵션이 붙는다. 칸을 더하려면 여기와 언어 파일에 더한다
 */
export const GEAR_SLOTS = ['weapon', 'armor', 'ring', 'amulet', 'charm'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
export const isGearSlot = (v: unknown): v is GearSlot => typeof v === 'string' && (GEAR_SLOTS as readonly string[]).includes(v);

/** 등급: 나올 비중, 옵션의 수, 옵션 값 배율. 순서가 등급 번호다 */
export const RARITIES = [
  { id: 'common', weight: 70, opts: 1, mult: 1 },
  { id: 'uncommon', weight: 22, opts: 2, mult: 1.3 },
  { id: 'rare', weight: 7, opts: 3, mult: 1.7 },
  { id: 'epic', weight: 1, opts: 4, mult: 2.2 },
] as const;

// ===== [틀] 장비의 모양 =====
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
}

// ===== [이 게임] 장비와 강화의 수치 =====
export const GEAR = {
  /** 몬스터 한 마리가 장비를 떨어뜨릴 확률 (보스는 반드시) */
  dropChance: 0.06,
  /** 가방에 넣어 둘 수 있는 수 (낀 것 포함) */
  bagMax: 30,
  /** 장비 레벨에 따라 떨어지는 무기와 갑옷의 바탕 (가장 높은 것은 보스만 떨어뜨린다) */
  weaponFor: (lv: number): ItemId => (lv >= 6 ? 'sword4' : lv >= 4 ? 'sword3' : lv >= 2 ? 'sword2' : 'sword1'),
  armorFor: (lv: number): ItemId => (lv >= 3 ? 'armor2' : 'armor1'),
  /** 떨어뜨린 몬스터의 경험치로 장비 레벨을 정한다 */
  // 약한 몬스터(슬라임, 위습)는 1, 잿빛 숲의 몬스터는 2~4, 그림자와 보스는 5~6이 된다.
  // 예전에는 25로 나눠 잿빛 숲에서도 거의 다 1레벨(낡은 검)이 나와, 주운 장비가 상점의 보급형보다 못했다
  levelOf: (monsterExp: number): number => Math.max(1, Math.min(6, 1 + Math.floor(monsterExp / 15))),
};

export const ENHANCE = {
  max: 10,
  /** 보급형(상점에서 산 옵션 없는 장비)은 여기까지만 강화된다 */
  supplyMax: 5,
  /** 강화 단계마다 옵션 값이 이만큼 커진다 */
  perPlus: 0.1,
  /** 지금 단계에서 다음으로 갈 때의 성공 확률. 실패해도 잃는 것은 골드뿐이다 */
  rate: (plus: number): number => Math.max(0.2, 1 - plus * 0.1),
  gold: (plus: number, rar: number): number => 30 * (plus + 1) * (rar + 1),
};

// ===== [틀] 장비 도우미: 위의 수치와 아이템 정의에서 값을 구한다 =====
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
export const sellPrice = (g: Gear): number => 5 + gearScore(g) + baseTier(g) * 10;

// ---------- 성장 선택: 능력치와 기술 강화 ----------
// ===== [이 게임] 능력치의 종류와 수치 (isBuildStat은 [틀]의 도우미) =====
/** 찍을 수 있는 능력치: 힘(공격 피해), 체력(최대 체력), 행운(치명타 확률) */
export const BUILD_STATS = ['pow', 'vit', 'luck'] as const;
export type BuildStat = (typeof BUILD_STATS)[number];
export const isBuildStat = (v: unknown): v is BuildStat => typeof v === 'string' && (BUILD_STATS as readonly string[]).includes(v);

export const BUILD = {
  /** 레벨이 하나 오를 때마다 받는 점수 */
  pointsPerLevel: 3,
  /** 점수 하나가 주는 것: 공격 피해 +1%, 최대 체력 +8, 치명타 확률 +0.4%p */
  pow: 1, vit: 8, luck: 0.4,
  /** 찍은 점수를 모두 돌려받는 값 */
  resetGold: (lv: number): number => 30 * lv,
  /** 기술 강화: 가장 높은 단계, 단계마다 피해·회복이 늘어나는 비율 */
  skillMax: 5,
  skillPerLevel: 0.12,
  /** 지금 단계(lv)에서 다음으로 올리는 데 필요한 캐릭터 레벨과 골드 */
  skillNeedLv: (lv: number): number => lv * 4,
  skillGold: (lv: number): number => 80 * lv * lv,
};

// ---------- 우편 ----------
// ===== [틀] 우편과 보상의 모양, 우편 도우미 (MAIL_MAX의 값은 [이 게임]의 것) =====
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
/** 우편함의 한도. 넘으면 오래된 것부터 밀려나지만, 거래로 생긴 우편은 밀어내지 않는다 (mailKept) */
export const MAIL_MAX = 30;
const TRADE_MAILS: readonly string[] = ['marketSold', 'marketExpired', 'marketBought', 'marketBack'];
/** 우편에 물건(장비, 아이템)이 붙어 있는가 */
export const hasGoods = (r: Reward): boolean => !!r.gear?.length || (!!r.items && Object.keys(r.items).length > 0);
/** 밀어내면 안 되는 우편인가: 물건이 붙었거나 거래의 값이 든 우편은 다른 사람과 주고받은 것이라 사라지면 안 된다 */
export const mailKept = (m: { k: string; r: Reward }): boolean => hasGoods(m.r) || TRADE_MAILS.includes(m.k);

// ---------- 방치 보상 ----------
// ===== [이 게임] 방치 보상의 수치 =====
export const IDLE = {
  /** 이보다 짧게 비웠으면 보상이 없다(분) */
  minMin: 10,
  /** 이보다 오래 비워도 더 쌓이지 않는다(분) */
  maxMin: 480,
  reward: (minutes: number, lv: number): Reward => ({
    gold: Math.round(minutes * (1 + lv * 0.2)),
    exp: Math.round(minutes * (2 + lv)),
    sparks: Math.floor(minutes / 20),
  }),
};

// ---------- 일일 임무와 출석 ----------
// ===== [틀] 임무의 모양(DailyKind, DailyDef, 아래의 DailyState) / [이 게임] 임무와 출석 보상의 표(DAILIES, ATTEND) =====
/** 임무의 종류. 틀이 세는 것은 'kill'(처치)과 'enhance'(강화)이고, 그 밖의 것은 게임의 규칙이 센다 (이 게임의 'offer': 불씨 바치기) */
export type DailyKind = string;
export interface DailyDef { kind: DailyKind; n: number; r: Reward }
export const DAILIES = {
  kill30: { kind: 'kill', n: 30, r: { gold: 60, exp: 150 } },
  offer10: { kind: 'offer', n: 10, r: { gold: 40, exp: 100 } },
  enhance1: { kind: 'enhance', n: 1, r: { gold: 50 } },
} as const satisfies Record<string, DailyDef>;
export type DailyId = keyof typeof DAILIES;
export const DAILY_IDS = Object.keys(DAILIES) as DailyId[];

/** 출석 보상: 이어서 접속한 날 수(1~7)마다. 7일을 채우면 다시 1일째부터 */
export const ATTEND: readonly Reward[] = [
  { gold: 30 }, { gold: 40 }, { gold: 50, sparks: 5 }, { gold: 60 }, { gold: 80 }, { gold: 100, sparks: 10 }, { gold: 200, sparks: 20 },
];

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
// ===== [틀] 순위 한 줄의 모양 / [이 게임] 순위의 수치(RANK) =====
export interface RankRow { name: string; lv: number; cls: string; power: number }
export const RANK = { keep: 50, show: 20, everyS: 5 };
