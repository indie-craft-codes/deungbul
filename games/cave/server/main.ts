// 버섯 동굴의 서버 진입점 (npm run start:cave)
import path from 'node:path';
import { runServer } from '@engine/server';
import { installCave } from './cave';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({ port: 3003, db: path.join(root, 'data', 'cave', 'game.db'), dist: path.join(root, 'dist-cave'), plugins: [installCave] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
