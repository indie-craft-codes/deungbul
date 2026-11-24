// 문서(docs/making-a-game.md)의 코드 조각이 예제와 같은가. 문서의 코드는 예제에서 그대로 따온 것이어야 한다: 예제를 고치고 문서를 잊으면 여기서 잡힌다.
// 약속: 따온 조각은 코드 울타리의 머리에 파일 경로를 적는다 (```ts games/sample/server/bonfire.ts). 경로가 없는 울타리(명령, 폴더 그림)는 검사하지 않는다.
// 조각 안의 '…'만 있는 줄은 건너뛴 자리다: 그 앞뒤의 덩어리가 파일에 그 차례로 있으면 된다. 줄 앞뒤의 공백은 견주지 않는다.
import fs from 'node:fs';
import { check } from '@engine/testing';

const root = new URL('../../../', import.meta.url);
const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8').replace(/\r\n/g, '\n');
const lines = (text: string): string[] => text.split('\n').map((l) => l.trim()).filter((l) => l !== '');

const doc = read('docs/making-a-game.md');
const blocks = [...doc.matchAll(/^```[a-z]*[ \t]+(\S+)\n([\s\S]*?)^```$/gm)].map((m) => ({ file: m[1], code: m[2] }));
const bad: string[] = [];
for (const b of blocks) {
  if (!fs.existsSync(new URL(b.file, root))) { bad.push(`${b.file}: 없는 파일`); continue; }
  const src = lines(read(b.file));
  let from = 0;
  // 건너뛴 자리('…')로 나눈 덩어리마다, 파일의 이어진 줄들과 같아야 한다
  for (const chunk of b.code.split(/^\s*(?:\/\/|#|<!--)?\s*…\s*(?:-->)?\s*$/m).map(lines).filter((c) => c.length)) {
    let at = -1;
    for (let i = from; i + chunk.length <= src.length && at < 0; i++) if (chunk.every((l, k) => src[i + k] === l)) at = i;
    if (at < 0) { bad.push(`${b.file}: 문서의 조각이 파일에 없다 → ${chunk[0].slice(0, 70)}`); break; }
    from = at + chunk.length;
  }
}
for (const x of bad) console.log('  ' + x);
const files = new Set(blocks.map((b) => b.file));
check(blocks.length >= 12 && files.size >= 8 && bad.length === 0, `문서의 코드 조각 ${blocks.length}개(파일 ${files.size}개)가 예제의 파일에 그대로 있다`);

// 문서가 가리키는 파일과 npm 스크립트가 실제로 있는가
const paths = [...new Set([...doc.matchAll(/`((?:games\/sample|engine|scripts|docs)\/[\w./-]+\.(?:ts|json|html|css|md|mjs|sh))`/g)].map((m) => m[1]))];
const missing = paths.filter((p) => !fs.existsSync(new URL(p, root)));
const scripts = Object.keys((JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts);
const cited = [...new Set([...doc.matchAll(/npm run ([\w:]+)/g)].map((m) => m[1]))];
const unknown = cited.filter((s) => !scripts.includes(s));
for (const x of [...missing, ...unknown]) console.log('  없다: ' + x);
check(paths.length >= 12 && missing.length === 0 && cited.length >= 4 && unknown.length === 0, `문서가 가리키는 파일 ${paths.length}개와 npm 스크립트 ${cited.length}개가 실제로 있다`);
