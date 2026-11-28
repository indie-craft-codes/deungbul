// 그림 넣기 (U3 그림 자리, art2에서 넓힘): 폴더의 그림 파일을 게임의 public/art/ 아래로 옮기고, 등록 표(games/<게임>/client/artlist.ts)를 만든다.
// 화면은 그 표를 registerArt(ART)로 등록해 쓰고, 표에 없는 그림은 틀이 대신 그린다 (초상은 3D 모델의 그림, 배경은 css, 아이콘은 SVG: engine/client/art.ts).
// 어떤 칸이 필요한지는 node scripts/art-list.mjs <게임> (파일 이름·권장 크기·투명 여부·그림을 만들 사람의 영어 설명).
//
// 쓰는 법 (저장소 뿌리에서):
//   node scripts/art-import.mjs <게임> <그림 폴더> [--dry] [--replace] [--bg=#rrggbb]
//     --dry      옮기지 않고 무엇을 할지만 적는다
//     --replace  표를 새로 쓴다 (기본은 있던 표에 더하고, 같은 열쇠는 새 것이 이긴다)
//     --bg       앱 아이콘을 얹을 바탕색 (apple-touch·maskable·OG). 없으면 index.html의 theme-color, 없으면 그림 왼쪽 위 칸의 색
//
// 파일 이름이 열쇠다 ('<종류>-<id>.<확장자>' 또는 '<종류>/<id>.<확장자>'. 칸의 종류·권장 크기는 scripts/art-slots.mjs):
//   portrait-<캐릭터 id>.webp      'portrait:<id>'    512×512 투명      bg-<장면>[@portrait|@landscape].webp  'bg:<장면>'  1080×1920·1920×1080
//   banner-<이벤트 id>.webp        'banner:<id>'      1200×500          icon-<아이콘 이름>.svg|png            'icon:<이름>' 24 격자 SVG·128×128 투명
//   cur-<재화 id>.webp             'cur:<id>'         128×128 투명      item-<아이템 id>[@<손 모양>].webp      'item:<id>'  256×256 투명
//   skill-<기술 id>.webp           'skill:<id>'       256×256           enemy-<몬스터 id>.webp                 'enemy:<id>' 512×512 투명
//   frame-<등급 id>.webp           'frame:<등급>'     400×500 투명      fx-<이름>.webp                         'fx:<이름>'  512×512 투명
//   logo.webp                      'logo'             1200×400 투명     splash[@portrait|@landscape].webp      'splash'     1080×1920·1920×1080
//   appicon.png                    'appicon'          1024×1024 PNG: 아래의 아이콘들을 만든다
// 받는 확장자: .webp .png (아이콘은 .svg도, 앱 아이콘은 .png만). 크기를 맞추거나 webp로 바꾸지는 않는다: 이미 맞춘 파일을 옮기고 등록만 한다.
// 크기가 권장과 다르거나, 투명이 필요한 칸에 투명이 없거나, 파일이 크면 경고한다 (그래도 넣는다).
// 앱 아이콘(appicon.png, 1024×1024): node의 zlib만으로 PNG를 줄여 public/art/brand/에 icon-32·180·192·256·512, icon-maskable-512, og(1200×630)와
// manifest.webmanifest를 만든다. 빌드(scripts/vite-art.ts)가 index.html의 머리에 favicon·apple-touch-icon·manifest·og:image를 넣고, 데스크톱 앱은 icon-256을 창 아이콘으로 쓴다.
// 크기별 파일을 직접 주려면 appicon-32.png · appicon-180.png · appicon-192.png · appicon-256.png · appicon-512.png · appicon-maskable.png · og.png (만든 것보다 이긴다).
import fs from 'node:fs';
import path from 'node:path';
import { APPICON_OUT, BRAND, ORIENT, SLOTS, sizeOf, sizeText, webpAlpha } from './art-slots.mjs';
import { decodePng, encodePng, hasTransparency, hexRgb, onCanvas, pngInfo, resize } from './png.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const [game, from] = args.filter((a) => !a.startsWith('--'));
if (!game || !from) { console.error('쓰는 법: node scripts/art-import.mjs <게임> <그림 폴더> [--dry] [--replace] [--bg=#rrggbb]'); process.exit(1); }
const gameDir = path.join(root, 'games', game);
if (!fs.existsSync(path.join(gameDir, 'client'))) { console.error(`게임이 없습니다: games/${game}/client`); process.exit(1); }
const src = path.resolve(from);
if (!fs.existsSync(src)) { console.error(`그림 폴더가 없습니다: ${src}`); process.exit(1); }

