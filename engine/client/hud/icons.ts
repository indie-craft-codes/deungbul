// 아이템의 그림(아이콘): 게임이 그림 한 장에 여러 아이콘을 담은 시트를 등록하면, 가방·상점·대장간·물약 단추가 이름 옆에 그 칸을 그린다.
// 시트는 열 × 행의 고른 칸이고, ids는 위 줄 왼쪽부터 읽는 차례의 아이템 id다(빈 칸은 null). 그림이 없는 아이템은 지금처럼 글자만 보인다.
// 그림의 파일은 게임의 public/ 폴더에 둔다(빌드하면 화면과 같은 자리로 간다). 예: addItemSheet('./items/sheet.jpg', 3, 2, ['potion', 'tonic', …])
// 무기는 직업의 손 모양(ClassDef.hand)마다 이름이 다르다(검 / 활 / 지팡이): hand를 주고 등록한 그림은 그 손의 직업에게만 보인다.
import { handOf } from '../../shared/defs';

/** 아이콘 하나: 어느 시트의 몇째 칸인가 */
interface Icon { src: string; cols: number; rows: number; col: number; row: number }
/** 열쇠: 아이템 id, 또는 손 모양이 정해진 그림이면 '아이템 id@손 모양' */
const ICONS = new Map<string, Icon>();
/** 손 모양을 정해 등록한 그림이 있는 아이템 (다른 손의 직업에게는 그 그림을 보이지 않는다) */
const HANDED = new Set<string>();

/**
 * 아이콘 시트를 등록한다. 같은 아이템을 다시 등록하면 뒤의 것이 이긴다(시트를 여러 장 써도 된다).
 * hand를 주면 그 손 모양(ClassDef.hand)의 직업에게만 보이는 그림이다: 무기의 검 그림은 'sword', 활 그림은 'bow'.
 * 칸은 정사각형이 보기 좋다(아이콘은 정사각형 칸에 그려진다)
 */
export function addItemSheet(src: string, cols: number, rows: number, ids: readonly (string | null)[], hand?: string): void {
  ids.forEach((id, i) => {
    if (!id) return;
    ICONS.set(hand ? `${id}@${hand}` : id, { src, cols, rows, col: i % cols, row: Math.floor(i / cols) });
    if (hand) HANDED.add(id);
  });
}

/** 그 아이템의 그림 (직업 cls에 맞는 것). 손 모양을 정해 등록된 아이템인데 이 직업의 손 모양 그림이 없으면 없음 */
function find(id: string, cls: string): Icon | undefined {
  if (HANDED.has(id)) return ICONS.get(`${id}@${handOf(cls)}`) ?? (ICONS.has(id) ? ICONS.get(id) : undefined);
  return ICONS.get(id);
}

/** 그 아이템에 그림이 있는가 (직업 cls의 눈으로) */
export const hasItemIcon = (id: string, cls = ''): boolean => !!find(id, cls);

/**
 * 아이템 그림 하나를 그리는 요소. 그림이 없으면 null (부르는 쪽은 그냥 건너뛴다). 크기는 css의 .icon(기본 32px, --icon으로 바꾼다).
 * cls: 보는 사람의 직업 (무기는 손 모양마다 그림이 다르다). css: 요소에 더할 class
 */
export function itemIcon(id: string, cls = '', css = ''): HTMLElement | null {
  const ic = find(id, cls);
  if (!ic) return null;
  const el = document.createElement('span');
  el.className = css ? `icon ${css}` : 'icon';
  el.setAttribute('aria-hidden', 'true');
  el.style.backgroundImage = `url("${ic.src}")`;
  el.style.backgroundSize = `${ic.cols * 100}% ${ic.rows * 100}%`;
  el.style.backgroundPosition = `${ic.cols > 1 ? (ic.col / (ic.cols - 1)) * 100 : 0}% ${ic.rows > 1 ? (ic.row / (ic.rows - 1)) * 100 : 0}%`;
  return el;
}
