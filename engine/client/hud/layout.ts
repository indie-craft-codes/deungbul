// 폰 HUD의 구역 배치 (묶음 A의 2: docs/screens.md 9.2의 2). 요소마다의 절대 좌표 대신, 폰에서는 화면을 구역으로 나누고 틀과 게임의 요소가 구역에 '등록'한다.
// 구역이 쌓기(flex)·넘침(최대 높이, 스크롤)·안전 영역(노치·홈 막대: env(safe-area-inset-*))·화면 높이(--app-h)를 맡는다 (style.css의 '구역 배치').
//   tl 위 왼쪽: 상태(내 정보, 대상·단계 막대, 게임의 상태 줄)     tr 위 오른쪽: 메뉴·가방 단추, 전환 단추, 대화(접힘), 오른쪽 창(상점·퀘스트)
//   tc 가운데 위: 알림 띠(게임의 위험 알림)                        bc 아래 가운데: 안내 글(흘러가는 알림, 튜토리얼 카드). 아래 구역 위에 놓여 단추와 겹치지 않는다
//   bl 아래 왼쪽: 이동(조이스틱)                                   br 아래 오른쪽: 행동(자동 사냥·기술 단추). 엄지 자리
// 배치는 화면의 모양마다: body[data-lay]가 'portrait'(폰 세로: 너비 720 이하이고 세로가 길다), 'landscape'(폰 가로: 높이 480 이하), 'pc'(그 밖).
// PC('pc')에서는 구역을 쓰지 않는다: 요소는 뼈대의 제자리에 있고 예전 스타일 그대로다 (등불지기·예제의 PC 화면이 바뀌지 않는다).
// 폰에서는 등록한 요소를 구역으로 옮기고(제자리에 표시를 남긴다), PC 모양으로 돌아가면 제자리로 되돌린다.
// 게임은 placeIn(구역, 요소, 차례)으로 자기 요소를 등록한다 (차례가 작을수록 위·앞). 구역이 아니라 다른 요소 안으로도 옮길 수 있다 (언어 선택을 메뉴 창의 머리로).
import { $ } from '../app';
import { onLangChange, t } from '../i18n';
import { platform } from '../platform';

export type Zone = 'tl' | 'tr' | 'tc' | 'bl' | 'br' | 'bc';
export type Lay = 'pc' | 'portrait' | 'landscape';
interface Reg { el: HTMLElement; to: Zone | HTMLElement; order: number; only?: readonly Lay[]; before?: HTMLElement | null; mark?: Comment }

const regs: Reg[] = [];
const zones = new Map<Zone, HTMLElement>();
let lay: Lay = 'pc';
const fns: ((l: Lay) => void)[] = [];

/** 지금 화면의 모양 */
export const myLay = (): Lay => lay;
/** 화면의 모양이 바뀔 때 (처음 한 번도) */
export function onLay(fn: (l: Lay) => void): void { fns.push(fn); }

/** 화면 크기로 모양을 가른다 (시험이 node에서 부른다) */
export function layOf(w: number, h: number): Lay {
  if (h <= 480 && w > h) return 'landscape';
  if (w <= 720 && h >= w) return 'portrait';
  return 'pc';
}

/**
 * 요소를 구역에 등록한다: 폰 모양(portrait·landscape)에서 그 구역으로 옮긴다. order가 작을수록 앞(위).
 * to에 요소를 주면 그 요소 안으로 옮긴다 (before를 주면 그 앞에). only를 주면 그 모양에서만 옮긴다
 */
export function placeIn(to: Zone | HTMLElement, el: HTMLElement | string | null | undefined, order = 50, opts: { only?: readonly Lay[]; before?: HTMLElement | null } = {}): void {
  const node = typeof el === 'string' ? $(el) : el;
  if (!node) return; // 고르지 않은 모듈의 요소
  const old = regs.findIndex((r) => r.el === node);
  if (old >= 0) { restore(regs[old]); regs.splice(old, 1); }
  const r: Reg = { el: node, to, order, only: opts.only, before: opts.before };
  regs.push(r);
  if (zones.size) arrange();
}

function restore(r: Reg): void {
  if (!r.mark) return;
  r.mark.replaceWith(r.el);
  r.mark = undefined;
}

