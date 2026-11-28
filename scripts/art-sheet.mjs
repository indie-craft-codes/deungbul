// 스프라이트 시트 맞추기 (artfix): 'sheet:<id>' 그림(기본 4열 × 4행, 투명 배경, 옆모습 오른쪽 보기)을 받아 칸마다 알파 상자를 재고,
// 모든 프레임을 같은 기준(발밑 가운데: 칸의 아래에서 3% 위, 가로 가운데)으로 다시 놓은 정규화 시트를 만든다. 프레임마다 투명 여백이 달라도 화면에서 흔들리지 않는다.
// 화면 쪽은 engine/client/scene/sprites.ts의 SHEET_DEFAULT(base 0.03)가 이 배치를 읽는다. 그림 넣기(art-import.mjs)가 sheet-<id>.png를 받으면 이것을 거친다.
//   node scripts/art-sheet.mjs <입력.png> <출력.png> [--cols=4] [--rows=4] [--h=320] [--keep-haze]  (--keep-haze: 반투명 무채색을 지우지 않는다)
//   맞춘 PNG는 크다(칸 16개): 화면에 넣을 때는 WebP(품질 90, 알파)로 바꿔 sheet-<id>.webp로 넣어도 된다 (art-import는 WebP를 맞추지 않고 그대로 넣는다)
//     --h  칸의 높이를 이만큼으로 줄인다 (기본 320px: 폰에서 사람 키 150px 안팎이면 넉넉하다. 더 작은 칸은 늘리지 않는다)
// 하는 일: 거의 투명한 칸의 색을 지운다(알파 < 12) · 가장자리의 붉은 번짐(크로마 키 자국)을 누른다 · 칸마다 발밑(알파 상자의 아래)과 몸의 가운데(알파 무게 중심)를 재서
// 모든 칸이 같은 자리에 오게 옮긴다 · 칸의 크기는 가장 큰 프레임에 맞춘다. 원본은 바꾸지 않는다 (입력 그대로 둔다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, resize } from './png.mjs';

export const SHEET_BASE = 0.03;

/** 시트 한 장을 맞춘다: img { w, h, data } → { img, cell: [w, h], frames: [{ x0, y0, x1, y1 }] } */
export function normalizeSheet(src, { cols = 4, rows = 4, h: maxH = 320, haze = true } = {}) {
  const { w: W, h: H } = src, d = new Uint8Array(src.data);
  // 1) 거의 투명한 칸은 색까지 지운다 (밉맵·선형 걸러 보기에서 투명 칸의 색이 가장자리로 번지지 않게)
  //    그리고 안개 지우기(haze, 기본 켬): 그림 만드는 AI가 '투명'이라며 그려 넣는 회색 바둑판·뿌연 후광은 반투명한 무채색이다 → 지운다 (색이 있는 반투명인 유령의 몸·불꽃은 남는다)
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3], hi = Math.max(d[i], d[i + 1], d[i + 2]), sat = hi - Math.min(d[i], d[i + 1], d[i + 2]);
    if (a < 12 || (haze && ((a < 235 && sat < 28) || (a < 160 && sat < 70 && hi > 150)))) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; }
  }
  // 2) 투명 가까이(2칸 안)의 붉은 번짐을 누른다: 빨강이 초록·파랑보다 훨씬 센 칸만
  const nearClear = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || d[(yy * W + xx) * 4 + 3] < 16) return true; } return false; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    if (!d[i + 3] || r < 90 || r < Math.max(g, b) * 1.6 + 30) continue;
    if (!nearClear(x, y)) continue;
    d[i] = Math.min(255, Math.round(Math.max(g, b) * 1.1));
  }
  // 3) 칸마다 알파 상자와 무게 중심
  const cw = W / cols, ch = H / rows, frames = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const X0 = Math.round(c * cw), X1 = Math.round((c + 1) * cw), Y0 = Math.round(r * ch), Y1 = Math.round((r + 1) * ch);
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, mass = 0, mx = 0;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      const a = d[(y * W + x) * 4 + 3];
      if (a < 40) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      mass += a; mx += a * x;
    }
    frames.push(x1 < 0 ? { X0, Y0, X1, Y1, empty: true } : { X0, Y0, X1, Y1, x0, y0, x1, y1, ax: Math.round(mx / mass) });
  }
  const full = frames.filter((f) => !f.empty);
  if (!full.length) throw new Error('시트에 그림이 없습니다 (모두 투명)');
  // 4) 칸의 크기: 기준(가로 무게 중심·발밑)에서 가장 멀리 간 프레임에 맞춘다
  const half = Math.max(...full.map((f) => Math.max(f.ax - f.x0, f.x1 - f.ax))) + 1, up = Math.max(...full.map((f) => f.y1 - f.y0)) + 1;
  const pad = Math.max(4, Math.round(up * 0.04));
  const OH = Math.ceil((up + pad) / (1 - SHEET_BASE)), OW = 2 * (half + pad), foot = OH - Math.round(OH * SHEET_BASE);
  const out = new Uint8Array(OW * cols * OH * rows * 4);
  frames.forEach((f, k) => {
    if (f.empty) return;
    const c = k % cols, r = Math.floor(k / cols), ox = c * OW + OW / 2 - f.ax, oy = r * OH + foot - 1 - f.y1;
    for (let y = f.Y0; y < f.Y1; y++) for (let x = f.X0; x < f.X1; x++) {
      const i = (y * W + x) * 4;
      if (!d[i + 3]) continue;
      const tx = x + ox, ty = y + oy;
      if (tx < c * OW || tx >= (c + 1) * OW || ty < r * OH || ty >= (r + 1) * OH) continue;
      const o = (ty * OW * cols + tx) * 4;
      out[o] = d[i]; out[o + 1] = d[i + 1]; out[o + 2] = d[i + 2]; out[o + 3] = d[i + 3];
    }
  });
  let img = { w: OW * cols, h: OH * rows, data: out };
  // 5) 칸이 크면 줄인다 (칸 단위로 나눠지게: 줄인 칸도 정수)
  if (maxH && OH > maxH) { const k = maxH / OH, cw2 = Math.round(OW * k), ch2 = Math.round(OH * k); img = resize(img, cw2 * cols, ch2 * rows); return { img, cell: [cw2, ch2], frames }; }
  return { img, cell: [OW, OH], frames };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const [inp, outp] = args.filter((a) => !a.startsWith('--'));
  if (!inp || !outp) { console.error('쓰는 법: node scripts/art-sheet.mjs <입력.png> <출력.png> [--cols=4] [--rows=4] [--h=320] [--keep-haze]'); process.exit(1); }
  const src = decodePng(fs.readFileSync(inp));
  if (!src) { console.error(`${inp}: 이 PNG를 읽지 못했습니다 (8비트·비월 아닌 PNG만)`); process.exit(1); }
  const r = normalizeSheet(src, { cols: Number(opt('cols') ?? 4), rows: Number(opt('rows') ?? 4), h: Number(opt('h') ?? 320), haze: !args.includes('--keep-haze') });
  fs.writeFileSync(outp, encodePng(r.img));
  console.log(`${inp} ${src.w}×${src.h} → ${outp} ${r.img.w}×${r.img.h} (칸 ${r.cell[0]}×${r.cell[1]}, 발밑 칸 아래 ${SHEET_BASE * 100}%)`);
  r.frames.forEach((f, i) => { if (f.empty) console.log(`  칸 ${i + 1}: 비었음`); });
}
