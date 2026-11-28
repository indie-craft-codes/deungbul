// 화면을 영상으로 찍는다 (시험할 때 움직임을 눈으로 확인하는 용도): 헤드리스 Chrome(GPU)으로 주소를 열고, 크롬의 화면 송출(Page.startScreencast)을 받아
// 일정한 빠르기(기본 초당 20장)의 영상(.mp4, 그리고 같은 이름의 .webm)으로 만든다. 영상 만들기는 scripts/frames2video.py (파이썬 opencv-python 필요).
//   node scripts/record.mjs <주소> <출력.mp4> [--s=초] [--size=1280,720] [--wait=ms] [--do="ms:JS"]... [--fps=20] [--mobile]
//     --wait  찍기 전에 페이지가 뜨기를 기다리는 시간 (기본 6000)
//     --do    찍기 시작한 뒤 ms에 페이지에서 JS를 돌린다 (여러 번 줄 수 있다. ms가 0이면 찍기 직전). 예: --do="0:document.querySelector('button').click()"
//     --mobile 폰처럼 (터치, 화면 배율 2)
// 다른 작업과 같은 브라우저 잠금을 쓴다: $TEMP/dg-work/chrome.lock이 있으면 기다린다 (남의 잠금은 지우지 않는다)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (n, d) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const [url, out] = args.filter((a) => !a.startsWith('--'));
if (!url || !out) { console.error('쓰는 법: node scripts/record.mjs <주소> <출력.mp4> [--s=초] [--size=1280,720] [--wait=ms] [--do="ms:JS"] [--fps=20] [--mobile]'); process.exit(1); }
const secs = Number(opt('s', '10')), size = opt('size', '1280,720'), wait = Number(opt('wait', '6000')), fps = Number(opt('fps', '20'));
const dos = args.filter((a) => a.startsWith('--do=')).map((a) => { const s = a.slice(5), i = s.indexOf(':'); return { at: Number(s.slice(0, i)), js: s.slice(i + 1) }; }).sort((a, b) => a.at - b.at);
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = process.env.TEMP ?? os.tmpdir();
const lock = path.join(tmp, 'dg-work', 'chrome.lock');
const frames = fs.mkdtempSync(path.join(tmp, 'rec-'));

// 브라우저 잠금 (한 번에 하나)
fs.mkdirSync(path.dirname(lock), { recursive: true });
for (let i = 0; fs.existsSync(lock); i++) { if (i % 20 === 0) console.log('브라우저 잠금을 기다립니다…'); await sleep(1000); }
fs.writeFileSync(lock, `record ${process.pid}`);
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu',
  `--window-size=${size}`, `--user-data-dir=${path.join(tmp, 'dg-work', 'rec-chrome', String(port))}`, '--no-first-run', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const shots = [];
try {
  let tab;
  for (let i = 0; i < 160 && !tab; i++) { await sleep(250); try { tab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } }
  if (!tab) throw new Error('Chrome 디버깅 포트에 연결하지 못했습니다');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let seq = 0;
  const pending = new Map(), logs = [];
  const call = (method, params = {}) => new Promise((ok) => { const id = ++seq; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); return; }
    if (m.method === 'Page.screencastFrame') {
      const f = path.join(frames, `${String(shots.length).padStart(5, '0')}.jpg`);
      fs.writeFileSync(f, Buffer.from(m.params.data, 'base64'));
      shots.push({ f, t: m.params.metadata.timestamp });
      ws.send(JSON.stringify({ id: ++seq, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
    } else if (m.method === 'Runtime.exceptionThrown') logs.push('예외: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('오류: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  await call('Runtime.enable'); await call('Page.enable');
  const [w, h] = size.split(',').map(Number);
  if (args.includes('--mobile')) { await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true }); await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
  await call('Page.navigate', { url });
  await sleep(wait);
  const run = async (js) => { const r = await call('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) logs.push('--do 오류: ' + r.exceptionDetails.text); };
  for (const d of dos.filter((x) => x.at <= 0)) await run(d.js);
  await call('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: w, maxHeight: h, everyNthFrame: 1 });
  const t0 = Date.now();
  for (const d of dos.filter((x) => x.at > 0)) { await sleep(Math.max(0, d.at - (Date.now() - t0))); await run(d.js); }
  await sleep(Math.max(0, secs * 1000 - (Date.now() - t0)));
  await call('Page.stopScreencast');
  await sleep(200);
  console.log(logs.length ? '콘솔:\n' + logs.join('\n') : '콘솔 오류 없음');
  ws.close();
} finally {
  chrome.kill();
  fs.rmSync(lock, { force: true });
}
if (shots.length < 2) { console.error(`받은 장면이 ${shots.length}장뿐입니다`); process.exit(1); }
// 송출은 화면이 바뀔 때만 장면을 보낸다: 시각표대로 일정한 빠르기로 펴서 영상으로
const list = path.join(frames, 'list.json');
fs.writeFileSync(list, JSON.stringify(shots));
const py = path.join(path.dirname(fileURLToPath(import.meta.url)), 'frames2video.py');
const r = spawnSync('python', [py, list, out, String(fps)], { stdio: 'inherit', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
fs.rmSync(frames, { recursive: true, force: true });
process.exit(r.status ?? 1);
