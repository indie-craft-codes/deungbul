// 메뉴 창: 드롭 장비(끼기·강화·팔기), 우편, 일일 임무와 출석, 순위를 탭으로 나눠 보여 준다. (단축키 M)
// 새 탭을 더하려면 TABS에 이름과 그리는 함수를 더한다.
import { BUILD, BUILD_STATS, GUILD, DAILIES, DAILY_IDS, ENHANCE, GEAR, GEAR_SLOTS, RARITIES, baseOpt, enhanceMax, classOf, isItemId, isSupply, optValue, sellPrice, type Gear, type Reward } from '../../../shared/defs';
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
  // 무기와 갑옷은 바탕 아이템의 이름을 쓴다 (직업에 따라 검/활/지팡이). 사거나 만든 것은 '보급형'이라고 붙인다
  const what = isItemId(g.base) ? itemName(g.base, me?.cls ?? '') : loc.gear.slots[g.slot];
  const name = loc.fmt.gearName(what, isSupply(g) ? loc.gear.rarities.supply : g.made && !g.opts.length ? loc.gear.rarities.made : loc.gear.rarities[RARITIES[g.rar].id], g.plus, g.lv);
  const base = baseOpt(g);
  const lines = g.opts.map(([k, v]) => loc.gear.stats[k](optValue(g, v)));
  if (base && base[1] > 0) lines.unshift(loc.gear.stats[base[0]](optValue(g, base[1])));
  const opts = lines.join(' · ');
  const cost = ENHANCE.gold(g.plus, g.rar);
  const buttons = [
    worn ? button(t('unequip'), () => send({ t: 'unequip', slot: g.slot })) : button(t('equip'), () => send({ t: 'equip', uid: g.uid })),
    button(g.plus >= enhanceMax(g) ? t('enhanceMaxed') : loc.fmt.enhanceCost(cost, Math.round(ENHANCE.rate(g.plus) * 100)), () => send({ t: 'enhance', uid: g.uid }), g.plus >= enhanceMax(g) || !me || me.gold < cost),
  ];
  if (!worn) buttons.push(button(loc.fmt.sellFor(sellPrice(g)), () => send({ t: 'sell', uid: g.uid })));
  if (worn && g.slot === 'weapon') buttons.shift(); // 무기는 빼지 못한다: 다른 무기를 끼면 바뀐다
  return row(name, opts, buttons, isSupply(g) ? 'supply' : g.made && !g.opts.length ? 'made' : 'rar' + g.rar);
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
  // 전투 중에는 상태 메시지가 초당 여러 번 온다. 그때마다 단추를 새로 만들면 누르는 사이에 단추가 사라져 클릭이 먹지 않으므로,
  // 화면에 영향을 주는 값이 그대로면 다시 그리지 않는다
  const sig = JSON.stringify([tab, L().code, S.me.gold, S.me.lv, S.me.cls, S.meta, S.guild, S.guildInvite, S.rank]);
  if (sig === lastSig) return;
  lastSig = sig;
  ui.gold.textContent = L().fmt.gold(S.me.gold);
  ui.tabs.textContent = '';
  TABS.forEach((x, i) => {
    const b = button(t(x.key) + (x.draw === drawBuild && S.meta.build.left > 0 ? ' •' : x.draw === drawMail && S.meta.mail.length ? ' •' : ''), () => { tab = i; if (TABS[i].draw === drawRank) send({ t: 'rank' }); renderMenu(); });
    b.classList.toggle('on', i === tab);
    ui.tabs.append(b);
  });
  const top = ui.list.scrollTop;
  ui.list.textContent = '';
  TABS[tab].draw();
  ui.list.scrollTop = top;
}

/** 메뉴를 열고 그 탭을 보여 준다 (다른 창의 단추에서 부른다) */
export function openMenu(key: UiKey): void {
  if (!S.me) return;
  tab = Math.max(0, TABS.findIndex((x) => x.key === key));
  ui.panel.hidden = false;
  lastSig = '';
  renderMenu();
}

export function toggleMenu(): void {
  if (!S.me) return;
  ui.panel.hidden = !ui.panel.hidden;
  lastSig = '';
  if (!ui.panel.hidden && TABS[tab].draw === drawRank) send({ t: 'rank' });
  renderMenu();
}

export function initMenu(): void {
  ui.btn.addEventListener('click', (e) => { toggleMenu(); (e.currentTarget as HTMLElement).blur(); });
  $('menuClose').addEventListener('click', () => { ui.panel.hidden = true; });
  onMsg('meta', (m) => { S.meta = { gear: m.gear, worn: m.worn, mail: m.mail, daily: m.daily, power: m.power, build: m.build }; renderMenu(); });
  onMsg('guild', (m) => { S.guild = m.g; S.guildInvite = m.invite ?? null; renderMenu(); });
  onMsg('gtag', (m) => setGuildTag(m.id, m.g));
  onMsg('rank', (m) => { S.rank = { list: m.list, me: m.me }; renderMenu(); });
  onMsg('stat', renderMenu); // 골드가 바뀌면 강화 단추의 상태도 바뀐다
  onLangChange(renderMenu);
}