/** 모양에 맞게 요소를 옮기거나 되돌린다 */
function arrange(): void {
  const phone = lay !== 'pc';
  // 구역마다 차례대로 (같은 차례는 등록한 차례)
  const sorted = [...regs].sort((a, b) => a.order - b.order);
  for (const r of sorted) {
    const want = phone && (!r.only || r.only.includes(lay));
    if (!want) { restore(r); continue; }
    if (!r.mark) { r.mark = document.createComment('zone'); r.el.before(r.mark); }
    const box = typeof r.to === 'string' ? zones.get(r.to) : r.to;
    if (!box) continue;
    if (r.before && r.before.parentElement === box) r.before.before(r.el); else box.append(r.el);
  }
}

function measure(): void {
  const set = (k: string, v: number) => document.documentElement.style.setProperty(k, `${Math.round(v)}px`);
  const bl = zones.get('bl'), br = zones.get('br'), tl = zones.get('tl'), tr = zones.get('tr');
  if (!bl || !br || !tl || !tr) return;
  set('--zbl-w', bl.offsetWidth); set('--zbr-w', br.offsetWidth);
  set('--zb-h', Math.max(bl.offsetHeight, br.offsetHeight)); set('--ztl-h', tl.offsetHeight); set('--ztr-h', tr.offsetHeight); set('--ztr-w', tr.offsetWidth);
}

function relay(): void {
  const { w, h } = platform().display.viewport();
  const next = layOf(w, h);
  if (next === lay && document.body.dataset.lay === next) return;
  lay = next;
  document.body.dataset.lay = lay;
  arrange();
  // 대화는 폰에서 접혀 시작한다 (한 줄 미리 보기, 누르면 펼침)
  $('chat').classList.toggle('fold', lay !== 'pc');
  for (const fn of fns) fn(lay);
}

/** 틀의 요소를 구역에 등록하고 구역을 만든다 (startClient가 게임의 모듈 다음에 부른다) */
export function initLayout(): void {
  const hud = $('hud');
  const box = document.createElement('div');
  box.id = 'zones';
  for (const z of ['tl', 'tr', 'tc', 'bl', 'br', 'bc'] as const) {
    const d = document.createElement('div');
    d.className = 'zone'; d.id = `zone-${z}`;
    box.append(d); zones.set(z, d);
  }
  hud.append(box);
  // 위 오른쪽의 단추 줄: 내 정보 창의 가방·메뉴 단추가 폰에서 여기로 온다 (내 정보 창이 한 줄로 줄어든다)
  const btns = document.createElement('div');
  btns.id = 'hudBtns';
  zones.get('tr')!.append(btns);
  placeIn('tl', 'me', 0);
  placeIn('tl', 'topmid', 10);
  placeIn(btns, 'bagBtn', 0);
  placeIn(btns, 'menuBtn', 1);
  placeIn('tr', 'chat', 30);
  placeIn('tr', 'rightcol', 40);
  placeIn('bl', 'stick', 0);
  placeIn('br', 'bottom', 0);
  placeIn('bc', 'feed', 10);
  // 채널·언어 선택은 메뉴 창의 머리로 (폰에서는 내 정보 창에 자리가 없다)
  const head = $('menuHead');
  if (head) { placeIn(head, 'channel', 0, { before: $('soundBtn') }); placeIn(head, 'lang', 1, { before: $('soundBtn') }); }
  // 접힌 대화: 누르면 펼친다. 펼친 대화의 '접기'
  const chat = $('chat');
  const fold = document.createElement('button');
  fold.type = 'button'; fold.id = 'chatFold'; fold.className = 'plain';
  const label = () => { fold.textContent = t('chatFold'); };
  label(); onLangChange(label);
  chat.prepend(fold);
  fold.addEventListener('click', (e) => { e.stopPropagation(); chat.classList.add('fold'); chat.classList.remove('typing'); });
  chat.addEventListener('click', (e) => { if (chat.classList.contains('fold') && e.target !== fold) { chat.classList.remove('fold'); if ((e.target as HTMLElement).id === 'chatBtn') return; } }, true);
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(measure); for (const z of zones.values()) ro.observe(z); }
  window.addEventListener('resize', relay);
  window.addEventListener('orientationchange', () => { relay(); setTimeout(relay, 300); });
  relay();
  measure();
}
