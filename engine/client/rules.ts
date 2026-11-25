// 틀의 화면 코드가 이 게임의 규칙을 묻는 자리. 서버의 g.rules(engine/server/game/game.ts의 Rules)와 짝이다.
// 틀(상점, 대장간, 알림, 이동 예측)은 주민이나 등탑을 직접 읽지 않고 여기에 묻고, 게임의 모듈(games/deungbul/client/deungbul.ts)이 값을 채운다.
// 아무도 채우지 않으면 기본 규칙이다: 기본 속도, 잠긴 것 없음. 서버의 기본값과 같아야 예측이 어긋나지 않는다.
import { MAP, PLAYER_SPEED } from '../shared/world';

export interface Rules {
  /** 지금 내 이동 속도. 서버의 g.rules.speed(p)와 같은 값을 내야 한다 (다르면 걷는 동안 서버 위치로 되감긴다) */
  speed: () => number;
  /** 조건(key)이 풀렸는가: 상점 물건(ItemDef.needs)과 제작의 잠금. 서버의 g.rules.unlocked와 같은 판정 */
  unlocked: (key: string) => boolean;
  /** 잠긴 것의 자리에 대신 적는 짧은 글 (상점의 "…가 돌아오면 들어옵니다") */
  lockNote: (key: string) => string;
  /** 잠긴 것을 어떻게 푸는지 알려 주는 한 줄. 풀려 있거나 알려 줄 것이 없으면 빈 문자열 */
  lockHint: (key: string) => string;
  /** '마을로'(H 키)가 데려가는 곳. 채우지 않으면 맵의 처음 자리(MAP.spawn) */
  home: () => { x: number; z: number };
  /** 접속할 때 자동 사냥을 켜고 시작하는가 (방치형 게임). 기본은 끈 채로: 자리를 비운 동안 사냥하던 캐릭터를 이어받을 때만 켠다 */
  autoAtStart: () => boolean;
}

export const rules: Rules = {
  speed: () => PLAYER_SPEED,
  unlocked: () => true,
  lockNote: () => '',
  lockHint: () => '',
  home: () => MAP.spawn,
  autoAtStart: () => false,
};
