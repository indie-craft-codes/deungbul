// [items] 상품 (상점의 일반화, 묶음 6): 내용의 GOODS에 적은 상품을 판다. GOODS가 비어 있으면 이 시스템은 만들어지지 않는다 (NPC 상점 shop.ts는 그대로다).
//   값      price { cur, n, kind? }: kind를 주면 그 종류의 몫으로만 (이벤트 상점: 이벤트 재화 'event')
//   주는 것  give(골드·두 번째 재화·경험치·아이템 여럿: 묶음), hero(영웅 하나, roster 모듈). 아이템이 가방에 다 들어가지 않으면 값을 치르기 전에 막는다
//   한정    limit { n, per }: 사람마다, 그 기간(초기화 시각 RESET의 날·주·달, 또는 ever)에 살 수 있는 수. 이벤트 상품의 ever는 그 이벤트의 회차마다
//   수량    stock: 서버 전체에서 팔 수 있는 수. 서버가 세고 월드와 함께 저장한다 (월드 저장의 goods 칸)
//   기간    from·to, 또는 event(그 이벤트의 기간)
//   어디서  shop 'npc'는 길 상인의 창(상인 곁에서만), 그 밖은 메뉴의 '상점' 탭, event는 '이벤트' 탭
// 명령: { t: 'goods', id }. 산 것은 사건 counted('buy')로 센다 (일일·이벤트 임무, 시즌 점수, 업적이 함께 본다). 개인 상태 'goods'(GoodsMe): 이번 기간에 산 수, 서버에 남은 수.
import { GOODS, eventDef, goodsDef, goodsIds, goodsOpen, hasGoods, isHeroId, isItemId, itemCap, nearShop, type GoodsDef, type GoodsMe, type Reward } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { CURS } from './wallet';

/** 장부의 원인 이름 (명령) */
export const GOODS_WHY = 'cmd:goods';
/** 사람마다: 상품 id → [이번 기간에 산 수, 그 기간의 열쇠] */
type Bought = Record<string, [number, string]>;

/** 보상을 바로 준다: 재화는 지갑, 아이템은 가방 (들어가지 않은 것은 우편으로). 상품과 시즌 트랙이 쓴다 */
export function giveNow(g: Game, p: Ent, r: Reward, why: string): void {
  for (const k of CURS) if (r[k]) g.wallet.add(p, k, r[k]!, why);
  const left: Record<string, number> = {};
  if (r.items && g.has('items')) for (const [id, n] of Object.entries(r.items)) { if (!isItemId(id) || !(n >= 1)) continue; const got = g.bag.putItem(p, id, n, why); if (n > got) left[id] = n - got; }
  const rest: Reward = { ...(Object.keys(left).length ? { items: left } : {}), ...(r.gear?.length ? { gear: r.gear } : {}) };
  if (hasGoods(rest) && g.has('mail')) g.mail.send(p, 'comp', [], rest);
}
/** 보상 여럿을 하나로 (우편 한 통) */
export function mergeRewards(list: readonly Reward[]): Reward {
  const pay: Partial<Record<(typeof CURS)[number], number>> = {}, things: Record<string, number> = {};
  for (const r of list) {
    for (const k of CURS) if (r[k]) pay[k] = (pay[k] ?? 0) + r[k]!;
    for (const [id, n] of Object.entries(r.items ?? {})) things[id] = (things[id] ?? 0) + n;
  }
  const gear = list.flatMap((r) => r.gear ?? []);
  return { ...pay, ...(Object.keys(things).length ? { items: things } : {}), ...(gear.length ? { gear } : {}) };
}

export class Goods {
  private bought = new WeakMap<Ent, Bought>();
  /** 상품 id → 서버 전체에서 판 수 (수량이 있는 상품) */
  private sold: Record<string, number> = {};

