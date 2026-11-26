// 자원 로딩 예산: 화면을 빌드한 뒤(npm run build, build:all) 빌드 결과의 크기를 묶음별로 보이고 기준을 넘으면 경고한다. 빌드를 실패시키지는 않는다.
//   node scripts/budget.mjs [게임]      (scripts/game.mjs의 build가 끝나면 부른다)
// 묶음:
//   첫 묶음   index.html과 그것이 곧바로 읽는 스크립트·스타일(modulepreload 포함): 게임 화면이 뜨기까지 반드시 받는 것
//   자원      client/public/에서 온 파일(모델·소리 …). 화면이 registerX로 등록한 것은 접속 화면에서 미리 받는다: 첫 묶음과 함께 센다.
//             화면에서 preloadLater로 미룬 것은 들어간 뒤에 받지만, 이 도구는 코드를 읽지 않으므로 그대로 첫 다운로드로 센다(실제 값은 브라우저로 잰다)
//   나중      다른 페이지(도감 guide.html 등)와 그것만 쓰는 파일, 나중에 import()로 읽는 조각
// 기준 (docs/genre-features.md 6절): 첫 다운로드 8MB(Poki 목표), 20MB(CrazyGames 모바일 홈 노출), 전체 250MB·파일 1,500개(CrazyGames). 게임의 deploy.json의
//   "budget": { "firstMB": 8, "mobileMB": 20 }로 바꿀 수 있다.
// 재방문 캐시: deploy.json에 "offlineCache": true가 있으면 빌드 결과에 서비스 워커(sw.js)를 쓴다 (화면은 engine/client/lifecycle.ts의 enableOfflineCache로 켠다).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { deployOf } from './deploy.mjs';

const MB = 1024 * 1024;
const game = process.argv[2] ?? process.env.GAME ?? 'deungbul';
let dep;
try { dep = deployOf(game); } catch (err) { console.log(`[예산] ${game}: deploy.json이 없어 건너뜁니다 (${err.message})`); process.exit(0); }
const raw = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'games', game, 'deploy.json'), 'utf8'));
const firstMB = Number(raw.budget?.firstMB ?? 8), mobileMB = Number(raw.budget?.mobileMB ?? 20);
const out = dep.dist;
if (!fs.existsSync(path.join(out, 'index.html'))) { console.log(`[예산] ${game}: ${out}/index.html이 없습니다`); process.exit(0); }

/** 폴더 안의 파일 모두 (out 기준 상대 경로, / 구분) */
const files = [];
(function walk(dir) { for (const d of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, d.name); if (d.isDirectory()) walk(p); else files.push(path.relative(out, p).split(path.sep).join('/')); } })(out);
const size = (f) => fs.statSync(path.join(out, f)).size;
const gz = (f) => zlib.gzipSync(fs.readFileSync(path.join(out, f)), { level: 9 }).length;

