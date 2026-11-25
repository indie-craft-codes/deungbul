// 그림(아이콘): 게임이 그림 한 장에 여러 아이콘을 담은 시트를 등록하면, 틀의 화면이 이름 옆에 그 칸을 그린다. 그림이 없는 것은 지금처럼 글자만 보인다.
// 시트는 열 × 행의 고른 칸이고, keys는 위 줄 왼쪽부터 읽는 차례의 열쇠다(빈 칸은 null). 투명 배경 PNG·WebP를 권한다: 칸 뒤의 바탕색은 css의 --icon-bg로 게임이 정한다.
// 그림의 파일은 게임의 public/ 폴더에 둔다(빌드하면 화면과 같은 자리로 간다).
//
// 열쇠                    쓰이는 곳
//   아이템 id             가방·상점·대장간의 줄, 물약 단추(Q), 메뉴의 장비(무기·갑옷의 바탕 아이템)
//   'slot:' + 장비 칸     바탕 아이템이 없는 떨어진 장비(반지·목걸이 …)의 메뉴 줄. 예: 'slot:ring'
//   'cur:gold'            내 정보 창의 첫 번째 재화 앞     'cur:second'  두 번째 재화 앞
//   'ui:mail'             메뉴의 우편 줄
// 무기는 직업의 손 모양(ClassDef.hand)마다 이름이 다르다(검 / 활 / 지팡이): hand를 주고 등록한 그림은 그 손의 직업에게만 보인다.
import { handOf, type Gear } from '../../shared/defs';

/** 아이콘 하나: 어느 시트의 몇째 칸인가 */
interface Icon { src: string; cols: number; rows: number; col: number; row: number }
/** 열쇠: 위의 표의 것, 또는 손 모양이 정해진 그림이면 '열쇠@손 모양' */
const ICONS = new Map<string, Icon>();
/** 손 모양을 정해 등록한 그림이 있는 열쇠 (다른 손의 직업에게는 그 그림을 보이지 않는다) */
const HANDED = new Set<string>();

/**
 * 그림 시트를 등록한다. 같은 열쇠를 다시 등록하면 뒤의 것이 이긴다(시트를 여러 장 써도 된다).
 * hand를 주면 그 손 모양(ClassDef.hand)의 직업에게만 보이는 그림이다: 무기의 검 그림은 'sword', 활 그림은 'bow'.
 * 칸은 정사각형이 보기 좋다(아이콘은 정사각형 칸에 그려진다)
 */
export function addIconSheet(src: string, cols: number, rows: number, keys: readonly (string | null)[], hand?: string): void {
  keys.forEach((key, i) => {
    if (!key) return;
    ICONS.set(hand ? `${key}@${hand}` : key, { src, cols, rows, col: i % cols, row: Math.floor(i / cols) });
    if (hand) HANDED.add(key);
  });
}
/** 아이템 그림의 시트 (열쇠가 아이템 id인 addIconSheet) */
export const addItemSheet = addIconSheet;

/** 그 열쇠의 그림 (직업 cls에 맞는 것). 손 모양을 정해 등록된 열쇠인데 이 직업의 손 모양 그림이 없으면 없음 */
function find(key: string, cls: string): Icon | undefined {
  if (HANDED.has(key)) return ICONS.get(`${key}@${handOf(cls)}`) ?? (ICONS.has(key) ? ICONS.get(key) : undefined);
  return ICONS.get(key);
}

/** 그 열쇠에 그림이 있는가 (직업 cls의 눈으로) */
export const hasItemIcon = (key: string, cls = ''): boolean => !!find(key, cls);

/**
 * 그림 하나를 그리는 요소. 그림이 없으면 null (부르는 쪽은 그냥 건너뛴다). 크기는 css의 .icon(기본 32px, --icon으로 바꾼다).
 * cls: 보는 사람의 직업 (무기는 손 모양마다 그림이 다르다). css: 요소에 더할 class ('sm'이면 글자 곁의 작은 그림)
 */
export function itemIcon(key: string, cls = '', css = ''): HTMLElement | null {
  const ic = find(key, cls);
  if (!ic) return null;
  const el = document.createElement('span');
  el.className = css ? `icon ${css}` : 'icon';
  el.setAttribute('aria-hidden', 'true');
  el.style.backgroundImage = `url("${ic.src}")`;
  el.style.backgroundSize = `${ic.cols * 100}% ${ic.rows * 100}%`;
  el.style.backgroundPosition = `${ic.cols > 1 ? (ic.col / (ic.cols - 1)) * 100 : 0}% ${ic.rows > 1 ? (ic.row / (ic.rows - 1)) * 100 : 0}%`;
  return el;
}

/** 장비 하나의 그림: 무기·갑옷은 바탕 아이템의 그림, 바탕이 없는 장비(반지 …)는 그 칸의 그림('slot:칸') */
export const gearIcon = (g: Pick<Gear, 'base' | 'slot'>, cls = ''): HTMLElement | null => (g.base && itemIcon(g.base, cls)) || itemIcon(`slot:${g.slot}`, cls);
