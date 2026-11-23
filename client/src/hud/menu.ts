// 메뉴 창: 드롭 장비(끼기·강화·팔기), 우편, 일일 임무와 출석, 거래소, 길드, 순위를 탭으로 나눠 보여 준다. (단축키 M)
// 새 탭을 더하려면 TABS에 이름과 그리는 함수를 더한다.
import { BUILD, BUILD_STATS, GUILD, DAILIES, DAILY_IDS, ENHANCE, GEAR, GEAR_SLOTS, ITEMS, MARKET, MARKET_FILTERS, MARKET_SORTS, MAT_MAX, RARITIES, baseOpt, enhanceMax, classOf, isItemId, isSupply, marketFee, optValue, sellPrice, type Gear, type ItemId, type MarketFilter, type MarketItem, type MarketSort, type Reward } from '../../../shared/defs';
import { $ } from '../app';
import { setGuildTag } from '../entities';
import { onMsg } from '../bus';
import { L, itemName, onLangChange, t } from '../i18n';
import type { UiKey } from '../i18n/ko';
import { send } from '../net';
import { S } from '../state';

const ui = { panel: $('menu'), tabs: $('menuTabs'), list: $('menuList'), gold: $('menuGold'), btn: $('menuBtn') };
const TABS: readonly { key: UiKey; draw: () => void }[] = [
  { key: 'tabGear', draw: drawGear },
  { key: 'tabBuild', draw: drawBuild },
  { key: 'tabMail', draw: drawMail },
  { key: 'tabDaily', draw: drawDaily },
  { key: 'tabMarket', draw: drawMarket },
  { key: 'tabGuild', draw: drawGuild },
  { key: 'tabRank', draw: drawRank },
];
let tab = 0;

function el(cls: string, text = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = text;
  return d;
}
function button(text: string, on: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'plain'; b.textContent = text; b.disabled = disabled;
  b.addEventListener('click', on);
  return b;
}
/** 한 줄: 왼쪽에 이름과 설명, 오른쪽에 단추들 */
function row(name: string, note: string, buttons: HTMLElement[] = [], cls = ''): HTMLDivElement {
  const r = el('mrow ' + cls), what = el('what');
  what.append(el('iname', name));
  if (note) what.append(el('note', note));
  const acts = el('acts');
  acts.append(...buttons);
  r.append(what, acts);
  return r;
}
const rewardText = (r: Reward): string => L().fmt.reward(r.gold ?? 0, r.exp ?? 0, r.sparks ?? 0);

/** 장비 한 점의 이름, 옵션 줄, 줄의 모양(등급 색). 장비 탭과 거래소, 우편이 같은 표시를 쓴다 */
function gearLabel(g: Gear): { name: string; opts: string; cls: string } {
  const loc = L(), me = S.me;
  // 무기와 갑옷은 바탕 아이템의 이름을 쓴다 (직업에 따라 검/활/지팡이). 사거나 만든 것은 '보급형'이라고 붙인다
  const what = isItemId(g.base) ? itemName(g.base, me?.cls ?? '') : loc.gear.slots[g.slot];
  const name = loc.fmt.gearName(what, isSupply(g) ? loc.gear.rarities.supply : g.made && !g.opts.length ? loc.gear.rarities.made : loc.gear.rarities[RARITIES[g.rar].id], g.plus, g.lv);
  const base = baseOpt(g);
  const lines = g.opts.map(([k, v]) => loc.gear.stats[k](optValue(g, v)));
  if (base && base[1] > 0) lines.unshift(loc.gear.stats[base[0]](optValue(g, base[1])));
  return { name, opts: lines.join(' · '), cls: isSupply(g) ? 'supply' : g.made && !g.opts.length ? 'made' : 'rar' + g.rar };
}
/** 우편에 붙은 물건: 장비의 이름과 아이템의 수량 */
function goodsText(r: Reward): string {
  const loc = L();
  return [...(r.gear ?? []).map((g) => gearLabel(g).name), ...Object.entries(r.items ?? {}).map(([id, n]) => loc.fmt.marketStack(isItemId(id) ? loc.items[id].name : id, n))].join(' · ');
}

