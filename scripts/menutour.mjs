// 시험 서버에서 손님 캐릭터로 진행 단추를 눌러 단계를 깨고(메뉴가 열리게), 메뉴의 묶음·탭마다 폰 화면을 찍는다 (시험 서버 전용: 운영 서버에 쓰지 않는다)
// node scripts/menutour.mjs <주소> <출력 폴더> [진행 초=200] [크기=390,844] [직업=파수꾼]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [url, outDir, playS = '200', size = '390,844', cls = '파수꾼'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const [W, H] = size.split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lock = path.join(process.env.TEMP, 'dg-work', 'chrome.lock');
while (fs.existsSync(lock)) await sleep(1000);
fs.writeFileSync(lock, 'menutour');
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu',
  `--window-size=${W},${H}`, `--user-data-dir=${path.join(process.env.TEMP, 'dg-work', 'tour-chrome', String(port))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
try {
  let tab;
  for (let i = 0; i < 160 && !tab; i++) { await sleep(250); try { tab = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((ok) => { ws.onopen = ok; });
  let seq = 0; const pending = new Map(); const errs = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text); };
  const call = (method, params = {}) => new Promise((ok) => { const id = ++seq; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (js) => (await call('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true })).result?.value;
  const shot = async (name) => { const s = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(s.data, 'base64')); };
  await call('Runtime.enable'); await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await call('Page.navigate', { url });
  await sleep(5000);
  const CLX = `(t)=>{const e=[...document.querySelectorAll('button,[role=button],div,b')].filter(b=>b.offsetParent&&(b.innerText||'').trim().startsWith(t)).pop();(e?.closest('button')||e)?.click();return !!e}`;
  await ev(`(${CLX})(${JSON.stringify(cls)})`);
  // 진행: 튜토리얼은 건너뛰고, 전투는 자동·빠르게, 결과 창은 다음으로
  const ADV = `(()=>{const want=['건너뛰기','계속','다음 단계','다음 도전','출발','확인','받기','닫기','×2'];const bs=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&!b.disabled);for(const w of want){const b=bs.find(x=>(x.innerText||'').trim().startsWith(w));if(b){b.click();return w}}return 'none'})()`;
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < Number(playS) * 1000) { const r = await ev(ADV); if (r !== 'none') n++; await sleep(1500); }
  console.log('진행 단추', n, '번');
  await ev(`(${CLX})('메뉴')`); await sleep(1200);
  await shot('00-menu');
  // 묶음(mgroup)마다, 그 안의 탭마다
  const groups = await ev(`[...document.querySelectorAll('.mgroup')].filter(b=>b.offsetParent).map(b=>b.dataset.group)`) ?? [];
  console.log('묶음', groups);
  let k = 1;
  for (const g of groups) {
    await ev(`document.querySelector('.mgroup[data-group="${g}"]')?.click()`); await sleep(900);
    const tabs = await ev(`(()=>{const p=document.querySelector('.mgroup')?.parentElement;const nx=p?.nextElementSibling;return [...(nx?.querySelectorAll('button')??[])].filter(b=>b.offsetParent).map(b=>b.innerText.trim())})()`) ?? [];
    if (!tabs.length) { await shot(`${String(k++).padStart(2, '0')}-${g}`); continue; }
    for (let i = 0; i < tabs.length; i++) {
      await ev(`(()=>{const p=document.querySelector('.mgroup')?.parentElement;const nx=p?.nextElementSibling;[...(nx?.querySelectorAll('button')??[])].filter(b=>b.offsetParent)[${i}]?.click()})()`); await sleep(900);
      await shot(`${String(k++).padStart(2, '0')}-${g}-${tabs[i].replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 20)}`);
    }
  }
  console.log(errs.length ? '오류:\n' + errs.join('\n') : '콘솔 오류 없음');
  ws.close();
} finally { chrome.kill(); fs.rmSync(lock, { force: true }); }
