// 다국어. 언어를 더하려면 ko.ts와 같은 모양의 파일을 만들고 아래 LOCALES에 한 줄 추가한다.
// 화면에 보이는 문장은 코드에 직접 쓰지 않고 언제나 여기를 거친다.
import { handOf, type ItemId } from '../../../shared/defs';
import { NAME_MAX } from '../../../shared/world';
import { en } from './en';
import { itemInfo as itemInfoOf, ko, type Locale, type UiKey } from './ko';

export const LOCALES: readonly Locale[] = [ko, en];
let current: Locale = ko;
const listeners: (() => void)[] = [];

function detect(): Locale {
  const pick = (code: string | null | undefined) => LOCALES.find((l) => code?.toLowerCase().startsWith(l.code));
  let saved: string | null = null;
  try { saved = localStorage.getItem('lang'); } catch { /* 저장소를 못 쓰는 환경 */ }
  // 주소의 ?lang= 이 가장 먼저, 그다음 저장된 선택, 그다음 브라우저 언어
  return pick(new URLSearchParams(location.search).get('lang')) ?? pick(saved) ?? pick(navigator.language) ?? ko;
}

/** 현재 언어의 문장 묶음 */
export const L = (): Locale => current;
/** 아이템 이름. 무기는 직업에 따라 이름이 다르다 (검 / 활 / 지팡이) */
export function itemName(id: ItemId, cls: string): string {
  const it = current.items[id];
  const hand = handOf(cls);
  return (hand !== 'sword' && it[hand]) || it.name;
}
/** 터치 화면인가. 키보드가 없으니 단축키 안내를 빼고 보여 준다 */
/** 아이템의 한 줄 설명: 수치로 된 효과는 아이템 정의에서 읽어 만든다 (ko.ts의 itemInfo) */
export const itemInfo = (id: ItemId): string => itemInfoOf(current, id);

export const isTouch = (): boolean => matchMedia('(pointer: coarse)').matches;
/**
 * 문장 안의 [[PC용|터치용]] 표시를 지금 입력 장치에 맞게 고른다. 터치용을 비우면([[ (F)|]]) 그 부분이 빠진다.
 * 언어 파일의 문장은 이것을 거쳐야 하므로, 고정 문구는 t()로, 서버 안내문은 notifySys로 읽는다.
 */
export function forInput(text: string): string {
  if (!text.includes('[[')) return text;
  const touch = isTouch();
  return text.replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g,(_, pc: string, tap: string) => (touch ? tap : pc));
}
/** 고정 문구 */
export const t = (key: UiKey): string => forInput(current.ui[key]);

/** HTML에 적어 둔 표시(data-i18n 등)를 현재 언어로 채운다. */
export function applyDom(): void {
  document.documentElement.lang = current.code;
  document.title = current.ui.title;
  const each = (attr: string, set: (el: HTMLElement, text: string) => void) => {
    for (const el of document.querySelectorAll<HTMLElement>(`[${attr}]`)) {
      const key = el.getAttribute(attr) as UiKey;
      if (key in current.ui) set(el, forInput(current.ui[key]));
    }
  };
  each('data-i18n', (el, s) => { el.textContent = s; });
  each('data-i18n-title', (el, s) => { el.title = s; });
  each('data-i18n-placeholder', (el, s) => { (el as HTMLInputElement).placeholder = s; });
  each('data-i18n-aria', (el, s) => { el.setAttribute('aria-label', s); });
}

export function setLang(code: string): void {
  const next = LOCALES.find((l) => l.code === code);
  if (!next || next === current) return;
  current = next;
  try { localStorage.setItem('lang', code); } catch { /* 무시 */ }
  applyDom();
  for (const fn of listeners) fn();
}

/** 언어가 바뀔 때 다시 그려야 하는 것을 등록한다. */
export function onLangChange(fn: () => void): void { listeners.push(fn); }

/** 처음 접속할 때 쓸 무작위 이름. 현재 언어의 낱말로 만든다. */
export function randomName(): string {
  const pick = (a: readonly string[]) => a[Math.floor(Math.random() * a.length)];
  return (pick(current.nameA) + pick(current.nameB) + (10 + Math.floor(Math.random() * 90))).slice(0, NAME_MAX);
}

/**
 * 그 이름이 무작위로 붙은 이름이면 어느 언어의 낱말로 지어졌는지(언어 코드)를, 아니면 null을 돌려준다.
 * randomName이 만드는 모양(낱말 둘 + 숫자 둘, 길면 잘림)과 정확히 맞을 때만 그렇게 본다.
 */
export function autoNameLocale(name: string): string | null {
  for (const l of LOCALES) {
    for (const a of l.nameA) {
      if (!name.startsWith(a.slice(0, NAME_MAX))) continue;
      for (const b of l.nameB) {
        // 낱말 둘 뒤에 숫자가 (잘리고 남은 만큼, 많아야 둘) 붙은 모양인가
        const word = (a + b).slice(0, NAME_MAX), rest = name.slice(word.length);
        if (name.startsWith(word) && rest.length === Math.min(2, NAME_MAX - word.length) && /^\d*$/.test(rest)) return l.code;
      }
    }
  }
  return null;
}

/** 초를 m:ss로 */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

current = detect();
