// 제작: 몬스터가 재료를 떨어뜨리고, 브람의 대장간에서 재료와 골드로 무기를 만든다.
import { DROPS, FORGES, MAT_MAX, RECIPES, SMITHY_REACH, isItemId, isMonsterId, itemDef, type ItemId } from '../../../shared/defs';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { Shop } from './shop';

export class Craft {
  constructor(private g: Game) {
    g.commands.set('craft', (p, m) => { if (isItemId(m.id)) this.craft(p, m.id); });
    // 재료: 피해를 준 사람 각자가 따로 굴린다 (함께 잡아도 서로 빼앗지 않는다)
    g.on('monsterKilled', (m, hitters) => {
      const drop = isMonsterId(m.type) ? DROPS[m.type] : undefined;
      if (!drop) return;
      for (const p of hitters) {
        if (Math.random() >= drop.chance || (p.items[drop.id] ?? 0) >= MAT_MAX) continue;
        p.items[drop.id] = (p.items[drop.id] ?? 0) + 1;
        p.dirty = true; p.unsaved = true;
        g.notify(p, 'loot', drop.id);
      }
    });
  }

  private craft(p: Ent, id: ItemId): void {
    const g = this.g, recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    // 닿는 대장간이 있어야 하고, 그 대장간의 잠금(이 게임에서는 대장장이 주민)이 풀려 있어야 한다
    const forge = FORGES.find((f) => dist(p, f) <= SMITHY_REACH);
    if (!forge) { g.notify(p, 'forgeFar'); return; }
    if (forge.needs && !g.rules.unlocked(forge.needs)) { g.notify(p, 'forgeClosed'); return; }
    const def = itemDef(id);
    if ((def.kind === 'weapon' || def.kind === 'armor') && (def.tier ?? 0) <= Shop.wornTier(p, def.kind)) { g.notify(p, 'alreadyBest'); return; }
    const mats = Object.entries(recipe.mats) as [ItemId, number][];
    if (mats.some(([mat, n]) => (p.items[mat] ?? 0) < n)) { g.notify(p, 'noMats'); return; }
    if (p.gold < recipe.gold) { g.notify(p, 'noGold'); return; }

    for (const [mat, n] of mats) p.items[mat] -= n;
    p.gold -= recipe.gold;
    if (!Shop.wear(g, p, id, true)) p.items[id] = (p.items[id] ?? 0) + 1;
    p.dirty = true; p.unsaved = true;
    g.notify(p, 'crafted', id, p.cls);
  }
}
