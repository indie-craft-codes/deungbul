// 달무리 원정대의 화면 진입점. (1) 언어 묶음 (2) 이 게임의 창 (3) 틀 시작의 차례.
import { setLocales } from '@engine/client/i18n';
import { rules, setMenuTabs, startClient } from '@engine/client';
import { initExpedition, mountExpedition } from './expedition';
import { LOCALES } from './i18n';
import { initScene, look } from './scene';
import './dalmuri.css';

setLocales(LOCALES);
mountExpedition();
// 메뉴의 탭: 수집형의 넷, 원정(열쇠 던전·별정수), 우편(방치 보상·던전 보상), 일일. 장비 탭은 던전 모듈의 의존으로만 있어 숨긴다
setMenuTabs(['heroes', 'gacha', 'squad', 'stages', 'expedition', 'mail', 'daily']);
// 단계 안에서는 서버가 대신 싸운다. 들판(던전 밖)에서 자동 사냥은 없다 (away 모듈을 고르지 않았다)
void rules;
startClient({ look, modules: [initScene, initExpedition] });
