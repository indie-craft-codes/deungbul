// 모든 테스트를 차례로 돌린다 (npm test). 틀의 시험과 이 게임(등불지기)의 시험이 따로 있다.
//   npm test                  전부 (틀 → 게임)
//   npm run test:engine       틀만: 시험용 내용 위의 틀 시험과 틀의 경계 검사. 끝에 게임의 파일이 하나도 로드되지 않았는지 확인한다
//   npm run test:game         이 게임의 것만
//   npx tsx test/all.ts 이름   고른 것만 (예: boundary deungbul/quests fx/shop)
// 틀의 시험은 시험용 내용(engine/test/fx/shared/content) 위에서 도는 engine/test/fx/이름.test.ts(명령에서는 fx/이름)이고,
// 별칭 @game이 그 폴더를 가리켜야 하므로 따로 된 프로세스로 돈다(engine/test/fx/all.ts). 틀의 경계 검사(engine/test/boundary.test.ts)는 소스를 읽으므로 여기서 돈다.
// 이 게임의 것은 games/deungbul/test/이름.test.ts (명령에서는 deungbul/이름).
// 새 테스트: 틀의 기능이면 engine/test/fx/에 만들어 그 폴더의 all.ts의 FX에, 이 게임의 규칙이면 games/deungbul/test/에 만들어 GAME에 더한다.
// 틀의 시험은 new Game()으로(규칙 플러그인 없음), 게임의 시험은 games/deungbul/test/game.ts의 newGame()으로 게임을 만든다.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { failures } from '../engine/test/harness';

/** 이 프로세스(뿌리의 tsconfig)에서 도는 틀의 검사: 소스를 읽는 경계 검사 */
const ENGINE = ['boundary'];
const GAME = ['framework', 'baseline', 'split', 'shop', 'classes', 'combat', 'craft', 'party', 'keepers', 'quests', 'nav', 'zone2', 'channel', 'ledger', 'harden', 'guide', 'server'].map((n) => `deungbul/${n}`);
/** 이름 → 시험 파일. 'deungbul/이름'은 이 게임의 시험이다 */
const fileOf = (name: string): string => (name.startsWith('deungbul/') ? `../games/deungbul/test/${name.slice('deungbul/'.length)}.test.ts` : `../engine/test/${name}.test.ts`);

const args = process.argv.slice(2), engineOnly = args.includes('--engine'), gameOnly = args.includes('--game');
const only = args.filter((a) => !a.startsWith('--'));
/** 시험용 내용 위의 틀 시험 (이름 앞에 fx/). 아무것도 고르지 않았으면 틀의 시험을 돌 때 모두 돈다 */
const fxOnly = only.filter((a) => a.startsWith('fx/')).map((a) => a.slice('fx/'.length));
const runFx = only.length ? fxOnly.length > 0 : !gameOnly;
const names = only.length ? only.filter((a) => !a.startsWith('fx/')) : engineOnly ? ENGINE : gameOnly ? GAME : [...ENGINE, ...GAME];

for (const name of names) {
  console.log(`\n[${name}]`);
  await import(fileOf(name));
}
// 시험용 내용 위의 틀 시험: 별칭이 달라 따로 된 프로세스로 돌리고, 그 결과를 함께 센다 (그 출력은 [fx/이름]으로 시작한다)
let fxFailed = false;
if (runFx) {
  const root = path.resolve(import.meta.dirname, '..');
  const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const r = spawnSync(process.execPath, [tsx, '--tsconfig', path.join(root, 'engine', 'test', 'fx', 'tsconfig.json'), path.join(root, 'engine', 'test', 'fx', 'all.ts'), ...fxOnly], { cwd: root, stdio: 'inherit' });
  fxFailed = r.status !== 0;
}
const failed = failures() > 0 || fxFailed;
console.log(failed ? `\n실패 ${failures()}건${fxFailed ? ' (시험용 내용 위의 틀 시험에도 실패가 있다: 위의 [fx/…])' : ''}` : '\n모두 통과');
process.exit(failed ? 1 : 0);
