// 직업과 기술의 모양, 그리고 게임의 표(CLASSES, SKILL_DEFS)에서 값을 꺼내는 도우미. 표와 수치는 게임의 내용에 있다 (@game/shared/content).
import { CLASSES, DEFAULT_CLASS, HP_PER_LEVEL, MAP, SKILL_DEFS } from '@game/shared/content';

/**
 * 기술이 하는 일. 서버(engine/server/game/systems/combat.ts)는 기술 이름이 아니라 이 종류만 보고 처리하므로,
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
export type SkillId = keyof typeof SKILL_DEFS;
export const skillDef = (id: SkillId): SkillDef => SKILL_DEFS[id];
export const isSkillId = (v: unknown): v is SkillId => typeof v === 'string' && Object.hasOwn(SKILL_DEFS, v);

export interface ClassDef {
  /** 1레벨 체력 */
  hp: number;
  /** 기본 공격 사거리 */
  range: number;
  /** 기본 공격 피해 범위 */
  basic: readonly [number, number];
  /** 기술 칸의 기술 (SKILL_SLOTS개. 칸의 수는 게임이 정한다) */
  skills: readonly SkillId[];
  /** 손에 드는 것의 모양. 캐릭터 모델과 무기 이름(검/활/지팡이)이 이것을 따른다 */
  hand: 'sword' | 'bow' | 'staff';
  /** 멀리서 쏘는 직업이면 날아가는 것의 모양. 없으면 붙어서 친다 */
  shot?: 'arrow' | 'bolt';
  /** 때릴 때 튀는 불티의 색 (없으면 기본색) */
  hitColor?: number;
}
export type ClassId = keyof typeof CLASSES;
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
export const isClassId = (v: unknown): v is ClassId => typeof v === 'string' && Object.hasOwn(CLASSES, v);
/** 무기 이름을 고를 때 쓰는 손 모양 (직업이 없으면 기본 직업의 것) */
export const handOf = (cls: unknown): ClassDef['hand'] => classOf(typeof cls === 'string' ? cls : '').hand;
export const classOf = (cls: string): ClassDef => CLASSES[isClassId(cls) ? cls : DEFAULT_CLASS];

export const maxHpFor = (cls: string, lv: number): number => classOf(cls).hp + HP_PER_LEVEL * (lv - 1);
export const SPAWN = MAP.spawn; // 등탑 앞: 접속과 부활 지점 (자리는 맵 정의에 있다)
