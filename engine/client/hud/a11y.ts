// 접근성의 틀 (U4: docs/ux-review.md 3.8). 창과 키보드를 한 곳에서 맡는다: 창의 코드는 그대로 두고 hidden이 바뀌는 것을 본다.
//   창(role="dialog")   틀의 큰 창(메뉴·가방·지도·직업 고르기)에 role·aria-modal·이름(창 제목)을 단다. 다른 창(확인·결과·공지 …)은 저마다 role="dialog"를 이미 단다
//   포커스              창이 열리면 창 안으로(창 자체: tabindex=-1, 폰에서 글자판이 뜨지 않게 입력칸은 고르지 않는다), 닫히면 연 단추로 돌아간다
//   Tab                 맨 위 창(또는 화면 쌓임의 맨 위 페이지) 안에서만 돈다. 창이 없을 때 Tab은 게임의 키(가장 가까운 대상)이고, 단추에 포커스가 있으면 다음 단추로
//   Esc                 화면 쌓임의 맨 위 하나를 닫는다 (폰의 뒤로 가기와 같다: hud/screens.ts의 backScreen). 확인 창·절전 화면·약관은 스스로 받는다
//   알림                가운데 알림(#banner)·흘러가는 알림(#feed)·튜토리얼 카드는 aria-live="polite" (위험 알림은 role="alert"로 이미)
// 다시 그리는 창(메뉴)은 keepFocus로 그리기 전의 포커스를 같은 단추(data-tab·data-group·차례)로 되돌린다.
import { $ } from '../app';
import { t, onLangChange, type UiKey } from '../i18n';
import { backScreen, screenStack } from './screens';

/** 키보드로 가는 것 */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const shown = (e: Element | null): e is HTMLElement => e instanceof HTMLElement && e.isConnected && !e.closest('[hidden]') && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
/** 그 안의 키보드로 갈 수 있는 것 (보이는 것만, 문서 차례) */
export const focusables = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => shown(e) && !e.closest('[inert]'));

/** 열린 창들 (연 차례). 창마다 연 때의 포커스 */
const open: { el: HTMLElement; opener: HTMLElement | null }[] = [];

/** 틀의 큰 창: 이름이 될 제목 키 */
const PANELS: readonly [string, UiKey][] = [['menu', 'menu'], ['bag', 'bag'], ['wmap', 'worldMap'], ['classPick', 'chooseClass']];

