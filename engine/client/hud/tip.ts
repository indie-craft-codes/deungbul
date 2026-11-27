// 터치에서도 보이는 툴팁: title 속성이 달린 요소를 손가락(펜)으로 길게 누르면 그 글을 말풍선으로 띄운다.
// 데스크톱(마우스)은 손대지 않는다: 브라우저의 title 툴팁이 예전처럼 뜬다. 그래서 화면의 코드는 지금처럼 title만 달면 된다 (아이템 이름, 기술 설명, 잠금 안내 …).
// 길게 눌러 말풍선이 떴으면 손을 뗄 때의 누름(click)은 삼킨다: 설명을 보려다 단추가 눌리지 않게. 짧게 누르면 예전처럼 눌린다.
// 글은 이미 i18n을 거친 title 그대로라 이 파일에는 문장이 없다.

/** 이만큼 누르고 있으면 띄운다(ms) */
export const LONG_PRESS_MS = 450;
/** 손가락이 이만큼 움직이면 길게 누르기가 아니다(px: 끌어 넘기기) */
const MOVE_PX = 10;
/** 손을 뗀 뒤 이만큼 더 보인다(ms) */
const LINGER_MS = 2500;

let pop: HTMLDivElement | null = null;
let pressTimer = 0, hideTimer = 0;
/** 이번 누름에서 말풍선을 띄웠다: 손을 뗄 때의 click을 삼킨다 */
let swallow = false;

/** 말풍선을 띄운다: 그 요소(near)의 위에, 자리가 없으면 아래에. 화면 밖으로 나가지 않게 */
export function showTip(text: string, near: DOMRect): void {
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'tipPop';
    pop.setAttribute('role', 'tooltip');
    document.body.append(pop);
  }
  pop.textContent = text;
  pop.hidden = false;
  const w = pop.offsetWidth, h = pop.offsetHeight, gap = 8, vw = document.documentElement.clientWidth;
  const left = Math.max(4, Math.min(vw - w - 4, near.left + near.width / 2 - w / 2));
  const top = near.top - h - gap >= 4 ? near.top - h - gap : near.bottom + gap;
  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
  clearTimeout(hideTimer);
}
export function hideTip(): void {
  clearTimeout(hideTimer);
  if (pop) pop.hidden = true;
}
/** 말풍선이 떠 있는가 */
export const tipShown = (): boolean => !!pop && !pop.hidden;

/** 누른 곳에서 가장 가까운 title이 있는 요소 (title이 빈 것은 건너뛴다) */
function titled(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  while (el) {
    if (el instanceof HTMLElement && el.title) return el;
    el = el.parentElement;
  }
  return null;
}

/** 틀이 startClient에서 한 번 켠다. 문서 전체에서 듣는다(창이 나중에 만든 요소도) */
export function initTips(): void {
  let x0 = 0, y0 = 0, pressing = false;
  const cancel = () => { clearTimeout(pressTimer); pressing = false; };
  document.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse') return; // 마우스는 브라우저의 툴팁 (예전 그대로)
    hideTip();
    swallow = false;
    const el = titled(ev.target);
    if (!el) return;
    x0 = ev.clientX; y0 = ev.clientY; pressing = true;
    clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      pressing = false;
      if (!el.isConnected || !el.title) return;
      showTip(el.title, el.getBoundingClientRect());
      swallow = true;
    }, LONG_PRESS_MS);
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', (ev) => { if (pressing && Math.hypot(ev.clientX - x0, ev.clientY - y0) > MOVE_PX) cancel(); }, { capture: true, passive: true });
  const up = () => {
    cancel();
    if (tipShown()) { clearTimeout(hideTimer); hideTimer = window.setTimeout(hideTip, LINGER_MS); }
  };
  document.addEventListener('pointerup', up, { capture: true, passive: true });
  document.addEventListener('pointercancel', up, { capture: true, passive: true });
  // 길게 눌러 띄웠으면 그 누름의 click과 길게 누르기 메뉴(안드로이드의 contextmenu)를 삼킨다
  document.addEventListener('click', (ev) => { if (!swallow) return; swallow = false; ev.preventDefault(); ev.stopPropagation(); }, { capture: true });
  document.addEventListener('contextmenu', (ev) => { if (swallow || pressing) ev.preventDefault(); }, { capture: true });
  // 화면이 움직이면(창을 넘김, 크기 바뀜) 엉뚱한 자리에 남지 않게 걷는다
  window.addEventListener('scroll', hideTip, { capture: true, passive: true });
  window.addEventListener('resize', hideTip);
}
