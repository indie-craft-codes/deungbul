// 굴림공의 시험을 차례로 돌린다 (node scripts/game.mjs test rollball, npm test도 함께).
import { failures } from '@engine/testing';

const ALL = ['rules'];
const only = process.argv.slice(2);
for (const name of only.length ? only : ALL) {
  console.log(`\n[rollball/${name}]`);
  await import(`./${name}.test.ts`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
