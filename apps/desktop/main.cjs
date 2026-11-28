// 데스크톱 앱(Electron)의 주 프로세스 (플랫폼 분리 2단계: docs/platforms.md 4절, 쓰는 법: docs/making-a-game.md '데스크톱으로 내기').
// 저장소의 게임 화면 빌드(games/<게임>/deploy.json의 dist: dist-sample, dist-echopact, dist)를 사용자 정의 프로토콜 app://<게임>/ 으로 싣는다.
// file://로 열면 모듈 스크립트·fetch·소리·모델 읽기가 막히므로(CORS) 표준·보안 출처로 등록한 프로토콜을 쓴다. 화면 코드는 웹과 같은 빌드이고,
// preload(./preload.cjs)가 내놓는 window.desktopBridge를 보고 플랫폼 접점이 데스크톱 구현(engine/client/platform/desktop.ts)을 고른다.
//
// 실행: npm run desktop -- [게임] [--server=ws://주소:포트] [--lang=en] [--profile=폴더]   (또는 apps/desktop에서 npx electron . --game=sample)
//   --game     게임 폴더 이름 (기본 sample)
//   --server   접속할 게임 서버 (기본: deploy.json의 desktop.server, 없으면 ws://localhost:<deploy.json의 port> = 로컬 개발 서버)
//   --dist     화면 빌드 폴더 (기본: deploy.json의 dist)
//   --profile  저장 폴더 (기본: OS의 앱 데이터 폴더/game-desktop/<게임>): 캐릭터 토큰·설정·창 크기
//   --lang, --auto   화면에 넘기는 값 (웹 주소의 ?lang= · ?auto=와 같다)
// 보안 기본: contextIsolation, sandbox, nodeIntegration 끔, 탐색은 app://<게임>/ 안에서만, 바깥 링크는 기본 브라우저로(http·https만),
//   CSP 머리말, 권한 요청은 전체 화면·클립보드 쓰기만, IPC는 app://<게임>/ 페이지가 보낸 것만 받는다.
'use strict';
const { app, BrowserWindow, protocol, shell, ipcMain, clipboard, dialog, safeStorage, session, screen, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEME = 'app';

/** 실행 인자 --이름=값 */
const arg = (name) => { const p = `--${name}=`; const a = process.argv.find((x) => x.startsWith(p)); return a === undefined ? undefined : a.slice(p.length); };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
/** 파일을 통째로 바꾼다 (쓰다가 꺼져도 반쪽 파일이 남지 않게) */
const writeJson = (f, v) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v)); fs.renameSync(f + '.tmp', f); } catch (e) { console.error('[desktop] 저장 실패', f, e.message); } };

/** 시작 설정: 게임, 화면 폴더, 서버 주소, 화면에 넘길 값 */
function config(o = {}) {
  const game = o.game ?? arg('game') ?? process.env.GAME ?? 'sample';
  if (!/^[a-z0-9_-]+$/.test(game)) throw new Error(`게임 이름이 이상합니다: ${game}`);
  const deploy = readJson(path.join(ROOT, 'games', game, 'deploy.json'));
  if (!deploy) throw new Error(`games/${game}/deploy.json이 없습니다`);
  const dist = path.resolve(ROOT, o.dist ?? arg('dist') ?? deploy.dist);
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error(`화면 빌드가 없습니다: ${dist} (먼저 npm run build:desktop -- ${game})`);
  const server = o.server ?? arg('server') ?? process.env.GAME_SERVER ?? deploy.desktop?.server ?? `ws://localhost:${deploy.port}`;
  if (!/^wss?:\/\/[^\s/]+/.test(server)) throw new Error(`서버 주소는 ws:// 또는 wss://로: ${server}`);
  const params = {};
  for (const k of ['lang', 'auto']) { const v = o.params?.[k] ?? arg(k); if (v) params[k] = v; }
  return { game, dist, server, params, title: deploy.desktop?.name ?? game, profile: o.profile ?? arg('profile') };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm' };
/** 화면의 CSP: 스크립트는 앱 안의 것만, 접속은 게임 서버(ws·wss)와 오류 보내기(http·https)만 */
const CSP = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "media-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self' data: blob: ws: wss: http: https:", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "frame-src 'none'", "form-action 'none'"].join('; ');

// 표준·보안 출처로 등록: fetch·모듈 스크립트·localStorage·소리 스트림이 https처럼 동작한다 (app이 준비되기 전에)
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

/** 바깥 주소를 기본 브라우저로 (http·https만. 나머지 체계(file:, javascript:, 다른 앱의 체계)는 열지 않는다) */
function openExternal(url) {
  let u; try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  void shell.openExternal(u.href);
  return true;
}

