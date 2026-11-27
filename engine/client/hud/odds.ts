// 확률표 창 (odds 모듈): 메뉴의 '확률' 탭. 서버가 보낸 공개 모양(OddsPublic: 공개 페이지 odds.json과 같은 것)을 그린다:
//   표마다 종류·버전·값·한정·천장·10번 보장·보호, 단계마다의 결과와 확률(강화는 +0, +1 … 단계마다), 실효 확률, 예정된 변경, 최근 변경 이력(전 → 후).
//   '내 추첨 기록'은 서버의 추첨 기록에서 내 것(최근 100건): 시각, 종류, 표의 버전, 결과.
//   '게임 밖에서 보기'는 같은 서버의 odds.html을 연다 (바깥 링크를 열 수 있는 플랫폼만: 포털 안에서는 단추가 없다).
// 서버의 짝은 engine/server/game/systems/odds.ts, 표의 모양과 굴림은 engine/shared/defs/odds.ts. 문장은 i18n의 ui·fmt와 oddsPage(공개 페이지와 같은 문장).
import { oddsPct, outcomeLabel, type DrawRow, type OddsPublic, type OddsTable, type OddsWhen } from '../../shared/defs';
import { onMsg } from '../bus';
import { L, t } from '../i18n';
import { heroName, rarityName } from '../i18n/ko';
import { uiText } from '../i18n/names';
import { send } from '../net';
import { platform } from '../platform';
import { addMenuTab } from './menu';
import { button, chips, el, redraw } from './menu/parts';

let pub: OddsPublic | null = null;
let mine: DrawRow[] | null = null;
let view: 'tables' | 'mine' = 'tables';
/** 펼친 표 (처음에는 첫 표만) */
const shut = new Set<string>();

const fill = (s: string, a: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => (a[k] !== undefined ? String(a[k]) : ''));
const words = () => L().oddsPage;
/** 표의 이름: 틀의 낱말(강화)이면 그 문장, 아니면 게임의 문장 키 */
const tableName = (t: Pick<OddsTable, 'name'>): string => words().words[t.name] ?? uiText.get(t.name);
const outName = (tb: Pick<OddsTable, 'kind'>, id: string): string => {
  const base = id.replace(/:guard$/, '');
  if (tb.kind === 'enhance') return words().words[outcomeLabel(tb, base).key] ?? base;
  const l = outcomeLabel(tb, base);
  return l.text ?? (l.key === base ? heroName(base) : uiText.get(l.key));
};
const whenText = (x: OddsWhen): string => {
  const w = words(), r = x.r !== undefined ? rarityName(x.r) : '';
  const s = x.k === 'base' ? w.base : x.k === 'pity' ? fill(w.pity, { n: x.n ?? '', r }) : x.k === 'ten' ? fill(w.ten, { r }) : x.k === 'plus' ? fill(w.plus, { n: x.n ?? '' }) : fill(w.roll, { n: x.n ?? '' });
  return x.sure ? `${s} · ${w.sure}` : s;
};

function rateTable(rows: { id: string; p: number; r?: number }[], tb: OddsTable): HTMLTableElement {
  const table = document.createElement('table');
  for (const o of rows) {
    const tr = table.insertRow();
    const a = tr.insertCell(); a.className = 'rn'; a.textContent = outName(tb, o.id);
    if (tb.kind !== 'enhance') tr.insertCell().textContent = o.r !== undefined ? rarityName(o.r) : '';
    tr.insertCell().textContent = oddsPct(o.p);
  }
  return table;
}

function drawTable(list: HTMLElement, tb: OddsTable, first: boolean): void {
  const w = words(), box = el('gbanner oddsT');
  const open = first ? !shut.has(tb.id) : shut.has(tb.id);
  const head = el('ttitle', `${tableName(tb)} · ${w.kinds[tb.kind] ?? tb.kind} · ${L().fmt.oddsVersion(tb.version)}`);
  box.append(head);
  box.append(button(t(open ? 'gachaRatesHide' : 'gachaRates'), () => { if (shut.has(tb.id)) shut.delete(tb.id); else shut.add(tb.id); redraw(); }));
  if (!open) { list.append(box); return; }
  const wrap = el('grates');
  if (tb.limited) {
    const bits: string[] = [];
    if (tb.limited.from !== undefined) bits.push(fill(w.from, { at: new Date(tb.limited.from).toLocaleString() }));
    if (tb.limited.to !== undefined) bits.push(fill(w.to, { at: new Date(tb.limited.to).toLocaleString() }));
    if (tb.limited.total !== undefined) bits.push(fill(w.total, { n: tb.limited.total }));
    wrap.append(el('note', `${w.limited} · ${bits.join(' · ')}`));
  }
  if (tb.pity) wrap.append(el('note', fill(w.pityRule, { n: tb.pity.after, r: tb.pity.r !== undefined ? rarityName(tb.pity.r) : '' })));
  if (tb.ten) wrap.append(el('note', fill(w.tenRule, { r: tb.ten.r !== undefined ? rarityName(tb.ten.r) : '' })));
  if (tb.guard) wrap.append(el('note', fill(w.guard, { item: uiText.get(tb.guard) })));
  for (const s of tb.steps) wrap.append(el('ghd', s.when.map(whenText).join(' / ') || s.key), rateTable([...s.outcomes], tb));
  if (tb.effective?.length) wrap.append(el('ghd', w.effective), el('note', w.effectiveNote), rateTable([...tb.effective], tb));
  box.append(wrap);
  list.append(box);
}