function gearRow(g: Gear, worn: boolean): HTMLDivElement {
  const loc = L(), me = S.me, { name, opts, cls } = gearLabel(g);
  const cost = ENHANCE.gold(g.plus, g.rar);
  const buttons = [
    worn ? button(t('unequip'), () => send({ t: 'unequip', slot: g.slot })) : button(t('equip'), () => send({ t: 'equip', uid: g.uid })),
    button(g.plus >= enhanceMax(g) ? t('enhanceMaxed') : loc.fmt.enhanceCost(cost, Math.round(ENHANCE.rate(g.plus) * 100)), () => send({ t: 'enhance', uid: g.uid }), g.plus >= enhanceMax(g) || !me || me.gold < cost),
  ];
  if (!worn) buttons.push(button(loc.fmt.sellFor(sellPrice(g)), () => send({ t: 'sell', uid: g.uid })));
  if (worn && g.slot === 'weapon') buttons.shift(); // 무기는 빼지 못한다: 다른 무기를 끼면 바뀐다
  return row(name, opts, buttons, cls);
}

function drawGear(): void {
  const loc = L(), m = S.meta;
  ui.list.append(el('baghead', loc.fmt.power(m.power)));
  for (const slot of GEAR_SLOTS) {
    const g = m.gear.find((x) => x.uid === m.worn[slot]);
    if (g) ui.list.append(gearRow(g, true));
    else ui.list.append(row(loc.gear.slots[slot], t('none')));
  }
  const rest = m.gear.filter((x) => m.worn[x.slot] !== x.uid).sort((a, b) => b.rar - a.rar || b.lv - a.lv);
  ui.list.append(el('baghead', `${t('tabGear')} ${loc.fmt.have(m.gear.length, GEAR.bagMax)}`));
  if (!rest.length) ui.list.append(el('note', t('gearEmpty')));
  for (const g of rest) ui.list.append(gearRow(g, false));
}

function drawBuild(): void {
  const loc = L(), me = S.me, b = S.meta.build;
  if (!me) return;
  // 능력치: 남은 점수를 나눠 찍는다
  ui.list.append(el('baghead', loc.fmt.statLeft(b.left)));
  for (const k of BUILD_STATS) {
    const n = b.stats[k] ?? 0;
    ui.list.append(row(`${loc.build.stats[k].name} ${n}`, loc.build.stats[k].info(Math.round(n * BUILD[k] * 10) / 10), [button('+1', () => send({ t: 'stat', k }), b.left < 1)]));
  }
  const spent = BUILD_STATS.reduce((s, k) => s + (b.stats[k] ?? 0), 0), cost = BUILD.resetGold(me.lv);
  ui.list.append(button(loc.fmt.statResetFor(cost), () => send({ t: 'statReset' }), spent === 0 || me.gold < cost));
  // 기술: 골드로 단계를 올린다
  ui.list.append(el('baghead', t('skillUpHead')));
  for (const id of classOf(me.cls).skills) {
    const lv = b.skillLv[id] ?? 1, max = lv >= BUILD.skillMax, need = BUILD.skillNeedLv(lv), gold = BUILD.skillGold(lv);
    const note = max ? loc.fmt.skillBonus(Math.round((lv - 1) * BUILD.skillPerLevel * 100)) : `${loc.fmt.skillBonus(Math.round((lv - 1) * BUILD.skillPerLevel * 100))} · ${me.lv < need ? loc.fmt.skillNeed(need) : loc.fmt.gold(gold)}`;
    ui.list.append(row(`${loc.skills[id].name} ${loc.fmt.skillLv(lv, BUILD.skillMax)}`, note, [button(max ? t('enhanceMaxed') : t('skillUpBtn'), () => send({ t: 'skillUp', id }), max || me.lv < need || me.gold < gold)]));
  }
}

