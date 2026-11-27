// 도감으로 가는 단추와 도감 창의 '규칙·수치' 칸 (묶음 E).
// 예전에는 단추가 공개 도감(games/deungbul/client/guide.html)을 새 탭으로 열었다: 게임 탭이 숨어 '자리 비움'이 붙고, 돌아오면 자동 사냥이 꺼져 있었다(ux-review 2.2).
// 이제 단추는 게임 안의 도감 창(틀의 메뉴 '도감' 탭: engine/client/hud/codexbook.ts)을 연다. 공개 도감의 내용(구역과 표: guide/data.ts)은 그 창의 '규칙·수치' 칸에 같은 것을 그리고,
// 공개 페이지 자체는 그대로 남아 창 아래의 '공개 도감 열기 (새 탭)'로 연다 (Ctrl·Shift·가운데 단추로 누르면 예전처럼 브라우저가 새 탭으로).
// 도감의 내용은 게임의 첫 번들에 넣지 않는다: 그 칸을 처음 볼 때 따로 읽는다 (동적 import).
// 다른 창의 자리에 기대지 않으려고 HTML에 자리를 두지 않고 여기서 만들어 화면 가장자리에 띄운다.
import '../guide/link.css';
import { linkText } from '../guide/link.text';
import { L, onLangChange, t } from '@engine/client/i18n';
import { addCodexSection, openCodex, renderMenu, setCodexPublic } from '@engine/client';
import type { Block, Pack, Section, Table } from '../guide/data';

type GuideMod = typeof import('../guide/data');
let mod: GuideMod | null = null;
let loading = false;
/** 고른 구역 (도감의 구역 id) */
let pick = '';
/** 구역을 만든 언어와 그 결과 (언어가 바뀌면 다시 만든다) */
let built: { code: string; list: Section[] } | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

function drawTable(t: Table): HTMLElement {
  const fig = el('figure', undefined, 'cbTable');
  if (t.caption) fig.append(el('figcaption', t.caption));
  const table = el('table'), thead = el('thead'), head = el('tr'), body = el('tbody');
  for (const hd of t.head) { const th = el('th', hd); th.scope = 'col'; head.append(th); }
  for (const r of t.rows) { const tr = el('tr'); for (const c of r.cells) tr.append(el('td', c)); body.append(tr); }
  thead.append(head);
  table.append(thead, body);
  const scroll = el('div', undefined, 'cbScroll');
  scroll.tabIndex = 0;
  scroll.append(table);
  fig.append(scroll);
  return fig;
}
function drawBlock(b: Block): HTMLElement {
  switch (b.t) {
    case 'h': return el('h4', b.text);
    case 'p': return el('p', b.text, 'note');
    case 'ul': { const ul = el('ul', undefined, 'note'); for (const i of b.items) ul.append(el('li', i)); return ul; }
    case 'table': return drawTable(b.table);
  }
}

/** '규칙·수치' 칸: 공개 도감과 같은 구역들 (구역을 고르는 칸 + 그 구역의 글과 표) */
function drawGuide(list: HTMLElement): void {
  if (!mod) {
    list.append(el('p', '…', 'note'));
    if (!loading) { loading = true; void import('../guide/data').then((m) => { mod = m; loading = false; renderMenu(); }); }
    return;
  }
  const code = L().code;
  if (!built || built.code !== code) {
    const pack: Pack = mod.packOf(code) ?? mod.PACKS[0];
    built = { code, list: mod.buildGuide(pack) };
  }
  const secs = built.list;
  if (!secs.some((s) => s.id === pick)) pick = secs[0]?.id ?? '';
  const sel = el('select', undefined, 'cbGuideSel');
  sel.setAttribute('aria-label', linkText(code).label);
  for (const s of secs) sel.add(new Option(s.title, s.id));
  sel.value = pick;
  sel.addEventListener('change', () => { pick = sel.value; renderMenu(); sel.blur(); });
  list.append(sel);
  const s = secs.find((x) => x.id === pick);
  if (s) { list.append(el('h3', s.title, 'cbGuideHead')); for (const b of s.blocks) list.append(drawBlock(b)); }
}

export function initGuideLink(): void {
  addCodexSection({ id: 'guide', label: () => t('cbGuide'), draw: drawGuide, sig: () => [pick, !!mod] });
  // 공개 페이지는 그대로: 창 아래에서 새 탭으로 (바깥 주소를 열 수 있는 곳만: 틀이 가린다)
  setCodexPublic(() => `./guide.html?lang=${L().code}`);
  const a = document.createElement('a');
  a.id = 'guideLink';
  a.rel = 'noopener';
  // 그냥 누르면 게임 안의 도감 창. Ctrl·Shift·가운데 단추로 누르면 브라우저가 하던 대로 둔다 (새 탭, 새 창: 공개 도감)
  a.addEventListener('click', (ev) => {
    if (ev.button !== 0 || ev.ctrlKey || ev.shiftKey || ev.metaKey || ev.altKey) return;
    ev.preventDefault();
    a.blur();
    openCodex();
  });
  const draw = (): void => {
    const code = L().code, text = linkText(code);
    a.textContent = text.label;
    a.title = text.title;
    a.setAttribute('aria-label', text.title);
    // 상대 경로: 게임 서버가 내보낼 때도, GitHub Pages의 하위 경로에서도 같은 폴더의 도감을 가리킨다
    a.href = `./guide.html?lang=${code}`;
  };
  draw();
  onLangChange(draw);
  document.body.append(a);
}
