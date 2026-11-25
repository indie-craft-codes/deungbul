// 가방 창: 물약과 제작 재료를 어디서나 볼 수 있다. 장비는 메뉴의 장비 탭에서 다룬다. (단축키 B)
// 장비 가방의 칸 수와 분해 설정(서버의 개인 상태 bag, salvage)도 여기서 받아 넣고, 가방이 가득 찼으면 가방 단추에 표시한다.
import { GEAR, ITEMS, SALVAGE, itemCap, itemDef, type ItemId } from '../../shared/defs';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { S } from '../state';
import { openMenu } from './menu';
import { sourceText } from './sources';

const ui = { panel: $('bag'), gold: $('bagGold'), list: $('bagList') };
const ids = Object.keys(ITEMS) as ItemId[];
/** 가방에 든 장비의 수 (마지막으로 받은 meta) */
let gearCount = 0;
const gearFull = (): boolean => gearCount >= S.bag.max;

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
  gear.addEventListener('click', () => { ui.panel.hidden = true; openMenu('gear'); });
  ui.list.append(gear);
  // 장비 가방의 든 수와 칸 수. 가득 찼으면 알린다: 새로 떨어지는 장비가 버려진다
  ui.list.append(row(t('tabGear'), loc.fmt.have(gearCount, S.bag.max), ''));
  if (gearFull()) { const warn = document.createElement('div'); warn.className = 'note gwarn'; warn.setAttribute('role', 'status'); warn.textContent = S.bag.lost > 0 ? loc.fmt.bagLost(S.bag.lost) : t('bagFull'); ui.list.append(warn); }
  // 물약과 재료: 그 종류의 아이템이 없는 게임은 머리줄도 두지 않는다
  const potions = ids.filter((id) => itemDef(id).kind === 'potion'), mats = ids.filter((id) => itemDef(id).kind === 'mat');
  if (potions.length) ui.list.append(head(t('bagPotions')));
  for (const id of potions) ui.list.append(row(loc.items[id].name, loc.fmt.have(me.items[id] ?? 0, itemCap(id)), ''));
  if (mats.length) ui.list.append(head(t('bagMats')));
  // 재료마다 어떤 몬스터가 떨어뜨리는지 적어 준다 (어디서 구하는지 화면 어디에도 없었다). 분해로 나오는 가루는 그렇게 적는다
  for (const id of mats) ui.list.append(row(loc.items[id].name, loc.fmt.haveBig(me.items[id] ?? 0, itemCap(id)), id === SALVAGE.item ? t('salvageSource') : sourceText(id)));
}

/** 가방이 가득 찼으면 가방 단추를 눈에 띄게 한다 (style.css의 #bagBtn.alert) */
function markBtn(): void {
  const b = $('bagBtn'), full = !!S.me && gearFull();
  b.classList.toggle('alert', full);
  if (full) b.title = t('bagFull'); else b.removeAttribute('title');
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
  onMsg('meta', (m) => { gearCount = m.gear.length; markBtn(); renderBag(); });
  // 개인 상태: 가방의 칸 수와 버려진 수, 분해의 설정. 메뉴(hud/menu.ts)보다 먼저 등록되므로 여기서 값을 넣는다
  onMsg('me', (m) => {
    const s = (typeof m.s === 'object' && m.s !== null ? m.s : {}) as Record<string, unknown>, n = (v: unknown, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : def);
    if (m.k === 'bag') S.bag = { max: Math.max(1, n(s.max, S.bag.max)), up: n(s.up, 0), lost: n(s.lost, 0), known: true };
    else if (m.k === 'salvage') S.salvage = { on: s.on === true, auto: n(s.auto, -1) };
    else return;
    markBtn(); renderBag();
  });
  // 다른 캐릭터로 이어받았을 때 앞 캐릭터의 값이 남지 않게 처음 값으로 돌린다 (서버가 접속 직후에 다시 보낸다)
  onMsg('welcome', () => { S.bag = { max: GEAR.bagMax, up: 0, lost: 0, known: false }; S.salvage = { on: false, auto: -1 }; gearCount = 0; markBtn(); });
  onLangChange(() => { markBtn(); renderBag(); });
}
