// 게임 하나를 골라 돌리는 도구. 어느 게임인가는 여기 한곳에서 정한다:
//   node scripts/game.mjs <일> [게임]
//   일:   start   서버 (games/<게임>/server/main.ts)
//         watch   서버, 파일을 고치면 다시 띄운다
//         client  화면의 개발 서버 (games/<게임>/vite.config.ts)
//         build   화면 빌드 (결과 폴더는 그 게임의 vite.config.ts가 정한다). 끝나면 크기 예산을 보인다 (scripts/budget.mjs)
//         test    그 게임의 시험 (games/<게임>/test/all.ts). 뒤에 이름을 주면 고른 것만
//         list    저장소의 게임들 (games/ 아래에서 deploy.json이나 server/main.ts가 있는 폴더: scripts/deploy.mjs의 listGames)
//   게임: 인자, 없으면 환경 변수 GAME, 그것도 없으면 deungbul.
// 게임마다 갖출 것: server/main.ts, vite.config.ts, (시험이 있으면) test/all.ts. tsconfig.json이 있으면 별칭(@game)을 그것으로 읽고(tsx --tsconfig), 없으면 뿌리의 tsconfig.json(등불지기)을 쓴다.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { listGames } from './deploy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const [cmd, ...more] = process.argv.slice(2);
if (cmd === 'list') { console.log(listGames().join('\n')); process.exit(0); }
// build all: 모든 게임의 화면을 차례로 빌드한다 (npm run build:all). 하나라도 실패하면 코드 1
if (cmd === 'build' && more[0] === 'all') {
  const failed = listGames().filter((g) => spawnSync(process.execPath, [import.meta.filename, 'build', g], { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'inherit' }).status !== 0);
  console.log(failed.length ? `빌드 실패: ${failed.join(', ')}` : `모든 게임을 빌드했다 (${listGames().join(', ')})`);
  process.exit(failed.length ? 1 : 0);
}
// test에서는 게임 이름을 빼고 시험 이름만 줄 수 있다 (npm run test:game -- quests): 첫 인자가 게임 폴더가 아니면 시험 이름으로 본다
const GAMES = listGames();
const isGame = (a) => a !== undefined && GAMES.includes(a);
const arg = cmd === 'test' && more.length && !isGame(more[0]) ? undefined : more[0];
const rest = arg === undefined ? more : more.slice(1);
const game = arg ?? process.env.GAME ?? 'deungbul';
const dir = path.join(root, 'games', game);
const fail = (msg) => { console.error(msg); process.exit(1); };

if (!GAMES.includes(game)) fail(`게임이 없습니다: games/${game} (있는 게임: ${GAMES.join(', ')}. 게임 폴더에는 deploy.json이나 server/main.ts가 있어야 한다)`);
const tsconfig = path.join(dir, 'tsconfig.json');
const tsxArgs = fs.existsSync(tsconfig) ? ['--tsconfig', tsconfig] : [];
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const server = path.join(dir, 'server', 'main.ts');
const viteConfig = path.join(dir, 'vite.config.ts');

const JOBS = {
  start: [tsx, ...tsxArgs, server],
  watch: [tsx, 'watch', ...tsxArgs, server],
  client: [vite, '-c', viteConfig],
  build: [vite, 'build', '-c', viteConfig],
  test: [tsx, ...tsxArgs, path.join(dir, 'test', 'all.ts')],
};
const job = JOBS[cmd];
if (!job) fail(`할 일을 고르세요: ${Object.keys(JOBS).join(', ')} (받은 것: ${cmd ?? '없음'})`);
for (const f of job.slice(1)) if (f.startsWith(dir) && !fs.existsSync(f)) fail(`games/${game}에 ${path.relative(dir, f)}이(가) 없습니다`);

// 저장소 뿌리에서 돌린다 (서버의 data/·dist/ 경로와 tsx의 뿌리 tsconfig가 거기를 기준으로 한다). 끝나면 같은 코드로 끝난다
const child = spawn(process.execPath, [...job, ...rest], { cwd: root, stdio: 'inherit', env: { ...process.env, GAME: game } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => {
  // 화면을 빌드했으면 크기 예산을 보인다 (scripts/budget.mjs: 묶음별 크기, 8MB·20MB 경고, deploy.json의 offlineCache면 sw.js)
  if (cmd === 'build' && code === 0) spawnSync(process.execPath, [path.join(root, 'scripts', 'budget.mjs'), game], { cwd: root, stdio: 'inherit' });
  process.exit(code ?? (signal ? 1 : 0));
});
