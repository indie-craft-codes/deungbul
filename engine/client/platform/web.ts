// 플랫폼의 기본 구현: 브라우저. 지금까지 틀이 브라우저에 직접 하던 것을 그대로 한다 (저장 키 이름도 같다: 기존 사용자의 진행이 그대로 이어진다).
// 브라우저 API(localStorage, 주소(location·history), navigator, visibilitychange·pagehide, window.onerror, 서비스 워커, 새 창, 파일 내려받기, 클립보드, 전체 화면)는 이 파일에서만 부른다
// (engine/test/boundary.test.ts 8절이 platform/ 밖의 호출을 막는다).
import { keyNameOf } from './keyname';
import type { Feature, InputKind, LifeEvent, Platform, RawError } from './types';

const on = (target: EventTarget, ev: string, fn: () => void, opts?: AddEventListenerOptions): (() => void) => { target.addEventListener(ev, fn, opts); return () => target.removeEventListener(ev, fn, opts); };

/** localStorage를 감싼다: 시크릿 모드·막힌 저장소에서는 throw 대신 null·false */
function local(): Storage | null { try { return window.localStorage; } catch { return null; } }

const media = (q: string): boolean => typeof matchMedia === 'function' && matchMedia(q).matches;

/**
 * 주 입력 장치. 처음에는 '(pointer: coarse)'로 짐작하고(예전의 isTouch와 같은 값: 첫 화면이 같다), 그 뒤로는 실제로 쓴 것을 따른다:
 * 손가락·펜으로 누르면 touch, 패드를 움직이면 gamepad. 마우스·키보드로 바꾸는 것은 이 기기에 정밀한 포인터가 있을 때만이다('(any-pointer: fine)':
 * 터치 노트북·태블릿+키보드). 폰은 키보드 사건(가상 자판)이 와도 터치로 남는다
 */
let input: InputKind | null = null;
const inputSubs = new Set<(k: InputKind) => void>();
function setInput(k: InputKind): void { if (input === k) return; input = k; for (const fn of inputSubs) fn(k); }
function watchInput(): InputKind {
  if (input) return input;
  input = media('(pointer: coarse)') ? 'touch' : 'mouse';
  const fine = (): boolean => media('(any-pointer: fine)');
  const editable = (t: EventTarget | null): boolean => t instanceof HTMLElement && (t.isContentEditable || t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement);
  window.addEventListener('pointerdown', (ev) => { if (ev.pointerType === 'touch' || ev.pointerType === 'pen') setInput('touch'); else if (ev.pointerType === 'mouse' && fine()) setInput('mouse'); }, { capture: true, passive: true });
  window.addEventListener('keydown', (ev) => { if (!editable(ev.target) && ev.key !== 'Unidentified' && ev.key !== 'Process' && fine()) setInput('mouse'); }, { capture: true, passive: true });
  return input;
}

/** 화면 크기. 홈 화면에 추가해 연 아이폰은 가로로 돌리면 페이지 높이를 실제보다 작게 알려 줘서 아래가 비므로, 그때는 기기 화면 크기를 직접 쓴다 (예전 main.ts의 appSize) */
function viewport(): { w: number; h: number } {
  if ((navigator as { standalone?: boolean }).standalone === true) {
    const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height);
    return window.matchMedia('(orientation: landscape)').matches ? { w: long, h: short } : { w: short, h: long };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

/** 게임 서버의 주소: 빌드의 VITE_SERVER_URL → 개발 서버의 포트 → 같은 출처 (예전 net.ts의 url) */
function baseUrl(): string {
  const fixed = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fixed) return fixed;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return import.meta.env.DEV ? `${proto}://${location.hostname}:${(import.meta.env.VITE_DEV_PORT as string | undefined) ?? '3001'}` : `${proto}://${location.host}`;
}

/**
 * 뒤로 가기의 자리 (Platform.nav): history에 항목 하나를 더해 두고, popstate를 '뒤로'로 받는다.
 * 거둘 때(disarm)는 history.back을 부르고 그 popstate는 알리지 않는다. 거두는 중에 다시 잡으면(arm) 그 popstate가 온 뒤에 잡는다
 * (history.back은 비동기라 바로 pushState하면 거둔 자리가 엉킨다)
 */
