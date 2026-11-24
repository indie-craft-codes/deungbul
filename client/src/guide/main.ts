// 도감의 화면: data.ts가 만든 구역과 표를 그대로 그린다. 내용은 여기서 정하지 않는다.
// 게임 서버에 접속하지 않는 정적 페이지다. 게임의 3D·통신 코드를 불러오지 않는다.
import './guide.css';
import { LANGS, PACKS, buildGuide, packOf, type Block, type Pack, type Table } from './data';

/** 빌드한 시각 (vite.config.ts가 넣는다) */
declare const __BUILD_TIME__: string;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

/** 처음 언어: 주소의 ?lang= 이 가장 먼저, 그다음 게임에서 고른 언어(게임이 localStorage의 'lang'에 적어 둔다), 그다음 브라우저 언어 */
function detect(): Pack {
  let saved: string | null = null;
  try { saved = localStorage.getItem('lang'); } catch { /* 저장소를 못 쓰는 환경 */ }
  return packOf(new URLSearchParams(location.search).get('lang')) ?? packOf(saved) ?? packOf(navigator.language) ?? PACKS[0];
}

let pack = detect();
const filter = $<HTMLInputElement>('filter'), langSel = $<HTMLSelectElement>('lang'), toc = $('toc'), content = $('content'), count = $('count');

/** 숫자로만 된 칸은 고정폭 글꼴로. 짧은 칸은 줄을 바꾸지 않고(표가 넓어지면 표를 가로로 민다), 문장 칸은 폭을 정해 두고 줄을 바꾼다 */
const cellClass = (text: string): string => (text.length <= 18 && /^[\d\s.,+×%–—:→-]+$/.test(text) ? 'num' : text.length > 40 ? 'long' : text.length > 16 ? 'mid' : 'short');

function drawTable(t: Table): HTMLElement {
  const fig = el('figure');
  fig.dataset.table = t.id;
  if (t.caption) fig.append(el('figcaption', t.caption));
  const table = el('table'), head = el('tr'), body = el('tbody');
  // 첫 칸이 번호나 단계뿐인 표는 첫 칸을 좁게 둔다
  const narrow = t.rows.every((r) => cellClass(r.cells[0]) === 'num');
  t.head.forEach((hd, i) => { const th = el('th', hd, i === 0 && narrow ? 'num' : hd.length > 14 ? 'mid' : 'short'); th.scope = 'col'; head.append(th); });
  for (const r of t.rows) {
    const tr = el('tr');
    tr.dataset.key = r.key;
    tr.dataset.text = r.cells.join(' ').toLowerCase();
    for (const c of r.cells) tr.append(el('td', c, cellClass(c)));
    body.append(tr);
  }
  const thead = el('thead');
  thead.append(head);
  table.append(thead, body);
  const scroll = el('div', undefined, 'scroll');
  scroll.tabIndex = 0; // 키보드로도 가로로 밀 수 있게
  scroll.append(table);
  fig.append(scroll);
  return fig;
}

function drawBlock(b: Block): HTMLElement {
  switch (b.t) {
    case 'h': return el('h3', b.text);
    case 'p': return el('p', b.text);
    case 'ul': { const ul = el('ul'); for (const i of b.items) ul.append(el('li', i)); return ul; }
    case 'table': return drawTable(b.table);
  }
}

/** 띠의 높이만큼 구역 제목이 가려지지 않게 한다 */
const measureBar = (): void => document.documentElement.style.setProperty('--bar-h', `${$('bar').offsetHeight}px`);

function render(): void {
  const { L, T } = pack;
  document.documentElement.lang = L.code;
  document.title = T.page.title;
  $('title').textContent = T.page.title;
  $('subtitle').textContent = T.page.subtitle;
  filter.placeholder = T.page.filterPlaceholder;
  filter.setAttribute('aria-label', T.page.filterLabel);
  langSel.setAttribute('aria-label', T.page.lang);
  toc.setAttribute('aria-label', T.page.toc);
  $('footText').textContent = T.page.footer;
  const built = typeof __BUILD_TIME__ === 'string' ? new Date(__BUILD_TIME__) : null;
  $('built').textContent = built && !Number.isNaN(built.getTime()) ? T.page.built(built.toLocaleString(L.code, { dateStyle: 'medium', timeStyle: 'short' })) : '';
  $('top').textContent = T.page.top;

  toc.replaceChildren();
  content.replaceChildren();
  for (const s of buildGuide(pack)) {
    const a = el('a', s.title);
    a.href = `#${s.id}`;
    toc.append(a);
    const sec = el('section');
    sec.id = s.id;
    sec.append(el('h2', s.title), ...s.blocks.map(drawBlock));
    content.append(sec);
  }
  applyFilter();
  measureBar();
}

/** 글자로 표의 줄을 거른다. 거르는 동안에는 설명 글을 감추고, 맞는 줄이 있는 표와 구역만 남긴다 */
function applyFilter(): void {
  const q = filter.value.trim().toLowerCase();
  let shown = 0;
  for (const sec of content.querySelectorAll<HTMLElement>('section')) {
    let any = false;
    for (const node of Array.from(sec.children) as HTMLElement[]) {
      if (node.tagName === 'H2') continue;
      if (node.tagName !== 'FIGURE') { node.hidden = q !== ''; continue; }
      let rows = 0;
      for (const tr of node.querySelectorAll<HTMLElement>('tbody tr')) {
        tr.hidden = q !== '' && !(tr.dataset.text ?? '').includes(q);
        if (!tr.hidden) rows++;
      }
      node.hidden = rows === 0;
      if (rows > 0) { any = true; shown += rows; }
    }
    sec.hidden = q !== '' && !any;
  }
  count.textContent = q === '' ? '' : shown === 0 ? pack.T.page.noMatch : pack.T.page.matched(shown);
}

for (const l of LANGS) langSel.add(new Option(l.label, l.code));
langSel.value = pack.L.code;
langSel.addEventListener('change', () => {
  pack = packOf(langSel.value) ?? pack;
  // 고른 언어를 주소에 남긴다 (새로 고치거나 주소를 건네도 같은 언어로 열린다). 게임의 언어 선택은 건드리지 않는다
  const url = new URL(location.href);
  url.searchParams.set('lang', pack.L.code);
  history.replaceState(null, '', url);
  render();
});
filter.addEventListener('input', applyFilter);
window.addEventListener('resize', measureBar);

render();
// 주소에 구역(#monsters)이 있으면 그린 뒤에 그곳으로 간다
if (location.hash.length > 1) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
