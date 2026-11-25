// 서버 실행 진입점: 이 게임의 규칙을 깔아 틀의 서버를 띄운다. 저장소 뿌리에서 npm run start:bastion으로 실행한다 (환경 변수는 engine/server/run.ts).
// 이 게임의 환경 변수: WAVE_S = 물결 사이의 시간(초), FIRST_S = 첫 물결까지(초)
import path from 'node:path';
import { runServer } from '@engine/server';
import { bastion } from './bastion';

const num = (v: string | undefined): number | undefined => (v && Number(v) > 0 ? Number(v) : undefined);
const root = path.resolve(import.meta.dirname, '..', '..', '..');
runServer({
  port: 3005, db: path.join(root, 'data', 'bastion', 'game.db'), dist: path.join(root, 'dist-bastion'),
  plugins: [bastion({ intervalS: num(process.env.WAVE_S), firstS: num(process.env.FIRST_S) })],
}).catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