function drawMail(): void {
  const loc = L(), mail = S.meta.mail;
  if (!mail.length) { ui.list.append(el('note', t('mailEmpty'))); return; }
  ui.list.append(button(t('claimAll'), () => send({ t: 'mailClaim', id: 0 })));
  for (const m of [...mail].reverse()) ui.list.append(row(loc.fmt.mailTitle(m.k, m.a), [rewardText(m.r), goodsText(m.r)].filter(Boolean).join(' · '), [button(t('claim'), () => send({ t: 'mailClaim', id: m.id }))]));
}

function drawDaily(): void {
  const loc = L(), d = S.meta.daily;
  ui.list.append(el('baghead', loc.fmt.streak(d.streak)));
  for (const id of DAILY_IDS) {
    const def = DAILIES[id], done = d.got.includes(id);
    ui.list.append(row(loc.gear.dailies[id], rewardText(def.r), [el('num', done ? t('dailyDone') : loc.fmt.have(d.prog[id] ?? 0, def.n))], done ? 'done' : ''));
  }
  ui.list.append(el('note', t('dailyNote')));
}

/** 글을 받는 칸과 단추 한 줄 */
function field(placeholder: string, max: number, label: string, on: (text: string) => void, value = ''): HTMLDivElement {
  const box = el('mfield'), input = document.createElement('input');
  input.type = 'text'; input.maxLength = max; input.placeholder = placeholder; input.value = value;
  input.addEventListener('keydown', (e) => e.stopPropagation()); // 글을 치는 동안 단축키가 눌리지 않게
  box.append(input, button(label, () => { if (input.value.trim()) on(input.value.trim()); }));
  return box;
}

function drawGuild(): void {
  const loc = L(), me = S.me, g = S.guild, inv = S.guildInvite;
  if (!me) return;
  if (!g) {
    if (inv) {
      ui.list.append(row(loc.fmt.guildInviteFrom(inv.name, inv.from), '', [
        button(t('partyAccept'), () => send({ t: 'guild', a: 'accept' })),
        button(t('partyDecline'), () => send({ t: 'guild', a: 'decline' })),
      ]));
    }
    ui.list.append(el('note', loc.fmt.guildCreateInfo(GUILD.createLv, GUILD.createGold)));
    ui.list.append(field(t('guildNameHint'), GUILD.nameMax, t('guildCreate'), (name) => send({ t: 'guild', a: 'create', name })));
    return;
  }
  ui.list.append(el('baghead', loc.fmt.guildHead(g.name, g.lv, Math.round(g.lv * GUILD.expPerLevel * 100))));
  ui.list.append(row(g.max ? t('guildMaxLv') : loc.fmt.guildExp(g.exp, g.need), t('guildGiveInfo'),
    GUILD.gives.map((n) => button(loc.fmt.guildGive(n), () => send({ t: 'guild', a: 'give', n }), me.gold < n))));
  if (g.notice) ui.list.append(el('note', g.notice));
  if (g.leader) ui.list.append(field(t('guildNoticeHint'), GUILD.noticeMax, t('guildNoticeSet'), (text) => send({ t: 'guild', a: 'notice', text }), g.notice));
  ui.list.append(el('baghead', loc.fmt.guildMembers(g.members.length, GUILD.maxMembers)));
  for (const m of [...g.members].sort((a, b) => Number(b.on) - Number(a.on) || b.gave - a.gave)) {
    const buttons = g.leader && !m.me && m.pid ? [button(t('guildKick'), () => send({ t: 'guild', a: 'kick', pid: m.pid }))] : [];
    ui.list.append(row(`${m.on ? '● ' : '○ '}${m.name}${m.leader ? ` (${t('guildLeader')})` : ''}`, `${loc.fmt.level(m.lv, loc.classes[m.cls as keyof typeof loc.classes]?.name ?? '')} · ${loc.fmt.guildGave(m.gave)}`, buttons, m.me ? 'mine' : m.on ? '' : 'done'));
  }
  ui.list.append(el('note', t('guildChatHint')));
  ui.list.append(button(t('guildLeave'), () => send({ t: 'guild', a: 'leave' })));
}

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

