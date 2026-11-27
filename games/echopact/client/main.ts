// 이 게임의 클라이언트 진입점 (index.html이 이 파일을 읽는다). 게임이 틀을 시작시킨다.
import { setLocales } from '@engine/client/i18n';
import { setMenuTabs, startClient } from '@engine/client';
import { initEchoes } from './echoes';
import { LOCALES } from './i18n';
import { initScene, look } from './scene';
import { initTutorial } from './tutorial';
import './echopact.css';

// 차례가 중요하다: (1) 언어 묶음을 등록하고 (2) 틀을 시작시킨다. 틀은 시작하면서 화면의 글자를 채운다
setLocales(LOCALES);
// 메뉴의 탭: 수집형의 넷과 변신(두 장르의 다리)을 앞에, 들판의 탭(장비·일일·우편·친구)을 뒤에. 기기·설정 탭은 틀이 늘 붙인다
setMenuTabs(['gacha', 'odds', 'heroes', 'squad', 'stages', 'morph', 'gear', 'daily', 'mail', 'friends']);
startClient({
  look,
  // 이 게임의 모듈: 적은 차례대로 init되고, 틀의 덧붙는 모듈(상점, 가방, 메뉴 …)보다 먼저다
  modules: [initScene, initEchoes, initTutorial],
});
