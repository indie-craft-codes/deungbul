// 직업, 기술, 전투 수치. 이름과 설명은 언어 파일에 있다. 수치는 모두 잠정값이다.
// 모양(SkillDef, ClassDef)과 도우미(classOf, maxHpFor 등)는 틀에 있다: engine/shared/defs/combat.ts
import type { ClassDef, ClassId, SkillDef } from '@engine/shared/defs/combat';

export const SKILL_DEFS = {
  smash: { cd: 4, range: 2.9, effect: { kind: 'hit', dmg: [28, 36] } }, // 전사: 대상에게 큰 피해
  whirl: { cd: 8, radius: 4.2, effect: { kind: 'area', at: 'self', dmg: [14, 20] } }, // 전사: 내 주변 모두에게 피해
  aimed: { cd: 5, range: 11, effect: { kind: 'hit', dmg: [30, 40] } }, // 궁수: 멀리 있는 대상에게 큰 피해
  volley: { cd: 9, range: 11, radius: 3.5, effect: { kind: 'area', at: 'target', dmg: [12, 18] } }, // 궁수: 대상 주변 모두에게 피해
  bolt: { cd: 4, range: 10, effect: { kind: 'hit', dmg: [34, 46] } }, // 마법사: 대상에게 큰 피해
  frost: { cd: 10, range: 10, radius: 4, effect: { kind: 'area', at: 'target', dmg: [10, 15], slow: 4 }, color: 0x8fd8ff }, // 마법사: 대상 주변 모두에게 피해를 주고 느리게 한다
  mend: { cd: 12, radius: 7, effect: { kind: 'heal', amount: 45, allies: true }, color: 0x7fd68a }, // 마법사: 나와 주변 사람들의 체력 회복
  breath: { cd: 15, effect: { kind: 'heal', amount: 60 }, color: 0x7fd68a }, // 전사, 궁수: 체력 회복
} as const satisfies Record<string, SkillDef>;

/** 직업마다 기술 칸은 세 개다 (단축키 1~3) */
export const SKILL_SLOTS = 3;

export const CLASSES = {
  warrior: { hp: 200, range: 2.3, basic: [10, 15], skills: ['smash', 'whirl', 'breath'], hand: 'sword' },
  archer: { hp: 170, range: 9, basic: [9, 13], skills: ['aimed', 'volley', 'breath'], hand: 'bow', shot: 'arrow' },
  // 마법사: 가장 약하지만 적을 묶고 곁의 사람을 살린다. 여럿이 있을 때 빛난다
  mage: { hp: 150, range: 8, basic: [11, 15], skills: ['bolt', 'frost', 'mend'], hand: 'staff', shot: 'bolt', hitColor: 0xffa24a },
} as const satisfies Record<string, ClassDef>;
/** 직업을 아직 고르지 않았으면('') 전사로 친다 */
export const DEFAULT_CLASS: ClassId = 'warrior';

export const HP_PER_LEVEL = 15;

/** 전투 공통 수치: 치명타와 자연 회복 (서버의 systems/combat.ts가 읽는다) */
export const COMBAT = {
  /** 기본 공격이 치명타가 될 확률 (장비 옵션과 능력치의 치명타 확률이 여기에 더해진다) */
  critChance: 0.15,
  /** 치명타의 피해 배율 */
  critMult: 1.8,
  /** 자연 회복: 마지막으로 맞은 뒤 이 시간(초)이 지나야 시작한다 */
  regenAfterS: 5,
  /** 자연 회복: 초당 회복량 (회복 보정이 곱해진다. 이 게임에서는 환한 구역의 배율) */
  regenPerS: 4,
};

/** 느려진 적의 이동 속도 배율 (느려지는 시간은 기술마다 effect.slow에 있다) */
export const SLOW_FACTOR = 0.5;

export const ATTACK_CD = 1.0;
/**
 * 나갔다가 이 시간(초) 안에 다시 접속하면 나갈 때의 체력, 기술 쿨다운, 물약 대기가 이어진다 (쿨다운은 떠나 있던 만큼 줄어든다).
 * 재접속으로 체력을 채우고 쿨다운을 지우지 못하게 한다. 더 오래 떠나 있었으면 쉬다 온 것이므로 가득 찬 채로 시작한다.
 */
export const REJOIN_KEEP_S = 300;
/** 이름을 정하지 못한 접속자에게 붙이는 이름의 머리말 (뒤에 숫자 네 자리가 붙는다) */
export const GUEST_NAME = 'Keeper';
