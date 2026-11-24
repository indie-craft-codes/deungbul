// 메뉴 창: 드롭 장비(끼기·강화·팔기), 우편, 일일 임무와 출석, 거래소, 길드, 순위를 탭으로 나눠 보여 준다. (단축키 M)
// 새 탭을 더하려면 TABS에 이름과 그리는 함수를 더한다.
// 창의 높이와 탭 줄, 닫기 단추의 자리는 고정이고(style.css의 #menu) 내용만 창 안에서 스크롤한다.
import { BUILD, BUILD_STATS, GUILD, DAILIES, DAILY_IDS, ENHANCE, GEAR, GEAR_SLOTS, ITEMS, MARKET, MARKET_FILTERS, MARKET_SORTS, MAT_MAX, RARITIES, baseOpt, enhanceMax, classOf, isItemId, isSupply, marketFee, optValue, sellPrice, type Gear, type ItemId, type MarketFilter, type MarketItem, type MarketSort, type Reward, type Stat } from '../../../shared/defs';
import { $ } from '../app';
import { setGuildTag } from '../entities';
import { onMsg, onSlow } from '../bus';
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
/** 마지막으로 그린 내용의 지문 (같으면 다시 그리지 않는다) */
let lastSig = '';

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
/** 한 줄: 왼쪽에 이름과 설명, 오른쪽에 단추들. 이름과 설명은 글이거나 미리 만든 요소다 */
function row(name: string | HTMLElement, note: string | HTMLElement, buttons: HTMLElement[] = [], cls = ''): HTMLDivElement {
  const r = el('mrow ' + cls), what = el('what');
  what.append(typeof name === 'string' ? el('iname', name) : name);
  if (note) what.append(typeof note === 'string' ? el('note', note) : note);
  const acts = el('acts');
  acts.append(...buttons);
  r.append(what, acts);
  return r;
}
const rewardText = (r: Reward): string => L().fmt.reward(r.gold ?? 0, r.exp ?? 0, r.sparks ?? 0);

/** 장비의 이름 앞에 어느 칸의 장비인지 작은 표를 붙인다 (반지·목걸이·부적은 이름만으로 구별하기 어렵다) */
function gearTitle(slot: string, name: string): HTMLDivElement {
  const d = el('iname'), s = document.createElement('span');
  s.className = 'mslot'; s.textContent = slot;
  d.append(s, name);
  return d;
}
/** 옵션 줄: 옵션 하나하나를 줄이 바뀌지 않는 덩어리로 넣어서 '받는 / 피해 -4%'처럼 중간에서 끊기지 않게 한다 */
function optsEl(parts: string[]): HTMLElement | '' {
  const list = parts.filter(Boolean);
  if (!list.length) return '';
  const d = el('note');
  list.forEach((p, i) => {
    const s = document.createElement('span');
    s.className = 'opt'; s.textContent = p;
    if (i) d.append(' · ');
    d.append(s);
  });
  return d;
}

/** 장비 한 점의 칸 이름, 이름, 옵션들, 줄의 모양(등급 색). 장비 탭과 거래소, 우편이 같은 표시를 쓴다 */
function gearLabel(g: Gear): { slot: string; name: string; opts: string[]; cls: string } {
  const loc = L(), me = S.me;
  // 무기와 갑옷은 바탕 아이템의 이름을 쓴다 (직업에 따라 검/활/지팡이). 사거나 만든 것은 '보급형'이라고 붙인다
  const what = isItemId(g.base) ? itemName(g.base, me?.cls ?? '') : loc.gear.slots[g.slot];
  const name = loc.fmt.gearName(what, isSupply(g) ? loc.gear.rarities.supply : g.made && !g.opts.length ? loc.gear.rarities.made : loc.gear.rarities[RARITIES[g.rar].id], g.plus, g.lv);
  // 무기·갑옷의 기본 수치와 같은 종류의 옵션은 더해서 한 번만 보여 준다 ('공격 피해 +45% · 공격 피해 +11%'가 아니라 '공격 피해 +56%').
  // 서버도 둘을 그대로 더해서 쓴다 (systems/gear.ts의 total)
  const sum = new Map<Stat, number>(), base = baseOpt(g);
  if (base && base[1] > 0) sum.set(base[0], optValue(g, base[1]));
  for (const [k, v] of g.opts) sum.set(k, (sum.get(k) ?? 0) + optValue(g, v));
  const opts = [...sum].map(([k, v]) => loc.gear.stats[k](Math.round(v * 10) / 10));
  return { slot: loc.gear.slots[g.slot], name, opts, cls: isSupply(g) ? 'supply' : g.made && !g.opts.length ? 'made' : 'rar' + g.rar };
}
/** 우편에 붙은 물건: 장비의 이름과 아이템의 수량 */
function goodsText(r: Reward): string {
  const loc = L();
  return [...(r.gear ?? []).map((g) => gearLabel(g).name), ...Object.entries(r.items ?? {}).map(([id, n]) => loc.fmt.marketStack(isItemId(id) ? loc.items[id].name : id, n))].join(' · ');
}

