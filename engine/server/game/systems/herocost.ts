// 영웅의 성장(기술 레벨, 각성, 영웅 장비의 강화)에 드는 값을 치르는 한 통로: 재화는 지갑(g.wallet), 재료는 가방(g.bag)을 지난다 (원인은 부른 쪽의 명령 이름).
// 모두 치를 수 있는지 먼저 보고, 하나라도 모자라면 아무것도 바꾸지 않고 까닭을 알린다 (재화 costShort, 재료 itemShort).
import { isItemId, type HeroCost } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

/** 값을 치를 수 있는가: 모자란 것이 있으면 그것 (재화 또는 재료와 모자란 수), 없으면 null */
export function costShort(g: Game, p: Ent, c: HeroCost): { cur: string } | { item: string; miss: number } | null {
  if (c.cur && c.n && c.n > 0 && !g.wallet.can(p, c.cur, c.n)) return { cur: c.cur };
  for (const [id, n] of Object.entries(c.items ?? {})) {
    if (!(n > 0)) continue;
    const have = g.has('items') && isItemId(id) ? g.bag.count(p, id) : 0;
    if (have < n) return { item: id, miss: n - have };
  }
  return null;
}

/** 값을 치른다. 모자라면 까닭을 알리고 false (아무것도 바뀌지 않는다) */
export function payCost(g: Game, p: Ent, c: HeroCost, why: string): boolean {
  const short = costShort(g, p, c);
  if (short) {
    if ('cur' in short) g.notify(p, 'costShort', short.cur); else g.notify(p, 'itemShort', short.item, short.miss);
    return false;
  }
  if (c.cur && c.n && c.n > 0) g.wallet.take(p, c.cur, c.n, why);
  for (const [id, n] of Object.entries(c.items ?? {})) if (n > 0 && isItemId(id)) g.bag.takeItem(p, id, n, why);
  return true;
}
