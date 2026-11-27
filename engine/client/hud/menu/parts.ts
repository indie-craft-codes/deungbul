// 메뉴의 탭들이 함께 쓰는 것: 창의 요소, 작은 요소 만들기(줄, 단추, 고르는 상자, 글 칸), 다시 그리기.
// 탭의 파일(gear.ts, market.ts …)은 menu.ts를 읽지 않는다: 다시 그리기는 redraw로 부르고, menu.ts가 setRedraw로 renderMenu를 건다.
import type { Reward } from '../../../shared/defs';
import { $ } from '../../app';
import { L } from '../../i18n';

export const ui = { panel: $('menu'), tabs: $('menuTabs'), list: $('menuList'), gold: $('menuGold'), btn: $('menuBtn') };

let render: (soft: boolean) => void = () => {};
/** 메뉴를 다시 그린다 (menu.ts의 renderMenu) */
export const redraw = (soft = false): void => render(soft);
/** menu.ts가 부른다 */
export function setRedraw(fn: (soft: boolean) => void): void { render = fn; }

export function el(cls: string, text = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}
/**
 * 단추 하나 (보조 단추 모양: .plain = .btn-secondary). why: 흐릴 때(disabled) 그 까닭 한 줄 — 단추 아래 작은 글과 툴팁(길게 누르면 폰에서도)으로 보인다.
 * 이유가 있는 흐린 단추는 글이 읽히게 덜 흐리다 (tokens.css의 .has-why)
 */
export function button(text: string, on: () => void, disabled = false, why = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'plain'; b.textContent = text; b.disabled = disabled;
  if (disabled && why) whyOf(b, why);
  b.addEventListener('click', on);
  return b;
}
/** 흐린 단추에 까닭을 단다 (단추 안의 작은 줄 + title). 까닭이 빈 글이면 떼어 낸다 */
export function whyOf(b: HTMLButtonElement, why: string): void {
  b.querySelector(':scope > .why')?.remove();
  b.classList.toggle('has-why', !!why);
  if (!why) { b.removeAttribute('title'); return; }
  const s = document.createElement('small');
  s.className = 'why'; s.textContent = why;
  b.append(s);
  b.title = why;
}
/** 한 줄: 왼쪽에 이름과 설명, 오른쪽에 단추들. 이름과 설명은 글이거나 미리 만든 요소다 */
export function row(name: string | HTMLElement, note: string | HTMLElement, buttons: HTMLElement[] = [], cls = ''): HTMLDivElement {
  const r = el('mrow ' + cls), what = el('what');
  what.append(typeof name === 'string' ? el('iname', name) : name);
  if (note) what.append(typeof note === 'string' ? el('note', note) : note);
  const acts = el('acts');
  acts.append(...buttons);
  r.append(what, acts);
  return r;
}
export const rewardText = (r: Reward): string => L().fmt.reward(r.gold ?? 0, r.exp ?? 0, r.sparks ?? 0);

/** 장비의 이름 앞에 어느 칸의 장비인지 작은 표를 붙인다 (반지·목걸이·부적은 이름만으로 구별하기 어렵다) */
export function gearTitle(slot: string, name: string): HTMLDivElement {
  const d = el('iname'), s = document.createElement('span');
  s.className = 'mslot'; s.textContent = slot;
  d.append(s, name);
  return d;
}
/** 옵션 줄: 옵션 하나하나를 줄이 바뀌지 않는 덩어리로 넣어서 '받는 / 피해 -4%'처럼 중간에서 끊기지 않게 한다 */
export function optsEl(parts: string[]): HTMLElement | '' {
  const list = parts.filter(Boolean);
  if (!list.length) return '';
  const d = el('note');
  list.forEach((p, i) => {
    const s = document.createElement('span');
    s.className = 'opt'; s.textContent = p;
    if (i) d.append(' · ');
    d.append(s);
  });
  return d;
}
export function span(cls: string, text: string): HTMLSpanElement { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; }

/** 글을 받는 칸과 단추 한 줄 */
export function field(placeholder: string, max: number, label: string, on: (text: string) => void, value = ''): HTMLDivElement {
  const box = el('mfield'), input = document.createElement('input');
  input.type = 'text'; input.maxLength = max; input.placeholder = placeholder; input.value = value;
  input.addEventListener('keydown', (e) => e.stopPropagation()); // 글을 치는 동안 단축키가 눌리지 않게
  box.append(input, button(label, () => { if (input.value.trim()) on(input.value.trim()); }));
  return box;
}

/** 고르는 단추 한 줄 (화면, 거르는 종류). 켜진 것은 금색이다 */
export function chips(items: { text: string; on?: boolean; off?: boolean; click: () => void }[]): HTMLDivElement {
  const box = el('mchips');
  for (const x of items) { const b = button(x.text, x.click, x.off); b.classList.toggle('on', !!x.on); box.append(b); }
  return box;
}
/** 고르는 상자. 단추 일곱 개를 늘어놓으면 폰에서 줄을 다 차지해서 물건이 안 보였다 */
export function select<T extends string>(label: string, items: readonly T[], value: T, text: (v: T) => string, on: (v: T) => void): HTMLSelectElement {
  const s = document.createElement('select');
  s.setAttribute('aria-label', label);
  for (const v of items) s.add(new Option(text(v), v, false, v === value));
  s.addEventListener('change', () => { const v = s.value as T; s.blur(); on(v); });
  // 펼쳐 둔 동안에는 창을 다시 그리지 않으므로(renderMenu), 닫히면 그사이 밀린 것을 그린다
  s.addEventListener('blur', () => setTimeout(() => redraw(true), 0));
  return s;
}
/** 숫자만 받는 칸. 적은 값은 on으로 넘겨서, 화면을 다시 그려도 남게 한다 */
export function numInput(placeholder: string, value: string, max: number, on: (text: string) => void, enter: () => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = max; input.placeholder = placeholder; input.value = value;
  input.setAttribute('aria-label', placeholder);
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') enter(); }); // 글을 치는 동안 단축키가 눌리지 않게
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); on(input.value); });
  return input;
}
