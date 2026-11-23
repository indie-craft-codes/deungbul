// 메뉴 창: 드롭 장비(끼기·강화·팔기), 우편, 일일 임무와 출석, 순위를 탭으로 나눠 보여 준다. (단축키 M)
// 새 탭을 더하려면 TABS에 이름과 그리는 함수를 더한다.
import { DAILIES, DAILY_IDS, ENHANCE, GEAR, GEAR_SLOTS, RARITIES, baseOpt, isItemId, optValue, sellPrice, type Gear, type Reward } from '../../../shared/defs';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, itemName, onLangChange, t } from '../i18n';
import type { UiKey } from '../i18n/ko';
import { send } from '../net';
import { S } from '../state';

const ui = { panel: $('menu'), tabs: $('menuTabs'), list: $('menuList'), gold: $('menuGold'), btn: $('menuBtn') };
const TABS: readonly { key: UiKey; draw: () => void }[] = [
  { key: 'tabGear', draw: drawGear },
  { key: 'tabMail', draw: drawMail },
  { key: 'tabDaily', draw: drawDaily },
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

function gearRow(g: Gear, worn: boolean): HTMLDivElement {
  const loc = L(), me = S.me;
  // 무기와 갑옷은 바탕 아이템의 이름을 쓴다 (직업에 따라 검/활/지팡이). 옵션이 없는 기본 장비는 등급 말을 붙이지 않는다
  const what = isItemId(g.base) ? itemName(g.base, me?.cls ?? '') : loc.gear.slots[g.slot];
  const name = loc.fmt.gearName(what, g.opts.length ? loc.gear.rarities[RARITIES[g.rar].id] : '', g.plus, g.lv);
  const base = baseOpt(g);
  const lines = g.opts.map(([k, v]) => loc.gear.stats[k](optValue(g, v)));
  if (base && base[1] > 0) lines.unshift(loc.gear.stats[base[0]](optValue(g, base[1])));
  const opts = lines.join(' · ');
  const cost = ENHANCE.gold(g.plus, g.rar);
  const buttons = [
    worn ? button(t('unequip'), () => send({ t: 'unequip', slot: g.slot })) : button(t('equip'), () => send({ t: 'equip', uid: g.uid })),
    button(g.plus >= ENHANCE.max ? t('enhanceMaxed') : loc.fmt.enhanceCost(cost, Math.round(ENHANCE.rate(g.plus) * 100)), () => send({ t: 'enhance', uid: g.uid }), g.plus >= ENHANCE.max || !me || me.gold < cost),
  ];
  if (!worn) buttons.push(button(loc.fmt.sellFor(sellPrice(g)), () => send({ t: 'sell', uid: g.uid })));
  if (worn && g.slot === 'weapon') buttons.shift(); // 무기는 빼지 못한다: 다른 무기를 끼면 바뀐다
  return row(name, opts, buttons, 'rar' + (g.opts.length ? g.rar : 0));
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

function drawMail(): void {
  const loc = L(), mail = S.meta.mail;
  if (!mail.length) { ui.list.append(el('note', t('mailEmpty'))); return; }
  ui.list.append(button(t('claimAll'), () => send({ t: 'mailClaim', id: 0 })));
  for (const m of [...mail].reverse()) ui.list.append(row(loc.fmt.mailTitle(m.k, m.a), rewardText(m.r), [button(t('claim'), () => send({ t: 'mailClaim', id: m.id }))]));
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

function drawRank(): void {
  const loc = L(), r = S.rank;
  if (!r.list.length) { ui.list.append(el('note', t('rankEmpty'))); return; }
  r.list.forEach((x, i) => ui.list.append(row(`${i + 1}. ${x.name}`, loc.fmt.level(x.lv, loc.classes[x.cls as keyof typeof loc.classes]?.name ?? ''), [el('num', loc.fmt.power(x.power))], i === r.me ? 'mine' : '')));
}

/** 내 장비·우편·일일 임무·순위나 언어가 바뀌면 다시 그린다 (열려 있을 때만). 단추의 우편 수는 늘 맞춘다. */
export function renderMenu(): void {
  const n = S.meta.mail.length;
  ui.btn.textContent = n ? `${t('menu')} ${n}` : t('menu');
  ui.btn.classList.toggle('alert', n > 0);
  if (ui.panel.hidden || !S.me) return;
  ui.gold.textContent = L().fmt.gold(S.me.gold);
  ui.tabs.textContent = '';
  TABS.forEach((x, i) => {
    const b = button(t(x.key), () => { tab = i; if (TABS[i].draw === drawRank) send({ t: 'rank' }); renderMenu(); });
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
  renderMenu();
}

export function initMenu(): void {
  ui.btn.addEventListener('click', (e) => { toggleMenu(); (e.currentTarget as HTMLElement).blur(); });
  $('menuClose').addEventListener('click', () => { ui.panel.hidden = true; });
  onMsg('meta', (m) => { S.meta = { gear: m.gear, worn: m.worn, mail: m.mail, daily: m.daily, power: m.power }; renderMenu(); });
  onMsg('rank', (m) => { S.rank = { list: m.list, me: m.me }; renderMenu(); });
  onMsg('stat', renderMenu); // 골드가 바뀌면 강화 단추의 상태도 바뀐다
  onLangChange(renderMenu);
}
