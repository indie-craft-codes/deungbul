// 상점과 소지품: 길 상인에게서 무기와 물약을 사고, 물약을 마신다. 무기는 공격 피해를 올린다.
// 잠금 열쇠(ItemDef.needs)가 있는 물건은 게임의 규칙(g.rules.unlocked)이 풀어야 상점에 들어온다.
import { ITEMS, POTION_CD, POTION_MAX, nearShop, isItemId, itemCap, itemDef, type ItemId } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { WHY } from './wallet';

export class Shop {
  constructor(private g: Game) {
    g.commands.set('buy', (p, m) => { if (isItemId(m.id)) this.buy(p, m.id); });
    g.commands.set('use', (p, m) => { if (isItemId(m.id)) this.use(p, m.id); });
    // 들고 있는 무기만큼 피해가 커진다
    g.mods.provide('damage', (p) => (p && isItemId(p.weapon) ? itemDef(p.weapon).damage ?? 1 : 1));
    // 입은 갑옷만큼 받는 피해가 준다
    g.mods.provide('guard', (p) => (p && isItemId(p.armor) ? itemDef(p.armor).guard ?? 1 : 1));
  }

  /** 지금 상점에 있는 물건인가 (잠금이 풀렸는가) */
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
      // 사면 바로 끼고 벗은 것이 가방에 남는다: 가방이 가득 찼으면 값을 치르기 전에 막는다 (31 / 30이 되던 것: 후반부 검토)
      if (g.bag.full(p)) { g.notify(p, 'gearBagFull'); return; }
    } else if (g.bag.count(p, id) >= POTION_MAX) { g.notify(p, 'potionFull'); return; }
    if (!g.wallet.take(p, 'gold', def.price, WHY.buy)) { g.notify(p, 'noGold'); return; }

    if (!Shop.wear(g, p, id, false, WHY.buy)) g.bag.putItem(p, id, 1, WHY.buy);
    p.dirty = true; p.unsaved = true;
    g.notify(p, 'bought', id, g.field(p, 'cls'));
    g.fire('bought', p, id);
  }

  private use(p: Ent, id: ItemId): void {
    const g = this.g, def = itemDef(id);
    // 물약은 체력을 채운다: 전투 모듈이 없으면(체력이 없으면) 늘 '가득 찼다'에서 멈춘다 (그 아래는 전투의 칸을 쓴다)
    if (def.kind !== 'potion' || g.field(p, 'itemCd') > 0) return;
    if (!g.bag.count(p, id)) { g.notify(p, 'noPotion'); return; }
    if (g.field(p, 'hp') >= g.field(p, 'maxHp')) { g.notify(p, 'hpFull'); return; }
    const amount = Math.round(Math.min(def.heal ?? 0, p.maxHp - p.hp));
    g.bag.takeItem(p, id, 1, WHY.use);
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

  /** 무기나 갑옷이면 기본 장비로 가방에 넣고 바로 갈아 낀다 (systems/gear.ts). 장비가 아니면 false. why: 원인의 이름 (가방 통로가 장부에 알린다) */
  static wear(g: Game, p: Ent, id: ItemId, made = false, why = ''): boolean {
    return g.has('gear') && g.gear.acquire(p, id, made, why);
  }

  /** 저장된 소지품을 읽는다. 없어진 아이템이나 이상한 수는 버린다. */
  static readItems(raw: unknown): Record<string, number> {
    const out: Record<string, number> = {};
    if (typeof raw !== 'object' || raw === null) return out;
    for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
      if (!isItemId(id) || typeof n !== 'number' || !(n > 0)) continue;
      const kind = ITEMS[id].kind;
      if (kind !== 'weapon' && kind !== 'armor') out[id] = Math.min(itemCap(id), Math.floor(n));
    }
    return out;
  }
}
