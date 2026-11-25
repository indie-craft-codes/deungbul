// 아이템의 그림(아이콘): 게임이 그림 한 장에 여러 아이콘을 담은 시트를 등록하면, 가방·상점·대장간·물약 단추가 이름 옆에 그 칸을 그린다.
// 시트는 열 × 행의 고른 칸이고, ids는 위 줄 왼쪽부터 읽는 차례의 아이템 id다(빈 칸은 null). 그림이 없는 아이템은 지금처럼 글자만 보인다.
// 그림의 파일은 게임의 public/ 폴더에 둔다(빌드하면 화면과 같은 자리로 간다). 예: addItemSheet('./items/sheet.jpg', 3, 2, ['potion', 'tonic', …])

/** 아이콘 하나: 어느 시트의 몇째 칸인가 */
interface Icon { src: string; cols: number; rows: number; col: number; row: number }
const ICONS = new Map<string, Icon>();

/**
 * 아이콘 시트를 등록한다. 같은 아이템을 다시 등록하면 뒤의 것이 이긴다(시트를 여러 장 써도 된다).
 * 시트의 칸은 정사각형이 아니어도 되지만, 아이콘은 정사각형 칸에 그려지므로 칸도 정사각형이 보기 좋다
 */
export function addItemSheet(src: string, cols: number, rows: number, ids: readonly (string | null)[]): void {
  ids.forEach((id, i) => { if (id) ICONS.set(id, { src, cols, rows, col: i % cols, row: Math.floor(i / cols) }); });
}

/** 그 아이템에 그림이 있는가 */
export const hasItemIcon = (id: string): boolean => ICONS.has(id);

/** 아이템 그림 하나를 그리는 요소. 그림이 없으면 null (부르는 쪽은 그냥 건너뛴다). 크기는 css의 .icon(기본 32px) */
export function itemIcon(id: string, cls = ''): HTMLElement | null {
  const ic = ICONS.get(id);
  if (!ic) return null;
  const el = document.createElement('span');
  el.className = cls ? `icon ${cls}` : 'icon';
  el.setAttribute('aria-hidden', 'true');
  el.style.backgroundImage = `url("${ic.src}")`;
  el.style.backgroundSize = `${ic.cols * 100}% ${ic.rows * 100}%`;
  el.style.backgroundPosition = `${ic.cols > 1 ? (ic.col / (ic.cols - 1)) * 100 : 0}% ${ic.rows > 1 ? (ic.row / (ic.rows - 1)) * 100 : 0}%`;
  return el;
}
