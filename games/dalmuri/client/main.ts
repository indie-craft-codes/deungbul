// 달무리 원정대의 화면 진입점. (1) 언어 묶음 (2) 메뉴 탭의 차례 (3) 틀 시작의 차례.
import { setLocales } from '@engine/client/i18n';
import { setMenuTabs, startClient } from '@engine/client';
import { initExpedition } from './expedition';
import { LOCALES } from './i18n';
import { initScene, look } from './scene';
import './dalmuri.css';

setLocales(LOCALES);
// 메뉴의 탭: 수집형의 넷과 영웅 장비, 단계(소탕·메뉴의 던전 줄), 원정(열쇠 사기·들어가기), 우편(방치 보상·던전 보상), 일일. 장비 탭은 던전 모듈의 의존으로만 있어 숨긴다
setMenuTabs(['heroes', 'gacha', 'squad', 'hgear', 'stages', 'expedition', 'mail', 'daily']);
// 단계와 열쇠 던전 안에서는 서버가 대신 싸운다(STAGE_RULES.leaderAuto, DungeonDef.auto). 들판(야영지)에서 자동 사냥은 없다 (away 모듈을 고르지 않았다).
// 쓰지 않는 틀의 단추(가방, 가까운 대상 공격)는 내용의 HUD.hide가 감춘다. 돌아왔을 때의 창은 IDLE.popup으로 틀이 붙인다
startClient({ look, modules: [initScene, initExpedition] });
