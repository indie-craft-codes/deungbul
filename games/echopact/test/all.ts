// 메아리 계약의 시험을 차례로 돌린다 (node scripts/game.mjs test echopact, npm test가 함께 돌린다).
//   node scripts/game.mjs test echopact -- pact   고른 것만 (pact, net, flow)
import { failures } from '@engine/testing';

const ALL = ['pact', 'net', 'flow', 'odds', 'live'];
const only = process.argv.slice(2);
for (const name of only.length ? only : ALL) {
  console.log(`\n[echopact/${name}]`);
  await import(`./${name}.test.ts`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
