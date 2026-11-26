// 서버를 실행하는 흔한 절차를 한 함수로: 환경 변수를 읽어 저장소와 서버를 띄우고, 종료 신호에 저장하고 끈다.
// 게임의 실행 진입점(server/main.ts)이 자기 규칙 플러그인과 폴더만 넘겨 부른다 (등불지기 games/deungbul/server/main.ts, 예제 games/sample/server/main.ts).
// 플러그인의 설정(등불지기의 습격 간격 같은 것)은 진입점이 자기 환경 변수를 읽어 플러그인을 만들 때 넘긴다. 더 손대야 하는 게임은 startServer를 직접 부른다.
// 기본 포트와 저장 파일은 그 게임의 운영 설정(games/<게임>/deploy.json)과 같게 준다.
//   PORT=…               포트 (없으면 opts.port)
//   BOTS=6               돌아다니는 봇 수
//   DB=경로 | memory      저장 파일 (없으면 opts.db. memory면 저장하지 않는다)
//   DEV_SPAWN=-24,24     처음 자리 대신 이 좌표에서 접속한다
//   METRICS=10           10초마다 서버 지표와 재화 흐름(경제 장부)을 한 줄씩 찍는다
//   BACKUP_EVERY_MIN=360 자동 백업 간격(분). 0이면 켜질 때만 (engine/server/store/backup.ts)
//   BACKUP_KEEP=20       남겨 둘 자동 백업 수
//   BACKUP=0             자동 백업을 끈다
//   COMPRESS=0           WebSocket 압축(perMessageDeflate)을 끈다 (기본 켬: docs/infra.md '압축')
// 서버는 저장 파일 옆에 자기 프로세스 번호를 server.pid로 적는다 (scripts/restart.mjs가 강제로 끌 때 쓴다). 꺼질 때 지운다.
// 치명적 오류(처리되지 않은 예외): 적고, 저장을 시도하고, 코드 1로 끝낸다. 감시자(scripts/serve.mjs)가 다시 띄운다.
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from './game/game';
import { log } from './log';
import { startServer, type Running } from './net/server';
import { BACKUP_DEFAULTS, type BackupOptions } from './store/backup';
import { MemoryStore, SqliteStore, type Store } from './store';

export interface RunOptions {
  /** 기본 포트. 한 PC에서 게임을 여럿 띄울 때 겹치지 않게 게임마다 다르게 준다 */
  port: number;
  /** 기본 저장 파일. 서버를 끄는 깃발(stop.flag)이 이 파일의 옆에 놓이므로, 게임마다 폴더를 따로 준다 */
  db: string;
  /** 빌드된 화면의 폴더 (vite의 outDir) */
  dist: string;
  /** 이 게임의 규칙 플러그인들. 없으면 틀만으로 돈다 */
  plugins?: Plugin[];
}