function marketAsk(): void { mk.armed = 0; send({ t: 'market', a: 'list', f: mk.f, sort: mk.sort, page: mk.page }); }
/** 거래소 탭을 열 때: 목록과 내 물건을 새로 받는다 */
function marketOpen(): void { marketAsk(); send({ t: 'market', a: 'mine' }); }

/** 고르는 단추 한 줄 (화면, 거르는 종류). 켜진 것은 금색이다 */
function chips(items: { text: string; on?: boolean; off?: boolean; click: () => void }[]): HTMLDivElement {
  const box = el('mchips');
  for (const x of items) { const b = button(x.text, x.click, x.off); b.classList.toggle('on', !!x.on); box.append(b); }
  return box;
}
/** 숫자만 받는 칸. 적은 값은 on으로 넘겨서, 화면을 다시 그려도 남게 한다 */
function numInput(placeholder: string, value: string, max: number, on: (text: string) => void, enter: () => void): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = max; input.placeholder = placeholder; input.value = value;
  input.setAttribute('aria-label', placeholder);
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') enter(); }); // 글을 치는 동안 단축키가 눌리지 않게
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); on(input.value); });
  return input;
}
const matName = (id: string | undefined): string => (isItemId(id) ? L().items[id].name : String(id ?? ''));
/** 거래소에 올라온 물건 한 줄 */
function marketRow(x: MarketItem, extra: string, buttons: HTMLElement[]): HTMLDivElement {
  const label = x.gear ? gearLabel(x.gear) : { name: L().fmt.marketStack(matName(x.item), x.n), opts: '', cls: '' };
  return row(label.name, [label.opts, extra].filter(Boolean).join(' · '), buttons, x.mine ? 'mine' : label.cls);
}

function drawMarketBrowse(): void {
  const loc = L(), me = S.me;
  if (!me) return;
  ui.list.append(chips(MARKET_FILTERS.map((f) => ({
    text: f === 'all' ? t('marketAll') : f === 'mat' ? t('marketMat') : loc.gear.slots[f], on: mk.f === f,
    click: () => { mk.f = f; mk.page = 0; marketAsk(); renderMenu(); },
  }))));
  ui.list.append(chips([
    { text: t(SORT_KEYS[mk.sort]), click: () => { mk.sort = MARKET_SORTS[(MARKET_SORTS.indexOf(mk.sort) + 1) % MARKET_SORTS.length]; mk.page = 0; marketAsk(); renderMenu(); } },
    { text: t('marketRefresh'), click: marketAsk },
    { text: t('marketPrev'), off: mk.page <= 0, click: () => { mk.page--; marketAsk(); } },
    { text: t('marketNext'), off: mk.page >= mk.pages - 1, click: () => { mk.page++; marketAsk(); } },
  ]));
  ui.list.append(el('baghead', loc.fmt.marketPage(mk.page + 1, mk.pages, mk.total)));
  if (!mk.list.length) ui.list.append(el('note', t('marketEmpty')));
  for (const x of mk.list) {
    const short = me.gold < x.price, armed = mk.armed === x.id;
    const buy = button(armed ? loc.fmt.marketConfirm(x.price) : loc.fmt.marketBuy(x.price), () => {
      if (!armed) { mk.armed = x.id; renderMenu(); return; }
      send({ t: 'market', a: 'buy', id: x.id });
      marketAsk(); // 산 물건이 목록에서 빠지게 바로 새로 받는다
    }, mk.guest || x.mine || short);
    ui.list.append(marketRow(x, [loc.fmt.marketSeller(x.seller), !x.mine && short ? loc.fmt.short(x.price - me.gold) : ''].filter(Boolean).join(' · '), [buy]));
  }
}

