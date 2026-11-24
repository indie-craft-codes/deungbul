// 모든 테스트를 차례로 돌린다 (npm test). 하나만 돌리려면: npx tsx test/all.ts 이름 (예: growth, server)
// 새 테스트는 test/이름.test.ts를 만들고 아래 목록에 더한다.
import { failures } from './harness';

const ALL = ['move', 'shop', 'classes', 'monsters', 'combat', 'craft', 'party', 'keepers', 'quests', 'nav', 'zone2', 'boss', 'growth', 'channel', 'build', 'market', 'guild', 'dungeon', 'harden', 'guide', 'security', 'server'];
const only = process.argv.slice(2);
for (const name of only.length ? only : ALL) {
  console.log(`\n[${name}]`);
  await import(`./${name}.test.ts`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
