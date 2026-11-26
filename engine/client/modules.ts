// 틀의 화면 모듈의 목록. 모듈은 init 안에서 필요한 것(서버 메시지, 프레임, 느린 주기, 언어 변경, 단축키)을 bus와 i18n에 스스로 등록한다.
// mod를 적은 것은 그 선택 모듈(engine/shared/modules.ts)을 고른 게임에서만 init된다: 고르지 않으면 그 창·단추·단축키가 생기지 않는다
// (그 창의 마크업도 뼈대를 붙일 때 빠진다: hud/skeleton.ts의 data-mod). mod가 없는 것은 핵심이다.
// 게임에만 있는 모듈은 여기에 두지 않는다: 게임의 진입점이 startClient에 넘긴다 (등불지기는 games/deungbul/client/main.ts). 게임의 모듈이 이 목록보다 먼저 init된다 (main.ts).
// 틀에 어느 게임에나 쓸 새 화면 모듈을 더할 때는 파일을 만들고 아래에 한 줄을 더한다.
import type { ModuleId } from '../shared/modules';
import { initAuto } from './auto';
import { initAutoName } from './hud/autoname';
import { initBag } from './hud/bag';
import { initBuffs } from './hud/buffs';
import { initChannel } from './hud/channel';
import { initClasses } from './hud/classes';
import { initGacha, initRoster, initSquad } from './hud/collect';
import { initDevice } from './hud/device';
import { initDungeon } from './hud/dungeon';
import { initForge } from './hud/forge';
import { initHeroGear } from './hud/herogrow';
import { initMenu } from './hud/menu';
import { initMinimap } from './hud/minimap';
import { initNear } from './hud/near';
import { initCard, initParty } from './hud/party';
import { initShop } from './hud/shop';
import { initStages } from './hud/stagebar';
import { initTeams } from './hud/teams';
import { initWorldMap } from './hud/worldmap';
import { hasModule } from './mods';
import { initSound } from './sound';

/** 차례대로 init한다. 상점, 대장간, 직업 고르기가 앞이다: 가르기 전에 main.ts가 직접 부르던 차례(같은 메시지와 같은 주기 안에서 다른 모듈보다 먼저)를 지킨다 */
const LIST: { init: () => void; mod?: ModuleId }[] = [
  { init: initShop, mod: 'items' },
  { init: initForge, mod: 'items' },
  { init: initClasses, mod: 'classes' },
  { init: initCard },
  { init: initParty, mod: 'party' },
  { init: initTeams, mod: 'teams' },
  { init: initAuto, mod: 'away' },
  { init: initBag, mod: 'items' },
  { init: initBuffs, mod: 'combat' },
  { init: initMinimap },
  { init: initWorldMap },
  { init: initMenu },
  { init: initDevice }, // 메뉴의 '기기' 탭: 메뉴 뒤에
  { init: initChannel },
  { init: initDungeon, mod: 'dungeon' },
  { init: initNear },
  { init: initSound },
  { init: initAutoName },
  // 수집형·방치형: 맨 뒤에 (고르지 않은 게임의 init 차례가 예전과 같게)
  { init: initRoster, mod: 'roster' },
  { init: initGacha, mod: 'gacha' },
  { init: initSquad, mod: 'squad' },
  { init: initStages, mod: 'stages' },
  // 영웅 장비 (수집형의 선택 모듈): 그 뒤에
  { init: initHeroGear, mod: 'herogear' },
];

export function initModules(): void {
  for (const m of LIST) if (!m.mod || hasModule(m.mod)) m.init();
}
