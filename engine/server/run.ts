// 서버를 실행하는 흔한 절차를 한 함수로: 환경 변수를 읽어 저장소와 서버를 띄우고, 종료 신호에 저장하고 끈다.
// 게임의 실행 진입점(server/main.ts)이 자기 규칙 플러그인과 폴더만 넘겨 부른다 (예: games/sample/server/main.ts).
// 더 손대야 하는 게임은 이것을 쓰지 않고 startServer를 직접 부른다 (등불지기의 games/deungbul/server/main.ts가 그렇다: 이 파일은 그 절차를 옮겨 적은 것이다).
//   PORT=…               포트 (없으면 opts.port)
//   BOTS=6               돌아다니는 봇 수
//   DB=경로 | memory      저장 파일 (없으면 opts.db. memory면 저장하지 않는다)
//   DEV_SPAWN=-24,24     처음 자리 대신 이 좌표에서 접속한다
//   METRICS=10           10초마다 서버 지표를 한 줄로 찍는다
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from './game/game';
import { startServer, type Running } from './net/server';
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
  const s = await startServer(port, { bots, store, staticDir: opts.dist, game: { plugins: opts.plugins ?? [] } });
  const at = (process.env.DEV_SPAWN ?? '').split(',').map(Number);
  if (at.length === 2 && at.every(Number.isFinite)) s.game.players.devSpawn = { x: at[0], z: at[1] };

  // Ctrl+C나 종료 신호를 받으면 저장하고 끈다
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    console.log('[server] 저장하고 종료합니다.');
    s.close().finally(() => { store.close(); process.exit(0); });
  };
  const every = Number(process.env.METRICS ?? 0);
  if (every > 0) {
    setInterval(() => {
      const x = s.metrics(), f = (v: number) => v.toFixed(2);
      console.log(`[metrics] 접속 ${x.clients} 엔티티 ${x.entities} | 틱 ${f(x.tickAvg)}/${f(x.tickP95)}/${f(x.tickMax)}ms | 전송 ${f(x.flushAvg)}/${f(x.flushP95)}/${f(x.flushMax)}ms | 지연 ${f(x.lagAvg)}/${f(x.lagMax)}ms | ${(x.bytesPerS / 1024).toFixed(1)}KB/s`);
    }, every * 1000).unref();
  }
  // 어디선가 놓친 예외 하나로 모두의 게임이 꺼지지 않게 한다: 적어 두고 계속 돈다
  process.on('uncaughtException', (err) => { console.error('[server] 처리되지 않은 예외:', err); });
  process.on('unhandledRejection', (err) => { console.error('[server] 처리되지 않은 거부:', err); });
  // 저장 파일 옆에 stop.flag 파일이 생기면 저장하고 끈다. Windows에서는 뒤에서 도는 서버에 종료 신호를 보낼 수 없어서 둔 길이다
  if (dbFile !== 'memory') {
    const stopFlag = path.join(path.dirname(dbFile), 'stop.flag');
    try { fs.rmSync(stopFlag, { force: true }); } catch { /* 없으면 됐다 */ }
    setInterval(() => { if (fs.existsSync(stopFlag)) { try { fs.rmSync(stopFlag, { force: true }); } catch { /* 지우지 못해도 끈다 */ } shutdown(); } }, 500).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`[server] http://localhost:${s.port} 에서 대기 중 (봇 ${bots}명, 저장: ${dbFile})`);
  return s;
}
