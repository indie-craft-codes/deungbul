// 틀의 시험 가운데 시험용 내용(engine/test/fx/shared/content) 위에서 도는 것들을 차례로 돌린다.
// 별칭 @game이 이 폴더를 가리켜야 하므로 따로 된 프로세스로 돈다: test/all.ts가 tsx --tsconfig engine/test/fx/tsconfig.json으로 부른다.
//   npx tsx --tsconfig engine/test/fx/tsconfig.json engine/test/fx/all.ts [이름 …]
import { MAP } from '@game/shared/content';
import { failures } from '../harness';
import { AREAS } from '../../shared/world';

/** 시험용 내용으로 옮긴 틀의 시험 (engine/test/fx/이름.test.ts). 옮길 때마다 test/all.ts의 ENGINE에서 빼고 여기에 더한다 */
export const FX = ['monsters', 'move', 'nav', 'classes', 'shop', 'craft', 'party', 'build', 'guild', 'boss', 'combat', 'growth', 'dungeon', 'compare', 'bag', 'salvage', 'wallet', 'ledger', 'market', 'channel', 'security', 'harden', 'server'];
// 별칭이 이 폴더를 가리키는가: 틀이 읽은 맵이 시험용 맵이어야 한다 (뿌리의 tsconfig로 돌리면 등불지기의 맵으로 조용히 돈다)
if (AREAS !== MAP.areas || AREAS[0].id !== 'meadow') throw new Error('별칭 @game이 engine/test/fx를 가리키지 않습니다. tsx --tsconfig engine/test/fx/tsconfig.json 으로 실행하세요 (npm test가 그렇게 부른다)');

const only = process.argv.slice(2);
for (const name of only.length ? only : FX) {
  console.log(`\n[fx/${name}]`);
  await import(`./${name}.test.ts`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
