// 화면 쌓기 (묶음 A의 1: docs/screens.md 9.2의 1): 전체 화면 페이지(page)와 큰 창(sheet)과 장면 보기(view)를 차례로 쌓고,
// 뒤로 가기는 맨 위 하나를, 홈은 바탕(root) 위의 모두를 닫는다. 폰 브라우저의 뒤로 가기(안드로이드 뒤로 몸짓)는 플랫폼 접점(platform().nav)으로 받아 '한 칸 뒤로'가 된다:
// 닫을 것이 있는 동안만 뒤로 가기의 자리를 잡아 두므로, 닫을 것이 없을 때의 뒤로 가기는 예전처럼 페이지를 떠난다.
//   page  화면 전체를 덮는 페이지 (수집형의 홈·모험·편성 확인): 열려 있는 동안 들판 HUD(조이스틱·기술·대화·내 정보·오른쪽 창)를 감춘다 (body.pageOn, body[data-page])
//   sheet 큰 창이나 떠 있는 창 (메뉴·가방·지도·뽑기 결과·단계 정보 창·결과 창): 들판 HUD는 그대로 두되 폰에서는 창이 HUD 구역 위에 그려진다 (body.sheetOn)
//   view  장면을 보는 단계 (탑의 전투): HUD를 감추지 않고 쌓임에만 든다 (뒤로 가기가 홈으로 데려가게)
// root: 그 모드의 바탕 페이지 (탑의 홈). 뒤로 가기로 닫히지 않고(그 위의 것만 닫는다), 홈(homeScreen)이 돌아오는 곳이다.
// 틀의 창(메뉴·가방·지도·뽑기 결과·소탕 결과)은 trackPanel로 쌓임에 든다: 창의 hidden이 바뀌는 것을 보고 저절로 넣고 뺀다 (창의 코드는 그대로).
// 게임의 화면도 같다: openScreen(id, { kind, close })으로 넣고, 스스로 닫았으면 dropScreen(id).
import { $ } from '../app';
import { platform } from '../platform';

export type ScreenKind = 'page' | 'sheet' | 'view';
export interface ScreenOpts {
  /** 종류 (기본 sheet) */
  kind?: ScreenKind;
  /** 뒤로 가기·홈이 이 화면을 닫을 때 부른다 (화면을 감추는 일). 주지 않으면 쌓임에서만 뺀다 */
  close?: () => void;
  /** 그 모드의 바탕 페이지: 뒤로 가기로 닫히지 않는다 */
  root?: boolean;
  /** 화면의 요소: 주면 쌓인 차례대로 겹친다(z-index 50부터, 바탕 페이지는 그대로). 페이지는 그 위에 다른 페이지·보기가 있으면 감춘다(class scrUnder) */
  el?: HTMLElement;
}
interface Entry { id: string; kind: ScreenKind; close?: () => void; root: boolean; el?: HTMLElement }

const stack: Entry[] = [];
const fns: ((ids: readonly string[]) => void)[] = [];
let armedBack = false;
let started = false;

/** 쌓임이 바뀔 때 body의 표시·뒤로 가기의 자리·듣는 곳을 맞춘다 */
function sync(): void {
  if (typeof document !== 'undefined') {
    const b = document.body;
    // 맨 위의 장면(페이지나 보기): 페이지면 들판 HUD를 감추고, 보기(전투)면 그 아래의 페이지(홈)를 감춘다
    const scene = [...stack].reverse().find((e) => e.kind !== 'sheet');
    const page = scene?.kind === 'page' ? scene : undefined;
    if (page) b.dataset.page = page.id; else delete b.dataset.page;
    stack.forEach((e, i) => {
      if (!e.el) return;
      if (!e.root) e.el.style.zIndex = String(50 + i);
      e.el.classList.toggle('scrUnder', e.kind !== 'sheet' && e !== scene);
    });
    const top = stack[stack.length - 1];
    if (top) b.dataset.screen = top.id; else delete b.dataset.screen;
    b.classList.toggle('pageOn', !!page);
    // 바탕 페이지 위의 창만 센다 (페이지가 맨 위면 sheetOn이 아니다)
    b.classList.toggle('sheetOn', !!top && top.kind === 'sheet');
  }
  const want = stack.some((e) => !e.root);
  if (want !== armedBack) { armedBack = want; if (want) platform().nav.arm(); else platform().nav.disarm(); }
  const ids = stack.map((e) => e.id);
  for (const fn of fns) fn(ids);
}

