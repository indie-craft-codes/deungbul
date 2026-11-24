// 몬스터의 모양과 도우미. 몬스터의 표와 수치는 게임의 내용에 있다 (@game/shared/content).
import { BOSS, MONSTERS } from '@game/shared/content';

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
  /** 필드 보스: 맞서는 사람이 늘수록 체력이 늘고, 예고 뒤에 주변을 내려친다 (server/game/systems/boss.ts) */
  boss?: boolean;
  /** 쓰러진 뒤 다시 나타나기까지(초). 없으면 RESPAWN_S */
  respawn?: number;
}

export type MonsterId = keyof typeof MONSTERS;
export const isMonsterId = (v: string): v is MonsterId => Object.hasOwn(MONSTERS, v);
export const monsterDef = (id: MonsterId): MonsterDef => MONSTERS[id];

/** 필드 보스의 최대 체력: fighters명이 맞설 때 (한 명이면 기본 체력). 서버의 systems/boss.ts와 도감이 함께 쓴다 */
export const bossHp = (base: number, fighters: number): number => Math.round(base * (1 + BOSS.hpPerPlayer * Math.max(0, Math.min(BOSS.maxScale, fighters) - 1)));
