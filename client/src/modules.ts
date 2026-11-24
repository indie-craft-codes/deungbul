// 덧붙는 기능 모듈의 목록. 새 기능은 파일을 만들고 여기에 init 한 줄을 더한다.
// 모듈은 init 안에서 필요한 것(서버 메시지, 프레임, 언어 변경)을 bus와 i18n에 스스로 등록한다.
import { initAuto } from './auto';
import { initDeungbul } from './game/deungbul';
import { initAutoName } from './hud/autoname';
import { initBag } from './hud/bag';
import { initChannel } from './hud/channel';
import { initDungeon } from './hud/dungeon';
import { initGuideLink } from './hud/guidelink';
import { initMarks } from './hud/marks';
import { initMenu } from './hud/menu';
import { initMinimap } from './hud/minimap';
import { initNear } from './hud/near';
import { initSound } from './sound';

export function initModules(): void {
  initDeungbul(); // 맨 먼저: 뒤의 모듈과, main.ts가 이어서 부르는 화면 코드(상인 세우기, 대장간)가 이 게임이 채운 규칙(rules)을 읽는다
  initAuto();
  initBag();
  initMinimap();
  initMarks();
  initMenu();
  initChannel();
  initGuideLink();
  initDungeon();
  initNear();
  initSound();
  initAutoName();
}
