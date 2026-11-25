// 이 게임(별가루 광산)의 규칙 플러그인과 서버 쪽 선언. 틀(engine/server)은 이 파일을 모른다: 서버 진입점(./main.ts)과 시험이 넘긴다.
import type { Ent, Game } from '@engine/server';
import { MAP as aliased } from '@engine/shared/world';
import { MAP } from '../shared/content';
import { DRILL } from '../shared/content/drill';
import { Drill, type DrillState } from './drill';

// 틀이 별칭 @game으로 읽은 내용이 이 게임의 것인가. tsx는 --tsconfig를 주지 않으면 뿌리의 tsconfig.json을 읽어 다른 게임의 내용으로 조용히 뜬다
if (MAP !== aliased) throw new Error('별칭 @game이 games/starmine을 가리키지 않습니다. tsx --tsconfig games/starmine/tsconfig.json 으로 실행하세요 (npm run start:starmine)');

declare module '@engine/server/game/ext' {
  /** g.drill */
  interface GameSystems { drill: Drill }
  /** p.drill: 채굴기와 각인. 처음 값과 저장은 Drill이 맡는다 */
  interface EntExt { drill: DrillState }
  /** 저장고의 별가루를 거뒀다 */
  interface HooksExt { collected: (p: Ent, n: number) => void }
}

export function installStarmine(g: Game): void {
  g.drill = new Drill(g);
  // 쓰러지면 광산 입구 앞에서 일어난다
  g.rules.respawn = () => ({ x: DRILL.x, z: DRILL.z + 4, id: 'mine' });
  // 일일 임무 '별가루 거두기'(DAILIES의 kind: 'collect')를 센다. g.daily는 플러그인보다 뒤에 만들어지므로 ready에서 잇는다
  g.ready.push(() => { const daily = g.daily; g.on('collected', (p) => daily.add(p, 'collect', 1)); });
}
