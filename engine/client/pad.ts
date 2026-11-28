// 게임패드 (플랫폼 분리 2단계: 데스크톱·Steam Deck, 웹에도 같다). 매 프레임 platform().input.gamepad()를 읽어 셈(./padcalc.ts)대로 한다:
// 창(메뉴·가방·지도·확인 창 …)이 열려 있으면 포커스를 옮기고 누르고 닫는다(U4의 접근성 틀 hud/a11y.ts의 포커스 체계를 그대로 쓴다), 없으면 이동과 기능.
// 접속 전(들어가기 화면)에는 화면 전체의 단추를 창처럼 다룬다. 글을 치는 칸에 포커스가 있으면 이동·기능을 하지 않는다(방향으로 칸을 빠져나갈 수는 있다).
// 패드가 없으면 아무것도 하지 않는다 (웹의 기본 동작 그대로).
import { onFrame, runAction } from './bus';
import { cycleFocus, focusRoot } from './hud/a11y';
import { padFieldActions, padMove, padUiSteps, type PadState, type PadUi } from './padcalc';
import { platform } from './platform';
import { S } from './state';

const ZERO = { x: 0, z: 0 };
let prev: PadState | null = null;
let move = ZERO;
/** 지금 패드의 이동 방향 (input.ts의 axis가 더한다) */
export const padAxis = (): { x: number; z: number } => move;

const typingNow = (): boolean => { const a = document.activeElement; return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement; };

function ui(step: PadUi, root: HTMLElement): void {
  if (step === 'next' || step === 'prev') { cycleFocus(root, step === 'prev'); return; }
  if (step === 'menu') { if (S.me) runAction('m'); return; }
  const a = document.activeElement;
  if (step === 'press') {
    if (a instanceof HTMLElement && a !== document.body && a !== root && root.contains(a)) a.click();
    else cycleFocus(root, false); // 아직 고른 것이 없다: 첫 단추로
    return;
  }
  // 닫기: Esc를 누른 것과 같게 (화면 쌓임의 맨 위를 닫는다. 확인 창·절전 화면은 스스로 받는다)
  (a instanceof HTMLElement ? a : document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
}

function tick(): void {
  const p = platform().input.gamepad();
  if (!p) { prev = null; move = ZERO; return; }
  const root = focusRoot() ?? (S.me ? null : document.body);
  if (root) {
    move = ZERO;
    for (const s of padUiSteps(prev, p)) ui(s, root);
  } else if (typingNow()) {
    move = ZERO;
    for (const s of padUiSteps(prev, p)) if (s === 'next' || s === 'prev' || s === 'back') (document.activeElement as HTMLElement).blur();
  } else {
    move = padMove(p);
    for (const a of padFieldActions(prev, p)) runAction(a);
  }
  prev = p;
}

/** 게임패드를 켠다 (input.ts의 initInput) */
export function initPad(): void { onFrame(tick); }
