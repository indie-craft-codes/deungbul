// 등급 색 표 하나 (U1 디자인 체계): 카드 테두리·뽑기 연출·이름표·장비 줄·3D 발밑 고리가 함께 쓴다.
// 표는 css의 토큰 --rar-<등급 이름> (engine/client/tokens.css: common uncommon rare epic legend myth). 영웅의 등급(HeroRarityDef.id)이 그 이름이면 그 색,
// 표에 없는 이름이면 내용의 color. 게임은 자기 css에서 --rar-<이름>을 덮어써 색을 바꾼다 (화면과 3D가 함께 바뀐다).
import { rarityDef } from '../../shared/defs';
import { teamCss } from '../../shared/defs/teams';

/** 그 등급의 css 색 (var(--rar-이름, 내용의 색)) */
export const rarityCss = (r: number): string => { const d = rarityDef(r); return `var(--rar-${d.id}, ${teamCss(d.color)})`; };
/** 요소에 등급 색(--rc)과 등급 이름(data-rar)을 단다 (테두리·이름 색은 css가 --rc로) */
export function tintRarity<T extends HTMLElement>(e: T, r: number): T { e.style.setProperty('--rc', rarityCss(r)); e.dataset.rar = rarityDef(r).id; return e; }
const hexCache = new Map<number, number>();
/** 그 등급의 색 0xRRGGBB (3D 재질): 토큰이 있으면 토큰, 없으면 내용의 색 */
export function rarityHex(r: number): number {
  const hit = hexCache.get(r);
  if (hit !== undefined) return hit;
  const d = rarityDef(r);
  let out = d.color;
  if (typeof document !== 'undefined') {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--rar-${d.id}`).trim();
    const m = /^#([0-9a-f]{6})$/i.exec(v) ?? /^#([0-9a-f]{3})$/i.exec(v);
    if (m) out = parseInt(m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1], 16);
  }
  hexCache.set(r, out);
  return out;
}