/** 손으로 준 앱 아이콘 크기별 파일 → 만들 파일 이름 */
const BRAND_FILES = { 'appicon-32': 'icon-32.png', 'appicon-180': 'icon-180.png', 'appicon-192': 'icon-192.png', 'appicon-256': 'icon-256.png', 'appicon-512': 'icon-512.png', 'appicon-maskable': 'icon-maskable-512.png', og: 'og.png' };

/** 파일 하나 → { key, kind, id, orient, ext } 또는 { brandFile } (이름이 맞지 않으면 null) */
function parse(rel) {
  const ext = path.extname(rel).toLowerCase();
  const stem = rel.slice(0, -ext.length).replace(/\\/g, '/').replace(/^brand[-/]/, '');
  if (BRAND_FILES[stem] && ext === '.png') return { brandFile: BRAND_FILES[stem], ext };
  const b = /^(logo|appicon|splash)(?:@(portrait|landscape))?$/.exec(stem);
  if (b) {
    const [, kind, orient] = b;
    if (orient && kind !== 'splash') return null;
    if (!SLOTS[kind].ext.includes(ext)) return null;
    return { key: `${kind}${orient ? `@${orient}` : ''}`, kind, id: '', orient, ext };
  }
  const m = /^(portrait|bg|banner|icon|cur|item|skill|enemy|unit|frame|fx)[-/]([\w.-]+?)(?:@([\w-]+))?$/.exec(stem);
  if (!m) return null;
  const [, kind, id, at] = m;
  if (at && !(kind === 'bg' && (at === 'portrait' || at === 'landscape')) && kind !== 'item') return null;
  if (!SLOTS[kind].ext.includes(ext)) return null;
  const orient = kind === 'bg' ? at : undefined;
  return { key: `${kind}:${id}${at ? `@${at}` : ''}`, kind, id: id + (at ? `@${at}` : ''), orient, ext };
}

/** 투명이 필요한 칸에 투명이 있는가 (PNG는 칸을 읽어 보고, WebP는 알파 표시를 본다). 모르면 null */
function alphaOf(buf) {
  const wa = webpAlpha(buf);
  if (wa !== null) return wa;
  const info = pngInfo(buf);
  if (!info) return null;
  if (!info.alpha) return false;
  const img = decodePng(buf);
  return img ? hasTransparency(img) : true;
}

