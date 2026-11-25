// 이 게임(돌담 마을)의 규칙 플러그인과 서버 쪽 선언. 틀(engine/server)은 이 파일을 모른다: 서버 진입점(./main.ts)과 시험이 넘긴다.
import type { Game } from '@engine/server';
import { MAP as aliased } from '@engine/shared/world';
import { MAP } from '../shared/content';
import { type WaveOptions, Waves } from './waves';

// 틀이 별칭 @game으로 읽은 내용이 이 게임의 것인가 (tsx에 --tsconfig를 주지 않으면 다른 게임의 내용으로 조용히 뜬다)
if (MAP !== aliased) throw new Error('별칭 @game이 games/bastion을 가리키지 않습니다. tsx --tsconfig games/bastion/tsconfig.json 으로 실행하세요 (npm run start:bastion)');

declare module '@engine/server/game/ext' {
  /** g.waves */
  interface GameSystems { waves: Waves }
  /** p.held: 지금까지 막아 낸 물결의 수 */
  interface EntExt { held: number }
}

/** 규칙 플러그인을 만든다: 물결의 간격을 바꾸려면 옵션을 준다 (서버는 환경 변수 WAVE_S, 시험은 짧게) */
export const bastion = (opts: WaveOptions = {}) => (g: Game): void => { g.waves = new Waves(g, opts); };
/** 기본 수치의 플러그인 */
export const installBastion = bastion();
