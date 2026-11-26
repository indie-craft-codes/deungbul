// 직업과 기술의 모양, 그리고 게임의 표(CLASSES, SKILL_DEFS)에서 값을 꺼내는 도우미. 표와 수치는 게임의 내용에 있다 (@game/shared/content).
import { CLASSES, DEFAULT_CLASS, HP_PER_LEVEL, MAP, SKILL_DEFS } from '../content';

/**
 * 기술이 하는 일. 서버(engine/server/game/systems/combat.ts)는 기술 이름이 아니라 이 종류만 보고 처리하므로,
 * 새 기술은 여기에 한 줄 더하면 된다. 새 종류의 효과가 필요할 때만 서버 코드를 고친다.
 */
export type SkillEffect =
  /** 대상 하나에게 피해 (치명타로 표시). slow: 이 시간(초) 동안 느려진다, stun: 이 시간(초) 동안 움직이지도 때리지도 못한다 */
  | { kind: 'hit'; dmg: readonly [number, number]; slow?: number; stun?: number }
  /** 범위(SkillDef.radius) 안 모든 적에게 피해. at: 범위의 중심이 나인가 대상인가. slow: 맞으면 이 시간(초) 동안 느려진다 */
  | { kind: 'area'; at: 'self' | 'target'; dmg: readonly [number, number]; slow?: number }
  /** 체력 회복. allies가 켜져 있으면 범위(SkillDef.radius) 안의 사람 모두 */
  | { kind: 'heal'; amount: number; allies?: boolean }
  /**
   * 잠깐 동안의 강화 (BuffMod의 비율 value를 dur초 동안). allies가 켜져 있으면 범위(SkillDef.radius) 안의 사람 모두.
   * 같은 기술을 다시 쓰면 시간이 처음부터 다시 흐른다(겹치지 않는다). 다른 기술의 강화끼리는 겹친다
   */
  | { kind: 'buff'; mod: BuffMod; value: number; dur: number; allies?: boolean }
  /** 돌진: 대상 쪽으로(대상이 없으면 바라보는 쪽으로) dist만큼 단숨에 움직인다. dmg가 있으면 닿은 대상에게 피해, stun이 있으면 기절 */
  | { kind: 'dash'; dist: number; dmg?: readonly [number, number]; stun?: number }
  /** 지속 피해(독, 화상): 대상에게(area면 대상 둘레 SkillDef.radius 안의 적 모두) 1초마다 dps씩 dur초 동안. 같은 사람이 다시 걸면 시간이 처음부터 */
  | { kind: 'dot'; dps: number; dur: number; area?: boolean };

/**
 * 강화(buff)가 바꾸는 것. value는 비율이다:
 * damage 주는 피해 ×(1+value), guard 받는 피해 ×(1−value), regen 체력 회복 ×(1+value), crit 치명타 확률 +value
 */
export type BuffMod = 'damage' | 'guard' | 'regen' | 'crit';
export const BUFF_MODS: readonly BuffMod[] = ['damage', 'guard', 'regen', 'crit'];

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
/**
   * 손에 드는 것의 모양. 캐릭터 모델과 무기 이름이 이것을 따른다: 이름표의 아이템에 이 id의 칸(bow, staff …)이 있으면 그 직업에게는 그 이름이 보인다.
   * 틀에 있는 것은 'sword', 'bow', 'staff'이고, 다른 모양은 게임이 화면에서 registerHand(id, …)로 등록한다 (등록하지 않으면 검으로 그린다)
   */
  hand: string;
  /** 멀리서 쏘는 직업이면 날아가는 것의 모양. 틀에 있는 것은 'arrow', 'bolt'이고, 다른 것은 registerShot으로 등록한다. 없으면 붙어서 친다 */
  shot?: string;
  /** 때릴 때 튀는 불티의 색 (없으면 기본색) */
  hitColor?: number;
}
export type ClassId = keyof typeof CLASSES;
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];
export const isClassId = (v: unknown): v is ClassId => typeof v === 'string' && Object.hasOwn(CLASSES, v);
/** 무기 이름을 고를 때 쓰는 손 모양 (직업이 없으면 기본 직업의 것) */
export const handOf = (cls: unknown): ClassDef['hand'] => classOf(typeof cls === 'string' ? cls : '').hand;
/** 직업이 없는 게임(직업 모듈을 쓰지 않거나 CLASSES가 빈 표)의 캐릭터가 쓰는 자리 값: 기술도 손에 든 것도 없다 */
export const NO_CLASS: ClassDef = { hp: 100, range: 2, basic: [0, 0], skills: [], hand: '' };
export const classOf = (cls: string): ClassDef => (CLASSES as Readonly<Record<string, ClassDef>>)[isClassId(cls) ? cls : DEFAULT_CLASS] ?? NO_CLASS;

export const maxHpFor = (cls: string, lv: number): number => classOf(cls).hp + HP_PER_LEVEL * (lv - 1);
export const SPAWN = MAP.spawn; // 처음 서는 곳: 접속과 (게임이 정하지 않았으면) 부활의 자리 (맵 정의에 있다)
