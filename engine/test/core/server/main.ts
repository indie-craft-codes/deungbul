// 공 마당을 띄운다 (화면을 눈으로 보려고: 핵심만 쓰는 게임의 모습). 운영하는 게임이 아니다.
//   npx vite build -c engine/test/core/vite.config.ts            (화면 → dist-core/)
//   PORT=3015 DB=memory npx tsx --tsconfig engine/test/core/tsconfig.json engine/test/core/server/main.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runServer } from '../../../server/run';
import { balls } from './balls';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
runServer({ port: 3015, db: path.join(root, 'data', 'core', 'game.db'), dist: path.join(root, 'dist-core'), plugins: [balls] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
