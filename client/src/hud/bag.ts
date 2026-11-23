// 가방 창: 물약과 제작 재료를 어디서나 볼 수 있다. 장비는 메뉴의 장비 탭에서 다룬다. (단축키 B)
import { ITEMS, MAT_MAX, POTION_MAX, type ItemId } from '../../../shared/defs';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { S } from '../state';
import { openMenu } from './menu';

const ui = { panel: $('bag'), gold: $('bagGold'), list: $('bagList') };
const ids = Object.keys(ITEMS) as ItemId[];

function row(slot: string, name: string, note: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'bagrow';
  const a = document.createElement('span');
  a.className = 'slot';
  a.textContent = slot;
  const b = document.createElement('div');
  b.className = 'what';
  const n = document.createElement('div');
  n.className = 'iname';
  n.textContent = name;
  b.appendChild(n);
  if (note) { const i = document.createElement('div'); i.className = 'note'; i.textContent = note; b.appendChild(i); }
  el.append(a, b);
  return el;
}
function head(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'baghead';
  el.textContent = text;
  return el;
}

/** 내 소지품이나 언어가 바뀌면 다시 그린다 (열려 있을 때만). */
export function renderBag(): void {
  const me = S.me;
  if (ui.panel.hidden || !me) return;
  const loc = L();
  ui.gold.textContent = loc.fmt.gold(me.gold);
  ui.list.textContent = '';
  // 장비(무기, 갑옷, 장신구)는 메뉴의 장비 탭 한 곳에서만 다룬다
  const gear = document.createElement('button');
  gear.type = 'button'; gear.className = 'plain'; gear.textContent = t('bagToGear');
  gear.addEventListener('click', () => { ui.panel.hidden = true; openMenu('tabGear'); });
  ui.list.append(gear);
  ui.list.append(head(t('bagPotions')));
  for (const id of ids) if (ITEMS[id].kind === 'potion') ui.list.append(row(loc.items[id].name, loc.fmt.have(me.items[id] ?? 0, POTION_MAX), ''));
  ui.list.append(head(t('bagMats')));
  for (const id of ids) if (ITEMS[id].kind === 'mat') ui.list.append(row(loc.items[id].name, loc.fmt.have(me.items[id] ?? 0, MAT_MAX), ''));
}

export function toggleBag(): void {
  if (!S.me) return;
  ui.panel.hidden = !ui.panel.hidden;
  renderBag();
}

export function initBag(): void {
  $('bagBtn').addEventListener('click', (e) => { toggleBag(); (e.currentTarget as HTMLElement).blur(); });
  $('bagClose').addEventListener('click', () => { ui.panel.hidden = true; });
  onMsg('stat', renderBag);
  onLangChange(renderBag);
}
