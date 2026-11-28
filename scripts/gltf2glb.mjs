// .gltf(버퍼가 data: URI로 박힌 것)를 .glb 한 파일로 묶는다 (base64를 풀어 약 25% 작아진다). 바깥 파일을 가리키는 uri는 그 파일을 읽어 넣는다.
//   node scripts/gltf2glb.mjs <입력.gltf> <출력.glb>
// 받은 모델 파일은 실행하지 않는다: JSON으로 읽고 바이트만 옮긴다
import fs from 'node:fs';
import path from 'node:path';

const [inp, out] = process.argv.slice(2);
if (!inp || !out) { console.error('쓰는 법: node scripts/gltf2glb.mjs <입력.gltf> <출력.glb>'); process.exit(1); }
const g = JSON.parse(fs.readFileSync(inp, 'utf8'));
const dir = path.dirname(inp);
const read = (uri) => {
  if (uri.startsWith('data:')) return Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64');
  const f = path.resolve(dir, decodeURIComponent(uri));
  if (!f.startsWith(path.resolve(dir))) throw new Error(`모델 폴더 밖의 파일을 가리킨다: ${uri}`);
  return fs.readFileSync(f);
};
// 버퍼를 하나로 잇는다 (4바이트 맞춤)
const parts = [], offsets = [];
let len = 0;
for (const b of g.buffers ?? []) { const d = read(b.uri ?? ''); offsets.push(len); parts.push(d); len += d.length; const pad = (4 - (len % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); len += pad; } }
for (const v of g.bufferViews ?? []) { v.byteOffset = (v.byteOffset ?? 0) + offsets[v.buffer]; v.buffer = 0; }
// 바깥 그림 파일도 버퍼 안으로
for (const im of g.images ?? []) {
  if (!im.uri) continue;
  const d = read(im.uri);
  g.bufferViews.push({ buffer: 0, byteOffset: len, byteLength: d.length });
  im.bufferView = g.bufferViews.length - 1; im.mimeType ??= im.uri.endsWith('.png') ? 'image/png' : 'image/jpeg'; delete im.uri;
  parts.push(d); len += d.length; const pad = (4 - (len % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); len += pad; }
}
g.buffers = [{ byteLength: len }];
let json = Buffer.from(JSON.stringify(g), 'utf8');
const jpad = (4 - (json.length % 4)) % 4;
if (jpad) json = Buffer.concat([json, Buffer.alloc(jpad, 0x20)]);
const bin = Buffer.concat(parts);
const total = 12 + 8 + json.length + 8 + bin.length;
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(out, Buffer.concat([head, jh, json, bh, bin]));
console.log(`${inp} → ${out} ${(total / 1024).toFixed(0)}KB (원본 ${(fs.statSync(inp).size / 1024).toFixed(0)}KB)`);
