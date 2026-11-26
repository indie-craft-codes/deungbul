// 공 마당의 화면: 핵심만 쓰는 게임의 화면이 무엇을 갖는지 보는 본보기 (모듈 0개). 언어는 id 이름표에 처음 이름의 재료만 더한다.
import { enBase } from '@engine/client/i18n/en';
import { koBase } from '@engine/client/i18n/ko';
import { withIdNames } from '@engine/client/i18n/names';
import { setLocales } from '@engine/client/i18n';
import { makeBall, onKey, registerKind, send, startClient } from '@engine/client';

setLocales([
  koBase(withIdNames({ nameA: ['빠른', '느긋한', '반짝이는'], nameB: ['공잡이', '마당지기'] })),
  enBase(withIdNames({ nameA: ['Quick', 'Calm', 'Shiny'], nameB: ['Catcher', 'Keeper'] })),
]);
// 서버의 공(g.defineKind('ball'))을 그린다: 빛나는 공은 금빛, 누가 주운 공은 회색으로 작게
registerKind('ball', {
  model: () => makeBall(0xf0c040, 0.45),
  update: (m, [glow]) => { m.root.scale.setScalar(glow ? 1 : 0.6); },
  label: () => '공',
  dot: '#f0c040',
});
// F: 가까운 공 줍기 (게임의 명령)
onKey('f', () => send({ t: 'pick' } as never));
startClient({});