/** 창의 이름: aria-label·aria-labelledby가 없으면 창 안의 첫 제목을 이름으로 */
function nameDialog(el: HTMLElement): void {
  // .modal(약관·나이 확인·문의)은 화면을 막는 창: role이 없으면 단다
  if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog');
  if (el.classList.contains('modal') && !el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');
  if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return;
  const h = el.querySelector<HTMLElement>('.ttitle, h1, h2, h3, .hk-title, .sttitle');
  if (!h || !h.textContent?.trim()) return;
  if (!h.id) h.id = `${el.id || 'dlg'}-title`;
  el.setAttribute('aria-labelledby', h.id);
}

/** 창이 열렸다: 연 것을 기억하고 포커스를 창 안으로 */
function opened(el: HTMLElement): void {
  if (open.some((x) => x.el === el)) return;
  const a = document.activeElement;
  open.push({ el, opener: a instanceof HTMLElement && a !== document.body && !el.contains(a) ? a : null });
  nameDialog(el);
  // 글을 치는 중(대화 입력)이면 빼앗지 않는다. 창 안에 이미 포커스가 있으면 그대로
  if (a instanceof HTMLInputElement && !el.contains(a) && shown(a)) return;
  if (el.contains(a)) return;
  if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
  el.focus({ preventScroll: true });
}
/** 창이 닫혔다: 포커스가 창 안에 있었거나 사라졌으면 연 단추로 돌린다 */
function closed(el: HTMLElement): void {
  const i = open.findIndex((x) => x.el === el);
  if (i < 0) return;
  const [{ opener }] = open.splice(i, 1);
  const a = document.activeElement;
  if (a && a !== document.body && !el.contains(a) && shown(a)) return;
  if (opener && shown(opener)) opener.focus({ preventScroll: true });
  else { const top = active(); if (top) top.focus({ preventScroll: true }); }
}

const isDialog = (e: Element | null): boolean => e instanceof HTMLElement && (e.getAttribute('role') === 'dialog' || e.getAttribute('role') === 'alertdialog' || e.classList.contains('modal'));
function check(e: HTMLElement): void { if (shown(e)) opened(e); else closed(e); }

/** 키보드가 머무는 곳: 맨 위의 열린 창, 없으면 화면 쌓임의 맨 위 페이지·창 (보이는 것) */
function active(): HTMLElement | null {
  for (let i = open.length - 1; i >= 0; i--) if (shown(open[i].el)) return open[i].el;
  const ids = screenStack();
  for (let i = ids.length - 1; i >= 0; i--) { const e = ($(ids[i]) as HTMLElement | null); if (shown(e)) return e; }
  return null;
}

/** 다시 그리는 창: 그리기 전의 포커스를 그린 뒤 같은 단추(data-tab·data-group·data-id, 없으면 같은 차례)로 돌린다 */
export function keepFocus(root: HTMLElement, draw: () => void): void {
  const a = document.activeElement;
  if (!(a instanceof HTMLElement) || !root.contains(a) || a === root) { draw(); return; }
  const keyOf = (e: HTMLElement) => e.dataset.tab ? `tab:${e.dataset.tab}` : e.dataset.group ? `group:${e.dataset.group}` : e.dataset.id ? `id:${e.dataset.id}` : e.id ? `#${e.id}` : '';
  // 그리기 전의 차례는 보임을 따지지 않고 센다 (전투 중 자주 불리므로 가볍게: 다시 그리지 않으면 여기서 끝난다)
  const key = keyOf(a), at = [...root.querySelectorAll(FOCUSABLE)].indexOf(a);
  draw();
  if (a.isConnected) return;
  const now = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const hit = (key && now.find((e) => keyOf(e) === key)) || now[Math.min(Math.max(at, 0), now.length - 1)];
  (hit ?? root).focus({ preventScroll: true });
}

/** 키보드(게임패드)가 머무는 창: 맨 위의 열린 창이나 화면 쌓임의 맨 위. 없으면 null (들판) */
export const focusRoot = (): HTMLElement | null => active();

/** box 안에서 포커스를 다음(back이면 앞) 것으로 옮긴다: 창의 Tab, 게임패드의 방향 (../pad.ts. ring: 포커스 테두리를 보이게: 키보드가 아닌 입력이라 브라우저가 스스로 그리지 않는다) */
export function cycleFocus(box: HTMLElement, back: boolean, ring = false): void {
  // 튜토리얼 카드는 창 밖에 떠 있어도 함께 돈다 (건너뛰기·이름 짓기 단추)
  const tut = ($('tut') as HTMLElement | null);
  const card = tut && shown(tut) && !box.contains(tut) ? focusables(tut) : [];
  const list = [...focusables(box), ...card];
  if (!list.length) { box.focus({ preventScroll: true }); return; }
  const i = list.indexOf(document.activeElement as HTMLElement);
  // 처음 들어올 때는 튜토리얼이 가리키는 단추(.tutHi)부터, 이름 짓기 카드면 카드의 입력칸부터 (안내를 따라가는 사람이 바로 닿게)
  const lead = list.find((e) => e.closest('.tutHi')) ?? (tut?.querySelector('input') ? card[0] : undefined) ?? list[0];
  const next = back ? (i <= 0 ? list[list.length - 1] : list[i - 1]) : i < 0 ? lead : i === list.length - 1 ? list[0] : list[i + 1];
  next.focus(ring ? ({ focusVisible: true } as FocusOptions) : undefined);
}

function onKey(ev: KeyboardEvent): void {
  if (ev.key === 'Tab') {
    const box = active();
    if (box) {
      // 창 안에서만 돈다 (게임의 Tab: 대상 고르기는 부르지 않는다)
      ev.stopImmediatePropagation();
      ev.preventDefault();
      cycleFocus(box, ev.shiftKey);
      return;
    }
    // 창이 없다: 단추에 포커스가 있으면 브라우저의 Tab (다음 단추), 아니면 게임의 키
    const a = document.activeElement;
    if (a instanceof HTMLElement && a !== document.body && a.matches(FOCUSABLE)) ev.stopImmediatePropagation();
    return;
  }
  // F6: 창이 없을 때 HUD의 단추로 (들판에서 Tab은 게임의 '가장 가까운 대상'이라). 한 번 더 누르면 3D 화면으로 돌아간다
  if (ev.key === 'F6' && !active()) {
    const hud = ($('hud') as HTMLElement | null), a = document.activeElement;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (hud && a instanceof HTMLElement && hud.contains(a)) { a.blur(); return; }
    focusables(hud ?? document.body)[0]?.focus();
    return;
  }
  if (ev.key === 'Escape') {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) return; // 글자 칸: 틀의 입력이 포커스를 뺀다
    // 스스로 Esc를 받는 창: 확인 창(capture로 먼저), 절전 화면, 약관·나이·문의(.modal: 고르기 전에는 닫히지 않는다)
    const top = open.length ? open[open.length - 1].el : null;
    if (top && shown(top) && (top.classList.contains('modal') || top.id === 'psave')) return;
    // 축하 카드(레벨 업·받음·열림): 저절로 닫히지만 Esc로 먼저 넘긴다
    const cel = ($('celebrate') as HTMLElement | null);
    if (shown(cel)) { cel.click(); ev.preventDefault(); ev.stopImmediatePropagation(); return; }
    if (screenStack().length && backScreen()) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }
}

