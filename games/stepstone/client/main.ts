// 징검돌 전술의 화면 진입점. 차례: (1) 언어 묶음 (2) 이 게임의 창 (3) 틀 시작
import { startClient } from '@engine/client';
import { setLocales } from '@engine/client/i18n';
import { LOCALES } from './i18n';
import { initDuel, mountDuel } from './duel';
import { initScene, look } from './scene';

setLocales(LOCALES);
mountDuel();
startClient({ look, modules: [initDuel, initScene] });
