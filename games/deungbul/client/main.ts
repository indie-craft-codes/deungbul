// 이 게임(등불지기)의 클라이언트 진입점 (games/deungbul/client/index.html이 이 파일을 읽는다). 게임이 틀을 시작시킨다:
// 지형의 겉모습(땅과 잎의 색, 건물)과 이 게임의 모듈 목록을 들고 틀의 startClient를 부른다. 틀의 파일은 이 폴더(games/deungbul/)를 import하지 않는다.
// 이 게임에만 있는 새 화면은 이 폴더 아래에 파일을 만들고 아래 목록에 init 한 줄을 더한다 (어느 게임에나 쓸 기능은 틀의 modules.ts에).
import { startClient } from '@engine/client';
import { initDeungbul, initResidents } from './deungbul';
import { initGuideLink } from './hud/guidelink';
import { initMarks } from './hud/marks';
import { mountMarkup } from './markup';
import { initQuest } from './hud/quest';
import { initRaid } from './hud/raid';
import { initTower } from './hud/tower';
import { initZone } from './hud/zone';
import { initModels } from './scene/models';
import { ground, leaf } from './scene/paint';
import { initScene } from './scene/scene';
import { buildScenery } from './scene/scenery';

// 이 게임의 창을 틀의 빈 자리에 붙인다 (틀의 index.html에는 틀의 창만 있다). 틀을 시작시키기 전이어야 한다: 모듈들이 init에서 요소를 잡는다
mountMarkup();

startClient({
  look: { ground, leaf, scenery: buildScenery },
  // 적은 차례대로 init되고, 같은 메시지·같은 주기 안에서도 이 차례로 그린다. 틀의 덧붙는 모듈(상점, 대장간, 메뉴 등)은 이 뒤에 init된다.
  modules: [
    initDeungbul, // 맨 먼저: 규칙(rules)을 채우고 공유 상태를 받아 둔다. 뒤의 모듈과 틀의 화면 코드(상점, 대장간, 상인 세우기)가 그것을 읽는다
    initRaid,
    initZone,
    initTower,
    initResidents,
    initQuest,
    initMarks,
    initGuideLink,
    initModels,
    initScene,
  ],
});
