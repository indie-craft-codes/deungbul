// 게임 서버를 저장하고 끈 뒤 감시자(scripts/serve.mjs) 아래에서 다시 띄운다. 운영체제와 무관하다(Node만 있으면 된다). 터널(cloudflared)은 절대 건드리지 않는다.
//   node scripts/restart.mjs [게임]            저장하고 끄고(떠 있으면) 다시 띄운다
//   node scripts/restart.mjs [게임] --stop     저장하고 끄기만 한다 (감시자도 멈춘다)
//   node scripts/restart.mjs [게임] --dry      할 일만 찍는다
// 게임: 인자, 없으면 GAME, 없으면 deungbul. 포트·저장 파일·봇 수는 games/<게임>/deploy.json, 환경 변수 PORT·DB·BOTS·LOG가 있으면 그것이 이긴다.
// 차례:
//   1. 포트에 서버가 떠 있으면 저장 파일 옆에 stop.flag를 세운다. 서버가 저장하고 코드 0으로 끝나면 감시자도 멈춘다. 둘이 끝날 때까지 기다린다(10초).
//   2. 10초 안에 안 꺼지면 강제로: 먼저 감시자(serve.pid)를 끄고(다시 띄우지 못하게), 그다음 그 포트에서 듣고 있는 프로세스(없으면 server.pid)를 끈다.
//      끄기 전에 프로세스의 이름을 보고 cloudflared면 끄지 않는다. 깃발은 치운다.
//   3. 로그(저장 파일 옆 server.log)를 server.log.prev로 돌린다 (앞 서버가 저장하고 꺼졌는지 볼 수 있게).
//   4. 감시자를 뒤에 띄우고(이 스크립트가 끝나도 돈다), 포트가 열릴 때까지(60초) 기다린 뒤 /healthz가 ticking:true가 될 때까지(20초) 다시 묻고 찍는다.
//      20초 안에 되지 않으면 마지막 답과 로그의 끝을 찍고 코드 1로 끝난다 (서버와 감시자는 그대로 둔다).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { settings } from './serve.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const game = args.find((a) => !a.startsWith('--')) ?? process.env.GAME ?? 'deungbul';
const dry = args.includes('--dry') || !!process.env.DRY, stopOnly = args.includes('--stop');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const win = process.platform === 'win32';

/** 그 포트에서 누군가 듣고 있는가 (localhost로 이어 본다) */
const listening = (port) => new Promise((ok) => {
  const so = net.connect({ host: '127.0.0.1', port });
  const done = (v) => { so.destroy(); ok(v); };
  so.setTimeout(1000, () => done(false));
  so.once('connect', () => done(true));
  so.once('error', () => done(false));
});
async function waitFor(cond, ms, step = 250) { const end = Date.now() + ms; while (Date.now() < end) { if (await cond()) return true; await sleep(step); } return cond(); }
/** 그 번호의 프로세스가 살아 있는가 */
function alive(pid) { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; } }
const readPid = (file) => { try { const n = Number(fs.readFileSync(file, 'utf8').trim()); return Number.isInteger(n) && n > 0 ? n : 0; } catch { return 0; } };
/** 프로세스의 실행 파일 이름 (모르면 빈 문자열) */
function imageOf(pid) {
  try {
    if (win) return execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true }).split(',')[0].replace(/"/g, '').trim();
    return execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' }).trim();
  } catch { return ''; }
}
/** 그 포트에서 듣고 있는 프로세스의 번호들 (Windows: netstat, 그 밖: lsof). 찾지 못하면 빈 목록 */
function pidsOnPort(port) {
  try {
    if (win) {
      const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true });
      return [...new Set(out.split(/\r?\n/).map((l) => l.trim().split(/\s+/)).filter((c) => c[3] === 'LISTENING' && c[1]?.endsWith(`:${port}`)).map((c) => Number(c[4])).filter((n) => n > 0))];
    }
    return [...new Set(execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).split(/\s+/).map(Number).filter((n) => n > 0))];
  } catch { return []; }
}
/** 강제로 끈다. cloudflared(터널)는 이름을 보고 끄지 않는다. 끈 것이 있으면 true */
function kill(pid, what) {
  if (!alive(pid) || pid === process.pid) return false;
  const image = imageOf(pid);
  if (/cloudflared/i.test(image)) { console.log(`  ${what} pid ${pid}는 cloudflared(${image})라 끄지 않습니다`); return false; }
  try { process.kill(pid, 'SIGKILL'); console.log(`  ${what}를 강제로 껐습니다 (pid ${pid}, ${image || '이름 모름'})`); return true; } catch (err) { console.log(`  ${what}(pid ${pid})를 끄지 못했습니다: ${err.message}`); return false; }
}
/** /healthz를 한 번 묻는다: 상태 번호와 본문 (닿지 못하면 status 0과 까닭) */
const healthz = (port) => new Promise((ok) => {
  const req = http.get({ host: '127.0.0.1', port, path: '/healthz', timeout: 2000 }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => ok({ status: res.statusCode ?? 0, body: b })); });
  req.on('error', (err) => ok({ status: 0, body: `오류 ${err.message}` })); req.on('timeout', () => { req.destroy(); ok({ status: 0, body: '시간 초과' }); });
});
/** 막 뜬 서버는 첫 틱 전에 503(ticking:false)을 줄 수 있다: ticking:true가 될 때까지 다시 묻는다 */
const ticking = (h) => { try { return h.status === 200 && JSON.parse(h.body).ticking === true; } catch { return false; } };
const HEALTH_WAIT_MS = 20_000;
const tail = (file, n) => { try { return fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/).slice(-n).join('\n'); } catch { return '(로그 없음)'; } };

