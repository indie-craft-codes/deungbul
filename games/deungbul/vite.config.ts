import { resolve } from 'node:path';
import { build, defineConfig, type Plugin, type UserConfig } from 'vite';

// 이 게임의 화면 빌드 설정 (npm run build, npm run dev: scripts/game.mjs가 games/<게임>/vite.config.ts를 고른다).
// 화면의 뿌리는 이 게임의 클라이언트 폴더(client/: index.html, guide.html, public/)다.
// 틀의 화면 코드는 engine/client, 서버와 함께 쓰는 코드는 engine/shared와 이 게임의 shared/에 있고, 빌드 결과는 저장소 뿌리의 dist/에 놓인다.
const game = import.meta.dirname, repo = resolve(game, '..', '..');
const client = resolve(game, 'client');
const dist = resolve(repo, 'dist');
const common: UserConfig = {
  root: client,
  // 틀과 게임의 경계를 넘는 import는 별칭으로 적는다 (tsconfig.json의 paths와 같아야 한다)
  resolve: { alias: { '@engine': resolve(repo, 'engine'), '@game': game } },
  // 상대 경로로 빌드한다: 게임 서버가 직접 내보낼 때도, GitHub Pages처럼 하위 경로(/저장소이름/)에 올릴 때도 그대로 동작한다
  base: './',
  // 도감 맨 아래에 적는 빌드 시각
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
};

/**
 * 도감(client/guide.html → dist/guide.html)을 게임 빌드가 끝난 뒤에 따로 빌드해 같은 dist/에 더한다.
 * 한 번에 두 페이지를 입력으로 주면 둘이 함께 쓰는 코드가 공용 조각으로 떨어져 나와 게임의 빌드 결과가 달라지므로,
 * 게임은 예전 그대로 두고 도감만 혼자 서는 번들로 만든다. 개발 서버(npm run dev)에서는 /guide.html이 그대로 열린다.
 */
function guidePage(): Plugin {
  return {
    name: 'guide-page',
    apply: 'build',
    async closeBundle() {
      await build({
        ...common, configFile: false, publicDir: false,
        build: { outDir: dist, emptyOutDir: false, rollupOptions: { input: resolve(client, 'guide.html') } },
      });
    },
  };
}

export default defineConfig({
  ...common,
  build: { outDir: dist, emptyOutDir: true },
  server: { host: true, port: 5173, fs: { allow: [repo] } },
  plugins: [guidePage()],
});
