// 화면의 뼈대를 문서에 붙이고(mountShell), 그 뼈대에서 게임이 자기 창을 붙이는 자리를 내준다(mountPanel).
// 뼈대(./skeleton.ts)에는 틀의 창과 빈 자리만 있고, 게임은 자기 창의 마크업을 mountPanel(자리, html)로 붙인다. 틀은 무엇이 붙는지 모른다.
// 붙은 마크업은 틀의 마크업과 똑같이 다뤄진다: data-i18n 표시는 applyDom이 채우고, 요소는 $('id')로 잡는다.
// 차례: 뼈대는 이 파일이 읽히는 때에 붙는다. 틀의 화면 파일 여럿이 읽히는 때에 요소를 잡아 두는데($('banner') 같은 것), 그 파일들은 모두 $를 쓰려고
// app.ts를 import하고 app.ts는 이 파일을 맨 먼저 import한다: 그래서 게임의 진입점이 무엇을 어떤 순서로 import하든 요소를 잡는 때에는 뼈대가 있다.
// 게임의 창(mountPanel)은 그 뒤, 게임의 진입점이 startClient를 부르기 전에 붙인다 (게임의 모듈은 init 안에서 요소를 잡는다).
// 이 파일은 app.ts를 import하지 않는다: app.ts가 이 파일에 기대어 먼저 붙이기 때문이다.
import { SKELETON } from './skeleton';

let mounted = false;
/**
 * 틀의 뼈대를 문서의 body 맨 앞에 붙인다. 한 번만 붙는다 (이 파일이 읽히는 때에 스스로 부르므로 게임이 따로 부를 일은 없다).
 * 게임의 index.html은 body에 진입점 script만 둔다: 그 앞에 뼈대가 들어간다.
 */
export function mountShell(): void {
  if (mounted || typeof document === 'undefined') return; // 화면이 없는 곳(node의 시험)에서 읽혀도 죽지 않는다
  mounted = true;
  document.body.insertAdjacentHTML('afterbegin', SKELETON);
}
mountShell();

/** 붙는 자리: 기준이 되는 틀의 요소와, 그 요소의 어느 쪽에 놓는가 */
interface SlotDef { at: () => Element | null | undefined; where: InsertPosition }
const byId = (id: string) => document.getElementById(id);

const SLOTS = {
  /** 내 정보: 체력 숫자 옆 (같은 줄의 오른쪽 끝) */
  meHp: { at: () => byId('hpt'), where: 'afterend' },
  /** 내 정보: 골드 옆 (같은 줄의 오른쪽 끝) */
  meGold: { at: () => byId('gold'), where: 'afterend' },
  /** 내 정보: 골드 줄과 단추 줄(접속자 수, 가방, 메뉴) 사이에 끼는 줄들 */
  meRows: { at: () => byId('status')?.parentElement, where: 'beforebegin' },
  /** 오른쪽 위에 쌓이는 창들의 맨 위 (상점 위) */
  rightTop: { at: () => byId('rightcol'), where: 'afterbegin' },
  /** 오른쪽 위에 쌓이는 창들의 맨 아래 (던전 창 아래) */
  rightBottom: { at: () => byId('rightcol'), where: 'beforeend' },
  /** 화면 전체에 떠 있는 것: HUD의 바로 아래, 오른쪽 창들 다음 (뒤에 오는 창들이 그 위에 그려진다) */
  hud: { at: () => byId('rightcol'), where: 'afterend' },
  /** 가운데 위 묶음의 맨 위 (대상 창 위) */
  topmid: { at: () => byId('topmid'), where: 'afterbegin' },
  /** 기술 단추 위의 단추 줄: 자동 사냥 단추 다음 */
  actions: { at: () => byId('autoBtn'), where: 'afterend' },
} as const satisfies Record<string, SlotDef>;
export type Slot = keyof typeof SLOTS;

/** 자리마다 마지막으로 붙인 것. 같은 자리에 여러 번 붙이면 붙인 차례대로 놓인다 */
const tails = new Map<Slot, ChildNode>();

/**
 * 게임의 마크업을 틀의 빈 자리에 붙인다. html의 맨 바깥 요소들이 감싸는 것 없이 그 자리의 형제로 들어간다
 * (스타일과 겹치는 순서가 문서의 순서에 기대므로 감싸는 요소를 더하지 않는다).
 */
export function mountPanel(slot: Slot, html: string): void {
  const { at, where } = SLOTS[slot];
  const anchor = at();
  if (!anchor) throw new Error(`mountPanel: '${slot}' 자리의 기준 요소가 화면에 없습니다`);
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  const last = tpl.content.lastChild;
  if (!last) return;
  const tail = tails.get(slot);
  if (where === 'beforebegin') anchor.before(tpl.content);
  else if (where === 'beforeend') anchor.append(tpl.content);
  else if (tail) tail.after(tpl.content);
  else if (where === 'afterbegin') anchor.prepend(tpl.content);
  else anchor.after(tpl.content);
  tails.set(slot, last);
}
