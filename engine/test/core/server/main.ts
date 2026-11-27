// 공 마당을 띄운다 (화면을 눈으로 보려고: 핵심만 쓰는 게임의 모습). 운영하는 게임이 아니다.
//   npx vite build -c engine/test/core/vite.config.ts            (화면 → dist-core/: 공 마당 index.html과 별 줍기 stars.html)
//   PORT=3015 DB=memory npx tsx --tsconfig engine/test/core/tsconfig.json engine/test/core/server/main.ts
//   STARS=1 PORT=3015 DB=memory npx tsx … 같은 파일     별 줍기(판 모듈 rooms, 방장·투표를 켠 판, 별 쏟기는 여섯 자리까지)를 띄운다: 화면은 /stars.html
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 별 줍기는 판 모듈을 고른다: 내용(shared/content)이 읽기 전에 깃발을 세우고, 서버의 코드는 그 뒤에 읽는다
const starsOn = process.env.STARS === '1';
if (starsOn) (globalThis as { CORE_STARS?: boolean }).CORE_STARS = true;
const { runServer } = await import('../../../server/run');
const { balls } = await import('./balls');
const { stars } = await import('./stars');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
runServer({ port: 3015, db: path.join(root, 'data', 'core', 'game.db'), dist: path.join(root, 'dist-core'), plugins: starsOn ? [balls, stars({ lead: true, voteS: 20 }, { seats: { min: 2, max: 6 } })] : [balls] })
  .catch((err) => { console.error('[server] 시작 실패:', err); process.exit(1); });
