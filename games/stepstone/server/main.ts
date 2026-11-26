// 서버 실행 진입점: node scripts/game.mjs start stepstone (환경 변수 PORT, DB는 engine/server/run.ts)
import path from 'node:path';
import { runServer } from '@engine/server';
import { installStepstone } from './stepstone';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({ port: 3009, db: path.join(root, 'data', 'stepstone', 'game.db'), dist: path.join(root, 'dist-stepstone'), plugins: [installStepstone] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
