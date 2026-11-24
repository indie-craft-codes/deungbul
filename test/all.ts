// 모든 테스트를 차례로 돌린다 (npm test). 틀의 시험과 이 게임(등불지기)의 시험이 따로 있다.
//   npm test                  전부 (틀 → 게임)
//   npm run test:engine       틀만: 이 게임의 규칙 플러그인 없이 돈다. 끝에 게임의 규칙 파일이 하나도 로드되지 않았는지 확인한다
//   npm run test:game         이 게임의 것만
//   npx tsx test/all.ts 이름   고른 것만 (예: growth server deungbul/quests)
// 시험 파일의 자리: 틀의 것은 engine/test/이름.test.ts, 이 게임의 것은 games/deungbul/test/이름.test.ts (명령에서는 예전처럼 deungbul/이름으로 가리킨다).
// 새 테스트: 틀의 기능이면 engine/test/에 만들어 ENGINE에, 이 게임의 규칙이면 games/deungbul/test/에 만들어 GAME에 더한다.
// 틀의 시험은 new Game()으로(규칙 플러그인 없음), 게임의 시험은 games/deungbul/test/game.ts의 newGame()으로 게임을 만든다.
import { registerHooks } from 'node:module';
import { check, failures } from '../engine/test/harness';

const ENGINE = ['framework', 'move', 'shop', 'classes', 'monsters', 'combat', 'craft', 'party', 'nav', 'boss', 'growth', 'channel', 'build', 'market', 'guild', 'dungeon', 'bag', 'salvage', 'wallet', 'ledger', 'harden', 'security', 'server'];
const GAME = ['framework', 'shop', 'classes', 'combat', 'craft', 'party', 'keepers', 'quests', 'nav', 'zone2', 'channel', 'ledger', 'harden', 'guide', 'server'].map((n) => `deungbul/${n}`);
/** 이 게임의 규칙 파일: 틀의 시험을 도는 동안 로드되면 안 된다 (engine/test/framework.test.ts의 GAME_FILES와 같다) */
const GAME_RULES = /\/games\/deungbul\/(server|test)\//;
/** 이름 → 시험 파일. 'deungbul/이름'은 이 게임의 시험이다 */
const fileOf = (name: string): string => (name.startsWith('deungbul/') ? `../games/deungbul/test/${name.slice('deungbul/'.length)}.test.ts` : `../engine/test/${name}.test.ts`);

const args = process.argv.slice(2), engineOnly = args.includes('--engine'), gameOnly = args.includes('--game');
const only = args.filter((a) => !a.startsWith('--'));
const names = only.length ? only : engineOnly ? ENGINE : gameOnly ? GAME : [...ENGINE, ...GAME];

// 로드되는 모듈을 적어 둔다 (이 뒤에 import되는 것부터: 시험 파일은 아래에서 하나씩 불러온다)
const loaded: string[] = [];
if (engineOnly) registerHooks({ load(url, context, next) { loaded.push(url); return next(url, context); } });

for (const name of names) {
  console.log(`\n[${name}]`);
  await import(fileOf(name));
}
if (engineOnly) {
  const game = loaded.filter((u) => GAME_RULES.test(u));
  for (const u of game) console.log('  ' + u);
  console.log('\n[틀만]');
  check(loaded.some((u) => u.endsWith('/server/game/game.ts')) && loaded.some((u) => u.endsWith('/server/game/systems/shop.ts')) && game.length === 0,
    `틀의 시험을 도는 동안 이 게임의 규칙 파일(플러그인, 등탑·습격·등탑지기·퀘스트·휴식, games/deungbul/test/)이 하나도 로드되지 않았다 (로드된 모듈 ${loaded.length}개)`);
}
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
