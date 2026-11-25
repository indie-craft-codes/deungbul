// 게임마다의 운영 설정(games/<게임>/deploy.json)을 읽는 도구. 운영 스크립트(restart.mjs, serve.mjs, restart.sh, publish.sh, pilot.mjs)가 이것을 거친다.
//   node scripts/deploy.mjs <칸> [게임]     칸의 값을 한 줄로 찍는다 (게임: 인자, 없으면 GAME, 없으면 deungbul)
//   node scripts/deploy.mjs flag on|off [게임]   서버를 끄는 깃발(저장 파일 옆의 stop.flag)을 세우거나 치운다
// 칸: port, db(저장 파일의 절대 경로), dir(저장 폴더), stop(깃발의 경로), dist(빌드 결과의 절대 경로), bots, pagesRepo, pagesDir, log(기본 로그)
// deploy.json: { port, db, dist, bots?, pages?: { repo, dir } }. 경로는 저장소 뿌리에서. pages가 없으면 GitHub Pages에 올리지 않는 게임이다.
// 서버의 진입점(games/<게임>/server/main.ts)의 기본값과 같아야 한다: 스크립트는 이 값을 PORT·DB로 넘겨 서버를 띄운다.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/** 그 게임의 운영 설정. 없으면 오류로 끝낸다 */
export function deployOf(game = process.env.GAME ?? 'deungbul') {
  if (!/^[a-z0-9_-]+$/i.test(game)) throw new Error(`게임 이름이 이상합니다: ${game}`);
  const file = path.join(root, 'games', game, 'deploy.json');
  if (!fs.existsSync(file)) throw new Error(`games/${game}/deploy.json이 없습니다 (port, db, dist를 적는다: docs/making-a-game.md 9절)`);
  const c = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const k of ['port', 'db', 'dist']) if (c[k] === undefined) throw new Error(`games/${game}/deploy.json에 ${k}가 없습니다`);
  const db = path.resolve(root, c.db), dir = path.dirname(db);
  return {
    game, port: Number(c.port), db, dir, stop: path.join(dir, 'stop.flag'), dist: path.resolve(root, c.dist), bots: Number(c.bots ?? 0),
    pagesRepo: c.pages?.repo ?? '', pagesDir: c.pages?.dir ? path.resolve(root, c.pages.dir) : '', log: path.join(dir, 'server.log'),
  };
}

// 명령줄로 불렸을 때
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [what, a, b] = process.argv.slice(2);
  try {
    if (what === 'flag') {
      const c = deployOf(b);
      if (a === 'on') { fs.mkdirSync(c.dir, { recursive: true }); fs.writeFileSync(c.stop, ''); } else fs.rmSync(c.stop, { force: true });
    } else {
      const c = deployOf(a);
      if (!what || !(what in c)) throw new Error(`칸을 고르세요: ${Object.keys(c).join(', ')}`);
      console.log(c[what]);
    }
  } catch (err) { console.error(err.message); process.exit(1); }
}
