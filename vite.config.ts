import { defineConfig } from 'vite';

// 클라이언트 소스는 client/, 서버와 함께 쓰는 코드는 shared/에 있다.
export default defineConfig({
  root: 'client',
  // 상대 경로로 빌드한다: 게임 서버가 직접 내보낼 때도, GitHub Pages처럼 하위 경로(/저장소이름/)에 올릴 때도 그대로 동작한다
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { host: true, port: 5173, fs: { allow: ['..'] } },
});
