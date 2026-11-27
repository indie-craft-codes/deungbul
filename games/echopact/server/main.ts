// 서버 실행 진입점: 이 게임의 규칙을 깔아 틀의 서버를 띄운다. 저장소 뿌리에서 node scripts/game.mjs start echopact (환경 변수는 engine/server/run.ts).
import path from 'node:path';
import { runServer } from '@engine/server';
import { installEchopact } from './echopact';

// 저장소 뿌리: 저장(data/echopact/)과 빌드된 화면(dist-echopact/)은 뿌리에 둔다. 다른 게임과 겹치지 않는 포트(3003)와 폴더를 쓴다
const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({ port: 3003, db: path.join(root, 'data', 'echopact', 'game.db'), dist: path.join(root, 'dist-echopact'), plugins: [installEchopact] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
