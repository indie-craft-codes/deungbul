// 소탕의 도우미 (stages 모듈의 단계 소탕, dungeon 모듈의 열쇠 던전 소탕이 함께 쓴다): 값(재화나 소탕권 아이템)을 치르고, 보상을 지갑·가방으로 바로 준다.
// 시스템이 아니다(명령도 틱도 없다): 명령은 단계({ t: 'stage', a: 'sweep' })와 던전({ t: 'dungeonSweep' })이 저마다 받는다.
// 값의 원인은 그 명령의 이름(cmd:stage:sweep, cmd:dungeonSweep: 장부가 명령에 붙이는 이름과 같다), 보상의 원인은 SWEEP_WHY('sweep')다.
import { isItemId, type Reward, type SweepCost, type SweepGot } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { CURS } from './wallet';

/** 지갑과 가방에 넘기는 원인의 이름: 소탕으로 받은 보상 */
export const SWEEP_WHY = 'sweep';

/** 값을 치를 것이 그 게임에 있는가 (재화는 economy, 아이템은 items 모듈과 ITEMS의 id). 없으면 시작할 때 알린다 */
export function costProblem(g: Game, cost: SweepCost | undefined, where: string): string {
  if (!cost) return '';
  if (!(cost.n >= 0) || !Number.isFinite(cost.n)) return `${where}: 소탕의 값 n이 깨져 있습니다 (${cost.n})`;
  if ('item' in cost) return !g.has('items') ? `${where}: 소탕권(아이템 ${cost.item})은 items 모듈이 있어야 씁니다` : !isItemId(cost.item) ? `${where}: 소탕권 '${cost.item}'이 ITEMS에 없습니다` : '';
  return !g.has('economy') ? `${where}: 재화로 치르는 소탕은 economy 모듈이 있어야 합니다` : '';
}

/** 가진 수 (재화나 아이템) */
export function costHave(g: Game, p: Ent, cost: SweepCost): number {
  return 'item' in cost ? g.bag.count(p, cost.item) : g.field(p, cost.cur);
}

/** n번 치를 수 있는가. 모자라면 안내문(itemShort: [재화나 아이템 id, 드는 수, 가진 수])을 보내고 false */
export function costCheck(g: Game, p: Ent, cost: SweepCost | undefined, n: number): boolean {
  if (!cost || cost.n <= 0) return true;
  const need = Math.ceil(cost.n) * n, have = costHave(g, p, cost);
  if (have >= need) return true;
  g.notify(p, 'itemShort', 'item' in cost ? cost.item : cost.cur, need, have);
  return false;
}

/** n번의 값을 치른다 (costCheck를 먼저 본다). 원인은 그 명령의 이름 */
export function costPay(g: Game, p: Ent, cost: SweepCost | undefined, n: number, why: string): boolean {
  if (!cost || cost.n <= 0) return true;
  const need = Math.ceil(cost.n) * n;
  return 'item' in cost ? g.bag.takeItem(p, cost.item as Parameters<typeof g.bag.takeItem>[1], need, why) : g.wallet.take(p, cost.cur, need, why);
}

/** 보상 하나를 지갑과 가방으로 바로 준다 (재화는 지갑, 재료·물약은 가방, 장비는 장비 모듈). 실제로 받은 것을 sum에 더한다 */
export function giveInto(g: Game, p: Ent, rw: Reward, why: string, sum: SweepGot): void {
  if (g.has('economy')) for (const cur of CURS) { const n = rw[cur]; if (n) { const got = g.wallet.add(p, cur, n, why); if (got) sum.cur[cur] = (sum.cur[cur] ?? 0) + got; } }
  if (g.has('items')) for (const [id, n] of Object.entries(rw.items ?? {})) { const got = g.bag.putItem(p, id as Parameters<typeof g.bag.putItem>[1], n, why); if (got) sum.goods[id] = (sum.goods[id] ?? 0) + got; }
  if (g.has('gear')) for (const it of rw.gear ?? []) { g.gear.give(p, structuredClone(it), why); sum.equip++; }
}

/** 빈 결과 */
export const sweepGot = (k: SweepGot['k'], id: string, n: number): SweepGot => ({ k, id, n, cur: {}, goods: {}, equip: 0 });
