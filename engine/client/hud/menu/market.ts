// 메뉴의 거래소 탭: 둘러보기(종류·정렬·쪽), 내 물건, 올리기.
import { ENHANCE, ITEMS, MARKET, MARKET_FILTERS, MARKET_SORTS, isItemId, isSupply, itemCap, itemDef, marketFee, type Gear, type ItemId, type MarketFilter, type MarketItem, type MarketSort } from '../../../shared/defs';
import type { ServerMsg } from '../../../shared/protocol';
import { L, t } from '../../i18n';
import type { UiKey } from '../../i18n/ko';
import { send } from '../../net';
import { S } from '../../state';
import { gearLabel } from './gear';
import { button, chips, el, emptyState, gearTitle, lockBand, numInput, optsEl, redraw, row, select, ui, whyOf } from './parts';
import { unlockHint } from '../reward';

// ---------- 거래소 ----------
/** 거래소 탭의 상태: 보고 있는 화면, 목록을 거른 조건, 서버가 준 목록, 올리려고 고른 물건과 적던 값 */
const mk = {
  view: 'browse' as 'browse' | 'mine' | 'post',
  f: 'all' as MarketFilter, sort: 'new' as MarketSort, page: 0, pages: 1, total: 0,
  list: [] as MarketItem[], mine: [] as MarketItem[],
  /** 내 물건 목록을 받은 시각: 남은 시간을 여기서부터 센다 */
  mineAt: 0,
  guest: false,
  /** 사기 단추를 한 번 누른 물건의 번호. 한 번 더 눌러야 산다 (값이 큰 물건을 잘못 눌러 사지 않게) */
  armed: 0,
  pick: null as { uid: number } | { item: ItemId } | null,
  price: '', n: '',
};
const SORT_KEYS: Record<MarketSort, UiKey> = { new: 'marketSortNew', cheap: 'marketSortCheap', costly: 'marketSortCostly' };
const filterName = (f: MarketFilter): string => (f === 'all' ? t('marketAll') : f === 'mat' ? t('marketMat') : L().gear.slots[f]);

function marketAsk(): void { mk.armed = 0; send({ t: 'market', a: 'list', f: mk.f, sort: mk.sort, page: mk.page }); }
/** 거래소 탭을 열 때: 목록과 내 물건을 새로 받는다 */
export function marketOpen(): void { marketAsk(); send({ t: 'market', a: 'mine' }); }

const matName = (id: string | undefined): string => (isItemId(id) ? L().items[id].name : String(id ?? ''));
/** 거래소에 올라온 물건 한 줄 */
function marketRow(x: MarketItem, extra: string[], buttons: HTMLElement[]): HTMLDivElement {
  const label = x.gear ? gearLabel(x.gear) : null;
  if (!label) return row(L().fmt.marketStack(matName(x.item), x.n), optsEl(extra), buttons, x.mine ? 'mine' : '');
  return row(gearTitle(label.slot, label.name), optsEl([...label.opts, ...extra]), buttons, x.mine ? 'mine' : label.cls);
}

/** 둘러보기의 도구들을 한 줄로: 종류, 정렬, 새로 고침, 쪽 넘기기. 화면 고르는 단추와 같은 줄(좁으면 그 아래 한 줄)에 놓인다 */
function marketTools(): HTMLDivElement {
  const loc = L(), box = el('mtools');
  const icon = (glyph: string, label: UiKey, on: () => void, off = false) => { const b = button(glyph, on, off); b.setAttribute('aria-label', t(label)); b.title = t(label); b.classList.add('icon'); return b; };
  box.append(
    select(t('marketFilter'), MARKET_FILTERS, mk.f, filterName, (f) => { mk.f = f; mk.page = 0; marketAsk(); redraw(); }),
    select(t('marketSort'), MARKET_SORTS, mk.sort, (s) => t(SORT_KEYS[s]), (s) => { mk.sort = s; mk.page = 0; marketAsk(); redraw(); }),
    icon('↻', 'marketRefresh', marketAsk),
    icon('‹', 'marketPrev', () => { mk.page--; marketAsk(); }, mk.page <= 0),
    el('num mpage', loc.fmt.marketPageShort(mk.page + 1, mk.pages, mk.total)),
    icon('›', 'marketNext', () => { mk.page++; marketAsk(); }, mk.page >= mk.pages - 1),
  );
  return box;
}