async function start(o = {}) {
  const cfg = config(o);
  const origin = `${SCHEME}://${cfg.game}`;
  // (node의 URL은 표준이 아닌 체계의 origin을 'null'로 준다: 체계와 호스트를 따로 본다)
  const isApp = (url) => { try { const u = new URL(url); return u.protocol === `${SCHEME}:` && u.host === cfg.game; } catch { return false; } };
  // 저장 폴더: 게임마다 따로 (웹에서 게임마다 출처(포트)가 달라 저장이 섞이지 않는 것과 같게)
  app.setPath('userData', cfg.profile ? path.resolve(cfg.profile) : path.join(app.getPath('appData'), 'game-desktop', cfg.game));
  await app.whenReady();
  Menu.setApplicationMenu(null); // 기본 메뉴(새로 고침·개발자 도구 단축키)를 걷는다: 게임의 키와 겹치지 않게

  // ---------- 화면 파일: app://<게임>/경로 → 화면 빌드 폴더 ----------
  protocol.handle(SCHEME, (req) => {
    const u = new URL(req.url);
    if (u.host !== cfg.game) return new Response('not found', { status: 404 });
    let rel; try { rel = decodeURIComponent(u.pathname); } catch { return new Response('bad path', { status: 400 }); }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(cfg.dist, '.' + rel);
    if (!file.startsWith(cfg.dist + path.sep)) return new Response('not found', { status: 404 }); // 폴더 밖으로 나가는 경로
    let body; try { body = fs.readFileSync(file); } catch { return new Response('not found', { status: 404 }); }
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const headers = { 'content-type': type, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
    if (type.startsWith('text/html')) headers['content-security-policy'] = CSP;
    return new Response(body, { status: 200, headers });
  });

  // ---------- 저장: 사용자 폴더의 store.json (비밀 값은 OS 암호화) ----------
  const storeFile = path.join(app.getPath('userData'), 'store.json');
  const saved = readJson(storeFile) ?? {};
  const store = { values: { ...(saved.values ?? {}) }, secret: { ...(saved.secret ?? {}) } };
  let flushTimer = null;
  const flush = () => { clearTimeout(flushTimer); flushTimer = null; writeJson(storeFile, store); };
  const later = () => { if (!flushTimer) flushTimer = setTimeout(flush, 300); };
  const seal = (v) => (safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(v).toString('base64') : 'raw:' + v);
  const unseal = (s) => { try { return s.startsWith('enc:') ? safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')) : s.startsWith('raw:') ? s.slice(4) : null; } catch { return null; } };

  // ---------- 창: 크기·자리·최대화·전체 화면을 기억한다 ----------
  const winFile = path.join(app.getPath('userData'), 'window.json');
  const ws = readJson(winFile) ?? {};
  const fits = (b) => b && screen.getAllDisplays().some((d) => { const a = d.workArea; return b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 40; });
  const bounds = { width: ws.width > 0 ? Math.max(640, ws.width | 0) : 1280, height: ws.height > 0 ? Math.max(400, ws.height | 0) : 800, ...(fits(ws) ? { x: ws.x, y: ws.y } : {}) };
  const secure = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, webviewTag: false, spellcheck: false,
    autoplayPolicy: 'no-user-gesture-required', devTools: !app.isPackaged };
  // 창·작업 표시줄의 아이콘: 게임이 넣은 앱 아이콘(scripts/art-import.mjs의 appicon → 빌드의 art/brand/icon-256.png). 없으면 Electron의 기본
  const iconFile = ['icon-256.png', 'icon-512.png'].map((f) => path.join(cfg.dist, 'art', 'brand', f)).find((f) => fs.existsSync(f));
  const win = new BrowserWindow({ ...bounds, minWidth: 640, minHeight: 400, show: false, backgroundColor: '#0b0d12', title: cfg.title, autoHideMenuBar: true, webPreferences: secure, ...(iconFile ? { icon: iconFile } : {}) });
  if (ws.maximized) win.maximize();
  if (ws.fullscreen) win.setFullScreen(true);
  let wsTimer = null;
  const saveWin = () => { clearTimeout(wsTimer); wsTimer = null; if (win.isDestroyed()) return; writeJson(winFile, { ...win.getNormalBounds(), maximized: win.isMaximized(), fullscreen: win.isFullScreen() }); };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, () => { clearTimeout(wsTimer); wsTimer = setTimeout(saveWin, 400); });
  win.on('close', saveWin);
  const tellFull = () => { if (!win.isDestroyed()) win.webContents.send('dg:fullscreen', win.isFullScreen()); saveWin(); };
  win.on('enter-full-screen', tellFull);
  win.on('leave-full-screen', tellFull);
  // F11(과 Alt+Enter)로 전체 화면
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'Enter' && input.alt))) { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  if (!o.noShow) win.once('ready-to-show', () => (o.showInactive ? win.showInactive() : win.show()));

  // ---------- 탐색 제한: app://<게임>/ 밖으로 나가지 않는다 ----------
  const lock = (wc) => {
    wc.on('will-navigate', (e, url) => { if (!isApp(url)) { e.preventDefault(); openExternal(url); } });
    wc.on('will-redirect', (e, url) => { if (!isApp(url)) e.preventDefault(); });
    wc.on('will-attach-webview', (e) => e.preventDefault());
    // 새 창: 앱 안의 페이지(도감·확률 페이지)는 같은 보안 설정의 새 창으로, 바깥 주소는 기본 브라우저로
    wc.setWindowOpenHandler(({ url }) => {
      if (isApp(url)) return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: '#0b0d12', webPreferences: secure } };
      openExternal(url);
      return { action: 'deny' };
    });
  };
  app.on('web-contents-created', (_e, wc) => lock(wc));
  lock(win.webContents);
  win.webContents.on('preload-error', (_e, file, err) => console.error('[desktop] preload 오류', file, err.message));
  const ALLOWED = new Set(['fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOWED.has(perm)));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => ALLOWED.has(perm));

  // ---------- 화면과 주고받기 (preload.cjs): app://<게임>/ 페이지가 보낸 것만 ----------
  const ok = (e) => isApp(e.senderFrame?.url ?? '');
  const version = `${cfg.game} ${app.getVersion()} (desktop, electron ${process.versions.electron})`;
  ipcMain.on('dg:init', (e) => { e.returnValue = ok(e) ? { game: cfg.game, server: cfg.server, version, params: cfg.params, store: store.values, fullscreen: win.isFullScreen() } : null; });
  ipcMain.on('dg:set', (e, k, v) => { if (!ok(e) || typeof k !== 'string' || typeof v !== 'string' || k.length > 200 || v.length > 1e6) return; store.values[k] = v; later(); });
  ipcMain.on('dg:remove', (e, k) => { if (!ok(e) || typeof k !== 'string') return; delete store.values[k]; later(); });
  ipcMain.handle('dg:secret-get', (e, k) => (ok(e) && typeof k === 'string' && store.secret[k] ? unseal(store.secret[k]) : null));
  ipcMain.handle('dg:secret-set', (e, k, v) => { if (!ok(e) || typeof k !== 'string' || typeof v !== 'string' || v.length > 4096) return false; store.secret[k] = seal(v); flush(); return true; });
  ipcMain.handle('dg:secret-remove', (e, k) => { if (ok(e) && typeof k === 'string') { delete store.secret[k]; flush(); } });
  ipcMain.handle('dg:open', (e, url) => {
    if (!ok(e) || typeof url !== 'string') return false;
    if (isApp(url)) { const w = new BrowserWindow({ width: 1000, height: 760, autoHideMenuBar: true, backgroundColor: '#0b0d12', webPreferences: secure }); void w.loadURL(url); return true; }
    return openExternal(url);
  });
  ipcMain.handle('dg:copy', async (e, text) => { if (!ok(e) || typeof text !== 'string') return false; try { await clipboard.writeText(text); return true; } catch { return false; } }); // (Electron 45부터 비동기)
  ipcMain.handle('dg:save', async (e, name, data, _mime) => {
    if (!ok(e) || typeof name !== 'string' || !(typeof data === 'string' || data instanceof Uint8Array)) return false;
    const safe = path.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'data.txt';
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), safe) });
    if (r.canceled || !r.filePath) return false;
    try { fs.writeFileSync(r.filePath, data); return true; } catch { return false; }
  });
  ipcMain.handle('dg:fullscreen', (e, on) => { if (!ok(e)) return false; win.setFullScreen(!!on); return true; });

  app.on('before-quit', () => { flush(); saveWin(); });
  app.on('window-all-closed', () => app.quit());
  await win.loadURL(`${origin}/index.html`);
  return { win, cfg };
}

module.exports = { start, config, openExternal };
// 시험 도구는 global.__desktopDriver를 세우고 이 파일을 require한 뒤 start를 스스로 부른다 (창을 다루고 찍으려고). 보통 실행은 곧바로 시작한다
if (!global.__desktopDriver) start().catch((e) => { console.error('[desktop]', e.message); dialog.showErrorBox('Game Desktop', e.message); app.exit(1); });
