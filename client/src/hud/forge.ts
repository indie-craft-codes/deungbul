// 대장간 창: 잠금(SMITH)이 풀린 뒤, 그 가까이에 서면 열린다. 가진 재료와 만들 수 있는 것을 보여 준다.
import { RECIPES, SMITH, SMITHY, SMITHY_REACH, itemDef, isItemId, type ItemId } from '../../../shared/defs';
import { craft } from '../actions';
import { $ } from '../app';
import { L, itemInfo, itemName, t } from '../i18n';
import { rules } from '../rules';
import { S } from '../state';
import { sourceLine } from './sources';

const ui = { panel: $('forge'), gold: $('forgeGold'), list: $('forgeList') };
const open = (): boolean => rules.unlocked(SMITH);

/** 내 소지품, 언어가 바뀌면 다시 그린다. */
export function renderForge(): void {
  const loc = L(), me = S.me;
  const gold = me?.gold ?? 0, items = me?.items ?? {};
  const tier = me && isItemId(me.weapon) ? itemDef(me.weapon).tier ?? 0 : 0;
  const armorTier = me && isItemId(me.armor) ? itemDef(me.armor).tier ?? 0 : 0;
  ui.gold.textContent = loc.fmt.gold(gold);
  ui.list.textContent = '';
  /** 만들 것에 모자라는 재료들: 창 아래에 어디서 얻는지 적어 준다 */
  const lacking = new Set<ItemId>();
  for (const r of RECIPES) {
    const def = itemDef(r.id);
    const row = document.createElement('div');
    row.className = 'shoprow';
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'iname';
    name.textContent = itemName(r.id, me?.cls ?? '');
    const note = document.createElement('div');
    note.className = 'note';
    info.append(name, note);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = loc.fmt.price(r.gold);
    btn.addEventListener('click', () => craft(r.id));

    if ((def.kind === 'weapon' && (def.tier ?? 0) <= tier) || (def.kind === 'armor' && (def.tier ?? 0) <= armorTier)) { note.textContent = t('owned'); btn.hidden = true; }
    else {
      // 재료마다 가진 수 / 필요한 수를 보여 줘서, 무엇이 모자라는지 바로 알게 한다
      const mats = Object.entries(r.mats) as [ItemId, number][];
      const parts = [itemInfo(r.id), ...mats.map(([id, n]) => loc.fmt.mat(loc.items[id].name, items[id] ?? 0, n))];
      if (gold < r.gold) parts.push(loc.fmt.short(r.gold - gold));
      // 항목 하나(재료 이름과 수)가 중간에서 줄이 바뀌지 않게 덩어리로 넣는다
      parts.forEach((p, i) => {
        const s = document.createElement('span');
        s.className = 'opt'; s.textContent = p;
        if (i) note.append(' · ');
        note.append(s);
      });
      btn.disabled = gold < r.gold || mats.some(([id, n]) => (items[id] ?? 0) < n);
      for (const [id, n] of mats) if ((items[id] ?? 0) < n) lacking.add(id);
    }
    row.append(info, btn);
    ui.list.appendChild(row);
  }
  for (const id of lacking) {
    const text = sourceLine(id);
    if (!text) continue;
    const src = document.createElement('div');
    src.className = 'note';
    src.textContent = text;
    ui.list.appendChild(src);
  }
}

/** 가끔: 잠금이 풀렸고 그 가까이에 있을 때만 창을 연다 */
export function forgeSlow(): void {
  const me = S.me;
  ui.panel.hidden = !me || !open() || Math.hypot(me.x - SMITHY.x, me.z - SMITHY.z) > SMITHY_REACH;
}
