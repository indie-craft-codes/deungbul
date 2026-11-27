// 플랫폼의 기본 구현: 브라우저. 지금까지 틀이 브라우저에 직접 하던 것을 그대로 한다 (저장 키 이름도 같다: 기존 사용자의 진행이 그대로 이어진다).
// 브라우저 API(localStorage, visibilitychange, window.onerror, 서비스 워커, 파일 내려받기, 클립보드, 전체 화면)는 이 파일에서만 부른다.
import type { Feature, LifeEvent, Platform, RawError } from './types';

const on = (target: EventTarget, ev: string, fn: () => void, opts?: AddEventListenerOptions): (() => void) => { target.addEventListener(ev, fn, opts); return () => target.removeEventListener(ev, fn, opts); };

/** localStorage를 감싼다: 시크릿 모드·막힌 저장소에서는 throw 대신 null·false */
function local(): Storage | null { try { return window.localStorage; } catch { return null; } }

/** 처음 사용자 입력이 오면 한 번 (자동 재생 정책: 소리는 그 뒤에만) */
const unlockers: (() => void)[] = [];
let unlocked = false;
function wakeAll(): void { if (unlocked) return; unlocked = true; for (const fn of unlockers.splice(0)) fn(); }

/** 게임 서버의 주소: 빌드의 VITE_SERVER_URL → 개발 서버의 포트 → 같은 출처 (예전 net.ts의 url) */
function baseUrl(): string {
  const fixed = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fixed) return fixed;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return import.meta.env.DEV ? `${proto}://${location.hostname}:${(import.meta.env.VITE_DEV_PORT as string | undefined) ?? '3001'}` : `${proto}://${location.host}`;
}