function webNav(): Platform['nav'] {
  let armed = false, skip = 0, again = false;
  const fns = new Set<() => void>();
  const push = () => { try { history.pushState({ dgNav: 1 }, ''); armed = true; } catch { /* 주소를 바꿀 수 없는 곳 */ } };
  window.addEventListener('popstate', () => {
    if (skip > 0) { skip--; if (again && skip === 0) { again = false; push(); } return; }
    if (!armed) return; // 게임의 자리가 아닌 뒤로 (주소의 #이 바뀐 것 따위)
    armed = false;
    for (const fn of [...fns]) fn();
  });
  return {
    arm: () => { if (armed) return; if (skip > 0) { again = true; return; } push(); },
    disarm: () => { again = false; if (!armed) return; armed = false; skip++; try { history.back(); } catch { skip--; } },
    onBack: (fn) => { fns.add(fn); return () => { fns.delete(fn); }; },
  };
}

export function webPlatform(): Platform {
  const has = (f: Feature): boolean => {
    switch (f) {
      case 'storage.durable': case 'lifecycle.pause': case 'display.orientation': case 'display.safeArea': case 'ads': case 'ads.rewarded': case 'invite': return false;
      case 'notify.local': case 'notify.push': case 'purchase': case 'achievements': case 'cloudSave': return false; // 웹 기본 구현에는 없다 (포털·앱 구현이 채운다)
      case 'input.touch': return (navigator.maxTouchPoints ?? 0) > 0 || media('(any-pointer: coarse)');
      case 'input.keyboard': return media('(any-pointer: fine)'); // 브라우저는 키보드가 있는지 알려 주지 않는다: 정밀한 포인터가 있으면 키보드도 있다고 본다
      case 'input.gamepad': return typeof navigator.getGamepads === 'function';
      case 'display.fullscreen': return !!document.documentElement.requestFullscreen;
      case 'share': return typeof navigator.share === 'function';
      case 'clipboard': return !!navigator.clipboard?.writeText;
      case 'offline.cache': return 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      default: return true; // link.external, files.save, errors, app.update(새로고침)
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
      // 입력마다 (예전 sound.ts가 직접 달던 것과 같은 사건·같은 차례)
      onUnlock: (fn) => { window.addEventListener('pointerdown', fn, { passive: true }); window.addEventListener('keydown', fn); },
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
      viewport,
    },
    input: {
      primary: watchInput,
      onChange: (fn) => { watchInput(); inputSubs.add(fn); return () => inputSubs.delete(fn); },
      gamepad: () => {
        const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
        const pad = [...pads].find((p) => !!p && p.connected);
        if (!pad) return null;
        const dz = (v: number | undefined): number => (v === undefined || Math.abs(v) < 0.2 ? 0 : v);
        const x = dz(pad.axes[0]), z = dz(pad.axes[1]), buttons = pad.buttons.map((b) => b.pressed);
        if (x || z || buttons.some(Boolean)) setInput('gamepad');
        return { x, z, buttons };
      },
      keyName: keyNameOf,
    },
    // 새 창(탭)으로 연다: <a target="_blank" rel="noopener">와 같다. noopener로 열면 window.open이 늘 null을 돌려주므로 던지지 않았으면 연 것으로 본다
    openUrl: (url) => { try { window.open(url, '_blank', 'noopener'); return Promise.resolve(true); } catch { return Promise.resolve(false); } },
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
    notify: { permission: () => Promise.resolve('denied'), register: () => Promise.resolve(null), local: () => Promise.resolve(false) },
    purchase: { products: () => Promise.resolve([]), buy: () => Promise.resolve({ error: 'unsupported' }), onPending: () => {} },
    achievements: { unlock: () => Promise.resolve(false) },
    cloud: { get: () => Promise.resolve(null), set: () => Promise.resolve(false) },
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
    nav: webNav(),
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
      // 웹은 새로 읽으면 서버가 내보내는 새 화면이 온다 (화면만 따로 올린 곳도 같은 배포에서 함께 바뀐다)
      requireUpdate: () => location.reload(),
      param: (name) => { try { return new URLSearchParams(location.search).get(name); } catch { return null; } },
      setParam: (name, value) => { try { const url = new URL(location.href); url.searchParams.set(name, value); history.replaceState(null, '', url); } catch { /* 주소를 바꿀 수 없는 곳 */ } },
      anchor: () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return location.hash.slice(1); } },
      language: () => navigator.language ?? '',
    },
  };
}