  constructor(private g: Game) {
    for (const id of goodsIds()) if (goodsDef(id)!.give.gear?.length) throw new Error(`[goods] GOODS.${id}: 장비(give.gear)는 상품으로 줄 수 없습니다 (우편으로 보내는 보상에만)`);
    g.commands.set('goods', (p, m) => { if (typeof m.id === 'string') this.buy(p, m.id); });
    g.saves.push({
      name: 'goods',
      save: (p) => { const b = this.bought.get(p); return b && Object.keys(b).length ? b : undefined; },
      load: (p, raw) => {
        if (typeof raw !== 'object' || raw === null) return;
        const b: Bought = {};
        for (const [id, v] of Object.entries(raw as Record<string, unknown>)) if (goodsDef(id) && Array.isArray(v) && Number.isInteger(v[0]) && v[0] > 0 && typeof v[1] === 'string') b[id] = [v[0], v[1]];
        this.bought.set(p, b);
      },
    });
    g.worldSaves.push({
      name: 'goods',
      save: () => (Object.keys(this.sold).length ? { sold: this.sold } : undefined),
      load: (raw) => {
        const s = (raw as { sold?: unknown } | null)?.sold;
        if (typeof s !== 'object' || s === null) return;
        for (const [id, n] of Object.entries(s as Record<string, unknown>)) if (goodsDef(id) && Number.isInteger(n) && (n as number) > 0) this.sold[id] = n as number;
      },
    });
    g.personal.push({ name: 'goods', state: (p): GoodsMe => this.me(p) });
  }

  /** 그 상품의 한정이 새로 차는 기간의 열쇠 */
  private keyOf(def: GoodsDef): string {
    const per = def.limit?.per ?? 'ever';
    if (per !== 'ever') return this.g.time.keyOf(per);
    return def.event ? `ev:${eventDef(def.event)?.from ?? 0}` : '';
  }
  /** 이번 기간에 그 사람이 산 수 */
  count(p: Ent, id: string): number {
    const def = goodsDef(id), b = this.bought.get(p)?.[id];
    return def && b && b[1] === this.keyOf(def) ? b[0] : 0;
  }
  /** 서버에 남은 수 (수량이 없으면 Infinity) */
  left(id: string): number { const s = goodsDef(id)?.stock; return s === undefined ? Infinity : Math.max(0, s - (this.sold[id] ?? 0)); }
  me(p: Ent): GoodsMe {
    const b: Record<string, number> = {}, s: Record<string, number> = {};
    for (const id of goodsIds()) { const n = this.count(p, id); if (n) b[id] = n; const l = this.left(id); if (l !== Infinity) s[id] = l; }
    return { b, s };
  }

  /** 산다. 살 수 없으면 까닭을 알리고 false (goodsNo: 0 팔지 않음, 1 한도, 2 품절, 3 재화, 4 가방, 5 상인 곁이 아님) */
  buy(p: Ent, id: string): boolean {
    const g = this.g, def = goodsDef(id);
    const no = (why: number): false => { g.notify(p, 'goodsNo', why, id); return false; };
    if (!def || !goodsOpen(def, g.now()) || (def.event && !g.has('event'))) return no(0);
    if (def.shop === 'npc' && !nearShop(p)) return no(5);
    if (def.limit && this.count(p, id) >= def.limit.n) return no(1);
    if (this.left(id) <= 0) return no(2);
    for (const [item, n] of Object.entries(def.give.items ?? {})) if (!g.has('items') || !isItemId(item) || g.bag.count(p, item) + n > itemCap(item)) return no(4);
    const pr = def.price;
    const paid = pr.kind ? g.wallet.takeKind(p, pr.cur, pr.kind, pr.n, GOODS_WHY) : g.wallet.take(p, pr.cur, pr.n, GOODS_WHY);
    if (!paid) return no(3);
    giveNow(g, p, def.give, GOODS_WHY);
    if (def.hero && g.has('roster') && isHeroId(def.hero)) g.roster.grant(p, def.hero);
    const b = this.bought.get(p) ?? {}, key = this.keyOf(def);
    b[id] = [(b[id]?.[1] === key ? b[id][0] : 0) + 1, key];
    this.bought.set(p, b);
    if (def.stock !== undefined) { this.sold[id] = (this.sold[id] ?? 0) + 1; g.saveDirty = true; }
    p.dirty = true; p.unsaved = true;
    g.notify(p, 'goodsGot', id);
    if (g.has('codex')) for (const item of Object.keys(def.give.items ?? {})) g.codex.note(p, 'item', item);
    if (g.has('daily')) g.daily.add(p, 'buy', 1);
    return true;
  }
}

/** 상품이 있는 게임인가 (없으면 시스템을 만들지 않는다) */
export const hasGoodsDefs = (): boolean => Object.keys(GOODS).length > 0;
