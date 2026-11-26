// 이 게임의 클라이언트 진입점 (index.html이 이 파일을 읽는다). 게임이 틀을 시작시킨다.
import { setLocales } from '@engine/client/i18n';
import { startClient } from '@engine/client';
import { initBonfire, mountBonfire } from './bonfire';
import { LOCALES } from './i18n';
import { initScene, look } from './scene';
import { initCharStands } from './chars';

// 차례가 중요하다: (1) 언어 묶음을 등록하고 (2) 이 게임의 창을 붙인 뒤에 (3) 틀을 시작시킨다. 틀은 시작하면서 화면의 글자를 채운다
setLocales(LOCALES);
mountBonfire();
startClient({
  look,
  // 이 게임의 모듈: 적은 차례대로 init되고, 틀의 덧붙는 모듈(상점, 가방, 메뉴 …)보다 먼저다
  modules: [initBonfire, initScene, initCharStands],
});