export async function runServer(opts: RunOptions): Promise<Running> {
  const port = Number(process.env.PORT ?? opts.port);
  const bots = Number(process.env.BOTS ?? 0);
  const dbFile = process.env.DB ?? opts.db;
  if (dbFile !== 'memory') fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const store: Store = dbFile === 'memory' ? new MemoryStore() : new SqliteStore(dbFile);
  const s = await startServer(port, { bots, store, staticDir: opts.dist, game: { plugins: opts.plugins ?? [] }, backup: backupFromEnv(), compress: process.env.COMPRESS === undefined || process.env.COMPRESS === '' ? undefined : process.env.COMPRESS !== '0' });
  const at = (process.env.DEV_SPAWN ?? '').split(',').map(Number);
  if (at.length === 2 && at.every(Number.isFinite)) s.game.players.devSpawn = { x: at[0], z: at[1] };

  // 저장 파일 옆에 이 프로세스의 번호를 적는다: 깃발로 꺼지지 않는 서버를 운영 스크립트가 찾아 끌 수 있게 (scripts/restart.mjs)
  const pidFile = dbFile === 'memory' ? '' : path.join(path.dirname(dbFile), 'server.pid');
  if (pidFile) { try { fs.writeFileSync(pidFile, String(process.pid)); } catch (err) { log.warn('[server] server.pid를 적지 못했습니다:', err); } }
  const dropPid = () => { if (pidFile) { try { if (fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) fs.rmSync(pidFile, { force: true }); } catch { /* 없으면 됐다 */ } } };

  // Ctrl+C나 종료 신호를 받으면 저장하고 끈다
  let closing = false;
  const shutdown = (code = 0) => {
    if (closing) return;
    closing = true;
    log.info(`[server] 저장하고 종료합니다${code ? ` (코드 ${code})` : ''}.`);
    // 끄는 길이 어디서 막혀도(열린 연결이 닫히지 않는 등) 10초 뒤에는 끝낸다. 저장은 close()의 처음에 동기로 끝난다
    setTimeout(() => { log.error('[server] 10초 안에 꺼지지 않아 그대로 끝냅니다'); dropPid(); process.exit(code || 1); }, 10_000).unref();
    let closed: Promise<void>;
    try { closed = s.close(); } catch (err) { log.error('[server] 끄다가 예외:', err); closed = Promise.resolve(); }
    closed.catch((err) => log.error('[server] 끄다가 예외:', err)).finally(() => { try { store.close(); } catch { /* 이미 닫혔다 */ } dropPid(); process.exit(code); });
  };
  const every = Number(process.env.METRICS ?? 0);
  if (every > 0) {
    setInterval(() => {
      const x = s.metrics(), f = (v: number) => v.toFixed(2);
      console.log(`[metrics] 접속 ${x.clients} 엔티티 ${x.entities} | 틱 ${f(x.tickAvg)}/${f(x.tickP95)}/${f(x.tickMax)}ms | 전송 ${f(x.flushAvg)}/${f(x.flushP95)}/${f(x.flushMax)}ms | 지연 ${f(x.lagAvg)}/${f(x.lagMax)}ms | ${(x.bytesPerS / 1024).toFixed(1)}KB/s`);
      if (s.game.has('economy')) console.log(s.game.ledger.line()); // 같은 간격으로 재화 흐름 한 줄 (systems/ledger.ts)
    }, every * 1000).unref();
  }
  // 처리되지 않은 예외: 적고, 저장을 시도하고, 코드 1로 끝낸다. 감시자(scripts/serve.mjs)가 다시 띄운다.
  // 메시지 처리·틱·전송의 예외는 그 자리에서 잡혀 여기 오지 않는다(server.ts). 여기 오는 것은 그 밖의 콜백(타이머, 소켓, HTTP)이 중간에 끊긴 것이라,
  // 그 뒤로 프로세스가 온전한지 알 수 없다(Node의 문서도 이어서 돌리지 말라고 한다). 예전에는 삼키고 계속 돌았다: 같은 예외가 되풀이되며 조용히 망가진 채 도는 쪽이 더 나쁘다
  process.on('uncaughtException', (err) => {
    log.error('[server] 처리되지 않은 예외. 저장하고 끝냅니다:', err);
    shutdown(1);
  });
  // 처리되지 않은 거부(Promise): 적기만 하고 계속 돈다. 서버의 틀은 동기 코드라(틱, 메시지, 저장) 거부가 나는 곳은 게임이 따로 띄운 비동기 일뿐이고,
  // 거부는 그 비동기 일 하나가 끝났다는 뜻이지 Node의 내부 상태가 끊긴 것이 아니다. 접속한 모두를 끊고 다시 띄울 만한 일이 아니다. 지표(/metrics)에는 남지 않으니 로그에서 찾는다
  process.on('unhandledRejection', (err) => { log.error('[server] 처리되지 않은 거부 (계속 돕니다):', err); });
  // 저장 파일 옆에 stop.flag 파일이 생기면 저장하고 끈다. Windows에서는 뒤에서 도는 서버에 종료 신호를 보낼 수 없어서 둔 길이다
  if (dbFile !== 'memory') {
    const stopFlag = path.join(path.dirname(dbFile), 'stop.flag');
    try { fs.rmSync(stopFlag, { force: true }); } catch { /* 없으면 됐다 */ }
    setInterval(() => { if (fs.existsSync(stopFlag)) { try { fs.rmSync(stopFlag, { force: true }); } catch { /* 지우지 못해도 끈다 */ } shutdown(0); } }, 500).unref();
  }
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  log.info(`[server] http://localhost:${s.port} 에서 대기 중 (봇 ${bots}명, 저장: ${dbFile}, pid ${process.pid})`);
  return s;
}

/** 환경 변수의 자동 백업 설정: BACKUP=0이면 끈다, BACKUP_EVERY_MIN, BACKUP_KEEP */
function backupFromEnv(): BackupOptions | false {
  if (process.env.BACKUP === '0') return false;
  const num = (v: string | undefined, def: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : def; };
  return { everyMin: num(process.env.BACKUP_EVERY_MIN, BACKUP_DEFAULTS.everyMin), keep: Math.max(1, num(process.env.BACKUP_KEEP, BACKUP_DEFAULTS.keep)) };
}
