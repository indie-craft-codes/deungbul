// 그림 입히기 (art2): 등록된 그림(engine/client/art.ts)을 화면 요소에 입힌다. 그림이 없으면 아무것도 바꾸지 않는다 (지금의 css·SVG·글자 그대로).
//   setScene(el, 장면)  큰 화면·창의 배경 'bg:<장면>' (세로·가로 따로 있으면 그것). 글이 읽히게 어둡게 덮는다(--art-dim-a/-b). 그림이 바뀌거나 화면 방향이 바뀌면 다시 입힌다
//   artPic(열쇠)         그림 하나(<img class="artPic">). 없으면 null: 부르는 쪽은 지금처럼 그린다
//   frameArt(el, 등급)   등급 테두리 'frame:<등급 id>'를 칸 위에 얹는다 (없으면 css의 등급 색 테두리 그대로)
//   initArtDom()         접속 화면의 제목 'logo'·배경 'splash', 직업 고르기의 배경 'bg:classes' (startClient가 한 번)
import { artPick, artUrl, hasArt, onArt, splashArt } from '../art';
import { rarityDef } from '../../shared/defs';

const landscape = (): boolean => typeof matchMedia !== 'undefined' && matchMedia('(orientation: landscape)').matches;
const orient = (): 'portrait' | 'landscape' => (landscape() ? 'landscape' : 'portrait');
let watching = false;

/** 요소 하나에 배경을 입히거나 걷는다 (data-art-scene의 장면, 접속 화면은 splash) */
function paint(el: HTMLElement): void {
  const scene = el.dataset.artScene ?? '';
  const url = !scene ? undefined : scene === '@splash' ? splashArt(orient()) : artPick('bg', scene, orient());
  if (url) {
    el.style.backgroundImage = `linear-gradient(var(--art-dim-a), var(--art-dim-b)), url("${url}")`;
    el.classList.add('artBg');
    el.dataset.artOn = '1';
  } else if (el.dataset.artOn) {
    el.style.backgroundImage = '';
    el.classList.remove('artBg');
    delete el.dataset.artOn;
  }
}
function repaint(): void {
  if (typeof document === 'undefined') return;
  for (const el of document.querySelectorAll<HTMLElement>('[data-art-scene]')) paint(el);
}
function watch(): void {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  onArt(repaint);
  matchMedia?.('(orientation: landscape)').addEventListener?.('change', repaint);
}

/** 요소의 배경 장면을 정한다 (같은 장면이면 다시 칠하지 않는다). 장면이 비면 걷는다 */
export function setScene(el: HTMLElement | null | undefined, scene: string | undefined): void {
  if (!el) return;
  const s = scene ?? '';
  if ((el.dataset.artScene ?? '') === s) return;
  if (s) el.dataset.artScene = s; else delete el.dataset.artScene;
  watch();
  if (hasArt() || el.dataset.artOn) paint(el);
}

/** 그 열쇠의 그림 요소 (<img class="artPic">). 없으면 null */
export function artPic(key: string, cls = ''): HTMLImageElement | null {
  const url = artUrl(key);
  if (!url) return null;
  const img = document.createElement('img');
  img.src = url; img.alt = ''; img.className = cls ? `artPic ${cls}` : 'artPic';
  img.setAttribute('aria-hidden', 'true');
  return img;
}

/**
 * 메뉴 줄(menu/parts의 row)의 이름 앞에 그림을 붙인다: 열쇠를 차례로 보고 처음 있는 것 하나 (상품 'icon:goods-<id>', 업적 'icon:ach-<id>',
 * 임무 'icon:daily-<id>'·'icon:mission-<종류>', 우편 'icon:mail-<종류>' …). 하나도 없으면 아무것도 하지 않는다 (지금 그대로)
 */
export function rowArt<T extends HTMLElement>(r: T, ...keys: string[]): T {
  if (!hasArt()) return r;
  for (const k of keys) { const p = artPic(k, 'rowPic'); if (p) { (r.querySelector('.iname') ?? r).prepend(p); break; } }
  return r;
}

/** 등급 테두리 그림을 칸 위에 얹는다 ('frame:<등급 id>'). 없으면 아무것도 하지 않는다 */
export function frameArt<T extends HTMLElement>(el: T, rarity: number): T {
  const url = artUrl(`frame:${rarityDef(rarity).id}`);
  if (!url) return el;
  const f = document.createElement('i');
  f.className = 'rframe'; f.setAttribute('aria-hidden', 'true');
  f.style.backgroundImage = `url("${url}")`;
  el.classList.add('hasRframe');
  el.prepend(f); // 맨 앞에: 얼굴 그림 위, 뒤에 오는 표시(NEW·등급 글자)의 아래

  return el;
}

/** 접속 화면의 제목 그림 (logo): 글자는 낭독기에 남긴다 */
function logo(): void {
  const h = document.querySelector<HTMLElement>('#gate h1');
  if (!h) return;
  const url = artUrl('logo');
  let img = h.querySelector<HTMLImageElement>('img.artLogo');
  h.classList.toggle('hasLogo', !!url);
  if (!url) { img?.remove(); return; }
  if (!img) { img = document.createElement('img'); img.className = 'artLogo'; img.alt = ''; img.setAttribute('aria-hidden', 'true'); h.prepend(img); }
  img.src = url;
}

/** 접속 화면·직업 고르기의 그림 (startClient가 한 번, 그림이 바뀌면 다시) */
export function initArtDom(): void {
  if (typeof document === 'undefined') return;
  const gate = document.querySelector<HTMLElement>('#gate');
  if (gate) setScene(gate, '@splash');
  setScene(document.querySelector<HTMLElement>('#classPick'), 'classes');
  logo();
  onArt(logo);
}