/**
 * 장비 줄에서 방금 일어난 일: 강화 결과(그 줄에 잠깐 보여 준다)와, 팔기를 한 번 누른 장비(한 번 더 눌러야 팔린다).
 * 화면 아래의 한 줄 알림만으로는 강화가 됐는지 눈에 띄지 않았고, 팔기는 한 번에 팔려 잘못 누르기 쉬웠다
 */
const act = { enhUid: 0, enhWait: false, enhOk: false, enhPlus: 0, sellUid: 0, enhTimer: 0, sellTimer: 0 };

function gearRow(g: Gear, worn: boolean): HTMLDivElement {
  const loc = L(), me = S.me, label = gearLabel(g);
  const cost = ENHANCE.gold(g.plus, g.rar), maxed = g.plus >= enhanceMax(g), price = sellPrice(g);
  const buttons: HTMLElement[] = [];
  if (!worn) buttons.push(button(t('equip'), () => send({ t: 'equip', uid: g.uid })));
  else if (g.slot !== 'weapon') buttons.push(button(t('unequip'), () => send({ t: 'unequip', slot: g.slot }))); // 무기는 빼지 못한다: 다른 무기를 끼면 바뀐다
  buttons.push(button(maxed ? t('enhanceMaxed') : loc.fmt.enhanceCost(cost, Math.round(ENHANCE.rate(g.plus) * 100)), () => {
    act.enhUid = g.uid; act.enhWait = true; // 서버의 답(성공/실패)을 이 줄에 보여 준다
    send({ t: 'enhance', uid: g.uid });
  }, maxed || !me || me.gold < cost));
  if (!worn) {
    const armed = act.sellUid === g.uid;
    const sell = button(armed ? loc.fmt.sellConfirm(price) : loc.fmt.sellFor(price), () => {
      clearTimeout(act.sellTimer);
      if (armed) { act.sellUid = 0; send({ t: 'sell', uid: g.uid }); return; }
      // 처음 누르면 확인으로 바뀌고, 몇 초 안에 다시 누르지 않으면 원래대로 돌아간다 (거래소의 사기 단추와 같은 방식)
      act.sellUid = g.uid;
      act.sellTimer = window.setTimeout(() => { act.sellUid = 0; renderMenu(); }, 4000);
      renderMenu();
    });
    sell.classList.toggle('armed', armed);
    buttons.push(sell);
  }
  const r = row(gearTitle(label.slot, label.name), optsEl(label.opts), buttons, 'gear ' + label.cls);
  if (act.enhUid === g.uid && !act.enhWait) {
    r.classList.add(act.enhOk ? 'ok' : 'fail');
    const res = el('mresult', act.enhOk ? loc.fmt.enhanceDone(act.enhPlus) : t('enhanceFailed'));
    res.setAttribute('role', 'status');
    r.querySelector('.what')?.append(res);
  }
  return r;
}

