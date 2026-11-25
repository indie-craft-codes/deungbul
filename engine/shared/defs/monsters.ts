// 몬스터의 모양과 도우미. 몬스터의 표와 수치는 게임의 내용에 있다 (@game/shared/content).
import { BOSS, GEAR, MONSTERS } from '../content';

export interface MonsterDef {
  hp: number;
  dmg: readonly [number, number];
  speed: number;
  exp: number;
  /** 처치 시 주는 불씨(두 번째 재화) 범위. 피해를 준 사람 각자가 받는다. 없으면 주지 않는다: 불씨가 없는 게임도 몬스터를 정의할 수 있다 */
  sparks?: readonly [number, number];
  /** 처치 시 주는 골드 범위 */
  gold: readonly [number, number];
  /** 먼저 덤비는 거리. 0이면 맞기 전에는 덤비지 않는다. */
  aggro: number;
  /** 이름표 높이 */
  h: number;
  /** 필드 보스: 맞서는 사람이 늘수록 체력이 늘고, 예고 뒤에 주변을 내려친다 (engine/server/game/systems/boss.ts) */
  boss?: boolean;
  /** 쓰러진 뒤 다시 나타나기까지(초). 없으면 RESPAWN_S */
  respawn?: number;
  /**
   * 싸우는 법(대상이 있을 때). 없으면 쫓아가 붙어서 때린다.
   * 틀의 것: 'ranged'(사거리 range에서 쏘고, 너무 붙으면 물러선다), 'flee'(체력이 fleeAt 아래면 대상에게서 달아난다. 거리가 벌어지면 놓친다).
   * 게임의 것: 서버에서 g.monsters.addBehavior('이름', fn)으로 등록한 이름 (engine/server/game/systems/monsters.ts의 MonsterBehavior)
   */
  behavior?: string;
  /** 'ranged'의 사거리(m). 없으면 MONSTER_RANGED */
  range?: number;
  /** 'flee'가 달아나기 시작하는 체력 비율. 없으면 0.3 */
  fleeAt?: number;
  /** 떨어져서 때리면 화면에 날아가는 것: registerShot으로 등록한 id (틀의 'arrow', 'bolt'). 없으면 날아가는 것 없이 맞기만 한다 */
  shot?: string;
  /**
   * 떨어뜨리는 장비의 레벨. 없으면 경험치로 정한다(GEAR.levelOf). 경험치로 정하는 식의 상한을 올리지 않고
   * 새 사냥터의 몬스터만 더 높은 장비를 떨어뜨리게 할 때 쓴다. 장비를 떨어뜨리는 곳(서버)과 도감은 gearLvOf로 읽는다
   */
  gearLv?: number;
}

/** 'ranged' 몬스터의 기본 사거리(m) */
export const MONSTER_RANGED = 8;

export type MonsterId = keyof typeof MONSTERS;
export const isMonsterId = (v: string): v is MonsterId => Object.hasOwn(MONSTERS, v);
export const monsterDef = (id: MonsterId): MonsterDef => MONSTERS[id];
/** 그 몬스터가 떨어뜨리는 장비의 레벨: 정의의 gearLv, 없으면 경험치로 (GEAR.levelOf) */
export const gearLvOf = (def: MonsterDef): number => def.gearLv ?? GEAR.levelOf(def.exp);

/** 필드 보스의 최대 체력: fighters명이 맞설 때 (한 명이면 기본 체력). 서버의 engine/server/game/systems/boss.ts와 도감이 함께 쓴다 */
export const bossHp = (base: number, fighters: number): number => Math.round(base * (1 + BOSS.hpPerPlayer * Math.max(0, Math.min(BOSS.maxScale, fighters) - 1)));
