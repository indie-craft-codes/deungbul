// 틀만 타입 검사한다: 이 게임(등불지기)의 파일이 없을 때 틀이 스스로 컴파일되는가 (npm run typecheck:engine).
// 게임의 파일 목록은 tsconfig.engine.json의 exclude다. tsc -p로 그 설정을 바로 쓰지 않는 까닭: exclude는 처음 읽을 파일만 거르고,
// 틀의 파일이 게임의 파일을 import하면 따라 들어와서(게임의 선언 병합까지) 검사가 뜻을 잃는다. 그래서 게임의 파일을 뺀 사본을 만들어 거기서 검사한다.
// 오류가 0이 될 때까지는 npm test에 넣지 않는다: 남은 오류가 곧 "틀이 아직 게임을 아는 곳"의 목록이다 (docs/framework-plan.md의 뒤 단계들이 줄여 간다).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
// node_modules 아래에 두어 사본에서도 three, ws, @types를 찾는다 (.gitignore에 이미 들어 있다)
const out = path.join(root, 'node_modules', '.cache', 'typecheck-engine');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.engine.json'), 'utf8'));
const excluded = (rel) => cfg.exclude.some((x) => rel === x || rel.startsWith(x + '/'));
fs.rmSync(out, { recursive: true, force: true });
let files = 0;
for (const dir of cfg.include) {
  fs.cpSync(path.join(root, dir), path.join(out, dir), {
    recursive: true,
    filter: (src) => { const rel = path.relative(root, src).split(path.sep).join('/'); if (excluded(rel)) return false; if (rel.endsWith('.ts')) files++; return true; },
  });
}
fs.copyFileSync(path.join(root, 'tsconfig.json'), path.join(out, 'tsconfig.json'));
fs.writeFileSync(path.join(out, 'tsconfig.engine.json'), JSON.stringify({ extends: './tsconfig.json', include: cfg.include }));

const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const res = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', path.join(out, 'tsconfig.engine.json')], { cwd: out, encoding: 'utf8' });
const errors = (res.stdout + res.stderr).split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
for (const l of errors) console.log(l);
const perFile = new Map();
for (const l of errors) { const f = l.split('(')[0]; perFile.set(f, (perFile.get(f) ?? 0) + 1); }
if (errors.length) {
  console.log('\n파일별 오류 수');
  for (const [f, n] of [...perFile].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${f}`);
}
console.log(`\n틀의 파일 ${files}개 (게임의 파일 ${cfg.exclude.length}곳을 뺐다): 오류 ${errors.length}개, 파일 ${perFile.size}개`);
if (res.status !== 0 && errors.length === 0) { console.log(res.stdout + res.stderr); process.exit(res.status ?? 1); }
process.exit(errors.length ? 1 : 0);
