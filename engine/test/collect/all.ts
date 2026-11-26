// 수집형·방치형 모듈의 시험을 시험용 내용(engine/test/collect/shared/content: 영웅 들판) 위에서 돌린다.
// 별칭 @game이 이 폴더를 가리켜야 하므로 따로 된 프로세스로 돈다: test/all.ts가 tsx --tsconfig engine/test/collect/tsconfig.json으로 부른다.
//   npx tsx --tsconfig engine/test/collect/tsconfig.json engine/test/collect/all.ts [이름 …]
// 끝에 '틀만' 검사를 한다: 도는 동안 게임(games/ 아래)의 파일이 하나도 로드되지 않았는가.
import { registerHooks } from 'node:module';
import { MAP } from '@game/shared/content';
import { check, failures } from '../harness';
import { AREAS } from '../../shared/world';

/** 수집형·방치형의 시험 (engine/test/collect/이름.test.ts) */
export const COLLECT = ['rules', 'saves', 'client', 'net', 'growth', 'growthsaves', 'growthnet', 'growthclient', 'sweep', 'offline', 'pickup', 'sweepnet'];
if (AREAS !== MAP.areas || AREAS[0].id !== 'heath') throw new Error('별칭 @game이 engine/test/collect를 가리키지 않습니다. tsx --tsconfig engine/test/collect/tsconfig.json 으로 실행하세요 (npm test가 그렇게 부른다)');

const loaded: string[] = [];
registerHooks({ load(url, context, next) { loaded.push(url); return next(url, context); } });

const only = process.argv.slice(2);
for (const name of only.length ? only : COLLECT) {
  console.log(`\n[collect/${name}]`);
  await import(`./${name}.test.ts`);
}
const games = loaded.filter((u) => u.includes('/games/'));
for (const u of games) console.log('  ' + u);
console.log('\n[collect/틀만]');
check(games.length === 0, `수집형의 시험을 도는 동안 게임의 파일(games/ 아래)이 하나도 로드되지 않았다 (로드된 모듈 ${loaded.length}개)`);
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
