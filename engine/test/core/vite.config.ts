// 공 마당의 화면 빌드 (눈으로 보는 용도): 뿌리는 client/, 결과는 저장소 뿌리의 dist-core/ (공 마당과 별 줍기 두 쪽)
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const here = import.meta.dirname, repo = resolve(here, '..', '..', '..');
export default defineConfig({
  root: resolve(here, 'client'),
  resolve: { alias: { '@engine': resolve(repo, 'engine'), '@game': here } },
  base: './',
  publicDir: false,
  define: { 'import.meta.env.VITE_DEV_PORT': JSON.stringify(process.env.PORT ?? '3015') },
  // 공 마당(index.html)과 별 줍기(stars.html: 판 모듈을 고른 화면)
  build: { outDir: resolve(repo, 'dist-core'), emptyOutDir: true, rollupOptions: { input: { index: resolve(here, 'client', 'index.html'), stars: resolve(here, 'client', 'stars.html') } } },
  server: { fs: { allow: [repo] } },
});