async function main() {
  const s = settings(game);
  const supPid = readPid(s.servePid), up = await listening(s.port);
  if (dry) {
    console.log(`게임 ${s.game} · 포트 ${s.port} · 저장 ${s.db} · 봇 ${s.bots} · 로그 ${s.log} · 깃발 ${s.stop}`);
    console.log(up ? `먼저: 포트 ${s.port}의 서버를 깃발로 저장하고 끈다 (10초 안에 안 꺼지면 감시자 → 서버 차례로 강제로)` : `먼저: 포트 ${s.port}에 떠 있는 서버가 없다`);
    if (alive(supPid)) console.log(`감시자가 돌고 있다 (pid ${supPid})`);
    if (!stopOnly) console.log(`시작: node scripts/serve.mjs ${s.game} (PORT=${s.port} DB=${s.db} BOTS=${s.bots}), 앞 로그는 ${s.log}.prev`);
    return 0;
  }
  // 1. 깃발로 저장하고 끄기
  if (up) {
    fs.mkdirSync(s.dir, { recursive: true });
    fs.writeFileSync(s.stop, '');
    console.log(`포트 ${s.port}의 서버를 깃발로 저장하고 끕니다…`);
    const down = await waitFor(async () => !(await listening(s.port)) && !alive(supPid), 10_000);
    if (!down) {
      // 2. 강제로: 감시자가 먼저 (서버를 끈 뒤 감시자가 다시 띄우지 못하게)
      console.log('10초 안에 꺼지지 않아 강제로 끕니다');
      kill(supPid, '감시자');
      const pids = pidsOnPort(s.port);
      const serverPid = readPid(s.serverPid);
      for (const pid of pids.length ? pids : [serverPid]) kill(pid, '서버');
      if (!(await waitFor(async () => !(await listening(s.port)), 5000))) { console.log(`포트 ${s.port}이 아직 열려 있습니다. 직접 확인하세요`); fs.rmSync(s.stop, { force: true }); return 1; }
      fs.rmSync(s.serverPid, { force: true });
    } else console.log('저장하고 꺼졌습니다');
    fs.rmSync(s.stop, { force: true });
  } else if (alive(supPid)) {
    // 서버는 없는데 감시자가 돈다 (다시 띄우기를 기다리는 중): 멈춘다
    console.log('서버는 떠 있지 않고 감시자만 돌고 있어 끕니다');
    kill(supPid, '감시자');
  }
  if (!alive(readPid(s.servePid))) fs.rmSync(s.servePid, { force: true });
  if (stopOnly) { console.log(`꺼져 있습니다 (${s.game}, 포트 ${s.port})`); return 0; }

  // 3. 로그 돌리기 (앞 프로세스가 파일을 막 놓았으면 Windows에서 잠깐 실패할 수 있어 몇 번 다시 한다)
  fs.mkdirSync(path.dirname(s.log), { recursive: true });
  if (fs.existsSync(s.log)) {
    for (let i = 0; ; i++) { try { fs.renameSync(s.log, s.log + '.prev'); break; } catch (err) { if (i >= 10) { console.log(`로그를 돌리지 못했습니다 (${err.message}). 이어 씁니다`); break; } await sleep(300); } }
  }
  // 4. 감시자를 뒤에 띄운다
  const sup = spawn(process.execPath, [path.join(root, 'scripts', 'serve.mjs'), s.game], {
    cwd: root, detached: true, stdio: 'ignore', windowsHide: true,
    env: { ...process.env, GAME: s.game, PORT: String(s.port), DB: s.db, BOTS: String(s.bots), LOG: s.log },
  });
  sup.unref();
  console.log(`감시자를 띄웠습니다 (pid ${sup.pid}). 포트 ${s.port}이 열리기를 기다립니다…`);
  if (!(await waitFor(() => listening(s.port), 60_000, 500))) { console.log('서버가 뜨지 않았습니다. 로그의 끝:'); console.log(tail(s.log, 8)); return 1; }
  console.log(`서버가 떴습니다 (${s.game}, 포트 ${s.port})`);
  let h = await healthz(s.port);
  const end = Date.now() + HEALTH_WAIT_MS;
  while (!ticking(h) && Date.now() < end) { await sleep(250); h = await healthz(s.port); }
  if (!ticking(h)) {
    console.log(`/healthz가 ${HEALTH_WAIT_MS / 1000}초 안에 ticking:true가 되지 않았습니다 (마지막 답: ${h.status || ''} ${h.body}). 로그의 끝:`);
    console.log(tail(s.log, 8));
    return 1;
  }
  console.log(`/healthz: ${h.status} ${h.body}`);
  return 0;
}

main().then((code) => process.exit(code), (err) => { console.error(err.message ?? err); process.exit(1); });