function drawMarketMine(): void {
  const loc = L(), passed = (performance.now() - mk.mineAt) / 1000;
  ui.list.append(el('baghead', loc.fmt.marketMineHead(mk.mine.length, MARKET.maxListings)));
  if (!mk.mine.length) ui.list.append(el('note', t('marketMineEmpty')));
  for (const x of mk.mine) {
    const min = Math.max(0, Math.floor((x.left - passed) / 60));
    ui.list.append(marketRow({ ...x, mine: false }, `${loc.fmt.marketPrice(x.price)} · ${loc.fmt.marketLeft(Math.floor(min / 60), min % 60)}`, [button(t('marketCancel'), () => send({ t: 'market', a: 'cancel', id: x.id }))]));
  }
}

function drawMarketPost(): void {
  const loc = L(), me = S.me, m = S.meta;
  if (!me || mk.guest) return;
  // 올릴 수 있는 것: 끼고 있지 않고 보급형이 아닌 장비, 그리고 가진 제작 재료
  const gear = m.gear.filter((x) => m.worn[x.slot] !== x.uid && !isSupply(x)).sort((a, b) => b.rar - a.rar || b.lv - a.lv);
  const mats = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].kind === 'mat' && (me.items[id] ?? 0) > 0);
  const full = mk.mine.length >= MARKET.maxListings;
  ui.list.append(el('note', loc.fmt.marketFeeInfo(Math.round(MARKET.tax * 100), MARKET.hours)));
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
      renderMenu();
    });
    // 값을 적는 동안 받게 될 금액을 바로 보여 준다 (적는 중에는 창을 다시 그리지 않으므로 여기서 직접 고친다)
    const show = () => {
      const v = read();
      note.textContent = !v.okN ? loc.fmt.marketCountRange(have) : !v.okPrice ? loc.fmt.marketPriceRange(MARKET.maxPrice) : loc.fmt.marketNet(v.price, marketFee(v.price), v.price - marketFee(v.price));
      post.disabled = full || !v.okPrice || !v.okN;
    };
    if (item) {
      const count = numInput(t('marketCountHint'), mk.n, String(MAT_MAX).length, (s) => { mk.n = s; show(); }, () => post.click());
      count.classList.add('short');
      box.append(count);
    }
    box.append(numInput(t('marketPriceHint'), mk.price, String(MARKET.maxPrice).length, (s) => { mk.price = s; show(); }, () => post.click()), post);
    show();
    ui.list.append(box, note);
  } else if (gear.length || mats.length) ui.list.append(el('note', t('marketPickHint')));
  else ui.list.append(el('note', t('marketPostEmpty')));

  const choose = (next: { uid: number } | { item: ItemId }, n: number) => { mk.pick = next; mk.price = ''; mk.n = String(n); renderMenu(); ui.list.scrollTop = 0; };
  if (gear.length) ui.list.append(el('baghead', t('tabGear')));
  for (const g of gear) {
    const label = gearLabel(g);
    ui.list.append(row(label.name, label.opts, [button(t('marketPick'), () => choose({ uid: g.uid }, 1), picked === g)], label.cls));
  }
  if (mats.length) ui.list.append(el('baghead', t('bagMats')));
  for (const id of mats) ui.list.append(row(loc.items[id].name, loc.fmt.have(me.items[id] ?? 0, MAT_MAX), [button(t('marketPick'), () => choose({ item: id }, me.items[id] ?? 1), item === id)]));
}

function drawMarket(): void {
  ui.list.append(chips([
    { text: t('marketBrowse'), on: mk.view === 'browse', click: () => { mk.view = 'browse'; marketAsk(); renderMenu(); } },
    { text: mk.mine.length ? `${t('marketMine')} ${mk.mine.length}` : t('marketMine'), on: mk.view === 'mine', click: () => { mk.view = 'mine'; mk.armed = 0; send({ t: 'market', a: 'mine' }); renderMenu(); } },
    { text: t('marketPost'), on: mk.view === 'post', off: mk.guest, click: () => { mk.view = 'post'; mk.armed = 0; renderMenu(); } },
  ]));
  if (mk.guest) ui.list.append(el('note', t('marketGuestNote')));
  if (mk.view === 'mine') drawMarketMine(); else if (mk.view === 'post' && !mk.guest) drawMarketPost(); else drawMarketBrowse();
}

