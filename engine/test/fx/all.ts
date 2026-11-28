// 틀의 시험을 시험용 내용(engine/test/fx/shared/content) 위에서 차례로 돌린다.
// 별칭 @game이 이 폴더를 가리켜야 하므로 따로 된 프로세스로 돈다: test/all.ts가 tsx --tsconfig engine/test/fx/tsconfig.json으로 부른다.
//   npx tsx --tsconfig engine/test/fx/tsconfig.json engine/test/fx/all.ts [이름 …]
// 끝에 '틀만' 검사를 한다: 틀의 시험이 도는 동안 게임(games/ 아래)의 파일이 하나도 로드되지 않았는가. 틀은 게임 없이 시험된다.
import { registerHooks } from 'node:module';
import { MAP } from '@game/shared/content';
import { check, failures } from '../harness';
import { AREAS } from '../../shared/world';

/** 틀의 시험 (engine/test/fx/이름.test.ts). 새 시험은 여기에 더한다 */
export const FX = ['bare', 'autoprefs', 'monsters', 'move', 'nav', 'classes', 'shop', 'craft', 'party', 'build', 'guild', 'boss', 'combat', 'growth', 'dungeon', 'compare', 'skills', 'locale', 'icons', 'assets', 'motion', 'bag', 'salvage', 'wallet', 'ledger', 'market', 'channel', 'security', 'harden', 'server', 'admin', 'handoff', 'ops', 'static', 'client', 'modules', 'parts', 'wire', 'teams', 'hotpath', 'liveops', 'web', 'platform', 'social', 'opstools'];
// 별칭이 이 폴더를 가리키는가: 틀이 읽은 맵이 시험용 맵이어야 한다 (뿌리의 tsconfig로 돌리면 등불지기의 맵으로 조용히 돈다)
if (AREAS !== MAP.areas || AREAS[0].id !== 'meadow') throw new Error('별칭 @game이 engine/test/fx를 가리키지 않습니다. tsx --tsconfig engine/test/fx/tsconfig.json 으로 실행하세요 (npm test가 그렇게 부른다)');

// 로드되는 모듈을 적어 둔다 (이 뒤에 import되는 시험 파일부터 센다)
const loaded: string[] = [];
registerHooks({ load(url, context, next) { loaded.push(url); return next(url, context); } });

const only = process.argv.slice(2);
for (const name of only.length ? only : FX) {
  console.log(`\n[fx/${name}]`);
  await import(`./${name}.test.ts`);
}
const games = loaded.filter((u) => u.includes('/games/'));
for (const u of games) console.log('  ' + u);
console.log('\n[fx/틀만]');
check((only.length > 0 || loaded.some((u) => u.endsWith('/server/game/game.ts'))) && games.length === 0, `틀의 시험을 도는 동안 게임의 파일(games/ 아래)이 하나도 로드되지 않았다 (로드된 모듈 ${loaded.length}개)`);
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
