// 등불지기의 시험을 차례로 돌린다. 별칭 @game이 이 게임을 가리켜야 하므로 이 게임의 tsconfig로 돈다:
//   npm run test:game                 전부 (= node scripts/game.mjs test deungbul)
//   npm run test:game -- quests shop  고른 것만
//   npm test                          틀의 시험과 모든 게임의 시험 (뿌리의 test/all.ts가 이것을 부른다. 거기서는 deungbul/이름으로 고른다)
// 새 시험: games/deungbul/test/이름.test.ts를 만들어 아래 GAME에 더한다. 게임은 game.ts의 newGame()으로 만든다.
import { failures } from '@engine/testing';

/** 이 게임의 시험 (games/deungbul/test/이름.test.ts) */
export const GAME = ['framework', 'baseline', 'split', 'shop', 'classes', 'combat', 'craft', 'party', 'keepers', 'quests', 'nav', 'zone2', 'channel', 'ledger', 'harden', 'guide', 'enhance', 'deep', 'zone3', 'server', 'saves'];

const only = process.argv.slice(2);
for (const name of only.length ? only : GAME) {
  console.log(`\n[deungbul/${name}]`);
  await import(`./${name}.test.ts`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
