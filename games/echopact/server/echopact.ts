// 이 게임(메아리 계약)의 규칙 플러그인. 틀(engine/server)은 이 파일을 모른다: 서버 진입점(./main.ts)과 시험이 넘긴다.
// 이 게임만의 규칙은 두 장르를 잇는 다리(./pact.ts) 하나다. 들판·뽑기·편성·단계·변신은 모두 틀의 모듈이다.
import { dist, type Game } from '@engine/server';
import { MAP as aliased } from '@engine/shared/world';
import { MAP } from '../shared/content';
import { WELL } from '../shared/content/pact';
import { installBoards } from './boards';
import { installPact } from './pact';

// 틀이 별칭 @game으로 읽은 내용이 이 게임의 것인가. tsx는 --tsconfig를 주지 않으면 뿌리의 tsconfig.json을 읽어 다른 게임의 내용으로 조용히 뜬다
if (MAP !== aliased) throw new Error('별칭 @game이 games/echopact를 가리키지 않습니다. node scripts/game.mjs start echopact 로 실행하세요');

export function installEchopact(g: Game): void {
  // 들판의 집은 울림 샘: 쓰러지면 샘 앞에서 일어나고(단계 안에서는 단계 모듈이 맡는다), 직업은 샘 곁에서 바꾼다
  g.rules.respawn = () => ({ x: WELL.x, z: WELL.z + 5, id: 'well' });
  g.rules.canChangeClass = (p) => dist(p, WELL) <= 7;
  installPact(g);
  // 순위표 (경쟁 묶음 8): 탑 최고 단계(주간)·편성 전투력 (./boards.ts)
  installBoards(g);
}
