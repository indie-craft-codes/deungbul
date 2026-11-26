// 반딧불 연못의 서버 진입점: node scripts/game.mjs start pond (기본 포트 3010)
import path from 'node:path';
import { runServer } from '@engine/server';
import { installPond } from './pond';

// 저장소 뿌리: 저장(data/pond/)과 빌드된 화면(dist-pond/)은 뿌리에 둔다
const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({ port: 3010, db: path.join(root, 'data', 'pond', 'game.db'), dist: path.join(root, 'dist-pond'), plugins: [installPond] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
