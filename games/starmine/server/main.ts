// 서버 실행 진입점: 이 게임의 규칙을 깔아 틀의 서버를 띄운다. 저장소 뿌리에서 npm run start:starmine으로 실행한다 (환경 변수는 engine/server/run.ts).
import path from 'node:path';
import { runServer } from '@engine/server';
import { installStarmine } from './starmine';

// 저장소 뿌리: 저장(data/starmine/)과 빌드된 화면(dist-starmine/)은 뿌리에 둔다. 다른 게임과 겹치지 않는 포트와 폴더를 쓴다
const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({ port: 3017, db: path.join(root, 'data', 'starmine', 'game.db'), dist: path.join(root, 'dist-starmine'), plugins: [installStarmine] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
