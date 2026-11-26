// 화면 파일(dist/)을 주는 처리기 (engine/server/net/static.ts): 파일의 종류(content-type), 없는 파일, 폴더 밖, 깨진 주소.
// 소리(.wav .ogg .mp3 .m4a)와 모델(.glb .gltf)이 application/octet-stream으로 가면 브라우저가 형식을 짐작해야 한다: 바른 종류로 준다.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mimeOf, serveStatic } from '../../server/net/static';
import { startServer } from '../../server/net/server';
import { check } from '../harness';

/** 시험마다 새 폴더: base/dist가 화면 폴더, base/outside.txt가 그 밖의 파일 (함께 도는 다른 시험과 겹치지 않는다) */
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-static-')), root = path.join(base, 'dist');
const WANT: Record<string, string> = {
  'index.html': 'text/html', 'a.js': 'text/javascript', 'a.css': 'text/css', 'a.json': 'application/json', 'app.webmanifest': 'application/manifest+json',
  'a.png': 'image/png', 'a.webp': 'image/webp', 'a.svg': 'image/svg+xml', 'f.woff2': 'font/woff2',
  's.wav': 'audio/wav', 's.ogg': 'audio/ogg', 's.mp3': 'audio/mpeg', 's.m4a': 'audio/mp4', 'Loud.MP3': 'audio/mpeg',
  'm.glb': 'model/gltf-binary', 'm.gltf': 'model/gltf+json', 'x.unknownext': 'application/octet-stream',
};
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
for (const name of Object.keys(WANT)) fs.writeFileSync(path.join(root, 'assets', name), name);
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
fs.writeFileSync(path.join(base, 'outside.txt'), 'outside');

function get(port: number, p: string): Promise<{ status: number; type: string; body: string }> {
  return new Promise((ok, fail) => {
    // path를 그대로 보낸다 (http.get은 '..'를 고치지 않는다)
    http.get({ host: '127.0.0.1', port, path: p }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (d) => { body += d; });
      res.on('end', () => ok({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body }));
    }).on('error', fail);
  });
}

const plain = http.createServer(serveStatic(root));
await new Promise<void>((r) => plain.listen(0, '127.0.0.1', () => r()));
const port = (plain.address() as { port: number }).port;
try {
  const got = await Promise.all(Object.keys(WANT).map(async (name) => [name, await get(port, `/assets/${name}`)] as const));
  const wrong = got.filter(([name, r]) => r.status !== 200 || r.body !== name || r.type.split(';')[0] !== WANT[name]);
  check(wrong.length === 0, `파일마다 바른 content-type을 준다: 소리 wav·ogg·mp3·m4a, 모델 glb·gltf, webp, woff2, json, webmanifest (${wrong.map(([n, r]) => `${n}=${r.status} ${r.type}`).join(', ') || `${got.length}개 모두`})`);
  check(['.js', '.css', '.html', '.json'].every((x) => mimeOf('a' + x).includes('charset=utf-8')) && !mimeOf('a.wav').includes('charset') && mimeOf('a.glb') === 'model/gltf-binary', '글 파일에는 charset=utf-8을 붙이고, 소리·모델에는 붙이지 않는다');
  const index = await get(port, '/');
  check(index.status === 200 && index.type.startsWith('text/html') && index.body === '<!doctype html>', '/는 index.html');
  check((await get(port, '/assets/none.ogg')).status === 404, '없는 파일은 404');
  const up = await get(port, '/../outside.txt'), enc = await get(port, '/%2e%2e/outside.txt');
  check(up.body !== 'outside' && enc.body !== 'outside' && [403, 404].includes(up.status) && enc.status === 403, `폴더 밖의 파일은 주지 않는다 (${up.status}, ${enc.status})`);
  check((await get(port, '/%')).status === 400 && (await get(port, '/a%00b')).status === 400, '깨진 주소와 널 바이트는 400');
} finally {
  await new Promise<void>((r) => plain.close(() => r()));
}

// 게임 서버도 같은 처리기로 준다 (startServer의 staticDir)
{
  const s = await startServer(0, { staticDir: root, backup: false });
  try {
    const r = await get(s.port, '/assets/s.ogg');
    check(r.status === 200 && r.type === 'audio/ogg', `게임 서버가 주는 소리 파일도 audio/ogg (${r.type})`);
  } finally { await s.close(); }
}

fs.rmSync(base, { recursive: true, force: true });
