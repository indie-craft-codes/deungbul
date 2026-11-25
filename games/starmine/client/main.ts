// 이 게임의 클라이언트 진입점 (index.html이 이 파일을 읽는다). 게임이 틀을 시작시킨다.
import { setLocales } from '@engine/client/i18n';
import { startClient } from '@engine/client';
import { initDrill, mountDrill } from './drill';
import { LOCALES } from './i18n';
import { initScene, look } from './scene';

// 차례가 중요하다: (1) 언어 묶음을 등록하고 (2) 이 게임의 창을 붙인 뒤에 (3) 틀을 시작시킨다
setLocales(LOCALES);
mountDrill();
startClient({ look, modules: [initDrill, initScene] });
