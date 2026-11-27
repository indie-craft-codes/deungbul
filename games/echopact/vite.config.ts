// 이 게임(메아리 계약)의 화면 빌드 설정 (node scripts/game.mjs build echopact).
// 뿌리는 이 게임의 client/(index.html이 있는 곳), 결과는 저장소 뿌리의 dist-echopact/: 다른 게임의 빌드와 섞이지 않는다.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const game = import.meta.dirname, repo = resolve(game, '..', '..');
export default defineConfig({
  root: resolve(game, 'client'),
  // 별칭은 tsconfig.json의 paths와 같아야 한다: @game이 이 게임의 폴더를 가리킨다
  resolve: { alias: { '@engine': resolve(repo, 'engine'), '@game': game } },
  base: './',
  // 모델·소리 파일이 없다 (겉모습은 모두 코드와 틀의 부품). public/은 넣은 그림의 자리 (art/: scripts/art-import.mjs). 폴더가 없으면 아무것도 옮기지 않는다
  publicDir: resolve(game, 'client', 'public'),
  // 개발 서버의 화면이 붙을 게임 서버의 포트: server/main.ts·deploy.json과 같다 (PORT를 주면 서버와 함께 따라간다)
  define: { 'import.meta.env.VITE_DEV_PORT': JSON.stringify(process.env.PORT ?? '3003') },
  build: { outDir: resolve(repo, 'dist-echopact'), emptyOutDir: true },
  server: { host: true, port: 5175, fs: { allow: [repo] } },
});
