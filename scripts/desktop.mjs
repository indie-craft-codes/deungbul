// 데스크톱 앱(Electron 시제품, apps/desktop/)을 준비하고 띄운다 (docs/platforms.md 2단계, docs/making-a-game.md '데스크톱으로 내기').
//   node scripts/desktop.mjs build [게임]          그 게임의 화면을 빌드하고(웹과 같은 빌드), 앱의 Electron을 받아 둔다(apps/desktop/node_modules: 처음 한 번)
//   node scripts/desktop.mjs run [게임] [인자…]     앱을 띄운다. 인자는 앱에 그대로 (--server=ws://주소:포트, --lang=en, --profile=폴더 …)
// 게임: 인자, 없으면 GAME, 없으면 sample. Electron은 apps/desktop/package.json에만 있다: 뿌리의 npm ci·npm test·웹 빌드는 Electron을 받지 않는다.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { listGames } from './deploy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const appDir = path.join(root, 'apps', 'desktop');
const [cmd, ...more] = process.argv.slice(2);
const games = listGames();
const game = more[0] && !more[0].startsWith('-') ? more.shift() : process.env.GAME ?? 'sample';
const fail = (msg) => { console.error(msg); process.exit(1); };
if (!games.includes(game)) fail(`게임이 없습니다: ${game} (있는 게임: ${games.join(', ')})`);

/** Electron 실행 파일 (apps/desktop/node_modules/electron). 없으면 null */
function electronPath() {
  try { const p = createRequire(path.join(appDir, 'package.json'))('electron'); return typeof p === 'string' && fs.existsSync(p) ? p : null; } catch { return null; }
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (cmd === 'build') {
  const b = spawnSync(process.execPath, [path.join(root, 'scripts', 'game.mjs'), 'build', game], { cwd: root, stdio: 'inherit' });
  if (b.status !== 0) process.exit(b.status ?? 1);
  if (!electronPath()) {
    console.log('apps/desktop: Electron을 받습니다 (처음 한 번)');
    const lock = fs.existsSync(path.join(appDir, 'package-lock.json'));
    const r = spawnSync(npm, [lock ? 'ci' : 'install', '--no-audit', '--no-fund'], { cwd: appDir, stdio: 'inherit', shell: process.platform === 'win32' });
    // 설치 스크립트를 돌리지 않는 npm 설정이면 실행 파일이 아직 없다: 패키지의 받기 스크립트를 직접 돌린다
    const fetchBin = path.join(appDir, 'node_modules', 'electron', 'install.js');
    if (r.status === 0 && !electronPath() && fs.existsSync(fetchBin)) spawnSync(process.execPath, [fetchBin], { cwd: path.dirname(fetchBin), stdio: 'inherit' });
    if (r.status !== 0 || !electronPath()) fail('Electron을 받지 못했습니다 (apps/desktop에서 npm ci)');
  }
  console.log(`준비됐습니다: npm run desktop -- ${game}   (서버: 따로 띄운 게임 서버. 기본 ws://localhost:<deploy.json의 port>, 바꾸려면 --server=ws://주소:포트)`);
} else if (cmd === 'run') {
  const exe = electronPath();
  if (!exe) fail('Electron이 없습니다: 먼저 npm run build:desktop');
  const child = spawn(exe, [appDir, `--game=${game}`, ...more], { cwd: root, stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code) => process.exit(code ?? 0));
} else fail('할 일을 고르세요: build [게임] | run [게임] [인자…]');
