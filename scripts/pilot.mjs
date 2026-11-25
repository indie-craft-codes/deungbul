// 파일럿 공개: 이 PC의 게임 서버에 임시 외부 주소를 붙이고, 화면을 GitHub Pages에 올린다.
//   node scripts/pilot.mjs [게임]   (게임: 인자, 없으면 GAME, 없으면 deungbul. 게임 서버는 따로 켜 둔다: npm start)
// 포트, 빌드 결과, 공개용 저장소와 그 폴더는 그 게임의 games/<게임>/deploy.json에서 읽는다(PORT, PAGES_REPO 환경 변수가 있으면 그것이 이긴다).
// 하는 일:
//   1. 화면을 빌드해서 공개용 저장소(.pages/, 빌드 결과만 들어 있다)에 넣는다. 소스는 올라가지 않는다.
//   2. cloudflared로 임시 주소(https://....trycloudflare.com)를 받는다. 이 창을 닫으면 주소도 사라진다.
//   3. 그 주소를 server.json에 적어 함께 올린다. 화면은 접속할 때마다 이 파일을 읽어 서버를 찾는다.
// 주소는 켤 때마다 바뀌지만 Pages 주소는 그대로라서, 폰의 홈 화면 아이콘은 계속 쓸 수 있다.
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployOf } from './deploy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = deployOf(process.argv[2] ?? process.env.GAME ?? 'deungbul');
if (!cfg.pagesDir && !process.env.PAGES_REPO) { console.error(`[pilot] ${cfg.game}의 deploy.json에 pages(repo, dir)가 없습니다`); process.exit(1); }
const pages = cfg.pagesDir || path.join(root, `.pages-${cfg.game}`);
const REPO = process.env.PAGES_REPO ?? cfg.pagesRepo;
const PORT = process.env.PORT ?? String(cfg.port);
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });
const quiet = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

function publish(serverUrl) {
  // 예전 파일을 지우고 새 빌드를 넣는다 (.git은 남긴다)
  for (const f of fs.readdirSync(pages)) if (f !== '.git') fs.rmSync(path.join(pages, f), { recursive: true, force: true });
  fs.cpSync(cfg.dist, pages, { recursive: true });
  fs.writeFileSync(path.join(pages, 'server.json'), JSON.stringify({ url: serverUrl }) + '\n');
  fs.writeFileSync(path.join(pages, '.nojekyll'), '');
  quiet('git add -A', pages);
  if (!quiet('git status --porcelain', pages)) { console.log('[pilot] 바뀐 것이 없어 올리지 않았습니다'); return; }
  quiet('git commit -q -m "화면과 서버 주소 갱신"', pages);
  run('git push -q origin HEAD:main', pages);
  console.log(`[pilot] 올렸습니다. 1~2분 뒤 반영됩니다: https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/`);
}

if (!fs.existsSync(path.join(pages, '.git'))) run(`gh repo clone ${REPO} "${pages}"`);
run(`node scripts/game.mjs build ${cfg.game}`);

const exe = ['cloudflared', 'C:/Program Files (x86)/cloudflared/cloudflared.exe', 'C:/Program Files/cloudflared/cloudflared.exe']
  .find((c) => { try { execSync(`"${c}" --version`, { stdio: 'ignore' }); return true; } catch { return false; } });
if (!exe) { console.error('[pilot] cloudflared를 찾지 못했습니다'); process.exit(1); }

const tunnel = spawn(exe, ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] });
let done = false;
const onData = (buf) => {
  const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
  if (!m || done) return;
  done = true;
  console.log(`[pilot] 임시 주소: ${m[0]}  (이 주소로 바로 들어가도 됩니다)`);
  try { publish(m[0].replace('https://', 'wss://')); } catch (err) { console.error('[pilot] 올리지 못했습니다:', err.message); }
  console.log('[pilot] 이 창을 닫으면 외부 접속이 끊깁니다.');
};
tunnel.stdout.on('data', onData);
tunnel.stderr.on('data', onData);
tunnel.on('exit', (code) => { console.log(`[pilot] 터널이 끝났습니다 (${code})`); process.exit(code ?? 0); });
process.on('SIGINT', () => tunnel.kill());
