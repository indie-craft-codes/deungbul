// 제작: 몬스터가 재료를 떨어뜨리고, 브람의 대장간에서 재료와 골드로 무기를 만든다.
import { DROPS, FORGES, RECIPES, SMITHY_REACH, isItemId, isMonsterId, itemDef, type ItemId } from '../../../shared/defs';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { Shop } from './shop';
import { WHY } from './wallet';

export class Craft {
  constructor(private g: Game) {
    g.commands.set('craft', (p, m) => { if (isItemId(m.id)) this.craft(p, m.id); });
    // 재료: 피해를 준 사람 각자가 따로 굴린다 (함께 잡아도 서로 빼앗지 않는다)
    g.on('monsterKilled', (m, hitters) => {
      const drop = isMonsterId(m.type) ? DROPS[m.type] : undefined;
      if (!drop) return;
      for (const p of hitters) {
        // 한도까지 찼으면 버려진다 (가방이 실제로 받은 수가 0)
        if (Math.random() >= drop.chance || !g.bag.putItem(p, drop.id, 1, g.players.huntWhy(p, m))) continue;
        g.notify(p, 'loot', drop.id);
      }
    });
  }

  private craft(p: Ent, id: ItemId): void {
    const g = this.g, recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    // 닿는 대장간이 있어야 하고, 그 대장간의 잠금(열쇠의 뜻은 게임이 정한다)이 풀려 있어야 한다
    const forge = FORGES.find((f) => dist(p, f) <= SMITHY_REACH);
    if (!forge) { g.notify(p, 'forgeFar'); return; }
    if (forge.needs && !g.rules.unlocked(forge.needs)) { g.notify(p, 'forgeClosed'); return; }
    const def = itemDef(id);
    if ((def.kind === 'weapon' || def.kind === 'armor') && (def.tier ?? 0) <= Shop.wornTier(p, def.kind)) { g.notify(p, 'alreadyBest'); return; }
    // 만들면 바로 끼고 벗은 것이 가방에 남는다: 가방이 가득 찼으면 재료와 골드를 쓰기 전에 막는다 (31 / 30이 되던 것: 후반부 검토)
    if ((def.kind === 'weapon' || def.kind === 'armor') && g.bag.full(p)) { g.notify(p, 'gearBagFull'); return; }
    const mats = Object.entries(recipe.mats) as [ItemId, number][];
    if (mats.some(([mat, n]) => g.bag.count(p, mat) < n)) { g.notify(p, 'noMats'); return; }
    if (!g.wallet.take(p, 'gold', recipe.gold, WHY.craft)) { g.notify(p, 'noGold'); return; }

    for (const [mat, n] of mats) g.bag.takeItem(p, mat, n, WHY.craft);
    if (!Shop.wear(g, p, id, true, WHY.craft)) g.bag.putItem(p, id, 1, WHY.craft);
    p.dirty = true; p.unsaved = true;
    g.notify(p, 'crafted', id, p.cls);
  }
}