const walk = (d, base = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), path.join(base, e.name)) : [path.join(base, e.name)]));
const found = [], brandFiles = [], skipped = [], warns = [];
for (const rel of walk(src)) {
  const p = parse(rel);
  if (!p) { skipped.push(rel); continue; }
  const file = path.join(src, rel), buf = fs.readFileSync(file);
  if (p.brandFile) {
    const want = APPICON_OUT[p.brandFile], sz = sizeOf(buf);
    if (!sz || sz[0] !== want[0] || sz[1] !== want[1]) warns.push(`${rel}: ${sz ? `${sz[0]}×${sz[1]}` : '크기를 읽지 못함'} (필요 ${want[0]}×${want[1]})`);
    brandFiles.push({ file, out: p.brandFile, rel });
    continue;
  }
  const k = SLOTS[p.kind];
  if (p.ext !== '.svg') {
    const sz = sizeOf(buf);
    const want = p.orient ? [ORIENT[p.orient]] : k.size;
    if (!sz) warns.push(`${rel}: 크기를 읽지 못했습니다 (PNG·WebP인가요?)`);
    else if (want.length && !want.some(([w, h]) => w === sz[0] && h === sz[1])) warns.push(`${rel}: ${sz[0]}×${sz[1]} (권장 ${sizeText(want)})`);
    if (k.alpha) { const a = alphaOf(buf); if (a === false) warns.push(`${rel}: 투명 배경이 없습니다 (이 칸은 투명 배경이 필요: 바탕이 네모로 보인다)`); }
  } else if (!/viewBox=["']0 0 24 24["']/.test(buf.toString('utf8'))) warns.push(`${rel}: SVG의 viewBox가 0 0 24 24가 아닙니다 (아이콘 격자)`);
  if (buf.length > k.max) warns.push(`${rel}: ${(buf.length / 1024).toFixed(0)}KB (${(k.max / 1024).toFixed(0)}KB 아래를 권장: 폰에서 늦게 뜬다)`);
  const out = BRAND.includes(p.kind) ? `art/brand/${p.key}${p.ext}` : `art/${p.kind}/${p.id}${p.ext}`;
  found.push({ ...p, file, buf, out, rel });
}

const listFile = path.join(gameDir, 'client', 'artlist.ts');
const old = {};
if (!flags.has('--replace') && fs.existsSync(listFile)) {
  for (const m of fs.readFileSync(listFile, 'utf8').matchAll(/^\s*'([^']+)': '([^']+)',$/gm)) old[m[1]] = m[2];
}
const table = { ...old };
for (const f of found) table[f.key] = f.out;

// ---- 앱 아이콘 → 크기별 파일 ----
const html = fs.existsSync(path.join(gameDir, 'client', 'index.html')) ? fs.readFileSync(path.join(gameDir, 'client', 'index.html'), 'utf8') : '';
const theme = /<meta name="theme-color" content="([^"]+)"/.exec(html)?.[1];
const title = /<title>([^<]*)<\/title>/.exec(html)?.[1]?.trim() || game;
const made = {}; // 만들 파일 이름 → Buffer
const icon = found.find((f) => f.kind === 'appicon');
if (icon) {
  const img = decodePng(icon.buf);
  if (!img) warns.push(`${icon.rel}: 이 PNG를 읽지 못했습니다 (8비트·비월 아닌 PNG만). 크기별 파일(appicon-192.png …)을 직접 주세요`);
  else {
    if (img.w !== img.h) warns.push(`${icon.rel}: 정사각형이 아닙니다 (${img.w}×${img.h}). 가운데에 맞춰 얹습니다`);
    const bg = hexRgb(opt('bg')) ?? hexRgb(theme) ?? [img.data[0], img.data[1], img.data[2]];
    const sq = img.w === img.h ? img : onCanvas(img, Math.max(img.w, img.h), Math.max(img.w, img.h), Math.max(img.w, img.h), bg);
    for (const [name, [w, h, size, fill]] of Object.entries(APPICON_OUT)) made[name] = encodePng(fill ? onCanvas(sq, w, h, size, bg) : resize(sq, w, h));
    console.log(`앱 아이콘: ${Object.keys(APPICON_OUT).join(' · ')} (바탕 #${bg.map((v) => v.toString(16).padStart(2, '0')).join('')})`);
  }
}
for (const b of brandFiles) made[b.out] = fs.readFileSync(b.file);
if (Object.keys(made).length) {
  made['manifest.webmanifest'] = Buffer.from(JSON.stringify({
    name: title, short_name: title, start_url: '../../', scope: '../../', display: 'standalone', orientation: 'any',
    background_color: theme ?? '#000000', theme_color: theme ?? '#000000',
    icons: [
      { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: './icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2) + '\n');
  for (const need of ['icon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png']) if (!made[need]) warns.push(`앱 아이콘 ${need}가 없습니다 (appicon.png 1024×1024 PNG를 주거나 크기별 파일을 직접)`);
}

console.log(`그림 ${found.length}개 (${src})`);
for (const f of found) console.log(`  ${f.key.padEnd(28)} ← ${f.rel}`);
for (const b of brandFiles) console.log(`  ${('brand/' + b.out).padEnd(28)} ← ${b.rel}`);
if (skipped.length) console.log(`이름이 맞지 않아 건너뜀 ${skipped.length}개: ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? ' …' : ''}`);
for (const w of warns) console.log(`  경고 ${w}`);
if (flags.has('--dry')) { console.log('(--dry: 옮기지 않았습니다)'); process.exit(0); }

const pub = path.join(gameDir, 'client', 'public');
for (const f of found) { const to = path.join(pub, f.out); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(f.file, to); }
for (const [name, buf] of Object.entries(made)) { const to = path.join(pub, 'art', 'brand', name); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, buf); }
const keys = Object.keys(table).sort();
fs.writeFileSync(listFile, `// 이 게임의 그림 등록 표 (scripts/art-import.mjs가 만든다: 손으로 고치지 말고 그림을 넣은 뒤 다시 돌린다).
// 열쇠 → 파일(public/ 아래, 빌드하면 화면과 같은 자리). 표에 없는 그림은 틀이 대신 그린다 (engine/client/art.ts).
export const ART: Readonly<Record<string, string>> = {
${keys.map((k) => `  '${k}': '${table[k]}',`).join('\n')}
};
`);
console.log(`옮김: games/${game}/client/public/art/ · 표: games/${game}/client/artlist.ts (${keys.length}개)`);
console.log('게임의 진입점이 registerArt(ART)를 부르는지 확인하세요 (세 게임 모두 부른다). public 폴더가 꺼진 게임은 vite.config.ts의 publicDir도.');
console.log(`빠진 칸 보기: node scripts/art-list.mjs ${game} --missing`);
