// 상점 창(길 상인 가까이에서 열린다)과 물약 버튼.
import { ITEMS, POTION_MAX, SHOPS, nearShop, SHOP_STOCK, itemDef, isItemId, type ItemId } from '../../shared/defs';
import { buy, usePotion } from '../actions';
import { $ } from '../app';
import { onFrame, onMsg, onSlow } from '../bus';
import { L, itemInfo, itemName, onLangChange, t } from '../i18n';
import { rules } from '../rules';
import { S } from '../state';
import { addPlace } from './near';

let ui: Record<'panel' | 'gold' | 'list', HTMLElement>;
let potion: { button: HTMLButtonElement; count: HTMLElement; cd: HTMLElement; time: HTMLElement } | null = null;

export function initShop(): void {
  ui = { panel: $('shop'), gold: $('shopGold'), list: $('shopList') };
  // 물약 버튼: 기술 버튼 옆에 둔다 (단축키 Q)
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'skill potion';
  b.innerHTML = '<span class="k">Q</span><span class="n"></span><span class="cd"></span><span class="t"></span>';
  b.addEventListener('click', () => { usePotion(); b.blur(); });
  $('skills').appendChild(b);
  potion = { button: b, count: b.querySelector<HTMLElement>('.n')!, cd: b.querySelector<HTMLElement>('.cd')!, time: b.querySelector<HTMLElement>('.t')! };
  renderShop();
  addPlace('shop', SHOPS);
  // 내 소지품(stat)이나 잠금 상태(공유 상태)가 바뀌면 다시 그린다
  onMsg('stat', renderShop);
  onMsg('world', renderShop);
  onFrame(shopFrame);
  onSlow(shopSlow);
  onLangChange(renderShop);
}

/** 내 소지품, 잠금 상태(공유 상태), 언어가 바뀌면 다시 그린다. */
export function renderShop(): void {
  const loc = L(), me = S.me;
  const gold = me?.gold ?? 0, items = me?.items ?? {};
  const tier = me && isItemId(me.weapon) ? itemDef(me.weapon).tier ?? 0 : 0;
  const armorTier = me && isItemId(me.armor) ? itemDef(me.armor).tier ?? 0 : 0;
  ui.gold.textContent = loc.fmt.gold(gold);
  ui.list.textContent = '';
  for (const id of SHOP_STOCK) {
    const def = itemDef(id);
    const row = document.createElement('div');
    row.className = 'shoprow';
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'iname';
    name.textContent = itemName(id, me?.cls ?? '');
    const note = document.createElement('div');
    note.className = 'note';
    info.append(name, note);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = loc.fmt.price(def.price);
    btn.addEventListener('click', () => buy(id));

    // 왜 살 수 없는지를 단추 대신 글로 알린다
    const stocked = !def.needs || rules.unlocked(def.needs); // 무엇이 잠그는지는 게임의 규칙이 안다 (서버의 g.rules.unlocked와 같은 판정)
    if (!stocked) { note.textContent = rules.lockNote(def.needs!); btn.disabled = true; }
    else if ((def.kind === 'weapon' && (def.tier ?? 0) <= tier) || (def.kind === 'armor' && (def.tier ?? 0) <= armorTier)) { note.textContent = t('owned'); btn.hidden = true; }
    else {
      note.textContent = def.kind === 'potion' ? `${itemInfo(id)} · ${loc.fmt.have(items[id] ?? 0, POTION_MAX)}` : itemInfo(id);
      if (gold < def.price) note.textContent += ` · ${loc.fmt.short(def.price - gold)}`; // 왜 살 수 없는지 알린다
      btn.disabled = gold < def.price || (def.kind === 'potion' && (items[id] ?? 0) >= POTION_MAX);
    }
    row.append(info, btn);
    ui.list.appendChild(row);
  }
  if (potion) {
    const total = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].kind === 'potion').reduce((n, id) => n + (items[id] ?? 0), 0);
    potion.count.textContent = loc.fmt.potions(total);
    potion.button.setAttribute('aria-label', `${loc.items.potion.name} (Q)`);
    potion.button.classList.toggle('empty', total === 0);
  }
}

/** 매 프레임: 물약 재사용 대기 표시 */
export function shopFrame(now: number): void {
  if (!potion) return;
  const left = S.itemCdEnd - now;
  potion.cd.style.transform = `scaleY(${left > 0 ? left / S.itemCdLen : 0})`;
  potion.time.textContent = left > 0 ? String(Math.ceil(left / 1000)) : '';
  potion.button.classList.toggle('cooling', left > 0);
}

/** 가끔: 길 상인 가까이에 있을 때만 상점 창을 연다 */
export function shopSlow(): void {
  const me = S.me;
  ui.panel.hidden = !me || !nearShop(me);
}
