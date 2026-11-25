// 별가루 광산의 시험을 차례로 돌린다 (npm run test:starmine). npm test도 이 파일을 찾아 함께 돌린다.
//   npm run test:starmine              전부
//   npm run test:starmine -- starmine  고른 것만
import { failures } from '@engine/testing';

const ALL = ['starmine'];
const only = process.argv.slice(2);
for (const name of only.length ? only : ALL) {
  console.log(`\n[starmine/${name}]`);
  await import(`./${name}.test.ts`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