function drawGear(): void {
  const loc = L(), m = S.meta;
  ui.list.append(el('baghead', loc.fmt.power(m.power)));
  // 보급형과 만들거나 주운 장비의 차이는 늘 보이게 둔다 (예전에는 남는 장비가 없을 때만 떴다)
  ui.list.append(el('note', loc.fmt.gearHint(ENHANCE.supplyMax, ENHANCE.max)));
  for (const slot of GEAR_SLOTS) {
    const g = m.gear.find((x) => x.uid === m.worn[slot]);
    if (g) ui.list.append(gearRow(g, true));
    else ui.list.append(row(gearTitle(loc.gear.slots[slot], t('none')), '', [], 'empty'));
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
  for (const m of [...mail].reverse()) ui.list.append(row(loc.fmt.mailTitle(m.k, m.a), optsEl([rewardText(m.r), goodsText(m.r)]), [button(t('claim'), () => send({ t: 'mailClaim', id: m.id }))]));
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
const filterName = (f: MarketFilter): string => (f === 'all' ? t('marketAll') : f === 'mat' ? t('marketMat') : L().gear.slots[f]);

function marketAsk(): void { mk.armed = 0; send({ t: 'market', a: 'list', f: mk.f, sort: mk.sort, page: mk.page }); }
/** 거래소 탭을 열 때: 목록과 내 물건을 새로 받는다 */
function marketOpen(): void { marketAsk(); send({ t: 'market', a: 'mine' }); }

/** 고르는 단추 한 줄 (화면, 거르는 종류). 켜진 것은 금색이다 */
function chips(items: { text: string; on?: boolean; off?: boolean; click: () => void }[]): HTMLDivElement {
  const box = el('mchips');
  for (const x of items) { const b = button(x.text, x.click, x.off); b.classList.toggle('on', !!x.on); box.append(b); }
  return box;
}
/** 고르는 상자. 단추 일곱 개를 늘어놓으면 폰에서 줄을 다 차지해서 물건이 안 보였다 */
function select<T extends string>(label: string, items: readonly T[], value: T, text: (v: T) => string, on: (v: T) => void): HTMLSelectElement {
  const s = document.createElement('select');
  s.setAttribute('aria-label', label);
  for (const v of items) s.add(new Option(text(v), v, false, v === value));
  s.addEventListener('change', () => { const v = s.value as T; s.blur(); on(v); });
  // 펼쳐 둔 동안에는 창을 다시 그리지 않으므로(renderMenu), 닫히면 그사이 밀린 것을 그린다
  s.addEventListener('blur', () => setTimeout(() => renderMenu(true), 0));
  return s;
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
    select(t('marketFilter'), MARKET_FILTERS, mk.f, filterName, (f) => { mk.f = f; mk.page = 0; marketAsk(); renderMenu(); }),
    select(t('marketSort'), MARKET_SORTS, mk.sort, (s) => t(SORT_KEYS[s]), (s) => { mk.sort = s; mk.page = 0; marketAsk(); renderMenu(); }),
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
  if (!mk.list.length) ui.list.append(el('note', t('marketEmpty')));
  for (const x of mk.list) {
    const short = me.gold < x.price, armed = mk.armed === x.id;
    const buy = button(armed ? loc.fmt.marketConfirm(x.price) : loc.fmt.marketBuy(x.price), () => {
      if (!armed) { mk.armed = x.id; renderMenu(); return; }
      send({ t: 'market', a: 'buy', id: x.id });
      marketAsk(); // 산 물건이 목록에서 빠지게 바로 새로 받는다
    }, mk.guest || x.mine || short);
    buy.classList.toggle('armed', armed);
    ui.list.append(marketRow(x, [loc.fmt.marketSeller(x.seller), !x.mine && short ? loc.fmt.short(x.price - me.gold) : ''], [buy]));
  }
}

function drawMarketMine(): void {
  const loc = L(), passed = (performance.now() - mk.mineAt) / 1000;
  ui.list.append(el('baghead', loc.fmt.marketMineHead(mk.mine.length, MARKET.maxListings)));
  if (!mk.mine.length) ui.list.append(el('note', t('marketMineEmpty')));
  for (const x of mk.mine) {
    const min = Math.max(0, Math.floor((x.left - passed) / 60));
    ui.list.append(marketRow({ ...x, mine: false }, [loc.fmt.marketPrice(x.price), loc.fmt.marketLeft(Math.floor(min / 60), min % 60)], [button(t('marketCancel'), () => send({ t: 'market', a: 'cancel', id: x.id }))]));
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
    ui.list.append(row(gearTitle(label.slot, label.name), optsEl(label.opts), [button(t('marketPick'), () => choose({ uid: g.uid }, 1), picked === g)], label.cls));
  }
  if (mats.length) ui.list.append(el('baghead', t('bagMats')));
  for (const id of mats) ui.list.append(row(loc.items[id].name, loc.fmt.have(me.items[id] ?? 0, MAT_MAX), [button(t('marketPick'), () => choose({ item: id }, me.items[id] ?? 1), item === id)]));
}

function drawMarket(): void {
  // 화면 고르기와 둘러보기 도구를 한 묶음으로 창 위쪽에 붙여 둔다 (목록을 내려도 따라온다)
  const bar = el('mbar');
  bar.append(chips([
    { text: t('marketBrowse'), on: mk.view === 'browse', click: () => { mk.view = 'browse'; marketAsk(); renderMenu(); } },
    { text: mk.mine.length ? `${t('marketMine')} ${mk.mine.length}` : t('marketMine'), on: mk.view === 'mine', click: () => { mk.view = 'mine'; mk.armed = 0; send({ t: 'market', a: 'mine' }); renderMenu(); } },
    { text: t('marketPost'), on: mk.view === 'post', off: mk.guest, click: () => { mk.view = 'post'; mk.armed = 0; renderMenu(); } },
  ]));
  if (mk.view === 'browse' || (mk.view === 'post' && mk.guest)) bar.append(marketTools());
  ui.list.append(bar);
  if (mk.guest) ui.list.append(el('note', t('marketGuestNote')));
  if (mk.view === 'mine') drawMarketMine(); else if (mk.view === 'post' && !mk.guest) drawMarketPost(); else drawMarketBrowse();
}

function drawRank(): void {
  const loc = L(), r = S.rank;
  if (!r.list.length) { ui.list.append(el('note', t('rankEmpty'))); return; }
  r.list.forEach((x, i) => ui.list.append(row(`${i + 1}. ${x.name}`, loc.fmt.level(x.lv, loc.classes[x.cls as keyof typeof loc.classes]?.name ?? ''), [el('num', loc.fmt.power(x.power))], i === r.me ? 'mine' : '')));
}

/** 내 장비·우편·일일 임무·순위나 언어가 바뀌면 다시 그린다 (열려 있을 때만). 단추의 우편 수는 늘 맞춘다. */
/**
 * soft가 켜져 있으면(전투 중 초당 여러 번 오는 상태 메시지) 화면에 영향을 주는 값이 그대로일 때 다시 그리지 않는다.
 * 그 밖에는(단추를 눌렀을 때, 거래소·길드·순위 응답) 언제나 다시 그린다.
 */
export function renderMenu(soft = false): void {
  const n = S.meta.mail.length;
  ui.btn.textContent = n ? `${t('menu')} ${n}` : t('menu');
  ui.btn.classList.toggle('alert', n > 0 || S.meta.build.left > 0 || !!S.guildInvite); // 받을 우편이나 찍을 점수가 있으면 눈에 띄게
  if (ui.panel.hidden || !S.me) return;
  const focus = document.activeElement;
  // 글을 치는 중이거나 고르는 상자를 펼쳐 둔 동안에는 다시 그리지 않는다 (칸이 새로 만들어지면 커서와 펼친 목록이 사라진다)
  if ((focus instanceof HTMLInputElement || focus instanceof HTMLSelectElement) && ui.list.contains(focus)) { ui.gold.textContent = L().fmt.gold(S.me.gold); return; }
  // 전투 중에는 상태 메시지가 초당 여러 번 온다. 그때마다 단추를 새로 만들면 누르는 사이에 단추가 사라져 클릭이 먹지 않으므로,
  // 화면에 영향을 주는 값이 그대로면 다시 그리지 않는다
  const sig = JSON.stringify([tab, L().code, S.me.gold, S.me.lv, S.me.cls, S.meta, S.guild, S.guildInvite, S.rank, act.enhUid, act.enhWait, act.enhOk, act.sellUid]);
  if (soft === true && sig === lastSig) return;
  lastSig = sig;
  ui.gold.textContent = L().fmt.gold(S.me.gold);
  const left = ui.tabs.scrollLeft;
  ui.tabs.textContent = '';
  TABS.forEach((x, i) => {
    const b = button(t(x.key), () => { const moved = tab !== i; tab = i; if (TABS[i].draw === drawRank) askRank(); if (TABS[i].draw === drawMarket) marketOpen(); renderMenu(); if (moved) ui.list.scrollTop = 0; });
    b.classList.toggle('on', i === tab);
    // 찍을 점수나 받을 우편이 있으면 점(•)을 찍는다. 점은 단추 모서리에 얹어서(style.css) 생겨도 탭의 너비가 바뀌지 않는다
    b.classList.toggle('dot', (x.draw === drawBuild && S.meta.build.left > 0) || (x.draw === drawMail && S.meta.mail.length > 0));
    ui.tabs.append(b);
  });
  ui.tabs.scrollLeft = left;
  const top = ui.list.scrollTop;
  ui.list.textContent = '';
  TABS[tab].draw();
  ui.list.scrollTop = top;
}

/** 순위를 마지막으로 달라고 한 시각과 그때의 내 레벨·전투력 */
let rankAt = -1e9, rankSig = '';
const mySig = (): string => `${S.me?.lv}:${S.meta.power}`;
function askRank(): void { rankAt = performance.now(); rankSig = mySig(); send({ t: 'rank' }); }

/** 메뉴를 열고 그 탭을 보여 준다 (다른 창의 단추에서 부른다) */
export function openMenu(key: UiKey): void {
  if (!S.me) return;
  tab = Math.max(0, TABS.findIndex((x) => x.key === key));
  ui.panel.hidden = false;
  lastSig = '';
  if (TABS[tab].draw === drawRank) askRank();
  if (TABS[tab].draw === drawMarket) marketOpen();
  renderMenu();
}

export function toggleMenu(): void {
  if (!S.me) return;
  ui.panel.hidden = !ui.panel.hidden;
  lastSig = '';
  if (!ui.panel.hidden && TABS[tab].draw === drawRank) askRank();
  if (!ui.panel.hidden && TABS[tab].draw === drawMarket) marketOpen();
  renderMenu();
}

export function initMenu(): void {
  ui.btn.addEventListener('click', (e) => { toggleMenu(); (e.currentTarget as HTMLElement).blur(); });
  $('menuClose').addEventListener('click', () => { ui.panel.hidden = true; });
  onMsg('meta', (m) => { S.meta = { gear: m.gear, worn: m.worn, mail: m.mail, daily: m.daily, power: m.power, build: m.build }; renderMenu(true); });
  onMsg('guild', (m) => { S.guild = m.g; S.guildInvite = m.invite ?? null; renderMenu(); });
  onMsg('gtag', (m) => setGuildTag(m.id, m.g));
  onMsg('market', (m) => {
    mk.guest = !!m.guest;
    if (m.v === 'mine') { mk.mine = m.list; mk.mineAt = performance.now(); }
    else { mk.list = m.list; mk.page = m.page; mk.pages = m.pages; mk.total = m.total; mk.armed = 0; }
    renderMenu();
  });
  onMsg('rank', (m) => { S.rank = { list: m.list, me: m.me }; renderMenu(); });
  onMsg('stat', () => renderMenu(true)); // 골드가 바뀌면 강화 단추의 상태도 바뀐다
  // 강화의 결과를 누른 그 줄에 잠깐 보여 준다
  onMsg('sys', (m) => {
    if (!act.enhWait) return;
    if (m.k === 'enhanceOk' || m.k === 'enhanceFail') {
      act.enhWait = false; act.enhOk = m.k === 'enhanceOk'; act.enhPlus = Number(m.a?.[0] ?? 0);
      clearTimeout(act.enhTimer);
      act.enhTimer = window.setTimeout(() => { act.enhUid = 0; renderMenu(); }, 3000);
      renderMenu();
    } else if (m.k === 'enhanceMax' || m.k === 'noGold') { act.enhWait = false; act.enhUid = 0; }
  });
  // 순위 탭을 열어 둔 동안 내 레벨이나 전투력이 바뀌면 순위를 다시 받는다. 5초에 한 번을 넘지 않는다
  onSlow((now) => {
    if (ui.panel.hidden || !S.me || TABS[tab].draw !== drawRank) return;
    if (mySig() !== rankSig && now - rankAt >= 5000) askRank();
  });
  onLangChange(() => renderMenu());
}
