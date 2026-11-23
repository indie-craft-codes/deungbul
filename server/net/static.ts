// 빌드된 클라이언트(dist/)를 같은 포트에서 서비스한다.
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary',
};

export function serveStatic(root: string): http.RequestListener {
  return (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = path.resolve(root, '.' + (urlPath === '/' ? '/index.html' : urlPath));
    // 폴더 밖의 파일은 주지 않는다
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(data);
    });
  };
}
