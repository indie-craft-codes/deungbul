// 별 줍기의 화면 진입점 (stars.html: 판 모듈 rooms를 고른 공 마당). 서버는 STARS=1로 띄운 server/main.ts. 눈으로 보는 용도다.
// stars.html이 이 파일보다 먼저 globalThis.CORE_STARS를 세워 내용(shared/content)이 'rooms'를 고른다.
import { enBase } from '@engine/client/i18n/en';
import { koBase } from '@engine/client/i18n/ko';
import { withIdNames } from '@engine/client/i18n/names';
import { setLocales } from '@engine/client/i18n';
import { startClient } from '@engine/client';
import { initStars } from './stars';

setLocales([
  koBase(withIdNames({ nameA: ['빠른', '느긋한', '반짝이는'], nameB: ['별잡이', '마당지기'] })),
  enBase(withIdNames({ nameA: ['Quick', 'Calm', 'Shiny'], nameB: ['Catcher', 'Keeper'] })),
]);
startClient({ modules: [initStars] });
