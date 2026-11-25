// 이 게임의 클라이언트 진입점 (index.html이 이 파일을 읽는다).
import { setLocales } from '@engine/client/i18n';
import { startClient } from '@engine/client';
import { LOCALES } from './i18n';
import { initScene, look } from './scene';
import { initWaves, mountWaves } from './waves';

// 차례: (1) 언어 묶음 (2) 이 게임의 창 (3) 틀을 시작
setLocales(LOCALES);
mountWaves();
startClient({ look, modules: [initWaves, initScene] });
