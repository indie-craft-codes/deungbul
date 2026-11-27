// 귀한 재화의 확인 단계 (공용 대화상자): 내용의 CURRENCIES에 confirm({ at, price })을 적은 재화를 한 번에 at 이상 쓰는 단추는 두 번 묻는다.
//   1단계  '얼마를 씁니다' + 실제 가격(price를 채운 게임만) → [계속] [그만두기]
//   2단계  '한 번 더 확인합니다' → [쓰기] [그만두기]. 단추의 자리를 1단계와 바꾸고 0.4초 동안 잠가, 빠르게 두 번 누른 손가락이 그대로 쓰지 않게 한다
// 적지 않은 재화(지금의 게임 모두)는 묻지 않고 곧바로 한다: 예전과 같다 (go를 그 자리에서 부른다).
// 쓰는 곳: 뽑기의 1번·10번 단추(hud/collect.ts). 게임의 단추도 confirmSpend(재화, 양, 할 일)로 감싸면 같다 (입구 @engine/client).
import { CURRENCIES, needsConfirm, type CurrencyDef } from '../../shared/defs';
import { L, t } from '../i18n';

let box: HTMLDivElement | null = null;
/** 지금 묻고 있는 것을 거둔다 */
let close: (() => void) | null = null;

function ensure(): HTMLDivElement {
  if (box) return box;
  box = document.createElement('div');
  box.className = 'modal'; box.id = 'spendAsk'; box.hidden = true;
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  box.innerHTML = '<div class="card panel"><h2 id="spendTitle"></h2><p id="spendText"></p><p class="note" id="spendPrice"></p><div class="btns" id="spendBtns"></div></div>';
  document.body.append(box);
  // 묻는 동안에는 단축키·이동 키가 게임에 가지 않는다. Esc는 그만두기
  window.addEventListener('keydown', (e) => { if (!box || box.hidden) return; if (e.key === 'Escape') close?.(); e.stopImmediatePropagation(); }, { capture: true });
  return box;
}

/** 지금 확인 창이 떠 있는가 (시험·게임) */
export const spendAsking = (): boolean => !!box && !box.hidden;

/**
 * cur 재화를 n만큼 쓰는 일(go)을 한다. 그 재화가 확인 단계를 쓰고 n이 그 양 이상이면 두 번 물은 뒤에, 아니면 곧바로.
 * no: 그만두었을 때 (없으면 아무것도 하지 않는다)
 */
export function confirmSpend(cur: string, n: number, go: () => void, no?: () => void): void {
  const def = (CURRENCIES as Readonly<Record<string, CurrencyDef>>)[cur];
  if (!needsConfirm(def, n)) { go(); return; }
  const b = ensure(), loc = L(), price = def?.confirm?.price;
  const text = b.querySelector<HTMLElement>('#spendText')!, btns = b.querySelector<HTMLElement>('#spendBtns')!, priceEl = b.querySelector<HTMLElement>('#spendPrice')!;
  b.querySelector<HTMLElement>('#spendTitle')!.textContent = t('confirmTitle');
  priceEl.textContent = price ? loc.fmt.confirmPrice(price) : '';
  priceEl.hidden = !price;
  const mk = (label: string, on: () => void, cls = ''): HTMLButtonElement => { const x = document.createElement('button'); x.type = 'button'; x.textContent = label; if (cls) x.className = cls; x.addEventListener('click', on); return x; };
  close = () => { b.hidden = true; close = null; no?.(); };
  const step2 = (): void => {
    text.textContent = `${loc.fmt.confirmSpend(n, cur)} ${t('confirmAgain')}`;
    const yes = mk(t('confirmYes'), () => { b.hidden = true; close = null; go(); }, 'gold');
    yes.disabled = true;
    setTimeout(() => { yes.disabled = false; }, 400);
    btns.replaceChildren(yes, mk(t('confirmNo'), () => close?.(), 'no'));
  };
  text.textContent = loc.fmt.confirmSpend(n, cur);
  btns.replaceChildren(mk(t('confirmNo'), () => close?.(), 'no'), mk(t('confirmNext'), step2));
  b.hidden = false;
}
