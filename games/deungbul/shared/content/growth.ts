// 성장의 수치: 드롭 장비(등급, 무작위 옵션, 강화), 우편, 방치 보상, 일일 임무와 출석, 순위.
// 수치는 모두 잠정값이다. 규칙은 engine/server/game/systems/의 gear, mail, idle, daily, rank가 맡는다.
// 모양(Gear, Reward, DailyDef 등)과 도우미(rollOpt, gearScore, needFor, powerOf 등)는 틀에 있다: engine/shared/defs/growth.ts
import type { DailyDef, Reward } from '@engine/shared/defs/growth';
import type { ItemId } from '@engine/shared/defs/items';

// ---------- 장비 ----------
/** 장비 옵션의 종류: 공격 피해(%), 받는 피해 감소(%), 치명타 확률(%p), 최대 체력 */
export const STATS = {
  dmg: { base: 3 },
  guard: { base: 2 },
  crit: { base: 2 },
  hp: { base: 12 },
} as const;

/**
 * 장비를 끼는 칸. 무기와 갑옷도 낱개 장비다: 상점에서 사거나 대장간에서 만든 것은 옵션 없는 기본 장비이고,
 * 몬스터가 떨어뜨린 것은 등급에 따라 옵션이 붙는다. 칸을 더하려면 여기와 언어 파일에 더한다
 */
export const GEAR_SLOTS = ['weapon', 'armor', 'ring', 'amulet', 'charm'] as const;

/** 등급: 나올 비중, 옵션의 수, 옵션 값 배율. 순서가 등급 번호다 */
export const RARITIES = [
  { id: 'common', weight: 70, opts: 1, mult: 1 },
  { id: 'uncommon', weight: 22, opts: 2, mult: 1.3 },
  { id: 'rare', weight: 7, opts: 3, mult: 1.7 },
  { id: 'epic', weight: 1, opts: 4, mult: 2.2 },
] as const;

export const GEAR = {
  /** 몬스터 한 마리가 장비를 떨어뜨릴 확률 (보스는 반드시) */
  dropChance: 0.06,
  /** 가방에 넣어 둘 수 있는 수 (낀 것 포함) */
  bagMax: 30,
  /** 낀 장비의 '받는 피해 감소' 옵션은 합쳐서 이만큼(%)까지만 듣는다 (갑옷 바탕의 배율과는 따로 곱해진다) */
  guardCap: 60,
  /**
   * 옵션 값의 굴림: 값 = 종류의 기본값 × 등급 배율 × (optMin + 난수 × optSpan) × (1 + (장비 레벨 − 1) × optPerLevel). 아래 rollOpt
   * 지금은 0.8배에서 1.2배 사이로 흩어지고, 장비 레벨 하나마다 15%씩 커진다
   */
  optMin: 0.8,
  optSpan: 0.4,
  optPerLevel: 0.15,
  /** 파는 값 = sellBase + 값어치(gearScore) + 바탕의 등급 × sellPerTier. 아래 sellPrice */
  sellBase: 5,
  sellPerTier: 10,
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

// ---------- 레벨 ----------
export const LEVEL = {
  /** 레벨 1에서 2로 오르는 데 필요한 경험치 */
  firstNeed: 60,
  /** 레벨이 하나 오를 때마다 필요 경험치에 곱하는 값 (곱한 뒤 반올림한다) */
  growth: 1.35,
};

// ---------- 성장 선택: 능력치와 기술 강화 ----------
/** 찍을 수 있는 능력치: 힘(공격 피해), 체력(최대 체력), 행운(치명타 확률) */
export const BUILD_STATS = ['pow', 'vit', 'luck'] as const;

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
/** 우편함의 한도. 넘으면 오래된 것부터 밀려나지만, 거래로 생긴 우편은 밀어내지 않는다 (mailKept) */
export const MAIL_MAX = 30;

// ---------- 방치 보상 ----------
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
export const DAILIES = {
  kill30: { kind: 'kill', n: 30, r: { gold: 60, exp: 150 } },
  offer10: { kind: 'offer', n: 10, r: { gold: 40, exp: 100 } },
  enhance1: { kind: 'enhance', n: 1, r: { gold: 50 } },
} as const satisfies Record<string, DailyDef>;

/** 출석 보상: 이어서 접속한 날 수(1~7)마다. 7일을 채우면 다시 1일째부터 */
export const ATTEND: readonly Reward[] = [
  { gold: 30 }, { gold: 40 }, { gold: 50, sparks: 5 }, { gold: 60 }, { gold: 80 }, { gold: 100, sparks: 10 }, { gold: 200, sparks: 20 },
];

// ---------- 순위 ----------
export const RANK = { keep: 50, show: 20, everyS: 5 };
/** 전투력의 식에 드는 점수: 캐릭터 레벨 하나, 낀 무기·갑옷 바탕의 등급 하나, 기술 강화 한 단계(1단계는 0)마다 */
export const POWER = { perLevel: 20, perTier: 15, perSkillLevel: 10 };