export function webPlatform(): Platform {
  const has = (f: Feature): boolean => {
    switch (f) {
      case 'storage.durable': case 'lifecycle.pause': case 'display.orientation': case 'display.safeArea': case 'ads': case 'ads.rewarded': case 'invite': return false;
      case 'display.fullscreen': return !!document.documentElement.requestFullscreen;
      case 'share': return typeof navigator.share === 'function';
      case 'clipboard': return !!navigator.clipboard?.writeText;
      case 'offline.cache': return 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      default: return true; // link.external, files.save, errors
    }
  };
  return {
    id: 'web',
    has,
    storage: {
      ready: () => Promise.resolve(),
      get: (k) => { try { return local()?.getItem(k) ?? null; } catch { return null; } },
      set: (k, v) => { try { const s = local(); if (!s) return false; s.setItem(k, v); return true; } catch { return false; } },
      remove: (k) => { try { local()?.removeItem(k); } catch { /* 저장소를 못 쓰는 환경 */ } },
      // 웹에는 따로 된 비밀 저장소가 없다: 같은 localStorage (기기 토큰의 키 'token'은 예전과 같다)
      secret: {
        get: (k) => { try { return Promise.resolve(local()?.getItem(k) ?? null); } catch { return Promise.resolve(null); } },
        set: (k, v) => { try { const s = local(); if (!s) return Promise.resolve(false); s.setItem(k, v); return Promise.resolve(true); } catch { return Promise.resolve(false); } },
        remove: (k) => { try { local()?.removeItem(k); } catch { /* 없다 */ } return Promise.resolve(); },
      },
    },
    lifecycle: {
      visible: () => document.visibilityState !== 'hidden',
      on: (ev: LifeEvent, fn) => {
        // 웹에는 진짜 일시정지가 없다: pause·resume은 숨김·보임과 같이 온다 (앱은 따로 온다)
        if (ev === 'hide' || ev === 'pause') return on(document, 'visibilitychange', () => { if (document.visibilityState === 'hidden') fn(); });
        if (ev === 'show' || ev === 'resume') return on(document, 'visibilitychange', () => { if (document.visibilityState !== 'hidden') fn(); });
        return on(window, 'pagehide', fn);
      },
    },
    audio: {
      onUnlock: (fn) => {
        if (unlocked) { fn(); return; }
        if (!unlockers.length) { window.addEventListener('pointerdown', wakeAll, { passive: true }); window.addEventListener('keydown', wakeAll); }
        unlockers.push(fn);
      },
      onInterrupt: () => { /* 웹에는 바깥의 소리 중단 사건이 없다 (광고는 ads가 알린다: ./index.ts) */ },
    },
    display: {
      fullscreen: {
        can: () => !!document.documentElement.requestFullscreen,
        is: () => !!document.fullscreenElement,
        set: async (v) => { try { if (v) await document.documentElement.requestFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen(); return true; } catch { return false; } },
      },
      orientation: { lock: () => Promise.resolve(false) },
      safeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
      pixelRatioCap: () => 2,
      pixelRatio: () => window.devicePixelRatio || 1,
    },
    openUrl: (url) => { try { return Promise.resolve(!!window.open(url, '_blank', 'noopener')); } catch { return Promise.resolve(false); } },
    share: async (d) => { try { await navigator.share(d); return true; } catch { return false; } },
    copy: async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } },
    saveFile: (name, data, mime) => {
      try {
        const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        return Promise.resolve(true);
      } catch { return Promise.resolve(false); }
    },
    errors: {
      listen: (fn: (e: RawError) => void) => {
        window.addEventListener('error', (ev) => {
          // 자원(그림·스크립트)을 읽지 못한 것도 error로 온다: 그것은 ErrorEvent가 아니다
          if (!(ev instanceof ErrorEvent)) return;
          const err = ev.error as { stack?: unknown } | undefined;
          fn({ kind: 'error', msg: String(ev.message || 'error'), stack: typeof err?.stack === 'string' ? err.stack : undefined, at: ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : undefined });
        });
        window.addEventListener('unhandledrejection', (ev) => {
          const r = ev.reason as { message?: unknown; stack?: unknown } | undefined;
          fn({ kind: 'rejection', msg: typeof r?.message === 'string' ? r.message : String(ev.reason), stack: typeof r?.stack === 'string' ? r.stack : undefined });
        });
      },
      report: (url, body) => {
        // 본문은 text/plain: 다른 출처(화면만 따로 올린 곳)로 보내도 미리 묻는 요청(preflight)이 없다. 닫히는 중에도 가게 keepalive
        try { void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'text/plain' }, mode: 'cors', credentials: 'omit' }).catch(() => { /* 못 보내면 버린다 */ }); } catch { /* 버린다 */ }
      },
    },
    offlineCache: async (scriptUrl) => {
      if (!has('offline.cache')) return false;
      try { await navigator.serviceWorker.register(scriptUrl); return true; } catch { return false; }
    },
    auth: { providers: () => ['guest'], proof: () => Promise.resolve(null) },
    ads: { gameplayStart: () => {}, gameplayStop: () => {}, adBreak: () => Promise.resolve(), rewarded: () => Promise.resolve(false) },
    invite: () => {},
    server: async () => {
      // 화면만 따로 올린 곳(GitHub Pages): 옆에 놓인 server.json({ "url": "wss://..." })을 읽는다. 없으면 화면을 내보낸 곳이 곧 서버다
      if (!import.meta.env.DEV && !import.meta.env.VITE_SERVER_URL) {
        try {
          const r = await fetch('./server.json', { cache: 'no-store' });
          const j = r.ok ? ((await r.json()) as { url?: unknown }) : null;
          if (j && typeof j.url === 'string' && /^wss?:\/\//.test(j.url)) return j.url;
        } catch { /* 파일이 없다 */ }
      }
      return baseUrl();
    },
    app: {
      version: () => {
        const s = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? '';
        return s.split('/').pop()?.split('?')[0] || 'dev';
      },
      build: () => 0,
      page: () => location.pathname,
      requireUpdate: () => location.reload(),
    },
  };
}
