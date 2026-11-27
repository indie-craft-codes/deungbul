// 뽑기 연출 (묶음 C의 10: docs/screens.md 2.7·9.2의 10·9.5의 (사)): 뽑기 결과를 단계로 보인다.
//   1 예고: 가장 높은 등급의 색이 먼저 비친다 (빛 덩이·'눌러서 열기')
//   2 한 장씩 공개: 낮은 등급은 저절로 빠르게, 새 카드(NEW)·가장 높은 등급은 멈춰 서서 크게 (누르면 다음)
//   3 요약: 열 칸 격자(등급 테두리·NEW·중복은 '조각 +n'), 천장까지, 남은 재화, [확인] [한 번 더 n번]
//   오른쪽 위 '건너뛰기': 남은 공개를 건너 요약으로 — 아직 보이지 않은 새 카드·가장 높은 등급에서는 한 번 멈춘다. 저절로 닫지 않는다.
// 그림은 영웅의 초상 칸(collect.ts의 setHeroPic: 메아리 계약은 charPortrait). 등급 색은 등급 색 표 하나(hud/rarity.ts).
// 창은 화면 쌓기의 sheet('gachaPop'): 뒤로 가기가 닫는다. 게임이 더 할 수 있는 것: onGachaResult(소리·덤 연출).
import { BANNER_TABLE, HERO_RARITIES, rarityDef, type PullGot } from '../../shared/defs';
import { stillMotion } from '../motion';
import { gachaSound } from '../sound';
import { L, t } from '../i18n';
import { bannerName, heroName, rarityName } from '../i18n/ko';
import { send } from '../net';
import { S } from '../state';
import { confirmSpend } from './confirm';
import { rarityCss, tintRarity } from './rarity';
import { dropScreen, openScreen } from './screens';
import { whyOf } from './menu/parts';
import { overflowText } from './cardgrow';

type Stage = 'tease' | 'reveal' | 'summary';
interface Show { banner: string; got: readonly PullGot[]; at: number; stage: Stage; top: number; seen: Set<number> }
let show: Show | null = null;
let box: HTMLElement | null = null;
let timer = 0;
let pic: (id: string) => string | undefined = () => undefined;
/** 초상 그림을 정한다 (collect.ts의 setHeroPic이 부른다) */
export function setShowPic(fn: (id: string) => string | undefined): void { pic = fn; }

const mk = (tag: string, cls: string, text?: string): HTMLElement => { const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const money = (cur: string): number => (S.me ? (cur === 'gold' ? S.me.gold : S.me.sparks) : 0);
const reduced = stillMotion;
/** 공개의 소리 (U2): 그 칸의 등급 높이 (가장 높은 등급 = ui.gacha3) */
const ding = (r: number): void => gachaSound(r, Math.max(1, HERO_RARITIES.length - 1));
/** 그 칸에서 멈출까: 새 카드이거나 이번 결과의 가장 높은 등급(가장 흔한 등급이 아니면) */
const special = (s: Show, g: PullGot): boolean => !g.dup || (g.r === s.top && s.top > 0);

function root(): HTMLElement {
  if (box) return box;
  const el = box = mk('div', 'gshow'); el.id = 'gachaPop'; el.hidden = true;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-live', 'polite');
  document.body.append(el);
  el.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('button')) step(); });
  return el;
}

/** 한 장의 카드 (크게: 공개, 작게: 요약) */
function card(g: PullGot, big: boolean): HTMLElement {
  const c = tintRarity(mk('div', big ? 'gsCard big' : 'gsCard'), g.r);
  const face = mk('div', 'gsFace'), img = pic(g.h);
  if (img) { const i = document.createElement('img'); i.src = img; i.alt = ''; face.append(i); } else face.textContent = [...heroName(g.h)][0] ?? '?';
  c.append(face, mk('b', 'gsName', heroName(g.h)), mk('small', 'gsRar', rarityName(g.r)));
  if (!g.dup) c.append(mk('span', 'gsNew', t('gsNew')));
  else c.append(mk('span', 'gsDup', overflowText(g) || L().fmt.gachaDup(g.n))); // 다 키운 카드는 '조각 n → 결정 m' (hud/cardgrow.ts)
  if (g.pity) c.append(mk('span', 'gsPity', t('gachaPityMark')));
  return c;
}

