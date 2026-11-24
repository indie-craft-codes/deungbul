// 직업, 기술, 전투 수치. 이름과 설명은 언어 파일에 있다. 수치는 모두 잠정값이다.

/**
 * 기술이 하는 일. 서버(systems/combat.ts)는 기술 이름이 아니라 이 종류만 보고 처리하므로,
 * 새 기술은 여기에 한 줄 더하면 된다. 새 종류의 효과가 필요할 때만 서버 코드를 고친다.
 */
export type SkillEffect =
  /** 대상 하나에게 피해 (치명타로 표시) */
  | { kind: 'hit'; dmg: readonly [number, number] }
  /** 범위(SkillDef.radius) 안 모든 적에게 피해. at: 범위의 중심이 나인가 대상인가. slow: 맞으면 이 시간(초) 동안 느려진다 */
  | { kind: 'area'; at: 'self' | 'target'; dmg: readonly [number, number]; slow?: number }
  /** 체력 회복. allies가 켜져 있으면 범위(SkillDef.radius) 안의 사람 모두 */
  | { kind: 'heal'; amount: number; allies?: boolean };

export interface SkillDef {
  cd: number;
  /** 대상이 이 거리 안에 있어야 쓸 수 있다 (대상이 필요한 기술) */
  range?: number;
  /** 범위 피해나 범위 회복의 반경 */
  radius?: number;
  effect: SkillEffect;
  /** 이펙트 색 (없으면 기본색) */
  color?: number;
}
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
export type SkillId = keyof typeof SKILL_DEFS;
export const skillDef = (id: SkillId): SkillDef => SKILL_DEFS[id];
export const isSkillId = (v: unknown): v is SkillId => typeof v === 'string' && Object.hasOwn(SKILL_DEFS, v);

/** 직업마다 기술 칸은 세 개다 (단축키 1~3) */
export const SKILL_SLOTS = 3;

export interface ClassDef {
  /** 1레벨 체력 */
  hp: number;
  /** 기본 공격 사거리 */
  range: number;
  /** 기본 공격 피해 범위 */
  basic: readonly [number, number];
  skills: readonly [SkillId, SkillId, SkillId];
  /** 손에 드는 것의 모양. 캐릭터 모델과 무기 이름(검/활/지팡이)이 이것을 따른다 */
  hand: 'sword' | 'bow' | 'staff';
  /** 멀리서 쏘는 직업이면 날아가는 것의 모양. 없으면 붙어서 친다 */
  shot?: 'arrow' | 'bolt';
  /** 때릴 때 튀는 불티의 색 (없으면 기본색) */
  hitColor?: number;
}
export const CLASSES = {
  warrior: { hp: 200, range: 2.3, basic: [10, 15], skills: ['smash', 'whirl', 'breath'], hand: 'sword' },
  archer: { hp: 170, range: 9, basic: [9, 13], skills: ['aimed', 'volley', 'breath'], hand: 'bow', shot: 'arrow' },
  // 마법사: 가장 약하지만 적을 묶고 곁의 사람을 살린다. 여럿이 있을 때 빛난다
  mage: { hp: 150, range: 8, basic: [11, 15], skills: ['bolt', 'frost', 'mend'], hand: 'staff', shot: 'bolt', hitColor: 0xffa24a },
} as const satisfies Record<string, ClassDef>;
export type ClassId = keyof typeof CLASSES;
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
export const isClassId = (v: unknown): v is ClassId => typeof v === 'string' && Object.hasOwn(CLASSES, v);
/** 직업을 아직 고르지 않았으면('') 전사로 친다 */
export const DEFAULT_CLASS: ClassId = 'warrior';
/** 무기 이름을 고를 때 쓰는 손 모양 (직업이 없으면 기본 직업의 것) */
export const handOf = (cls: unknown): ClassDef['hand'] => classOf(typeof cls === 'string' ? cls : '').hand;
export const classOf = (cls: string): ClassDef => CLASSES[isClassId(cls) ? cls : DEFAULT_CLASS];

export const HP_PER_LEVEL = 15;
export const maxHpFor = (cls: string, lv: number): number => classOf(cls).hp + HP_PER_LEVEL * (lv - 1);

/** 느려진 적의 이동 속도 배율 (느려지는 시간은 기술마다 effect.slow에 있다) */
export const SLOW_FACTOR = 0.5;

export const ATTACK_CD = 1.0;
/**
 * 나갔다가 이 시간(초) 안에 다시 접속하면 나갈 때의 체력, 기술 쿨다운, 물약 대기가 이어진다 (쿨다운은 떠나 있던 만큼 줄어든다).
 * 재접속으로 체력을 채우고 쿨다운을 지우지 못하게 한다. 더 오래 떠나 있었으면 쉬다 온 것이므로 가득 찬 채로 시작한다.
 */
export const REJOIN_KEEP_S = 300;
export const SPAWN = { x: 0, z: 3 }; // 등탑 앞: 접속과 부활 지점
/** 이름을 정하지 못한 접속자에게 붙이는 이름의 머리말 (뒤에 숫자 네 자리가 붙는다) */
export const GUEST_NAME = 'Keeper';
