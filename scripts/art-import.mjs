// 그림 넣기 (U3 그림 자리): 폴더의 그림 파일을 게임의 public/art/ 아래로 옮기고, 등록 표(games/<게임>/client/artlist.ts)를 만든다.
// 화면은 그 표를 registerArt(ART)로 등록해 쓰고, 표에 없는 그림은 틀이 대신 그린다 (초상은 3D 모델의 그림, 배경은 css, 아이콘은 SVG: engine/client/art.ts).
//
// 쓰는 법 (저장소 뿌리에서):
//   node scripts/art-import.mjs <게임> <그림 폴더> [--dry] [--replace]
//     --dry      옮기지 않고 무엇을 할지만 적는다
//     --replace  표를 새로 쓴다 (기본은 있던 표에 더하고, 같은 열쇠는 새 것이 이긴다)
//
// 파일 이름이 열쇠다 ('<종류>-<id>.<확장자>' 또는 '<종류>/<id>.<확장자>'):
//   portrait-<캐릭터 id>.webp         초상            'portrait:<id>'   권장 512×512 (정사각형, 캐릭터가 가운데·발끝까지)
//   bg-<장면>.webp                    로비 배경       'bg:<장면>'       세로 1080×1920 또는 가로 1920×1080
//   bg-<장면>@portrait.webp           세로 화면 배경  'bg:<장면>@portrait'  1080×1920
//   bg-<장면>@landscape.webp          가로 화면 배경  'bg:<장면>@landscape' 1920×1080
//   banner-<이벤트 id>.webp           배너            'banner:<id>'     1200×500
//   icon-<아이콘 이름>.svg            화면 아이콘     'icon:<이름>'     SVG (24×24 격자, currentColor). png·webp도 된다
// 받는 확장자: .webp .png (아이콘은 .svg도). 크기를 맞추거나 webp로 바꾸지는 않는다(새 의존성 없이 node만으로는 그림을 다시 그릴 수 없다):
// 이미 맞춘 파일을 옮기고 등록만 한다. 크기가 권장과 다르거나 파일이 크면 경고한다 (그래도 넣는다).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [game, from] = args.filter((a) => !a.startsWith('--'));
if (!game || !from) { console.error('쓰는 법: node scripts/art-import.mjs <게임> <그림 폴더> [--dry] [--replace]'); process.exit(1); }
const gameDir = path.join(root, 'games', game);
if (!fs.existsSync(path.join(gameDir, 'client'))) { console.error(`게임이 없습니다: games/${game}/client`); process.exit(1); }
const src = path.resolve(from);
if (!fs.existsSync(src)) { console.error(`그림 폴더가 없습니다: ${src}`); process.exit(1); }

/** 종류마다: 받는 확장자, 권장 크기([너비, 높이] 목록: 하나라도 맞으면 됨), 경고할 파일 크기(바이트) */
const KINDS = {
  portrait: { ext: ['.webp', '.png'], size: [[512, 512]], max: 400_000 },
  bg: { ext: ['.webp', '.png'], size: [[1080, 1920], [1920, 1080]], max: 1_500_000 },
  banner: { ext: ['.webp', '.png'], size: [[1200, 500]], max: 500_000 },
  icon: { ext: ['.svg', '.webp', '.png'], size: [], max: 60_000 },
};
const ORIENT = { portrait: [1080, 1920], landscape: [1920, 1080] };

/** 그림의 크기를 머리에서 읽는다 (PNG의 IHDR, WebP의 VP8·VP8L·VP8X). 모르면 null */
function sizeOf(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (chunk === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  }
  return null;
}

/** 파일 하나 → { key, kind, id, orient, ext } (이름이 맞지 않으면 null) */
function parse(rel) {
  const ext = path.extname(rel).toLowerCase();
  const stem = rel.slice(0, -ext.length).replace(/\\/g, '/');
  const m = /^(portrait|bg|banner|icon)[-/]([\w.-]+?)(?:@(portrait|landscape))?$/.exec(stem);
  if (!m) return null;
  const [, kind, id, orient] = m;
  if (orient && kind !== 'bg') return null;
  if (!KINDS[kind].ext.includes(ext)) return null;
  return { key: `${kind}:${id}${orient ? `@${orient}` : ''}`, kind, id, orient, ext };
}

const walk = (d, base = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), path.join(base, e.name)) : [path.join(base, e.name)]));
const found = [], skipped = [], warns = [];
for (const rel of walk(src)) {
  const p = parse(rel);
  if (!p) { skipped.push(rel); continue; }
  const file = path.join(src, rel), buf = fs.readFileSync(file);
  const k = KINDS[p.kind];
  if (p.ext !== '.svg') {
    const sz = sizeOf(buf);
    const want = p.orient ? [ORIENT[p.orient]] : k.size;
    if (!sz) warns.push(`${rel}: 크기를 읽지 못했습니다 (PNG·WebP인가요?)`);
    else if (want.length && !want.some(([w, h]) => w === sz[0] && h === sz[1])) warns.push(`${rel}: ${sz[0]}×${sz[1]} (권장 ${want.map(([w, h]) => `${w}×${h}`).join(' 또는 ')})`);
  } else if (!/viewBox=["']0 0 24 24["']/.test(buf.toString('utf8'))) warns.push(`${rel}: SVG의 viewBox가 0 0 24 24가 아닙니다 (아이콘 격자)`);
  if (buf.length > k.max) warns.push(`${rel}: ${(buf.length / 1024).toFixed(0)}KB (${(k.max / 1024).toFixed(0)}KB 아래를 권장: 폰에서 늦게 뜬다)`);
  found.push({ ...p, file, out: `art/${p.kind}/${p.id}${p.orient ? `@${p.orient}` : ''}${p.ext}` });
}

const listFile = path.join(gameDir, 'client', 'artlist.ts');
const old = {};
if (!flags.has('--replace') && fs.existsSync(listFile)) {
  for (const m of fs.readFileSync(listFile, 'utf8').matchAll(/^\s*'([^']+)': '([^']+)',$/gm)) old[m[1]] = m[2];
}
const table = { ...old };
for (const f of found) table[f.key] = f.out;

console.log(`그림 ${found.length}개 (${src})`);
for (const f of found) console.log(`  ${f.key.padEnd(28)} ← ${path.relative(src, f.file)}`);
if (skipped.length) console.log(`이름이 맞지 않아 건너뜀 ${skipped.length}개: ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? ' …' : ''}`);
for (const w of warns) console.log(`  경고 ${w}`);
if (flags.has('--dry')) { console.log('(--dry: 옮기지 않았습니다)'); process.exit(0); }

const pub = path.join(gameDir, 'client', 'public');
for (const f of found) { const to = path.join(pub, f.out); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(f.file, to); }
const keys = Object.keys(table).sort();
fs.writeFileSync(listFile, `// 이 게임의 그림 등록 표 (scripts/art-import.mjs가 만든다: 손으로 고치지 말고 그림을 넣은 뒤 다시 돌린다).
// 열쇠 → 파일(public/ 아래, 빌드하면 화면과 같은 자리). 표에 없는 그림은 틀이 대신 그린다 (engine/client/art.ts).
export const ART: Readonly<Record<string, string>> = {
${keys.map((k) => `  '${k}': '${table[k]}',`).join('\n')}
};
`);
console.log(`옮김: games/${game}/client/public/art/ · 표: games/${game}/client/artlist.ts (${keys.length}개)`);
console.log('게임의 진입점이 registerArt(ART)를 부르는지 확인하세요 (games/echopact/client/main.ts처럼). public 폴더가 꺼진 게임은 vite.config.ts의 publicDir도.');
