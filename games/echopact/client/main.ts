// 이 게임의 클라이언트 진입점 (index.html이 이 파일을 읽는다). 게임이 틀을 시작시킨다.
import { setLocales } from '@engine/client/i18n';
import { setMenuTabs, startClient } from '@engine/client';
import { initEchoes } from './echoes';
import { LOCALES } from './i18n';
import { initScene, look } from './scene';
import { initTower } from './tower';
import { initTutorial } from './tutorial';
import './echopact.css';

// 차례가 중요하다: (1) 언어 묶음을 등록하고 (2) 틀을 시작시킨다. 틀은 시작하면서 화면의 글자를 채운다
setLocales(LOCALES);
// 메뉴의 탭은 게임마다 다르다 (내용의 MODE_RULES.list의 tabs: 탑은 뽑기·메아리·편성·단계, 울림골은 변신·장비). 서버가 모드를 알려 주기 전의 차례는 탑의 것
setMenuTabs(['gacha', 'heroes', 'squad', 'stages', 'daily', 'mail', 'friends']);
startClient({
  look,
  // 이 게임의 모듈: 적은 차례대로 init되고, 틀의 덧붙는 모듈(상점, 가방, 메뉴 …)보다 먼저다
  modules: [initScene, initEchoes, initTower, initTutorial],
});
