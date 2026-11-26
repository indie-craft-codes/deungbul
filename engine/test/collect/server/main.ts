// 영웅 들판을 띄운다 (화면을 눈으로 보려고: 수집형·방치형 모듈의 모습). 운영하는 게임이 아니다.
//   npx vite build -c engine/test/collect/vite.config.ts            (화면 → dist-collect/)
//   PORT=3015 DB=memory npx tsx --tsconfig engine/test/collect/tsconfig.json engine/test/collect/server/main.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runServer } from '../../../server/run';
import { heath } from './heath';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
runServer({ port: 3015, db: path.join(root, 'data', 'collect', 'game.db'), dist: path.join(root, 'dist-collect'), plugins: [heath] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
