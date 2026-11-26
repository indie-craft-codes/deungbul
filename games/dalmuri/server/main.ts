// 달무리 원정대의 서버 진입점. 저장소 뿌리에서: node scripts/game.mjs start dalmuri (기본 포트 3008, 저장 data/dalmuri/game.db)
import path from 'node:path';
import { runServer } from '@engine/server';
import { installDalmuri } from './dalmuri';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({ port: 3008, db: path.join(root, 'data', 'dalmuri', 'game.db'), dist: path.join(root, 'dist-dalmuri'), plugins: [installDalmuri] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
