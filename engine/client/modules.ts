// 틀에 덧붙는 기능 모듈의 목록. 어느 게임에나 쓸 새 기능은 파일을 만들고 여기에 init 한 줄을 더한다.
// 모듈은 init 안에서 필요한 것(서버 메시지, 프레임, 느린 주기, 언어 변경)을 bus와 i18n에 스스로 등록한다.
// 게임에만 있는 모듈은 여기에 두지 않는다: 게임의 진입점이 startClient에 넘긴다 (이 게임은 games/deungbul/client/main.ts). 게임의 모듈이 이 목록보다 먼저 init된다 (main.ts).
import { initAuto } from './auto';
import { initAutoName } from './hud/autoname';
import { initBag } from './hud/bag';
import { initBuffs } from './hud/buffs';
import { initChannel } from './hud/channel';
import { initClasses } from './hud/classes';
import { initDevice } from './hud/device';
import { initDungeon } from './hud/dungeon';
import { initForge } from './hud/forge';
import { initMenu } from './hud/menu';
import { initMinimap } from './hud/minimap';
import { initNear } from './hud/near';
import { initParty } from './hud/party';
import { initShop } from './hud/shop';
import { initWorldMap } from './hud/worldmap';
import { initSound } from './sound';

export function initModules(): void {
  // 상점, 대장간, 직업 고르기가 앞이다: 가르기 전에 main.ts가 직접 부르던 차례(같은 메시지와 같은 주기 안에서 다른 모듈보다 먼저)를 지킨다
  initShop();
  initForge();
  initClasses();
  initParty();
  initAuto();
  initBag();
  initBuffs();
  initMinimap();
  initWorldMap();
  initMenu();
  initDevice(); // 메뉴의 '기기' 탭: 메뉴 뒤에
  initChannel();
  initDungeon();
  initNear();
  initSound();
  initAutoName();
}
