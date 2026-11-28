// 작은 PNG 도구 (새 의존성 없이 node의 zlib만): 읽기·크기 바꾸기·바탕에 얹기·쓰기. 그림 넣기(scripts/art-import.mjs)가 앱 아이콘 한 장에서
// favicon·PWA·apple-touch·OG·데스크톱 아이콘을 만들 때 쓴다. WebP는 읽지 못한다 (앱 아이콘은 PNG로 받는다).
// 읽는 것: 8비트 PNG (회색·회색+알파·RGB·RGBA·팔레트, 비월 아닌 것). 16비트와 비월(interlace) PNG는 null (art-import가 경고한다).
import zlib from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };

/** PNG의 머리만 읽는다: { w, h, depth, color, interlace, alpha(투명 칸이 있을 수 있는 형식인가) } 또는 null */
export function pngInfo(buf) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) return null;
  const color = buf[25];
  let alpha = color === 4 || color === 6;
  // 팔레트·RGB의 tRNS 덩이도 투명이다
  for (let p = 8; p + 8 <= buf.length;) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8); if (type === 'tRNS') alpha = true; if (type === 'IDAT' || type === 'IEND') break; p += 12 + len; }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), depth: buf[24], color, interlace: buf[28], alpha };
}

/** PNG → { w, h, data: RGBA Uint8Array }. 못 읽으면 null */
export function decodePng(buf) {
  const info = pngInfo(buf);
  if (!info || info.depth !== 8 || info.interlace !== 0) return null;
  const { w, h, color } = info;
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!ch) return null;
  const idat = [];
  let pal = null, trns = null;
  for (let p = 8; p + 8 <= buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IDAT') idat.push(body); else if (type === 'PLTE') pal = body; else if (type === 'tRNS') trns = body; else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = new Uint8Array(w * h * 4), line = new Uint8Array(stride), prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * ch;
      if (color === 6) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = line[s + 3]; }
      else if (color === 2) { out[o] = line[s]; out[o + 1] = line[s + 1]; out[o + 2] = line[s + 2]; out[o + 3] = trns && trns.length >= 6 && line[s] === trns[1] && line[s + 1] === trns[3] && line[s + 2] === trns[5] ? 0 : 255; }
      else if (color === 0) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = trns && trns.length >= 2 && line[s] === trns[1] ? 0 : 255; }
      else if (color === 4) { out[o] = out[o + 1] = out[o + 2] = line[s]; out[o + 3] = line[s + 1]; }
      else { const k = line[s]; out[o] = pal?.[k * 3] ?? 0; out[o + 1] = pal?.[k * 3 + 1] ?? 0; out[o + 2] = pal?.[k * 3 + 2] ?? 0; out[o + 3] = trns && k < trns.length ? trns[k] : 255; }
    }
    prev.set(line);
  }
  return { w, h, data: out };
}

/** 투명한 칸이 있는가 (알파 < 250인 칸이 전체의 0.5% 넘게) */
export function hasTransparency(img) {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 250) n++;
  return n > (img.w * img.h) / 200;
}

/** 크기를 바꾼다 (줄일 때는 칸의 평균: 알파를 곱한 색으로 섞어 가장자리가 어둡지 않게, 늘릴 때는 가까운 칸) */
export function resize(img, w, h) {
  const out = new Uint8Array(w * h * 4), sx = img.w / w, sy = img.h / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy, y1 = Math.max(y0 + 1e-6, (y + 1) * sy);
    for (let x = 0; x < w; x++) {
      const x0 = x * sx, x1 = Math.max(x0 + 1e-6, (x + 1) * sx);
      let r = 0, g = 0, b = 0, a = 0, wt = 0;
      for (let yy = Math.floor(y0); yy < Math.min(img.h, Math.ceil(y1)); yy++) {
        const fy = Math.min(y1, yy + 1) - Math.max(y0, yy);
        if (fy <= 0) continue;
        for (let xx = Math.floor(x0); xx < Math.min(img.w, Math.ceil(x1)); xx++) {
          const fx = Math.min(x1, xx + 1) - Math.max(x0, xx);
          if (fx <= 0) continue;
          const k = fx * fy, i = (yy * img.w + xx) * 4, al = img.data[i + 3] / 255;
          r += img.data[i] * al * k; g += img.data[i + 1] * al * k; b += img.data[i + 2] * al * k; a += al * k; wt += k;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = wt > 0 ? Math.round((a / wt) * 255) : 0;
    }
  }
  return { w, h, data: out };
}

/** 바탕색(rgb) 캔버스 w×h의 가운데에 그림을 size×size로 얹는다 (알파로 섞는다) */
export function onCanvas(img, w, h, size, rgb) {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { out[i * 4] = rgb[0]; out[i * 4 + 1] = rgb[1]; out[i * 4 + 2] = rgb[2]; out[i * 4 + 3] = 255; }
  const s = resize(img, size, Math.round((size * img.h) / img.w)), ox = Math.round((w - s.w) / 2), oy = Math.round((h - s.h) / 2);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const tx = ox + x, ty = oy + y;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
    const i = (y * s.w + x) * 4, o = (ty * w + tx) * 4, a = s.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(s.data[i + c] * a + out[o + c] * (1 - a));
  }
  return { w, h, data: out };
}

/** RGBA → PNG (줄마다 걸러 보기 다섯 가운데 가장 작은 것) */
export function encodePng(img) {
  const { w, h, data } = img, stride = w * 4, raw = Buffer.alloc((stride + 1) * h), cand = Array.from({ length: 5 }, () => Buffer.alloc(stride));
  for (let y = 0; y < h; y++) {
    const cur = data.subarray(y * stride, (y + 1) * stride), prev = y ? data.subarray((y - 1) * stride, y * stride) : null;
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = cand[f];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0, b = prev ? prev[i] : 0, c = prev && i >= 4 ? prev[i - 4] : 0;
        let p = 0;
        if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (cur[i] - p) & 0xff;
        o[i] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(tb)); return Buffer.concat([len, tb, c]); };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** '#rrggbb' → [r, g, b] (못 읽으면 null) */
export const hexRgb = (s) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s ?? '').trim()); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; };
