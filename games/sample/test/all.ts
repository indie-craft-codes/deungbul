// 예제 게임의 시험을 차례로 돌린다 (npm run test:sample). 등불지기의 시험(npm test)과는 따로 돈다: 별칭 @game이 가리키는 게임이 다르다.
//   npm run test:sample           전부
//   npm run test:sample -- empty  고른 것만 (sample, empty)
import { failures } from '@engine/test/harness';

const ALL = ['sample', 'empty'];
const only = process.argv.slice(2);
for (const name of only.length ? only : ALL) {
  console.log(`\n[sample/${name}]`);
  await import(`./${name}.test.ts`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
