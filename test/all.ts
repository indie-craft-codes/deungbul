// 모든 시험을 차례로 돌린다 (npm test): 틀의 시험 → 게임마다의 시험.
//   npm test                    전부 (틀 → games/ 아래의 게임 모두)
//   npm run test:engine         틀만: 경계 검사와 시험용 내용 위의 틀 시험. 끝에 게임의 파일이 하나도 로드되지 않았는지 확인한다
//   npm run test:game [-- 이름]  게임 하나만 (GAME, 없으면 deungbul: node scripts/game.mjs test)
//   npx tsx test/all.ts 이름     고른 것만 (예: boundary fx/shop deungbul/quests sample/docs)
// 어디에 무엇이 있나:
//   틀의 경계 검사  engine/test/boundary.test.ts      소스를 읽기만 하므로 이 프로세스에서 돈다 (이름: boundary)
//   틀의 시험       engine/test/fx/이름.test.ts        시험용 내용(engine/test/fx/shared/content) 위에서. 목록은 engine/test/fx/all.ts (이름: fx/이름)
//   게임의 시험     games/<게임>/test/이름.test.ts     목록은 그 게임의 test/all.ts (이름: <게임>/이름)
// 틀의 시험과 게임의 시험은 별칭 @game이 가리키는 곳이 달라 저마다 따로 된 프로세스로 돈다 (그 폴더의 tsconfig.json으로). 이 도구는 결과만 모은다.
// 새 시험: 틀의 기능이면 engine/test/fx/에 만들어 그 폴더의 all.ts의 FX에, 게임의 규칙이면 games/<게임>/test/에 만들어 그 게임의 all.ts에 더한다.
// 새 게임: games/<게임>/test/all.ts(와 tsconfig.json)를 두면 npm test가 저절로 함께 돌린다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { failures } from '../engine/test/harness';

const root = path.resolve(import.meta.dirname, '..');
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
/** 시험을 가진 게임들: games/<게임>/test/all.ts가 있는 폴더 */
const GAMES = fs.readdirSync(path.join(root, 'games'), { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, 'games', d.name, 'test', 'all.ts'))).map((d) => d.name).sort();

const args = process.argv.slice(2), engineOnly = args.includes('--engine'), gameOnly = args.includes('--game');
const only = args.filter((a) => !a.startsWith('--'));
/** 'fx/이름'·'<게임>/이름'으로 고른 것: 앞의 이름 → 고른 시험들 */
const picked = new Map<string, string[]>();
for (const a of only) {
  const at = a.indexOf('/');
  if (at < 0) continue;
  const [group, name] = [a.slice(0, at), a.slice(at + 1)];
  if (group !== 'fx' && !GAMES.includes(group)) { console.error(`모르는 이름입니다: ${a} (fx/이름, ${GAMES.map((g) => `${g}/이름`).join(', ')})`); process.exit(1); }
  picked.set(group, [...(picked.get(group) ?? []), name]);
}
const runs = (group: string): boolean => (only.length ? picked.has(group) : group === 'fx' ? !gameOnly : !engineOnly && (!gameOnly || group === (process.env.GAME ?? 'deungbul')));

// 1. 틀의 경계 검사 (이 프로세스)
const ENGINE = ['boundary'];
for (const name of only.length ? only.filter((a) => !a.includes('/')) : gameOnly ? [] : ENGINE) {
  if (!ENGINE.includes(name)) { console.error(`모르는 이름입니다: ${name}`); process.exit(1); }
  console.log(`\n[${name}]`);
  await import(`../engine/test/${name}.test.ts`);
}

// 2. 따로 된 프로세스들: 틀의 시험, 게임마다의 시험. 그 출력은 [fx/이름], [<게임>/이름]으로 시작한다
const failed: string[] = [];
const spawnRun = (label: string, tsconfig: string, entry: string, names: string[]) => {
  const r = spawnSync(process.execPath, [tsx, '--tsconfig', tsconfig, entry, ...names], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) failed.push(label);
};
if (runs('fx')) spawnRun('fx', path.join(root, 'engine', 'test', 'fx', 'tsconfig.json'), path.join(root, 'engine', 'test', 'fx', 'all.ts'), picked.get('fx') ?? []);
for (const game of GAMES) {
  if (!runs(game)) continue;
  const dir = path.join(root, 'games', game);
  const own = path.join(dir, 'tsconfig.json');
  spawnRun(game, fs.existsSync(own) ? own : path.join(root, 'tsconfig.json'), path.join(dir, 'test', 'all.ts'), picked.get(game) ?? []);
}

const bad = failures() > 0 || failed.length > 0;
console.log(bad ? `\n실패 ${failures()}건${failed.length ? ` (따로 돈 시험에도 실패가 있다: ${failed.join(', ')}. 위의 [${failed[0]}/…]를 보라)` : ''}` : '\n모두 통과');
process.exit(bad ? 1 : 0);