function drawRank(): void {
  const loc = L(), r = S.rank;
  if (!r.list.length) { ui.list.append(el('note', t('rankEmpty'))); return; }
  r.list.forEach((x, i) => ui.list.append(row(`${i + 1}. ${x.name}`, loc.fmt.level(x.lv, loc.classes[x.cls as keyof typeof loc.classes]?.name ?? ''), [el('num', loc.fmt.power(x.power))], i === r.me ? 'mine' : '')));
}

/** 내 장비·우편·일일 임무·순위나 언어가 바뀌면 다시 그린다 (열려 있을 때만). 단추의 우편 수는 늘 맞춘다. */
export function renderMenu(): void {
  const n = S.meta.mail.length;
  ui.btn.textContent = n ? `${t('menu')} ${n}` : t('menu');
  ui.btn.classList.toggle('alert', n > 0 || S.meta.build.left > 0 || !!S.guildInvite); // 받을 우편이나 찍을 점수가 있으면 눈에 띄게
  if (ui.panel.hidden || !S.me) return;
  if (document.activeElement instanceof HTMLInputElement && ui.list.contains(document.activeElement)) { ui.gold.textContent = L().fmt.gold(S.me.gold); return; } // 글을 치는 중에는 다시 그리지 않는다
  ui.gold.textContent = L().fmt.gold(S.me.gold);
  ui.tabs.textContent = '';
  TABS.forEach((x, i) => {
    const b = button(t(x.key) + (x.draw === drawBuild && S.meta.build.left > 0 ? ' •' : x.draw === drawMail && S.meta.mail.length ? ' •' : ''), () => { tab = i; if (TABS[i].draw === drawRank) send({ t: 'rank' }); if (TABS[i].draw === drawMarket) marketOpen(); renderMenu(); });
    b.classList.toggle('on', i === tab);
    ui.tabs.append(b);
  });
  const top = ui.list.scrollTop;
  ui.list.textContent = '';
  TABS[tab].draw();
  ui.list.scrollTop = top;
}

export function toggleMenu(): void {
  if (!S.me) return;
  ui.panel.hidden = !ui.panel.hidden;
  if (!ui.panel.hidden && TABS[tab].draw === drawRank) send({ t: 'rank' });
  if (!ui.panel.hidden && TABS[tab].draw === drawMarket) marketOpen();
  renderMenu();
}

export function initMenu(): void {
  ui.btn.addEventListener('click', (e) => { toggleMenu(); (e.currentTarget as HTMLElement).blur(); });
  $('menuClose').addEventListener('click', () => { ui.panel.hidden = true; });
  onMsg('meta', (m) => { S.meta = { gear: m.gear, worn: m.worn, mail: m.mail, daily: m.daily, power: m.power, build: m.build }; renderMenu(); });
  onMsg('guild', (m) => { S.guild = m.g; S.guildInvite = m.invite ?? null; renderMenu(); });
  onMsg('gtag', (m) => setGuildTag(m.id, m.g));
  onMsg('market', (m) => {
    mk.guest = !!m.guest;
    if (m.v === 'mine') { mk.mine = m.list; mk.mineAt = performance.now(); }
    else { mk.list = m.list; mk.page = m.page; mk.pages = m.pages; mk.total = m.total; mk.armed = 0; }
    renderMenu();
  });
  onMsg('rank', (m) => { S.rank = { list: m.list, me: m.me }; renderMenu(); });
  onMsg('stat', renderMenu); // 골드가 바뀌면 강화 단추의 상태도 바뀐다
  onLangChange(renderMenu);
}
