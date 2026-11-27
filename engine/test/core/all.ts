// 틀의 '핵심만' 시험을 최소 내용(engine/test/core/shared/content: 모듈 0개, 공 마당) 위에서 돌린다.
// 별칭 @game이 이 폴더를 가리켜야 하므로 따로 된 프로세스로 돈다: test/all.ts가 tsx --tsconfig engine/test/core/tsconfig.json으로 부른다.
//   npx tsx --tsconfig engine/test/core/tsconfig.json engine/test/core/all.ts [이름 …]
// 끝에 '틀만' 검사를 한다: 도는 동안 게임(games/ 아래)의 파일이 하나도 로드되지 않았는가.
import { registerHooks } from 'node:module';
import { MAP } from '@game/shared/content';
import { check, failures } from '../harness';
import { AREAS } from '../../shared/world';

/** 핵심만의 시험 (engine/test/core/이름.test.ts) */
export const CORE = ['core', 'rooms', 'compete'];
if (AREAS !== MAP.areas || AREAS[0].id !== 'yard') throw new Error('별칭 @game이 engine/test/core를 가리키지 않습니다. tsx --tsconfig engine/test/core/tsconfig.json 으로 실행하세요 (npm test가 그렇게 부른다)');

const loaded: string[] = [];
registerHooks({ load(url, context, next) { loaded.push(url); return next(url, context); } });

const only = process.argv.slice(2);
for (const name of only.length ? only : CORE) {
  console.log(`\n[core/${name}]`);
  await import(`./${name}.test.ts`);
}
const games = loaded.filter((u) => u.includes('/games/'));
for (const u of games) console.log('  ' + u);
console.log('\n[core/틀만]');
check(games.length === 0, `핵심만의 시험을 도는 동안 게임의 파일(games/ 아래)이 하나도 로드되지 않았다 (로드된 모듈 ${loaded.length}개)`);
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
