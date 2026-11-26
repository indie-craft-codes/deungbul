// 달무리 원정대의 화면 빌드 (node scripts/game.mjs build dalmuri): 뿌리는 client/, 결과는 저장소 뿌리의 dist-dalmuri/
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const game = import.meta.dirname, repo = resolve(game, '..', '..');
export default defineConfig({
  root: resolve(game, 'client'),
  // 별칭은 tsconfig.json의 paths와 같아야 한다: @game이 이 게임의 폴더를 가리킨다
  resolve: { alias: { '@engine': resolve(repo, 'engine'), '@game': game } },
  base: './',
  // 모델·소리 파일이 없다 (모두 코드 모델과 틀의 합성음)
  publicDir: false,
  define: { 'import.meta.env.VITE_DEV_PORT': JSON.stringify(process.env.PORT ?? '3008') },
  build: { outDir: resolve(repo, 'dist-dalmuri'), emptyOutDir: true },
  server: { host: true, port: 5193, fs: { allow: [repo] } },
});
