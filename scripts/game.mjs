// 게임 하나를 골라 돌리는 도구. 어느 게임인가는 여기 한곳에서 정한다:
//   node scripts/game.mjs <일> [게임]
//   일:   start   서버 (games/<게임>/server/main.ts)
//         watch   서버, 파일을 고치면 다시 띄운다
//         client  화면의 개발 서버 (games/<게임>/vite.config.ts)
//         build   화면 빌드 (결과 폴더는 그 게임의 vite.config.ts가 정한다)
//   게임: 인자, 없으면 환경 변수 GAME, 그것도 없으면 deungbul.
// 게임마다 갖출 것: server/main.ts, vite.config.ts. tsconfig.json이 있으면 별칭(@game)을 그것으로 읽고(tsx --tsconfig), 없으면 뿌리의 tsconfig.json(등불지기)을 쓴다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [cmd, arg, ...rest] = process.argv.slice(2);
const game = arg ?? process.env.GAME ?? 'deungbul';
const dir = path.join(root, 'games', game);
const fail = (msg) => { console.error(msg); process.exit(1); };

if (!/^[a-z0-9_-]+$/i.test(game) || !fs.existsSync(dir)) fail(`게임 폴더가 없습니다: games/${game}`);
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
};
const job = JOBS[cmd];
if (!job) fail(`할 일을 고르세요: ${Object.keys(JOBS).join(', ')} (받은 것: ${cmd ?? '없음'})`);
for (const f of job.slice(1)) if (f.startsWith(dir) && !fs.existsSync(f)) fail(`games/${game}에 ${path.relative(dir, f)}이(가) 없습니다`);

// 저장소 뿌리에서 돌린다 (서버의 data/·dist/ 경로와 tsx의 뿌리 tsconfig가 거기를 기준으로 한다). 끝나면 같은 코드로 끝난다
const child = spawn(process.execPath, [...job, ...rest], { cwd: root, stdio: 'inherit', env: { ...process.env, GAME: game } });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
