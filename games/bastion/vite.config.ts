// 이 게임의 화면 빌드 설정 (npm run build:bastion, npm run dev:bastion).
// 뿌리는 이 게임의 client/(index.html이 있는 곳), 결과는 저장소 뿌리의 dist-bastion/: 등불지기의 dist/와 섞이지 않는다.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const game = import.meta.dirname, repo = resolve(game, '..', '..');
export default defineConfig({
  root: resolve(game, 'client'),
  // 별칭은 tsconfig.json의 paths와 같아야 한다: @game이 이 게임의 폴더를 가리킨다
  resolve: { alias: { '@engine': resolve(repo, 'engine'), '@game': game } },
  // 상대 경로로 빌드한다: 게임 서버가 직접 내보낼 때도, 하위 경로에 올릴 때도 그대로 동작한다
  base: './',
  publicDir: false,
  // 개발 서버의 화면이 붙을 게임 서버의 포트: server/main.ts의 기본 포트와 같아야 한다 (PORT를 주면 서버와 함께 따라간다)
  define: { 'import.meta.env.VITE_DEV_PORT': JSON.stringify(process.env.PORT ?? '3005') },
  build: { outDir: resolve(repo, 'dist-bastion'), emptyOutDir: true },
  // 틀의 코드가 뿌리(client/) 밖에 있으므로 저장소 뿌리까지 읽게 한다
  server: { host: true, port: 5190, fs: { allow: [repo] } },
});
