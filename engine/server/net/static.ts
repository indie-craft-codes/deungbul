// 빌드된 클라이언트(dist/)를 같은 포트에서 서비스한다.
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

/** 확장자 → content-type. 없는 것은 application/octet-stream (브라우저가 소리·모델 파일을 그 형식으로 읽게 바르게 준다) */
export const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/ogg', '.weba': 'audio/webm',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
};
/** 파일 이름의 content-type (확장자는 대소문자를 가리지 않는다) */
export const mimeOf = (file: string): string => MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

export function serveStatic(root: string): http.RequestListener {
  return (req, res) => {
    // 깨진 주소('/%')나 널 바이트가 든 주소는 예외를 던진다. 처리기 밖으로 나가면 서버가 통째로 죽으므로 여기서 거른다
    let urlPath: string;
    try { urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]); } catch { res.writeHead(400).end(); return; }
    if (urlPath.includes('\0')) { res.writeHead(400).end(); return; }
    const file = path.resolve(root, '.' + (urlPath === '/' ? '/index.html' : urlPath));
    // 폴더 밖의 파일은 주지 않는다
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found'); return; }
      res.writeHead(200, { 'content-type': mimeOf(file) }).end(data);
    });
  };
}
