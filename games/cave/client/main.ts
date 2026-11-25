// 버섯 동굴의 화면 진입점
import { setLocales } from '@engine/client/i18n';
import { startClient } from '@engine/client';
import { initCave, mountCave } from './cave';
import { LOCALES } from './i18n';
import { initScene, look } from './scene';

setLocales(LOCALES);
mountCave();
startClient({ look, modules: [initCave, initScene] });
