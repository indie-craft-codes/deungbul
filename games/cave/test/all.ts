// 버섯 동굴의 시험 (npm run test:cave)
import { failures } from '@engine/testing';

const ALL = ['cave'];
const only = process.argv.slice(2);
for (const name of only.length ? only : ALL) {
  console.log(`\n[cave/${name}]`);
  await import(`./${name}.test.ts`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
