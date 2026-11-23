// 상점과 소지품: 길 상인에게서 무기와 물약을 사고, 물약을 마신다. 무기는 공격 피해를 올린다.
// 돌아온 주민에 따라 상점에 들어오는 물건이 늘어난다.
import { ITEMS, MAT_MAX, POTION_CD, POTION_MAX, nearShop, isItemId, itemDef, type ItemId } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

export class Shop {
  constructor(private g: Game) {
    g.commands.set('buy', (p, m) => { if (isItemId(m.id)) this.buy(p, m.id); });
    g.commands.set('use', (p, m) => { if (isItemId(m.id)) this.use(p, m.id); });
    // 들고 있는 무기만큼 피해가 커진다
    g.mods.provide('damage', (p) => (p && isItemId(p.weapon) ? itemDef(p.weapon).damage ?? 1 : 1));
    // 입은 갑옷만큼 받는 피해가 준다
    g.mods.provide('guard', (p) => (p && isItemId(p.armor) ? itemDef(p.armor).guard ?? 1 : 1));
  }

  /** 지금 상점에 있는 물건인가 (필요한 주민이 돌아왔는가) */
  stocked(id: ItemId): boolean {
    const needs = itemDef(id).needs;
    return !needs || this.g.rules.unlocked(needs);
  }

  private buy(p: Ent, id: ItemId): void {
    const g = this.g, def = itemDef(id);
    if (!nearShop(p)) { g.notify(p, 'shopFar'); return; }
    if (def.price <= 0 || !this.stocked(id)) { g.notify(p, 'notStocked'); return; }
    if (def.kind === 'weapon' || def.kind === 'armor') {
      if ((def.tier ?? 0) <= Shop.wornTier(p, def.kind)) { g.notify(p, 'alreadyBest'); return; }
    } else if ((p.items[id] ?? 0) >= POTION_MAX) { g.notify(p, 'potionFull'); return; }
    if (p.gold < def.price) { g.notify(p, 'noGold'); return; }

    p.gold -= def.price;
    if (!Shop.wear(g, p, id)) p.items[id] = (p.items[id] ?? 0) + 1;
    p.dirty = true; p.unsaved = true;
    g.notify(p, 'bought', id, p.cls);
    g.fire('bought', p, id);
  }

  private use(p: Ent, id: ItemId): void {
    const g = this.g, def = itemDef(id);
    if (def.kind !== 'potion' || p.itemCd > 0) return;
    if (!(p.items[id] > 0)) { g.notify(p, 'noPotion'); return; }
    if (p.hp >= p.maxHp) { g.notify(p, 'hpFull'); return; }
    const amount = Math.round(Math.min(def.heal ?? 0, p.maxHp - p.hp));
    p.items[id]--;
    p.hp += amount;
    p.itemCd = POTION_CD;
    p.dirty = true; p.unsaved = true;
    g.emit(['heal', p.id, amount]);
    g.itemCds.push({ id: p.id, ms: POTION_CD * 1000 });
  }

  /** 지금 든 무기나 입은 갑옷의 등급 (없으면 0) */
  static wornTier(p: Ent, kind: 'weapon' | 'armor'): number {
    const id = kind === 'weapon' ? p.weapon : p.armor;
    return isItemId(id) ? itemDef(id).tier ?? 0 : 0;
  }

  /** 무기나 갑옷이면 기본 장비로 가방에 넣고 바로 갈아 낀다 (systems/gear.ts). 장비가 아니면 false */
  static wear(g: Game, p: Ent, id: ItemId): boolean {
    return g.gear.acquire(p, id);
  }

  /** 저장된 소지품을 읽는다. 없어진 아이템이나 이상한 수는 버린다. */
  static readItems(raw: unknown): Record<string, number> {
    const out: Record<string, number> = {};
    if (typeof raw !== 'object' || raw === null) return out;
    for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
      if (!isItemId(id) || typeof n !== 'number' || !(n > 0)) continue;
      const kind = ITEMS[id].kind;
      if (kind !== 'weapon' && kind !== 'armor') out[id] = Math.min(kind === 'potion' ? POTION_MAX : MAT_MAX, Math.floor(n));
    }
    return out;
  }
}
