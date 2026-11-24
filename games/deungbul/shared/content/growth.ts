// 성장의 수치: 드롭 장비(등급, 무작위 옵션, 강화), 우편, 방치 보상, 일일 임무와 출석, 순위.
// 수치는 모두 잠정값이다. 규칙은 engine/server/game/systems/의 gear, mail, idle, daily, rank가 맡는다.
// 모양(Gear, Reward, DailyDef 등)과 도우미(rollOpt, gearScore, needFor, powerOf 등)는 틀에 있다: engine/shared/defs/growth.ts
import type { ItemId } from '@engine/shared/defs/items';
import { BUILD_COST, GEAR_ECON } from './economy';

// 경제 수치는 economy.ts에 모았다: 강화의 값과 확률(ENHANCE), 방치 보상(IDLE), 일일 임무(DAILIES), 출석(ATTEND)은 통째로 거기에 있고 여기서 다시 내보낸다.
// 장비가 떨어지는 확률·가방의 크기·파는 값(GEAR), 능력치와 기술에 드는 골드(BUILD)는 아래 묶음이 거기서 읽는다
export { ATTEND, DAILIES, ENHANCE, IDLE } from './economy';

// ---------- 장비 ----------
/** 장비 옵션의 종류: 공격 피해(%), 받는 피해 감소(%), 치명타 확률(%p), 최대 체력 */
export const STATS = {
  dmg: { base: 3, mod: 'damage' },
  guard: { base: 2, mod: 'guard' },
  crit: { base: 2, mod: 'crit' },
  hp: { base: 12, mod: 'hp' },
} as const;

/**
 * 장비를 끼는 칸. 무기와 갑옷도 낱개 장비다: 상점에서 사거나 대장간에서 만든 것은 옵션 없는 기본 장비이고,
 * 몬스터가 떨어뜨린 것은 등급에 따라 옵션이 붙는다. 칸을 더하려면 여기와 이 게임의 언어 파일(이름표 gearSlots)에 더한다
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
  dropChance: GEAR_ECON.dropChance,
  /** 가방에 넣어 둘 수 있는 수 (낀 것 포함) */
  bagMax: GEAR_ECON.bagMax,
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
  sellBase: GEAR_ECON.sellBase,
  sellPerTier: GEAR_ECON.sellPerTier,
  /** 장비 레벨에 따라 떨어지는 무기와 갑옷의 바탕 (가장 높은 것은 보스만 떨어뜨린다) */
  weaponFor: (lv: number): ItemId => (lv >= 6 ? 'sword4' : lv >= 4 ? 'sword3' : lv >= 2 ? 'sword2' : 'sword1'),
  armorFor: (lv: number): ItemId => (lv >= 3 ? 'armor2' : 'armor1'),
  /** 떨어뜨린 몬스터의 경험치로 장비 레벨을 정한다 */
  // 약한 몬스터(슬라임, 위습)는 1, 잿빛 숲의 몬스터는 2~4, 그림자와 보스는 5~6이 된다.
  // 예전에는 25로 나눠 잿빛 숲에서도 거의 다 1레벨(낡은 검)이 나와, 주운 장비가 상점의 보급형보다 못했다
  levelOf: (monsterExp: number): number => Math.max(1, Math.min(6, 1 + Math.floor(monsterExp / 15))),
};

// ---------- 레벨 ----------
export const LEVEL = {
  /** 레벨 1에서 2로 오르는 데 필요한 경험치 */
  firstNeed: 60,
  /** 레벨이 하나 오를 때마다 필요 경험치에 곱하는 값 (곱한 뒤 반올림한다) */
  growth: 1.35,
};

// ---------- 성장 선택: 능력치와 기술 강화 ----------
/** 찍을 수 있는 능력치: 힘(공격 피해), 체력(최대 체력), 행운(치명타 확률). per: 점수 하나가 주는 것 (공격 피해 +1%, 최대 체력 +8, 치명타 확률 +0.4%p) */
export const BUILD_STATS = {
  pow: { mod: 'damage', per: 1 },
  vit: { mod: 'hp', per: 8 },
  luck: { mod: 'crit', per: 0.4 },
} as const;

export const BUILD = {
  /** 레벨이 하나 오를 때마다 받는 점수 */
  pointsPerLevel: 3,
  /** 찍은 점수를 모두 돌려받는 값 */
  resetGold: BUILD_COST.resetGold,
  /** 기술 강화: 가장 높은 단계, 단계마다 피해·회복이 늘어나는 비율 */
  skillMax: 5,
  skillPerLevel: 0.12,
  /** 지금 단계(lv)에서 다음으로 올리는 데 필요한 캐릭터 레벨과 골드 */
  skillNeedLv: (lv: number): number => lv * 4,
  skillGold: BUILD_COST.skillGold,
};

// ---------- 우편 ----------
/** 우편함의 한도. 넘으면 오래된 것부터 밀려나지만, 거래로 생긴 우편은 밀어내지 않는다 (mailKept) */
export const MAIL_MAX = 30;

// ---------- 순위 ----------
export const RANK = { keep: 50, show: 20, everyS: 5 };
/** 전투력의 식에 드는 점수: 캐릭터 레벨 하나, 낀 무기·갑옷 바탕의 등급 하나, 기술 강화 한 단계(1단계는 0)마다 */
export const POWER = { perLevel: 20, perTier: 15, perSkillLevel: 10 };