function drawTables(list: HTMLElement): void {
  if (!pub) { list.append(el('note', t('oddsLoading'))); return; }
  const w = words();
  list.append(el('note', w.lead));
  if (pub.plans.length) {
    list.append(el('baghead', t('oddsPlans')));
    for (const p of pub.plans) { const tb = pub.tables.find((x) => x.id === p.table); list.append(el('note', `${tb ? tableName(tb) : p.table} · ${fill(w.planAt, { at: new Date(p.at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', local: new Date(p.at).toLocaleString() })} · ${p.text[L().code] ?? p.text.ko ?? Object.values(p.text)[0] ?? ''}`)); }
  }
  if (!pub.tables.length) list.append(el('note', w.none));
  pub.tables.forEach((tb, i) => drawTable(list, tb, i === 0));
  list.append(el('baghead', t('oddsHistory')));
  if (!pub.history.length) list.append(el('note', w.noHistory));
  for (const h of pub.history.slice(0, 10)) {
    const tb = pub.tables.find((x) => x.id === h.table);
    const why = h.why === 'boot' ? w.whyBoot : h.why === 'auto' ? w.whyAuto : h.why.startsWith('live:') ? w.whyLive : h.why === 'admin' ? w.whyAdmin : h.why;
    const line = el('glog');
    const b = document.createElement('b'); b.textContent = `${tb ? tableName(tb) : h.table} v${h.ver}`;
    const ch = h.gone ? w.gone : h.changes?.length ? h.changes.slice(0, 3).map((c) => `${c.step} ${tb ? outName(tb, c.id) : c.id}: ${c.a === null ? '-' : oddsPct(c.a)} → ${c.b === null ? '-' : oddsPct(c.b)}`).join(', ') + (h.changes.length > 3 ? ' …' : '') : h.ver === 1 ? w.first : '';
    line.append(b, el('note', `${why}${ch ? ` · ${ch}` : ''} · ${new Date(h.at).toLocaleString()}`));
    list.append(line);
  }
}

function drawMine(list: HTMLElement): void {
  if (mine === null) { list.append(el('note', t('oddsLoading'))); return; }
  if (!mine.length) { list.append(el('note', t('oddsMineNone'))); return; }
  const loc = L();
  for (const r of mine) {
    const tb = pub?.tables.find((x) => x.id === r.table) ?? { kind: r.kind === 'enhance' ? 'enhance' as const : 'capsule' as const };
    const line = el('glog');
    const b = document.createElement('b');
    b.textContent = r.got.map((id) => outName(tb, id)).join(', ');
    line.append(b, el('note', loc.fmt.oddsDrawHead(r.at, r.kind, r.ver)));
    list.append(line);
  }
}

function draw(list: HTMLElement): void {
  list.append(chips([
    { text: t('oddsTables'), on: view === 'tables', click: () => { view = 'tables'; redraw(); } },
    { text: t('oddsMine'), on: view === 'mine', click: () => { view = 'mine'; send({ t: 'odds', a: 'mine' }); redraw(); } },
  ]));
  if (platform().has('link.external')) list.append(button(t('oddsPageLink'), () => { void platform().openUrl(`./odds.html?lang=${L().code}`); }));
  if (view === 'tables') drawTables(list); else drawMine(list);
}

export function initOdds(): void {
  // always: 게임이 보일 탭을 골랐어도(setMenuTabs) 확률표는 늘 보인다 (확률 정보는 구매·조회 화면에서 늘 볼 수 있어야 한다: docs/genre-features.md 7절 5번). 목록에 넣으면 그 자리에
  addMenuTab({ id: 'odds', label: () => t('tabOdds'), draw, open: () => { send({ t: 'odds', a: 'tables' }); send({ t: 'odds', a: 'mine' }); }, sig: () => [pub?.at, mine, view, [...shut]], mod: 'odds', always: true });
  onMsg('odds', (m) => { if (m.a === 'tables') pub = m.pub; else mine = m.rows; redraw(true); });
  onMsg('welcome', () => { pub = null; mine = null; });
}
