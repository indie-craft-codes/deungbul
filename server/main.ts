// 서버 실행 진입점: 환경 변수를 읽어 저장소와 서버를 띄우고, 종료 신호에 저장하고 끈다.
//   PORT=3001            포트
//   BOTS=6               돌아다니는 봇 수
//   DB=경로 | memory      저장 파일 (memory면 저장하지 않는다)
//   RAID_EVERY_MIN=5     습격을 시각표 대신 이 간격(분)으로 연다
//   DEV_SPAWN=-24,24     등탑 대신 이 좌표에서 접속한다
//   METRICS=10           10초마다 서버 지표를 한 줄로 찍는다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './net/server';
import { MemoryStore, SqliteStore, type Store } from './store';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3001);
const bots = Number(process.env.BOTS ?? 0);
const dbFile = process.env.DB ?? path.join(root, 'data', 'game.db');
const store: Store = dbFile === 'memory' ? new MemoryStore() : new SqliteStore(dbFile);
const raidEvery = Number(process.env.RAID_EVERY_MIN ?? 0);

startServer(port, { bots, store, game: raidEvery > 0 ? { raid: { everyMin: raidEvery } } : {} }).then((s) => {
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
  // data/stop.flag 파일이 생기면 저장하고 끈다 (scripts/restart.sh가 쓴다). Windows에서는 뒤에서 도는 서버에 종료 신호를 보낼 수 없어서 둔 길이다
  const stopFlag = path.join(path.dirname(dbFile), 'stop.flag');
  try { fs.rmSync(stopFlag, { force: true }); } catch { /* 없으면 됐다 */ }
  setInterval(() => { if (fs.existsSync(stopFlag)) { try { fs.rmSync(stopFlag, { force: true }); } catch { /* 지우지 못해도 끈다 */ } shutdown(); } }, 500).unref();
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  console.log(`[server] http://localhost:${s.port} 에서 대기 중 (봇 ${bots}명, 저장: ${dbFile})`);
}).catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
