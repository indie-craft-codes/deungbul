// 서버 실행 진입점: node scripts/game.mjs start rollball (환경 변수 PORT, DB는 engine/server/run.ts)
import path from 'node:path';
import { runServer } from '@engine/server';
import { installRollball } from './rollball';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({ port: 3007, db: path.join(root, 'data', 'rollball', 'game.db'), dist: path.join(root, 'dist-rollball'), plugins: [installRollball] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
