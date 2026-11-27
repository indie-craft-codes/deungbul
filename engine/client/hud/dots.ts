// 알림 점 (묶음 A의 4: docs/screens.md 9.2의 5, 2.9): '지금 누르면 받을 것·할 수 있는 것'만 점으로 알린다.
// 점의 원천은 이름 하나에 함수 하나다 (setDot). 원천은 부모를 가진다: 아이의 점은 부모로 번진다 (메뉴의 탭 'menu.mail' → 메뉴 단추 'menu',
// 게임의 홈 단추 'home.heroes' ← 'menu.heroes'). 화면의 요소는 이름에 묶는다(bindDot): 0.25초마다 셈해 class 'dot'(그리고 수가 있으면 data-dot)를 붙이고 뗀다.
// 원천은 상태에서 바로 센다(받을 우편의 수, 올릴 수 있는 영웅): 할 일을 하면 상태가 바뀌어 점이 곧바로 꺼진다. 점을 '봤다'고 끄지 않는다.
// 틀의 원천: 메뉴의 탭마다 'menu.<탭 id>'(MenuTab.dot: 우편·찍을 점수·올릴 수 있는 영웅·뽑을 수 있는 뽑기·시즌 보상·친구 요청 …), 그 부모 'menu'.
import { onSlow } from '../bus';

type Src = () => boolean | number;
const sources = new Map<string, Src>();
const parents = new Map<string, string>();
const binds: { el: HTMLElement; id: string; count: boolean }[] = [];
let vals = new Map<string, number>();
let started = false;

/** 원천을 둔다: 참이거나 1 이상이면 점이 켜진다 (수는 숫자 점). parent를 주면 그리로 번진다. fn이 null이면 원천을 뺀다 */
export function setDot(id: string, fn: Src | null, parent?: string): void {
  if (fn) sources.set(id, fn); else sources.delete(id);
  if (parent !== undefined) dotParent(id, parent);
  start();
}
/** 이 이름의 점이 parent로 번진다 ('' 이면 번지지 않는다) */
export function dotParent(id: string, parent: string): void { if (parent) parents.set(id, parent); else parents.delete(id); }
/** 요소를 점의 이름에 묶는다. count면 수를 data-dot에 적는다 (우편 3) */
export function bindDot(el: HTMLElement | null | undefined, id: string, count = false): void {
  if (!el) return;
  const at = binds.findIndex((b) => b.el === el);
  if (at >= 0) binds.splice(at, 1);
  binds.push({ el, id, count });
  start();
  paint();
}
/** 그 이름의 지금 값 (아이들의 합 포함) */
export const dotOf = (id: string): number => vals.get(id) ?? 0;

/** 모든 원천을 세어 부모로 번지게 한다 (시험이 node에서 같은 셈을 부른다: dotTree) */
export function dotTree(src: ReadonlyMap<string, Src>, par: ReadonlyMap<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, fn] of src) {
    let v: number;
    try { const r = fn(); v = typeof r === 'number' ? Math.max(0, r) : r ? 1 : 0; } catch { v = 0; }
    if (!v) continue;
    // 자기와 조상 모두에 더한다 (고리가 있어도 끝나게 32단까지)
    for (let k: string | undefined = id, n = 0; k && n < 32; k = par.get(k), n++) out.set(k, (out.get(k) ?? 0) + v);
  }
  return out;
}

function paint(): void {
  for (const b of binds) {
    const v = vals.get(b.id) ?? 0;
    b.el.classList.toggle('dot', v > 0);
    if (b.count && v > 0) b.el.dataset.dot = String(v); else delete b.el.dataset.dot;
  }
}
function tick(): void { vals = dotTree(sources, parents); paint(); }
function start(): void { if (started) return; started = true; onSlow(tick); }
