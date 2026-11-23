// 덧붙는 기능 모듈의 목록. 새 기능은 파일을 만들고 여기에 init 한 줄을 더한다.
// 모듈은 init 안에서 필요한 것(서버 메시지, 프레임, 언어 변경)을 bus와 i18n에 스스로 등록한다.
import { initAuto } from './auto';
import { initBag } from './hud/bag';
import { initDungeon } from './hud/dungeon';
import { initMarks } from './hud/marks';
import { initMenu } from './hud/menu';
import { initMinimap } from './hud/minimap';

export function initModules(): void {
  initAuto();
  initBag();
  initMinimap();
  initMarks();
  initMenu();
  initDungeon();
}