/** 틀의 큰 창과 알림에 표시를 달고, 창이 열고 닫히는 것을 본다 (startClient가 화면 쌓임 다음에 부른다) */
export function initA11y(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  const label = () => { for (const [id, key] of PANELS) { const e = ($(id) as HTMLElement | null); if (e && !e.querySelector('.ttitle, h2')) e.setAttribute('aria-label', t(key)); } };
  for (const [id] of PANELS) { const e = ($(id) as HTMLElement | null); if (!e) continue; e.setAttribute('role', 'dialog'); e.setAttribute('aria-modal', 'true'); }
  label(); onLangChange(label);
  // 알림: 말로도 읽힌다 (소리·색만으로 알리지 않는다)
  for (const [id, live, role] of [['banner', 'polite', 'status'], ['feed', 'polite', 'log'], ['tut', 'polite', '']] as const) {
    const e = ($(id) as HTMLElement | null);
    if (e) { e.setAttribute('aria-live', live); if (role) e.setAttribute('role', role); }
  }
  const log = ($('log') as HTMLElement | null);
  if (log) { log.setAttribute('role', 'log'); log.setAttribute('aria-live', 'off'); log.setAttribute('aria-label', t('chatLabel')); } // 대화는 시끄러워 저절로 읽지 않는다 (펼쳐 읽는다)
  // 창이 열리고 닫히는 것: hidden이 바뀌거나 body에 창이 붙고 떨어질 때
  new MutationObserver((recs) => {
    for (const r of recs) {
      const e = r.target; if (!(e instanceof HTMLElement)) continue;
      if ((r.oldValue !== null) === e.hidden) continue; // 같은 값을 다시 적은 것 (프레임마다 hidden을 적는 요소가 있다)
      if (isDialog(e)) check(e); else for (const d of e.querySelectorAll<HTMLElement>('[role="dialog"], .modal')) check(d);
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden'] });
  // 창은 대개 body에 바로 붙는다 (확인·결과·뽑기 연출·단계 창): body의 자식만 본다 (이름표·대화 줄처럼 자주 바뀌는 곳은 보지 않는다)
  new MutationObserver((recs) => {
    for (const r of recs) {
      for (const n of r.addedNodes) if (n instanceof HTMLElement && isDialog(n)) check(n);
      for (const n of r.removedNodes) if (n instanceof HTMLElement && open.some((x) => x.el === n)) closed(n);
    }
  }).observe(document.body, { childList: true });
  for (const d of document.querySelectorAll<HTMLElement>('[role="dialog"], .modal')) if (shown(d)) opened(d);
  window.addEventListener('keydown', onKey, { capture: true });
}
