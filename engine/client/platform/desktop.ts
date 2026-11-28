// 데스크톱(Electron) 구현 (플랫폼 분리 2단계: docs/platforms.md 4절). 앱의 preload(apps/desktop/preload.cjs)가 contextBridge로 window.desktopBridge를 내놓으면
// platform()이 이것을 고른다(./index.ts). 없으면(브라우저) 웹 구현 그대로다: 웹의 동작은 바뀌지 않는다.
// 화면은 웹과 같은 빌드(dist-*)를 앱의 사용자 정의 프로토콜(app://<게임>/)로 읽는다. 웹 구현 위에 다른 칸만 덮어쓴다:
//   저장      앱의 사용자 폴더의 파일 (지워지지 않는다: storage.durable). 읽기는 동기 (preload가 시작 때 한 번 받아 둔 것), 쓰기는 뒤에서. 비밀(기기 토큰)은 OS 암호화(safeStorage)로
//   서버      페이지가 app://라 '같은 출처'가 서버가 아니다: 앱이 정한 주소 (실행 인자 --server, 게임의 deploy.json의 desktop.server, 없으면 로컬 개발 서버)
//   링크      바깥 주소(http·https)는 기본 브라우저로, 상대 주소(도감·확률 페이지)는 앱 안의 새 창으로
//   소리      자동 재생 잠금이 없다(autoplayPolicy): 곧바로 깨운다
//   전체 화면 창의 전체 화면 (F11과 같은 것)
//   업데이트  서버가 '이 화면은 오래됐다'고 하면 스토어 주소가 있으면 그곳을 연다
import type { Platform } from './types';
import { webPlatform } from './web';

/** preload가 내놓는 것 (apps/desktop/preload.cjs와 모양을 같게) */
export interface DesktopBridge {
  /** 시작할 때 정해진 값: 게임 이름, 접속할 서버, 앱의 버전 표시, 실행 인자로 받은 값(--lang=en …), 저장된 값의 사본 */
  readonly init: { game: string; server: string; version: string; params: Readonly<Record<string, string>>; store: Readonly<Record<string, string>> };
  storage: {
    set(k: string, v: string): void;
    remove(k: string): void;
    secretGet(k: string): Promise<string | null>;
    secretSet(k: string, v: string): Promise<boolean>;
    secretRemove(k: string): Promise<void>;
  };
  openUrl(url: string): Promise<boolean>;
  copy(text: string): Promise<boolean>;
  saveFile(name: string, data: string | Uint8Array, mime: string): Promise<boolean>;
  fullscreen: { is(): boolean; set(on: boolean): Promise<boolean> };
}

/** preload가 내놓은 다리 (없으면 null: 브라우저) */
export function desktopBridge(): DesktopBridge | null {
  const b = typeof window === 'undefined' ? undefined : (window as { desktopBridge?: DesktopBridge }).desktopBridge;
  return b && typeof b === 'object' && b.init ? b : null;
}

export function desktopPlatform(b: DesktopBridge): Platform {
  const web = webPlatform();
  const store = new Map(Object.entries(b.init.store));
  const has: Platform['has'] = (f) => {
    switch (f) {
      case 'storage.durable': case 'link.external': case 'clipboard': case 'files.save': case 'display.fullscreen': case 'input.keyboard': return true;
      case 'offline.cache': case 'share': return false; // 화면이 앱 안에 있다 (서비스 워커 필요 없음), 공유 창 없음
      default: return web.has(f);
    }
  };
  /** 상대 주소는 지금 페이지(app://<게임>/)를 기준으로 푼다 */
  const abs = (url: string): string => { try { return new URL(url, location.href).href; } catch { return url; } };
  return {
    ...web,
    id: 'desktop',
    has,
    storage: {
      ready: () => Promise.resolve(),
      get: (k) => store.get(k) ?? null,
      set: (k, v) => { store.set(k, v); b.storage.set(k, v); return true; },
      remove: (k) => { store.delete(k); b.storage.remove(k); },
      secret: { get: (k) => b.storage.secretGet(k), set: (k, v) => b.storage.secretSet(k, v), remove: (k) => b.storage.secretRemove(k) },
    },
    audio: {
      // 앱은 자동 재생 잠금을 껐다(autoplayPolicy): 곧바로 한 번 깨우고, 웹처럼 입력마다도 (멈춘 소리 장치를 다시 깨운다)
      onUnlock: (fn) => { setTimeout(fn, 0); web.audio.onUnlock(fn); },
      onInterrupt: web.audio.onInterrupt,
    },
    display: { ...web.display, fullscreen: { can: () => true, is: () => b.fullscreen.is(), set: (on) => b.fullscreen.set(on) } },
    openUrl: (url) => b.openUrl(abs(url)),
    share: () => Promise.resolve(false),
    copy: (text) => b.copy(text),
    saveFile: async (name, data, mime) => {
      try { return await b.saveFile(name, typeof data === 'string' ? data : new Uint8Array(await data.arrayBuffer()), mime); } catch { return false; }
    },
    offlineCache: () => Promise.resolve(false),
    server: () => Promise.resolve(b.init.server),
    app: {
      ...web.app,
      version: () => b.init.version,
      // 스토어(런처) 주소가 있으면 연다. 없으면 다시 읽는다: 앱 안의 화면 파일이 바뀌었으면(개발: 다시 빌드) 새 화면이 온다
      requireUpdate: (storeUrl) => { if (storeUrl && /^https?:\/\//.test(storeUrl)) void b.openUrl(storeUrl); else location.reload(); },
      param: (name) => b.init.params[name] ?? web.app.param(name),
      setParam: () => { /* 앱에는 주소창이 없다 */ },
    },
  };
}