function drawMarketBrowse(): void {
  const loc = L(), me = S.me;
  if (!me) return;
  const low = me.lv < MARKET.minLv;
  if (!mk.list.length) ui.list.append(emptyState('⚖', t('marketEmpty'), mk.guest || low ? undefined : { label: t('emptyToPost'), onClick: () => { mk.view = 'post'; redraw(); } }));
  for (const x of mk.list) {
    const short = me.gold < x.price, armed = mk.armed === x.id;
    const buy = button(armed ? loc.fmt.marketConfirm(x.price) : loc.fmt.marketBuy(x.price), () => {
      if (!armed) { mk.armed = x.id; redraw(); return; }
      send({ t: 'market', a: 'buy', id: x.id });
      marketAsk(); // 산 물건이 목록에서 빠지게 바로 새로 받는다
    }, mk.guest || x.mine || short || low);
    // 흐린 까닭 (U2): 레벨이 모자람(언제 열리는지) · 골드가 모자람
    if (!mk.guest && !x.mine) whyOf(buy, low ? unlockHint('market') : short ? loc.fmt.short(x.price - me.gold) : '');
    buy.classList.toggle('armed', armed);
    ui.list.append(marketRow(x, [loc.fmt.marketSeller(x.seller)], [buy]));
  }
}

function drawMarketMine(): void {
  const loc = L(), passed = (performance.now() - mk.mineAt) / 1000;
  ui.list.append(el('baghead', loc.fmt.marketMineHead(mk.mine.length, MARKET.maxListings)));
  if (!mk.mine.length) ui.list.append(emptyState('⚖', t('marketMineEmpty'), mk.guest || (S.me?.lv ?? 0) < MARKET.minLv ? undefined : { label: t('emptyToPost'), onClick: () => { mk.view = 'post'; redraw(); } }));
  for (const x of mk.mine) {
    const min = Math.max(0, Math.floor((x.left - passed) / 60));
    ui.list.append(marketRow({ ...x, mine: false }, [loc.fmt.marketPrice(x.price), loc.fmt.marketLeft(Math.floor(min / 60), min % 60)], [button(t('marketCancel'), () => send({ t: 'market', a: 'cancel', id: x.id }))]));
  }
}