function draw(): void {
  const el = root(), s = show;
  if (!s) return;
  el.textContent = '';
  el.style.setProperty('--rc', rarityCss(s.top));
  el.dataset.stage = s.stage;
  const head = mk('div', 'gsHead');
  head.append(mk('b', '', L().fmt.gsHead(bannerName(s.banner), s.got.length)));
  if (s.stage !== 'summary') {
    const skip = mk('button', 'btn-ghost gsSkip', t('gsSkip')) as HTMLButtonElement;
    skip.type = 'button'; skip.id = 'gsSkip';
    skip.addEventListener('click', () => skipAll());
    head.append(skip);
  }
  el.append(head);
  if (s.stage === 'tease') {
    const orb = mk('div', 'gsOrb'); orb.dataset.rar = rarityDef(s.top).id;
    el.append(orb, mk('p', 'gsHint', t('gsTap')));
  } else if (s.stage === 'reveal') {
    const g = s.got[s.at];
    el.append(mk('div', 'gsCount', `${s.at + 1} / ${s.got.length}`), card(g, true), mk('p', 'gsHint', s.at + 1 < s.got.length ? t('gsNext') : t('gsTap')));
  } else {
    const grid = mk('div', 'gsGrid');
    for (const g of s.got) grid.append(card(g, false));
    el.append(grid);
    const b = BANNER_TABLE[s.banner];
    const loc = L(), have = b ? money(b.cur) : 0;
    if (b) el.append(mk('p', 'gsHave', loc.fmt.gachaHave(have, b.cur)));
    const btns = mk('div', 'stbtns gsBtns');
    const ok = mk('button', 'btn-secondary', t('gsOk')) as HTMLButtonElement; ok.type = 'button'; ok.id = 'gsOk';
    ok.addEventListener('click', close);
    btns.append(ok);
    if (b) {
      const n = s.got.length >= 10 ? 10 : 1, cost = n === 10 ? b.ten : b.one;
      const again = mk('button', 'stgo btn-primary', loc.fmt.gsAgain(n)) as HTMLButtonElement; again.type = 'button'; again.id = 'gsAgain';
      again.append(mk('small', 'gsCost', loc.fmt.gachaCost(cost, b.cur)));
      again.disabled = have < cost;
      if (again.disabled) whyOf(again, loc.fmt.gachaShort(have, cost, b.cur));
      again.addEventListener('click', () => confirmSpend(b.cur, cost, () => send({ t: 'gacha', id: s.banner, n })));
      btns.append(again);
    }
    el.append(btns);
  }
}

/** 한 단계 앞으로 (누름·저절로) */
function step(): void {
  const s = show;
  if (!s) return;
  clearTimeout(timer);
  if (s.stage === 'tease') { s.stage = 'reveal'; s.at = 0; }
  else if (s.stage === 'reveal') { s.seen.add(s.at); if (s.at + 1 < s.got.length) s.at++; else s.stage = 'summary'; }
  else return;
  draw();
  if (s.stage === 'reveal') ding(s.got[s.at].r);
  auto();
}
/** 낮은 등급의 공개는 저절로 넘긴다 (새 카드·가장 높은 등급은 누를 때까지 멈춘다) */
function auto(): void {
  const s = show;
  if (!s || s.stage !== 'reveal') return;
  const g = s.got[s.at];
  if (special(s, g)) return;
  timer = window.setTimeout(step, reduced() ? 250 : 550);
}
/** 건너뛰기: 아직 보이지 않은 새 카드·가장 높은 등급이 남았으면 그 칸에서 한 번 멈추고, 없으면 요약으로 */
function skipAll(): void {
  const s = show;
  if (!s) return;
  clearTimeout(timer);
  const from = s.stage === 'tease' ? 0 : s.at + 1;
  for (let i = from; i < s.got.length; i++) {
    if (special(s, s.got[i]) && !s.seen.has(i)) { s.stage = 'reveal'; s.at = i; s.seen.add(i); draw(); ding(s.got[i].r); return; }
    s.seen.add(i);
  }
  s.stage = 'summary';
  draw();
}
function close(): void {
  clearTimeout(timer);
  show = null;
  const el = root();
  el.hidden = true;
  dropScreen('gachaPop');
}

/** 뽑기 결과를 받았다: 연출을 처음부터 (이미 떠 있으면 새 결과로 바꾼다) */
export function startGachaShow(banner: string, got: readonly PullGot[]): void {
  if (!got.length) return;
  clearTimeout(timer);
  show = { banner, got, at: 0, stage: 'tease', top: Math.max(...got.map((g) => g.r)), seen: new Set() };
  const el = root();
  el.hidden = false;
  openScreen('gachaPop', { kind: 'sheet', el, close: () => { clearTimeout(timer); show = null; el.hidden = true; } });
  draw();
  ding(show.top); // 예고: 가장 높은 등급의 소리가 먼저
  // 예고는 잠깐 비추고 저절로 공개로 (누르면 바로)
  timer = window.setTimeout(step, reduced() ? 300 : 1300);
}
/** 언어가 바뀌면 다시 그린다 */
export function redrawGachaShow(): void { if (show) draw(); }
/** 재화가 바뀌면 요약의 '한 번 더'를 다시 그린다 */
export function gachaShowMoney(): void { if (show?.stage === 'summary') draw(); }
