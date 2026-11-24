// 이 게임(모닥불 사냥터)의 규칙 플러그인과 서버 쪽 선언. 틀(engine/server)은 이 파일을 모른다: 서버 진입점(./main.ts)과 시험이 넘긴다.
import type { Ent, Game } from '@engine/server';
import { MAP as aliased } from '@engine/shared/world';
import { MAP } from '../shared/content';
import { Bonfire } from './bonfire';

// 틀이 별칭 @game으로 읽은 내용이 이 게임의 것인가. tsx는 --tsconfig를 주지 않으면 뿌리의 tsconfig.json을 읽어 다른 게임의 내용으로 조용히 뜬다
if (MAP !== aliased) throw new Error('별칭 @game이 games/sample을 가리키지 않습니다. tsx --tsconfig games/sample/tsconfig.json 으로 실행하세요 (npm run start:sample)');

declare module '@engine/server/game/ext' {
  /** g.bonfire */
  interface GameSystems { bonfire: Bonfire }
  /** p.fed: 지금까지 넣은 장작. 처음 값과 저장은 Bonfire가 맡는다 */
  interface EntExt { fed: number }
  /** 장작을 넣었다 */
  interface HooksExt { fed: (p: Ent, n: number) => void }
}

export function installSample(g: Game): void {
  g.bonfire = new Bonfire(g);
  // 일일 임무 '장작 넣기'(DAILIES의 kind: 'feed')를 센다. 임무 시스템(g.daily)은 플러그인보다 뒤에 만들어지므로, 모두 만들어진 뒤(ready)에 잇는다
  g.ready.push(() => { const daily = g.daily; g.on('fed', (p, n) => daily.add(p, 'feed', n)); });
}
