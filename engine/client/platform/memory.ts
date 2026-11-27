// 시험용 플랫폼(node): 저장소는 Map, 생명주기는 손으로 일으킨다(fire), 내려받기·열기·광고는 적어 둔다. 브라우저 없이 화면의 셈을 시험한다.
import { keyNameOf } from './keyname';
import type { Feature, InputKind, LifeEvent, Platform, RawError } from './types';

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
  /** 시작할 때 받은 값 (app.param이 읽고 setParam이 쓴다) */
  readonly params: Map<string, string>;
  /** 주 입력 장치를 바꾼다 (onChange한 곳에 간다) */
  setInput(k: InputKind): void;
  /** 화면 크기 (viewport가 돌려준다) */
  size: { w: number; h: number };
  /** 기기 언어 (app.language) */
  lang: string;
}

export function memoryPlatform(features: readonly Feature[] = ['files.save', 'link.external', 'errors']): MemoryPlatform {
  const data = new Map<string, string>(), did: string[] = [], reports: string[] = [];
  const subs = new Map<LifeEvent, Set<() => void>>();
  const errs: ((e: RawError) => void)[] = [];
  const params = new Map<string, string>(), inputSubs = new Set<(k: InputKind) => void>();
  let visible = true, kind: InputKind = 'mouse';
  const me: MemoryPlatform = {
    id: 'test', data, did, reports, params, size: { w: 1280, h: 720 }, lang: '',
    setInput: (k) => { if (kind === k) return; kind = k; for (const fn of inputSubs) fn(k); },
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
      viewport: () => ({ ...me.size }),
    },
    input: { primary: () => kind, onChange: (fn) => { inputSubs.add(fn); return () => inputSubs.delete(fn); }, gamepad: () => null, keyName: keyNameOf },
    openUrl: (url) => { did.push('open:' + url); return Promise.resolve(true); },
    share: () => Promise.resolve(false),
    copy: () => Promise.resolve(false),
    saveFile: (name) => { did.push('save:' + name); return Promise.resolve(true); },
    notify: { permission: () => Promise.resolve('denied'), register: () => Promise.resolve(null), local: (_at, title) => { did.push('notify:' + title); return Promise.resolve(false); } },
    purchase: { products: () => Promise.resolve([]), buy: () => Promise.resolve({ error: 'unsupported' }), onPending: () => {} },
    achievements: { unlock: (id) => { did.push('achievement:' + id); return Promise.resolve(false); } },
    cloud: { get: () => Promise.resolve(null), set: () => Promise.resolve(false) },
    errors: { listen: (fn) => { errs.push(fn); }, report: (url, body) => { did.push('report:' + url); reports.push(body); } },
    offlineCache: () => Promise.resolve(false),
    auth: { providers: () => ['guest'], proof: () => Promise.resolve(null) },
    ads: {
      gameplayStart: () => { did.push('ads:gameplayStart'); }, gameplayStop: () => { did.push('ads:gameplayStop'); },
      adBreak: (w) => { did.push('ads:adBreak:' + w); return Promise.resolve(); }, rewarded: (w) => { did.push('ads:rewarded:' + w); return Promise.resolve(false); },
    },
    invite: (room) => { did.push('invite:' + room.code); },
    server: () => Promise.resolve('ws://127.0.0.1:0'),
    app: {
      version: () => 'test', build: () => 0, page: () => '/', requireUpdate: (store) => { did.push(store ? 'update:' + store : 'update'); },
      param: (name) => params.get(name) ?? null, setParam: (name, value) => { params.set(name, value); }, anchor: () => '', language: () => me.lang,
    },
  };
  return me;
}