function start(): void {
  if (started) return;
  started = true;
  // 사람이 뒤로 갔다: 자리는 없어졌다 (닫을 것이 남으면 sync가 다시 잡는다)
  platform().nav.onBack(() => { armedBack = false; backScreen(); sync(); });
}

/** 화면을 쌓임에 넣는다 (이미 있으면 맨 위로 올린다). 화면을 보이는 일은 부른 쪽이 한다 */
export function openScreen(id: string, opts: ScreenOpts = {}): void {
  start();
  const at = stack.findIndex((e) => e.id === id);
  const old = at >= 0 ? stack.splice(at, 1)[0] : undefined;
  const e: Entry = { id, kind: opts.kind ?? old?.kind ?? 'sheet', close: opts.close ?? old?.close, root: opts.root ?? old?.root ?? false, el: opts.el ?? old?.el };
  // 바탕 페이지는 언제나 맨 아래에
  if (e.root) stack.unshift(e); else stack.push(e);
  sync();
}
/** 쌓임에서 뺀다 (화면이 스스로 닫혔을 때: close는 부르지 않는다) */
export function dropScreen(id: string): void {
  const at = stack.findIndex((e) => e.id === id);
  if (at < 0) return;
  const [e] = stack.splice(at, 1);
  if (e.el) { e.el.classList.remove('scrUnder'); if (!e.root) e.el.style.zIndex = ''; }
  sync();
}
/** 그 화면을 닫는다 (close를 부르고 쌓임에서 뺀다) */
export function closeScreen(id: string): void {
  const e = stack.find((x) => x.id === id);
  if (!e) return;
  dropScreen(id);
  e.close?.();
}
/** 뒤로: 바탕이 아닌 맨 위 하나를 닫는다. 닫은 것이 있으면 true */
export function backScreen(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    const e = stack[i];
    if (e.root) continue;
    closeScreen(e.id);
    return true;
  }
  return false;
}
/** 홈: 바탕 페이지 위의 모두를 닫는다 (위에서부터) */
export function homeScreen(): void {
  for (let i = stack.length - 1; i >= 0; i--) if (!stack[i].root) closeScreen(stack[i].id);
}
/** 바탕 페이지까지 모두 닫는다 (모드를 떠날 때) */
export function clearScreens(): void {
  for (let i = stack.length - 1; i >= 0; i--) closeScreen(stack[i].id);
}
/** 지금 쌓임 (아래 → 위의 id) */
export const screenStack = (): readonly string[] => stack.map((e) => e.id);
/** 그 화면이 쌓임에 있는가 */
export const screenOpen = (id: string): boolean => stack.some((e) => e.id === id);
/** 맨 위 화면의 id ('' 없음) */
export const topScreen = (): string => stack[stack.length - 1]?.id ?? '';
/** 쌓임이 바뀔 때 */
export function onScreens(fn: (ids: readonly string[]) => void): void { fns.push(fn); }

/**
 * 틀이나 게임의 창(요소)을 쌓임에 잇는다: 요소의 hidden이 풀리면 넣고, 걸리면 뺀다. 뒤로 가기는 close(기본: hidden을 건다)를 부른다.
 * 창의 코드는 그대로 둔다 (열고 닫는 길이 여럿인 창: 단추, 단축키, 다른 창의 바로 가기)
 */
export function trackPanel(el: HTMLElement | null | undefined, opts: ScreenOpts & { id?: string } = {}): void {
  if (!el || typeof MutationObserver === 'undefined') return;
  const id = opts.id ?? el.id;
  const close = opts.close ?? (() => { el.hidden = true; });
  const apply = () => { if (el.hidden) dropScreen(id); else if (!screenOpen(id)) openScreen(id, { kind: opts.kind ?? 'sheet', close, root: opts.root, el }); };
  new MutationObserver(apply).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  apply();
}

/** 틀의 창을 쌓임에 잇는다 (startClient가 모듈을 모두 엮은 뒤에 부른다): 메뉴·가방·지도·뽑기 결과·소탕 결과 */
export function initScreens(closeMap?: () => void): void {
  start();
  const byId = (id: string) => $(id);
  trackPanel(byId('menu'));
  trackPanel(byId('bag'));
  trackPanel(byId('wmap'), { close: closeMap });
  trackPanel(byId('gachaPop'));
  trackPanel(byId('sweepPop'));
}
