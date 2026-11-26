// 시험용 플랫폼(node): 저장소는 Map, 생명주기는 손으로 일으킨다(fire), 내려받기·열기·광고는 적어 둔다. 브라우저 없이 화면의 셈을 시험한다.
import type { Feature, LifeEvent, Platform, RawError } from './types';

export interface MemoryPlatform extends Platform {
  /** 저장된 값 (시험이 들여다본다) */
  readonly data: Map<string, string>;
  /** 생명주기 사건을 일으킨다 (hide면 visible()이 false가 된다) */
  fire(ev: LifeEvent): void;
  /** 오류를 일으킨다 (listen한 곳에 간다) */
  throwRaw(e: RawError): void;
  /** 한 일의 기록: 'save:이름', 'open:주소', 'report:주소', 'ads:gameplayStart' … */
  readonly did: string[];
  /** 보낸 오류 묶음의 본문 */
  readonly reports: string[];
}

export function memoryPlatform(features: readonly Feature[] = ['files.save', 'link.external', 'errors']): MemoryPlatform {
  const data = new Map<string, string>(), did: string[] = [], reports: string[] = [];
  const subs = new Map<LifeEvent, Set<() => void>>();
  const errs: ((e: RawError) => void)[] = [];
  let visible = true;
  return {
    id: 'test', data, did, reports,
    has: (f) => features.includes(f),
    storage: {
      ready: () => Promise.resolve(),
      get: (k) => data.get(k) ?? null,
      set: (k, v) => { data.set(k, v); return true; },
      remove: (k) => { data.delete(k); },
      secret: { get: (k) => Promise.resolve(data.get('secret:' + k) ?? null), set: (k, v) => { data.set('secret:' + k, v); return Promise.resolve(true); }, remove: (k) => { data.delete('secret:' + k); return Promise.resolve(); } },
    },
    lifecycle: {
      visible: () => visible,
      on: (ev, fn) => { let s = subs.get(ev); if (!s) subs.set(ev, s = new Set()); s.add(fn); return () => s.delete(fn); },
    },
    fire: (ev) => { if (ev === 'hide' || ev === 'pause') visible = false; if (ev === 'show' || ev === 'resume') visible = true; for (const fn of subs.get(ev) ?? []) fn(); },
    throwRaw: (e) => { for (const fn of errs) fn(e); },
    audio: { onUnlock: (fn) => fn(), onInterrupt: () => {} },
    display: {
      fullscreen: { can: () => false, is: () => false, set: () => Promise.resolve(false) },
      orientation: { lock: () => Promise.resolve(false) },
      safeArea: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
      pixelRatioCap: () => 2,
      pixelRatio: () => 1,
    },
    openUrl: (url) => { did.push('open:' + url); return Promise.resolve(true); },
    share: () => Promise.resolve(false),
    copy: () => Promise.resolve(false),
    saveFile: (name) => { did.push('save:' + name); return Promise.resolve(true); },
    errors: { listen: (fn) => { errs.push(fn); }, report: (url, body) => { did.push('report:' + url); reports.push(body); } },
    offlineCache: () => Promise.resolve(false),
    auth: { providers: () => ['guest'], proof: () => Promise.resolve(null) },
    ads: {
      gameplayStart: () => { did.push('ads:gameplayStart'); }, gameplayStop: () => { did.push('ads:gameplayStop'); },
      adBreak: (w) => { did.push('ads:adBreak:' + w); return Promise.resolve(); }, rewarded: (w) => { did.push('ads:rewarded:' + w); return Promise.resolve(false); },
    },
    invite: (room) => { did.push('invite:' + room.code); },
    server: () => Promise.resolve('ws://127.0.0.1:0'),
    app: { version: () => 'test', build: () => 0, page: () => '/', requireUpdate: () => { did.push('update'); } },
  };
}
