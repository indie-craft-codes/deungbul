// 등탑: 밝기와 단계. 수치는 모두 잠정값이다.
import { PLAYER_SPEED } from '@engine/shared/world';

export const GLOW_MAX = 100;
export const GLOW_START = 40; // 첫불 마을 등탑의 처음 밝기 (등탑별 값은 games/deungbul/shared/content/map.ts의 TOWERS)
export const GLOW_BRIGHT = 70; // 이 이상이면 '환함'
export const GLOW_DIM = 30; // 이 미만이면 '어스름'
export const TOWER_REACH = 6; // 등탑에 이만큼 가까워야 불씨를 바칠 수 있다

// 기여 단계의 보상(CONTRIB_TIERS)과 가득 찬 등탑이 한 번에 받는 불씨(FULL_TOWER_OFFER)는 economy.ts에 있고 여기서 다시 내보낸다
export { CONTRIB_TIERS, FULL_TOWER_OFFER } from './economy';
/** '오늘의 등탑지기' 명단에 보여 주는 사람 수 */
export const KEEPERS_SHOWN = 5;
/** 습격을 막아 내면 오늘의 명단에 더해지는 점수 (불씨 다섯 개를 바친 것과 같다) */
export const RAID_KEEP_POINTS = 5;

/** 밝기 단계: 0 어스름, 1 보통, 2 환함 */
export type Stage = 0 | 1 | 2;
export function stageOf(glow: number): Stage {
  return glow >= GLOW_BRIGHT ? 2 : glow >= GLOW_DIM ? 1 : 0;
}
/** 환함 단계의 혜택: 이동 속도와 자연 회복에 곱하는 값 */
export const GLOW_BRIGHT_SPEED = 1.1;
export const GLOW_BRIGHT_REGEN = 2;
/** 환함 단계에서는 발걸음이 빨라진다. 서버 판정과 클라이언트 예측이 같은 값을 쓴다. */
export function speedFor(stage: Stage): number {
  return PLAYER_SPEED * (stage === 2 ? GLOW_BRIGHT_SPEED : 1);
}