function drawMarketPost(): void {
  const loc = L(), me = S.me, m = S.meta;
  if (!me || mk.guest) return;
  // 올릴 수 있는 것: 끼고 있지 않고 보급형이 아닌 장비, 그리고 가진 제작 재료
  // 강화해서 귀속된 장비(ENHANCE.bindPlus 이상)는 고를 수 없게 뺀다 (검토 6: 골라도 서버가 거절하고 그 안내가 창에 가렸다)
  const bound = (x: Gear): boolean => ENHANCE.bindPlus > 0 && x.plus >= ENHANCE.bindPlus;
  const gear = m.gear.filter((x) => m.worn[x.slot] !== x.uid && !isSupply(x) && !x.lock && !bound(x)).sort((a, b) => b.rar - a.rar || b.lv - a.lv);
  const boundN = m.gear.filter((x) => m.worn[x.slot] !== x.uid && bound(x)).length;
  const mats = (Object.keys(ITEMS) as ItemId[]).filter((id) => itemDef(id).kind === 'mat' && (me.items[id] ?? 0) > 0);
  const full = mk.mine.length >= MARKET.maxListings;
  ui.list.append(el('note', loc.fmt.marketFeeInfo(Math.round(MARKET.tax * 100), MARKET.hours)));
  if (boundN > 0) ui.list.append(el('note', loc.fmt.marketBoundNote(boundN, ENHANCE.bindPlus)));
  if (full) ui.list.append(el('note', loc.msg.marketFull([MARKET.maxListings])));

  // 고른 물건이 그사이 사라졌으면(팔았거나 꼈거나 썼으면) 고르기 전으로 돌아간다
  const pick = mk.pick, picked = pick && 'uid' in pick ? gear.find((x) => x.uid === pick.uid) : undefined;
  const item = pick && 'item' in pick && mats.includes(pick.item) ? pick.item : undefined;
  if (pick && !picked && !item) mk.pick = null;
  if (picked || item) {
    const have = item ? me.items[item] ?? 0 : 1;
    ui.list.append(el('baghead', loc.fmt.marketPicked(picked ? gearLabel(picked).name : matName(item))));
    const box = el('mfield'), note = el('note');
    const read = () => {
      const price = /^\d+$/.test(mk.price) ? Number(mk.price) : 0, n = item ? (/^\d+$/.test(mk.n) ? Number(mk.n) : 0) : 1;
      return { price, n, okPrice: price >= 1 && price <= MARKET.maxPrice, okN: n >= 1 && n <= have };
    };
    const post = button(t('marketPost'), () => {
      const v = read();
      if (!v.okPrice || !v.okN || full) return;
      send(picked ? { t: 'market', a: 'post', uid: picked.uid, price: v.price } : { t: 'market', a: 'post', item, n: v.n, price: v.price });
      mk.pick = null; mk.price = ''; mk.n = '';
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); // Enter로 올렸으면 칸에 커서가 남아 창이 다시 그려지지 않는다
      redraw();
    });
    // 값을 적는 동안 받게 될 금액을 바로 보여 준다 (적는 중에는 창을 다시 그리지 않으므로 여기서 직접 고친다)
    const show = () => {
      const v = read();
      note.textContent = !v.okN ? loc.fmt.marketCountRange(have) : !v.okPrice ? loc.fmt.marketPriceRange(MARKET.maxPrice) : loc.fmt.marketNet(v.price, marketFee(v.price), v.price - marketFee(v.price));
      post.disabled = full || !v.okPrice || !v.okN;
    };
    if (item) {
      const count = numInput(t('marketCountHint'), mk.n, String(itemCap(item)).length, (s) => { mk.n = s; show(); }, () => post.click());
      count.classList.add('short');
      box.append(count);
    }
    box.append(numInput(t('marketPriceHint'), mk.price, String(MARKET.maxPrice).length, (s) => { mk.price = s; show(); }, () => post.click()), post);
    show();
    ui.list.append(box, note);
  } else if (gear.length || mats.length) ui.list.append(el('note', t('marketPickHint')));
  else ui.list.append(emptyState('⚖', t('marketPostEmpty')));

  const choose = (next: { uid: number } | { item: ItemId }, n: number) => { mk.pick = next; mk.price = ''; mk.n = String(n); redraw(); ui.list.scrollTop = 0; };
  if (gear.length) ui.list.append(el('baghead', t('tabGear')));
  for (const g of gear) {
    const label = gearLabel(g);
    ui.list.append(row(gearTitle(label.slot, label.name), optsEl(label.opts), [button(t('marketPick'), () => choose({ uid: g.uid }, 1), picked === g)], label.cls));
  }
  if (mats.length) ui.list.append(el('baghead', t('bagMats')));
  for (const id of mats) ui.list.append(row(loc.items[id].name, loc.fmt.haveBig(me.items[id] ?? 0, itemCap(id)), [button(t('marketPick'), () => choose({ item: id }, me.items[id] ?? 1), item === id)]));
}

export function drawMarket(): void {
  // 화면 고르기와 둘러보기 도구를 한 묶음으로 창 위쪽에 붙여 둔다 (목록을 내려도 따라온다)
  const bar = el('mbar');
  bar.append(chips([
    { text: t('marketBrowse'), on: mk.view === 'browse', click: () => { mk.view = 'browse'; marketAsk(); redraw(); } },
    { text: mk.mine.length ? `${t('marketMine')} ${mk.mine.length}` : t('marketMine'), on: mk.view === 'mine', click: () => { mk.view = 'mine'; mk.armed = 0; send({ t: 'market', a: 'mine' }); redraw(); } },
    { text: t('marketPost'), on: mk.view === 'post', off: mk.guest, click: () => { mk.view = 'post'; mk.armed = 0; redraw(); } },
  ]));
  if (mk.view === 'browse' || (mk.view === 'post' && mk.guest)) bar.append(marketTools());
  ui.list.append(bar);
  if (mk.guest) ui.list.append(el('note', t('marketGuestNote')));
  // 잠김 (U2): 레벨이 모자라면 사고팔기가 언제 열리는지 (둘러보기는 된다)
  else if (S.me && S.me.lv < MARKET.minLv) ui.list.append(lockBand(L().msg.marketNeedLv([MARKET.minLv])));
  if (mk.view === 'mine') drawMarketMine(); else if (mk.view === 'post' && !mk.guest) drawMarketPost(); else drawMarketBrowse();
}

/** 서버의 거래소 목록 (둘러보기, 내 물건) */
export function onMarketMsg(m: Extract<ServerMsg, { t: 'market' }>): void {
    mk.guest = !!m.guest;
    if (m.v === 'mine') { mk.mine = m.list; mk.mineAt = performance.now(); }
    else { mk.list = m.list; mk.page = m.page; mk.pages = m.pages; mk.total = m.total; mk.armed = 0; }
    redraw();
}
