// 서버 실행 진입점: 이 게임의 규칙을 깔아 틀의 서버를 띄운다. 저장소 뿌리에서 npm run start:sample로 실행한다 (환경 변수는 engine/server/run.ts).
import path from 'node:path';
import { runServer } from '@engine/server/run';
import { installSample } from './sample';

// 저장소 뿌리: 저장(data/)과 빌드된 화면(dist-sample/)은 뿌리에 둔다. 등불지기(3001, data/game.db, dist/)와 겹치지 않는 포트와 폴더를 쓴다
const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({ port: 3002, db: path.join(root, 'data', 'sample', 'game.db'), dist: path.join(root, 'dist-sample'), plugins: [installSample] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
