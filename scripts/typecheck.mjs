// 저장소 전체의 타입 검사 (npm run typecheck). 검사할 설정은 스스로 모은다: 새 게임은 폴더만 만들면 함께 검사된다.
//   node scripts/typecheck.mjs            전부
//   node scripts/typecheck.mjs <게임>…    그 게임의 설정만 (예: sample. 'engine'은 틀의 설정 넷)
// 모으는 것:
//   틀       tsconfig.json(편집기와 scripts·test, 등불지기를 가리킨다), tsconfig.engine.json(틀만을 등불지기의 내용으로),
//            engine/test/fx/tsconfig.json(틀만을 시험용 내용으로), engine/test/core/tsconfig.json(틀만을 핵심만 쓰는 최소 내용으로),
//            engine/test/collect/tsconfig.json(틀만을 수집형·방치형 내용으로)
//   게임마다  games/<게임>/tsconfig.json(게임 전체), games/<게임>/tsconfig.engine.json(있으면: 틀만을 그 게임의 내용으로)
// 게임의 목록은 scripts/deploy.mjs의 listGames(games/ 아래에서 deploy.json이나 server/main.ts가 있는 폴더)다.
// 한꺼번에 넷까지 함께 돌리고, 끝나면 실패한 설정과 그 출력을 모아 찍는다.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listGames } from './deploy.mjs';

const root = path.resolve(import.meta.dirname, '..');
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const ENGINE = ['tsconfig.json', 'tsconfig.engine.json', 'engine/test/fx/tsconfig.json', 'engine/test/core/tsconfig.json', 'engine/test/collect/tsconfig.json'];
const pick = process.argv.slice(2);
const games = listGames();
for (const g of pick) if (g !== 'engine' && !games.includes(g)) { console.error(`모르는 이름입니다: ${g} (engine, ${games.join(', ')})`); process.exit(1); }

const configs = [];
if (!pick.length || pick.includes('engine')) configs.push(...ENGINE);
for (const g of games) {
  if (pick.length && !pick.includes(g)) continue;
  for (const f of ['tsconfig.json', 'tsconfig.engine.json']) configs.push(`games/${g}/${f}`);
}
const todo = configs.filter((c) => fs.existsSync(path.join(root, c)));

const run = (cfg) => new Promise((done) => {
  const started = Date.now();
  const child = spawn(process.execPath, [tsc, '--noEmit', '-p', cfg], { cwd: root });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => {
    console.log(`${code === 0 ? '통과' : '실패'}  ${cfg} (${((Date.now() - started) / 1000).toFixed(1)}초)`);
    done({ cfg, code, out });
  });
});

const results = [];
const queue = [...todo];
const workers = Array.from({ length: Math.min(4, Math.max(1, os.cpus().length - 1), queue.length) }, async () => {
  while (queue.length) results.push(await run(queue.shift()));
});
await Promise.all(workers);
const bad = results.filter((r) => r.code !== 0);
for (const r of bad) console.log(`\n[${r.cfg}]\n${r.out.trim()}`);
console.log(bad.length ? `\n타입 검사 실패: ${bad.map((r) => r.cfg).join(', ')}` : `\n타입 검사 모두 통과 (설정 ${results.length}개)`);
process.exit(bad.length ? 1 : 0);
