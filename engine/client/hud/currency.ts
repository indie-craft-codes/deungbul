// 재화 줄 (묶음 A의 3: docs/screens.md 9.2의 3): 페이지의 위에 놓는 재화 칩들. 칩마다 그림·수, '+'를 누르면 그 재화를 얻는 곳으로 (게임이 잇는다).
// 틀이 아는 재화는 'gold'(첫 번째 재화: 엔티티의 gold)와 'second'(두 번째 재화: sparks)다. 게임은 다른 칩(값을 돌려주는 함수)을 더할 수 있다.
// 줄은 만들어 돌려줄 뿐이다: 붙일 곳은 부른 쪽이 정한다 (수집형 홈 키트의 위 띠, 게임의 페이지). 값은 0.25초마다 바뀐 것만 고친다.
import { onSlow } from '../bus';
import { L } from '../i18n';
import { S } from '../state';
import { itemIcon } from './icons';
import { uiIcon } from './uiicons';
import { showNumber } from './reward';
import { staminaChip } from './stamina';

export interface CurrencyChip {
  /** 칩의 이름표 (class와 data-cur에 들어간다: 게임의 스타일이 색을 준다) */
  id: string;
  /** 지금 값 */
  value: () => number;
  /** 그림 시트의 열쇠 ('cur:gold' 따위). 없거나 시트가 없으면 glyph */
  icon?: string;
  /** 그림 대신 쓰는 화면 아이콘의 이름(hud/uiicons.ts: 'coin'·'shard'·'stamina') 또는 글자 */
  glyph?: string;
  /** 칩을 길게 누르거나 마우스를 올렸을 때의 이름 (title) */
  title?: (n: number) => string;
  /** '+'를 누르면: 그 재화를 얻는 곳으로 (없으면 '+'가 없다) */
  plus?: () => void;
  /** 수 대신 보일 글 (스태미나의 'n/상한 · 다음 1까지 m:ss'). 없으면 수 */
  text?: (n: number) => string;
  /** 칩을 누르면 (스태미나: 부족 창) */
  onClick?: () => void;
  /** 거짓이면 칩을 감춘다 (스태미나: 서버가 켜지 않았으면) */
  shown?: () => boolean;
}
/** 틀이 아는 재화: 'gold' 첫 번째, 'second' 두 번째, 'stamina' 스태미나(stamina 모듈: hud/stamina.ts) */
export type CurrencyId = 'gold' | 'second' | 'stamina';

const builtIn = (id: CurrencyId): CurrencyChip => id === 'gold'
  ? { id: 'gold', icon: 'cur:gold', glyph: 'coin', value: () => S.me?.gold ?? 0, title: (n) => L().fmt.gold(n) }
  : id === 'stamina' ? staminaChip()
  : { id: 'second', icon: 'cur:second', glyph: 'shard', value: () => S.me?.sparks ?? 0, title: (n) => L().fmt.coinHave(n) || String(n) };

const bars: { chip: CurrencyChip; num: HTMLElement; el: HTMLElement; last: string; lang: string }[] = [];
let ticking = false;

/**
 * 재화 줄을 만든다. 칩은 틀의 재화 id('gold'·'second', plus를 줄 수 있다) 또는 게임의 칩.
 * 예: currencyBar([{ ...'second', plus: () => switchMode('vale') }, 'gold'])
 */
export function currencyBar(chips: readonly (CurrencyId | CurrencyChip | (Partial<CurrencyChip> & { id: CurrencyId }))[]): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'curbar';
  for (const c of chips) {
    const chip: CurrencyChip = typeof c === 'string' ? builtIn(c) : c.id === 'gold' || c.id === 'second' || c.id === 'stamina' ? { ...builtIn(c.id as CurrencyId), ...c } as CurrencyChip : c as CurrencyChip;
    const el = document.createElement('span');
    el.className = `curchip cur-${chip.id}`; el.dataset.cur = chip.id;
    const pic = chip.icon ? itemIcon(chip.icon, '', 'sm') : null;
    // 그림 시트의 칸이 없으면 화면 아이콘 (hud/uiicons.ts: 이름이면 SVG, 아니면 그 글자)
    if (pic) el.append(pic); else el.append(uiIcon(chip.glyph ?? ''));
    const num = document.createElement('b');
    el.append(num);
    if (chip.plus) {
      const p = document.createElement('button');
      p.type = 'button'; p.className = 'curplus'; p.textContent = '+';
      const go = chip.plus;
      p.addEventListener('click', (e) => { e.stopPropagation(); go(); });
      el.append(p);
    }
    if (chip.onClick) { const go = chip.onClick; el.classList.add('curtap'); el.setAttribute('role', 'button'); el.tabIndex = 0; el.addEventListener('click', go); }
    bar.append(el);
    bars.push({ chip, num, el, last: '', lang: '' });
  }
  draw();
  if (!ticking) { ticking = true; onSlow(draw); }
  return bar;
}

function draw(): void {
  const loc = L();
  for (const b of bars) {
    if (!b.el.isConnected && b.last) continue;
    if (b.chip.shown) b.el.hidden = !b.chip.shown();
    const n = b.chip.value(), text = b.chip.text ? b.chip.text(n) : n.toLocaleString(loc.code);
    if (text === b.last && b.lang === loc.code) continue;
    // 글로 보이는 칩(스태미나)은 굴리지 않는다
    if (b.chip.text) { b.last = text; b.lang = loc.code; b.num.textContent = text; if (b.chip.title) b.el.title = b.chip.title(n); continue; }
    // 바뀐 값은 굴리고 곁에 +n (U2: hud/reward.ts). 내 상태를 받기 전·언어가 바뀐 때는 글만
    const live = !!S.me?.ready && b.lang === loc.code;
    b.last = text; b.lang = loc.code;
    showNumber(b.num, n, (v) => v.toLocaleString(loc.code), live);
    if (b.chip.title) b.el.title = b.chip.title(n);
  }
}
