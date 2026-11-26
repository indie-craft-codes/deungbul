// 굴림공의 규칙 플러그인과 서버 쪽 선언. 틀(engine/server)은 이 파일을 모른다: 서버 진입점(./main.ts)과 시험이 넘긴다.
import type { Game } from '@engine/server';
import { MAP as aliased } from '@engine/shared/world';
import { MAP } from '../shared/content';
import { Pitch } from './pitch';

// 틀이 별칭 @game으로 읽은 내용이 이 게임의 것인가 (tsx에 --tsconfig를 주지 않으면 다른 게임의 내용으로 조용히 뜬다)
if (MAP !== aliased) throw new Error('별칭 @game이 games/rollball을 가리키지 않습니다. node scripts/game.mjs start rollball 로 실행하세요');

declare module '@engine/server/game/ext' {
  /** g.pitch */
  interface GameSystems { pitch: Pitch }
}

export function installRollball(g: Game): void {
  g.pitch = new Pitch(g);
}
