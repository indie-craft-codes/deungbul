// 이 게임(등불지기)의 개인 상태: 서버가 me 메시지로 알려 주는 내 진행 (퀘스트, 기여, 기여 단계, 휴식 보너스).
// 틀의 상태(../state.ts의 S)에는 이 칸들이 없다. 고치는 곳은 메시지를 받는 game/deungbul.ts 하나이고, 이 게임의 화면이 읽는다.
import type { MeState } from '../../../shared/deungbul';

export const G: MeState = {
  quest: { c: 0, s: 0, n: 0 },
  contrib: 0,
  tier: 0,
  rested: 0,
};
