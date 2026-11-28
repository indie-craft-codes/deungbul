// 빌드의 머리 (art2): 게임이 앱 아이콘을 넣었으면(scripts/art-import.mjs의 appicon → public/art/brand/ → 빌드의 art/brand/) 빌드한 index.html의 머리에
// favicon·apple-touch-icon·manifest·og:image를 넣는다(있던 icon·apple-touch-icon·manifest 줄은 그것으로 바꾼다). 넣지 않은 게임은 index.html을 건드리지 않는다.
// node scripts/game.mjs build <게임>이 빌드가 끝나면 부른다 (크기 예산 앞). 따로: node scripts/brand-head.mjs <게임>
import fs from 'node:fs';
import path from 'node:path';
import { deployOf } from './deploy.mjs';

const game = process.argv[2] ?? process.env.GAME ?? 'deungbul';
let dep;
try { dep = deployOf(game); } catch { process.exit(0); }
const html = path.join(dep.dist, 'index.html'), dir = path.join(dep.dist, 'art', 'brand');
const has = (f) => fs.existsSync(path.join(dir, f));
if (!fs.existsSync(html) || (!has('icon-192.png') && !has('icon-32.png'))) process.exit(0);
const src = fs.readFileSync(html, 'utf8');
const title = /<title>([^<]*)<\/title>/.exec(src)?.[1] ?? '';
const tags = [
  has('icon-32.png') && '<link rel="icon" type="image/png" sizes="32x32" href="./art/brand/icon-32.png">',
  has('icon-192.png') && '<link rel="icon" type="image/png" sizes="192x192" href="./art/brand/icon-192.png">',
  has('icon-180.png') && '<link rel="apple-touch-icon" href="./art/brand/icon-180.png">',
  has('manifest.webmanifest') && '<link rel="manifest" href="./art/brand/manifest.webmanifest">',
  has('og.png') && '<meta property="og:image" content="./art/brand/og.png">',
  has('og.png') && title && `<meta property="og:title" content="${title}">`,
].filter(Boolean);
const out = src.replace(/\s*<link rel="(icon|apple-touch-icon|manifest)"[^>]*>/g, '').replace(/\s*<meta property="og:(image|title)"[^>]*>/g, '').replace('</head>', `  ${tags.join('\n  ')}\n</head>`);
fs.writeFileSync(html, out);
console.log(`[머리] ${game}: 앱 아이콘 ${tags.length}줄 (art/brand/)`);
