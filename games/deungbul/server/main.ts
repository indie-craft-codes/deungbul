// 서버 실행 진입점: 틀의 runServer(engine/server/run.ts)에 이 게임의 규칙 플러그인과 폴더를 넘긴다.
// 환경 변수: PORT, BOTS, DB, DEV_SPAWN, METRICS는 runServer가 읽는다(그 파일의 머리 주석). 이 게임의 것은 하나:
//   RAID_EVERY_MIN=5     습격을 시각표 대신 이 간격(분)으로 연다
// 기본 포트와 저장 파일은 운영 설정(games/deungbul/deploy.json)과 같다: 3001, 뿌리의 data/game.db, 화면은 뿌리의 dist/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDeungbul } from './deungbul';
import { runServer } from '@engine/server';

// 저장소 뿌리: 저장 파일(data/)과 빌드된 화면(dist/)은 게임 폴더가 아니라 뿌리에 있다
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const raidEvery = Number(process.env.RAID_EVERY_MIN ?? 0);

// 이 게임의 규칙을 깔고, 그 설정(습격 간격)은 플러그인에 넘긴다
runServer({
  port: 3001,
  db: path.join(root, 'data', 'game.db'),
  dist: path.join(root, 'dist'),
  plugins: [(g) => installDeungbul(g, { raid: raidEvery > 0 ? { everyMin: raidEvery } : {} })],
}).catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
