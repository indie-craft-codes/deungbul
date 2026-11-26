// 반딧불 연못의 화면 진입점: (1) 언어 묶음 (2) 이 게임의 창 (3) 틀 시작
import { setLocales } from '@engine/client/i18n';
import { startClient } from '@engine/client';
import { LOCALES } from './i18n';
import { initScene, look } from './scene';
import { initTable, mountTable } from './table';

setLocales(LOCALES);
mountTable();
startClient({ look, modules: [initScene, initTable] });
