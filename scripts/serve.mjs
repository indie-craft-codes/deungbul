// 게임 서버의 감시자: 서버를 자식 프로세스로 띄우고, 비정상으로 끝나면 간격을 늘려 가며 다시 띄운다. 운영체제와 무관하다(Node만 있으면 된다).
//   node scripts/serve.mjs [게임]        (게임: 인자, 없으면 GAME, 없으면 deungbul)
// 포트·저장 파일·봇 수는 games/<게임>/deploy.json에서 읽는다. 환경 변수 PORT, DB, BOTS가 있으면 그것이 이긴다. 그 밖의 환경 변수(METRICS, BACKUP_* …)는 서버에 그대로 간다.
// 로그: LOG(없으면 저장 파일 옆의 server.log)에 이어 쓴다. 서버의 출력과 감시자의 줄('[serve] …')이 한 파일에 섞인다.
// 끝나는 때:
//   - 서버가 코드 0으로 끝났다: 정상 종료다(저장 파일 옆의 stop.flag로 저장하고 끈 것, 또는 Ctrl+C). 감시자도 끝난다.
//   - 서버가 0이 아닌 코드로 끝났다(처리되지 않은 예외, 강제 종료, 시작 실패): 1초, 2초, 4초 … 60초까지 늘려 가며 다시 띄운다. 60초 넘게 돌았으면 간격을 처음부터 센다.
//   - 감시자가 종료 신호(Ctrl+C)를 받았다: 깃발을 세워 서버를 저장하고 끄게 하고, 서버가 끝나면 다시 띄우지 않고 끝난다.
// 감시자는 자기 번호를 저장 파일 옆의 serve.pid에 적는다(끝날 때 지운다). scripts/restart.mjs가 이것으로 감시자를 찾는다.
// 보통은 직접 부르지 않고 scripts/restart.mjs가 뒤에서 띄운다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { deployOf } from './deploy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000, 60000];
const STABLE_MS = 60_000; // 이만큼 돌았으면 안정된 것으로 보고 간격을 처음부터 센다

/** 감시자와 재시작 스크립트가 함께 쓰는 설정: deploy.json에 환경 변수를 얹는다. 깃발과 pid 파일은 실제 저장 파일의 옆이다 */
export function settings(game = process.env.GAME ?? 'deungbul', env = process.env) {
  const c = deployOf(game);
  const db = env.DB ? (env.DB === 'memory' ? 'memory' : path.resolve(root, env.DB)) : c.db;
  // 메모리 저장의 서버는 깃발을 보지 않는다. 그래도 감시자의 파일은 게임의 저장 폴더에 둔다
  const dir = db === 'memory' ? c.dir : path.dirname(db);
  return {
    game: c.game, port: Number(env.PORT ?? c.port), db, bots: Number(env.BOTS ?? c.bots), dir,
    stop: path.join(dir, 'stop.flag'), servePid: path.join(dir, 'serve.pid'), serverPid: path.join(dir, 'server.pid'),
    log: env.LOG ? path.resolve(root, env.LOG) : path.join(dir, 'server.log'),
  };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
export const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;

function main() {
  const game = process.argv[2] ?? process.env.GAME ?? 'deungbul';
  const s = settings(game);
  fs.mkdirSync(path.dirname(s.log), { recursive: true });
  fs.mkdirSync(s.dir, { recursive: true });
  const logFd = fs.openSync(s.log, 'a');
  const say = (msg) => { try { fs.writeSync(logFd, `${stamp()} INFO  [serve] ${msg}\n`); } catch { /* 로그를 못 써도 감시는 한다 */ } };
  fs.writeFileSync(s.servePid, String(process.pid));
  const dropPid = () => { try { if (fs.readFileSync(s.servePid, 'utf8').trim() === String(process.pid)) fs.rmSync(s.servePid, { force: true }); } catch { /* 없으면 됐다 */ } };

  let child = null, fail = 0, stopping = false, timer = null;
  const start = () => {
    timer = null;
    const at = Date.now();
    say(`서버를 띄웁니다 (게임 ${s.game}, 포트 ${s.port}, 저장 ${s.db}, 봇 ${s.bots}, 감시자 pid ${process.pid})`);
    child = spawn(process.execPath, [path.join(root, 'scripts', 'game.mjs'), 'start', s.game], {
      cwd: root, stdio: ['ignore', logFd, logFd], windowsHide: true,
      env: { ...process.env, GAME: s.game, PORT: String(s.port), DB: s.db, BOTS: String(s.bots) },
    });
    child.on('error', (err) => say(`서버를 띄우지 못했습니다: ${err.message}`));
    child.on('exit', (code, signal) => {
      child = null;
      const ran = Date.now() - at;
      if (stopping || code === 0) {
        say(`서버가 끝났습니다 (코드 ${code ?? signal}${stopping ? ', 감시자가 종료 신호를 받음' : ', 정상 종료'}). 감시를 멈춥니다`);
        dropPid(); fs.closeSync(logFd); process.exit(0);
      }
      if (ran >= STABLE_MS) fail = 0;
      const wait = BACKOFF_MS[Math.min(fail, BACKOFF_MS.length - 1)];
      fail++;
      say(`서버가 비정상으로 끝났습니다 (코드 ${code ?? signal}, ${(ran / 1000).toFixed(1)}초 돎). ${wait / 1000}초 뒤 다시 띄웁니다 (연속 ${fail}번째)`);
      timer = setTimeout(start, wait);
    });
  };
  const onSignal = (sig) => {
    stopping = true;
    if (timer) { clearTimeout(timer); say(`종료 신호(${sig}): 다시 띄우지 않고 끝납니다`); dropPid(); fs.closeSync(logFd); process.exit(0); }
    // 서버에는 깃발로 알린다: Windows의 child.kill은 신호가 아니라 강제 종료라(저장하지 못한다), 그리고 실제 서버는 손자 프로세스다(game.mjs → tsx → 서버)
    if (child && s.db !== 'memory') { say(`종료 신호(${sig}): 깃발로 서버를 저장하고 끕니다`); fs.writeFileSync(s.stop, ''); } else if (child) child.kill(sig);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  start();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try { main(); } catch (err) { console.error(err.message ?? err); process.exit(1); }
}
