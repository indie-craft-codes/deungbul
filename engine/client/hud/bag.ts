// 가방 창: 물약과 제작 재료를 어디서나 볼 수 있다. 장비는 메뉴의 장비 탭에서 다룬다. (단축키 B)
// 아이템은 그림 칸의 격자로 보이고(칸 귀퉁이에 든 수), 칸을 누르면 아래에 이름·든 수·설명(어디서 구하는지)이 뜬다.
// 예전에는 줄마다 이름과 설명을 적은 목록이라 길고 어수선했다 (사용자: '아이템칸은 그냥 아이콘만 나오지 않아?')
// 장비 가방의 칸 수와 분해 설정(서버의 개인 상태 bag, salvage)도 여기서 받아 넣고, 가방이 가득 찼으면 가방 단추에 표시한다.
import { GEAR, ITEMS, SALVAGE, itemCap, itemDef, type ItemId } from '../../shared/defs';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, itemInfo, onLangChange, t } from '../i18n';
import { S } from '../state';
import { itemIcon } from './icons';
import { openMenu } from './menu';
import { sourceText } from './sources';

const ui = { panel: $('bag'), gold: $('bagGold'), list: $('bagList') };
const ids = Object.keys(ITEMS) as ItemId[];
/** 가방에 든 장비의 수 (마지막으로 받은 meta) */
let gearCount = 0;
/** 설명을 보고 있는 칸의 아이템 (다시 그려도 고른 칸이 남는다) */
let picked: ItemId | null = null;
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
  // 물약, 재료, 특별한 물건(보호석 등)의 칸: 이 차례로 늘어선다. 없는 것도 흐리게 보여, 무엇을 모을 수 있는지 알 수 있다
  const kinds = [['potion', 'bagPotions'], ['mat', 'bagMats'], ['token', 'bagCharms']] as const;
  const items = kinds.flatMap(([k]) => ids.filter((id) => itemDef(id).kind === k));
  if (!items.length) return;
  ui.list.append(head(t('bagItems')));
  const grid = document.createElement('div');
  grid.className = 'baggrid';
  const info = document.createElement('div');
  info.className = 'baginfo';
  info.setAttribute('aria-live', 'polite');
  const show = (id: ItemId | null): void => {
    picked = id;
    for (const c of grid.children) c.classList.toggle('on', (c as HTMLElement).dataset.id === id);
    info.textContent = '';
    if (!id) { info.append(Object.assign(document.createElement('div'), { className: 'note', textContent: t('bagPick') })); return; }
    const n = me.items[id] ?? 0, kind = kinds.find(([k]) => k === itemDef(id).kind)?.[1] ?? 'bagMats';
    const top = document.createElement('div');
    top.className = 'row';
    top.append(Object.assign(document.createElement('span'), { className: 'iname', textContent: loc.items[id].name }), Object.assign(document.createElement('span'), { className: 'num', textContent: (itemDef(id).kind === 'mat' ? loc.fmt.haveBig : loc.fmt.have)(n, itemCap(id)) }));
    // 설명: 재료는 어디서 구하는지(어떤 몬스터가 떨어뜨리는지, 가루는 분해), 물약은 효과, 특별한 물건은 쓰임새
    const note = itemDef(id).kind === 'mat' ? (id === SALVAGE.item ? t('salvageSource') : sourceText(id)) : itemInfo(id);
    info.append(top, Object.assign(document.createElement('div'), { className: 'note', textContent: [t(kind), note].filter(Boolean).join(' · ') }));
  };
  for (const id of items) {
    const n = me.items[id] ?? 0;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = n > 0 ? 'bagcell' : 'bagcell none';
    cell.dataset.id = id;
    cell.title = loc.items[id].name;
    cell.setAttribute('aria-label', `${loc.items[id].name} ${n}`);
    // 그림이 없는 아이템(그림 시트를 등록하지 않은 게임)은 이름의 앞 글자를 보인다
    const pic = itemIcon(id);
    cell.append(pic ?? Object.assign(document.createElement('span'), { className: 'bagabbr', textContent: loc.items[id].name.slice(0, 2) }));
    if (n > 0) cell.append(Object.assign(document.createElement('span'), { className: 'bagn', textContent: n >= 10000 ? `${Math.floor(n / 1000)}k` : String(n) }));
    cell.addEventListener('click', () => show(picked === id ? null : id));
    grid.append(cell);
  }
  ui.list.append(grid, info);
  show(picked && items.includes(picked) ? picked : null);
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