/** html 한 장이 곧바로 읽는 파일들 (script src, link href) + 그 스크립트가 정적으로 import하는 조각 */
function refsOf(html) {
  const text = fs.readFileSync(path.join(out, html), 'utf8'), got = new Set([html]);
  const add = (u) => { const f = u.replace(/^\.\//, '').replace(/^\//, '').split(/[?#]/)[0]; if (files.includes(f) && !got.has(f)) { got.add(f); if (f.endsWith('.js')) scan(f); } };
  const scan = (js) => { const src = fs.readFileSync(path.join(out, js), 'utf8'); for (const m of src.matchAll(/(?:^|[;\s])import\s*(?:[\w${}\s,*]+from\s*)?["']\.\/([\w.-]+\.js)["']/g)) add('assets/' + m[1]); };
  for (const m of text.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)) add(m[1]);
  return got;
}
const first = refsOf('index.html');
const pages = files.filter((f) => f.endsWith('.html') && f !== 'index.html');
const otherPages = new Set(pages.flatMap((p) => [...refsOf(p)]));
const isBuild = (f) => f.startsWith('assets/') || f.endsWith('.html');
const assets = files.filter((f) => !isBuild(f) && !first.has(f) && f !== 'sw.js' && f !== 'server.json');
const later = files.filter((f) => !first.has(f) && !assets.includes(f) && (otherPages.has(f) || isBuild(f)));
const sum = (list) => list.reduce((a, f) => a + size(f), 0);
const fmt = (b) => (b >= MB ? `${(b / MB).toFixed(2)}MB` : `${(b / 1024).toFixed(1)}KB`);

const firstB = sum([...first]), firstGz = [...first].reduce((a, f) => a + gz(f), 0), assetB = sum(assets), laterB = sum(later), total = sum(files);
const rows = [
  ['첫 묶음 (index.html + 곧바로 읽는 코드)', firstB, firstGz, first.size],
  ['자원 (모델·소리: 접속 화면에서 미리 받음)', assetB, null, assets.length],
  ['나중 (다른 페이지, 나중 조각)', laterB, null, later.length],
  ['전체', total, null, files.length],
];
console.log(`\n[예산] ${game} (${path.relative(process.cwd(), out) || out})`);
for (const [name, b, z, n] of rows) console.log(`  ${name.padEnd(30)} ${fmt(b).padStart(9)}${z !== null ? `  (gzip ${fmt(z)})` : ''}  파일 ${n}개`);
const firstDownload = firstB + assetB;
const warn = [];
if (firstDownload > mobileMB * MB) warn.push(`첫 다운로드 ${fmt(firstDownload)}가 ${mobileMB}MB(모바일 홈 노출 기준)를 넘습니다: 첫 장면에 필요 없는 모델·소리를 preloadLater로 미루세요`);
else if (firstDownload > firstMB * MB) warn.push(`첫 다운로드 ${fmt(firstDownload)}가 ${firstMB}MB(포털 목표)를 넘습니다: 첫 장면에 필요 없는 모델·소리를 preloadLater로 미루세요`);
if (total > 250 * MB) warn.push(`전체 ${fmt(total)}가 250MB를 넘습니다`);
if (files.length > 1500) warn.push(`파일이 ${files.length}개로 1,500개를 넘습니다`);
for (const w of warn) console.warn(`  경고: ${w}`);
if (!warn.length) console.log(`  첫 다운로드 ${fmt(firstDownload)}: 기준(${firstMB}MB, ${mobileMB}MB) 안`);

// ---------- 재방문 캐시 (서비스 워커) ----------
if (raw.offlineCache === true) {
  const version = Date.now().toString(36);
  const sw = `// 재방문 캐시 (scripts/budget.mjs가 빌드 뒤에 쓴다: deploy.json의 offlineCache). 화면은 engine/client/lifecycle.ts의 enableOfflineCache로 등록한다.
// 화면(HTML)·server.json은 늘 서버에서 먼저(못 받으면 캐시), 이름에 해시가 든 빌드 파일(assets/)은 캐시에서, 그 밖의 같은 출처 파일(모델·소리)은 캐시에서 주고 뒤에서 새로 받는다.
// 게임 서버와의 연결(WebSocket)과 오류 보내기(POST)는 건드리지 않는다. 오프라인 플레이는 없다(서버 권위 게임).
const CACHE = 'game-${version}';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const put = (res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; };
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/server.json')) { e.respondWith(fetch(req).then(put).catch(() => caches.match(req))); return; }
  if (url.pathname.includes('/assets/')) { e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(put))); return; }
  e.respondWith(caches.match(req).then((hit) => { const net = fetch(req).then(put).catch(() => hit); return hit || net; }));
});
`;
  fs.writeFileSync(path.join(out, 'sw.js'), sw);
  console.log(`  재방문 캐시: ${path.join(path.relative(process.cwd(), out), 'sw.js')}를 썼습니다 (deploy.json의 offlineCache)`);
}
