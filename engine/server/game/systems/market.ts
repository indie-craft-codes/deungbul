// 거래소: 플레이어끼리 장비와 제작 재료를 골드로 사고판다. 올린 물건은 판매자에게서 빠져 거래소가 맡는다(복사가 생기지 않게).
// 판 값과 돌아오는 물건은 우편으로 간다: 판매자가 접속해 있지 않아도 받아야 하므로 사람을 저장 키(Ent.pid)로 가리킨다.
// 손님(저장 키가 없는 접속)은 쓸 수 없다. 거래소는 월드와 함께 저장되고, 규칙의 수치는 games/deungbul/shared/content/social.ts의 MARKET에 있다.
import { ENHANCE, MAIL_MAX, MARKET, hasGoods, isItemId, itemCap, isMarketFilter, isMarketSort, isSupply, marketFee, type Gear, type ItemId, type MailKind, type MarketFilter, type MarketItem, type MarketSort, type Reward, itemDef } from '../../../shared/defs';
import { NAME_MAX } from '../../../shared/world';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { personalData } from '../personal';
import { GearSys } from './gear';
import { WHY } from './wallet';

/** 올라온 물건 하나. 장비(gear)이거나 재료 묶음(item과 n)이다 */
interface Listing {
  id: number;
  /** 판매자의 저장 키와, 올릴 때의 이름 */
  seller: string; name: string;
  gear?: Gear;
  item?: ItemId;
  n: number;
  /** 묶음 전체의 값 */
  price: number;
  /** 이 시각(ms, g.now 기준)이 지나면 판매자에게 돌아간다 */
  until: number;
}

/** 명령으로 들어온 값이 그 범위의 정수인가. 문자열, 소수, NaN, 무한대, 범위 밖의 수를 모두 걸러 낸다 */
const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isMat = (v: unknown): v is ItemId => isItemId(v) && itemDef(v).kind === 'mat';

export class Market {
  private listings = new Map<number, Listing>();
  private nextId = 1;
  /** 목록을 마지막으로 달라고 한 시각 (요청을 몰아 보내 서버를 느리게 하지 못하게) */
  private asked = new Map<number, number>();
  /** 지금까지 수수료로 사라진 골드 */
  private burned = 0;
  /** 기간이 지난 물건을 마지막으로 거둔 뒤 흐른 시간(초). 켜지자마자 한 번 거두도록 가득 채워 둔다 */
  private since = MARKET.sweepS;

  constructor(private g: Game) {
    g.commands.set('market', (p, m) => {
      switch (m.a) {
        case 'list': if (g.clock - (this.asked.get(p.id) ?? -99) < MARKET.listGapS) break; this.asked.set(p.id, g.clock); this.browse(p, isMarketFilter(m.f) ? m.f : 'all', isMarketSort(m.sort) ? m.sort : 'new', int(m.page, 0, Number.MAX_SAFE_INTEGER) ? m.page : 0); break;
        case 'mine': this.tellMine(p); break;
        case 'post': this.post(p, m); break;
        case 'buy': if (int(m.id, 1, Number.MAX_SAFE_INTEGER)) this.buy(p, m.id); break;
        case 'cancel': if (int(m.id, 1, Number.MAX_SAFE_INTEGER)) this.cancel(p, m.id); break;
      }
    });
    g.on('playerJoined', (p) => { if (p.pid) this.tellMine(p); });
    g.on('playerLeft', (id) => { this.asked.delete(id); });
    g.ticks.push((dt) => { this.since += dt; if (this.since >= MARKET.sweepS) { this.since = 0; this.sweep(); } });
    g.worldSaves.push({ name: 'market', save: () => ({ next: this.nextId, burned: this.burned, list: [...this.listings.values()] }), load: (d) => this.load(d) });
    // 내 데이터 (engine/server/game/personal.ts): 내보내기는 내가 올려 둔 물건, 삭제는 그것을 내린다 (주인이 사라지므로 물건도 함께 없어진다. 이미 팔린 것은 산 사람의 것)
    personalData(g).push({
      name: 'market',
      get: (pid) => { const list = this.own(pid); return list.length ? list.map((l) => ({ what: Market.what(l), n: l.n, price: l.price, until: l.until })) : undefined; },
      erase: (pid) => { for (const l of this.own(pid)) this.listings.delete(l.id); g.saveDirty = true; },
    });
  }

  private load(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as { next?: unknown; burned?: unknown; list?: unknown };
    if (!Array.isArray(d.list)) return;
    for (const raw of d.list as Listing[]) {
      if (typeof raw !== 'object' || raw === null || !int(raw.id, 1, Number.MAX_SAFE_INTEGER) || this.listings.has(raw.id)) continue;
      if (typeof raw.seller !== 'string' || !raw.seller || typeof raw.name !== 'string' || !int(raw.price, 1, MARKET.maxPrice) || typeof raw.until !== 'number' || !Number.isFinite(raw.until)) continue;
      const l: Listing = { id: raw.id, seller: raw.seller, name: raw.name.slice(0, NAME_MAX), n: 1, price: raw.price, until: raw.until };
      if (GearSys.valid(raw.gear)) l.gear = raw.gear;
      else if (isMat(raw.item) && int(raw.n, 1, itemCap(raw.item))) { l.item = raw.item; l.n = raw.n; }
      else continue;
      this.listings.set(l.id, l);
      this.nextId = Math.max(this.nextId, l.id + 1);
    }
    if (int(d.next, 1, Number.MAX_SAFE_INTEGER)) this.nextId = Math.max(this.nextId, d.next);
    if (int(d.burned, 0, Number.MAX_SAFE_INTEGER)) this.burned = d.burned;
  }

  /** 우편 제목에 넣을 물건의 이름표: 재료와 무기·갑옷은 아이템 id, 그 밖의 장비는 칸 */
  private static what(l: Listing): string { return l.gear ? l.gear.base ?? l.gear.slot : l.item ?? ''; }
  /** 물건을 우편에 붙일 모양으로 */
  private static goods(l: Listing): Reward { return l.gear ? { gear: [l.gear] } : { items: { [l.item ?? '']: l.n } }; }

  private view(l: Listing, me: Ent, now: number): MarketItem {
    return { id: l.id, gear: l.gear, item: l.item, n: l.n, price: l.price, seller: l.name, mine: !!me.pid && l.seller === me.pid, left: Math.max(0, Math.round((l.until - now) / 1000)) };
  }
  private own(pid: string): Listing[] { return [...this.listings.values()].filter((l) => l.seller === pid); }

  /** 목록의 한 쪽을 보낸다. 기간이 지났지만 아직 거두지 않은 물건은 보이지 않는다 */
  private browse(p: Ent, f: MarketFilter, sort: MarketSort, page: number): void {
    const now = this.g.now();
    const all = [...this.listings.values()].filter((l) => l.until > now && (f === 'all' || (f === 'mat' ? !!l.item : l.gear?.slot === f)));
    all.sort((a, b) => (sort === 'cheap' ? a.price - b.price : sort === 'costly' ? b.price - a.price : 0) || b.id - a.id);
    const pages = Math.max(1, Math.ceil(all.length / MARKET.pageSize));
    page = Math.min(page, pages - 1);
    const list = all.slice(page * MARKET.pageSize, (page + 1) * MARKET.pageSize).map((l) => this.view(l, p, now));
    this.g.out.push({ id: p.id, msg: { t: 'market', v: 'list', list, f, sort, page, pages, total: all.length, guest: p.pid ? undefined : true } });
  }

  /** 그 사람이 올려 둔 것을 알린다 */
  private tellMine(p: Ent): void {
    const now = this.g.now();
    const list = p.pid ? this.own(p.pid).sort((a, b) => a.until - b.until || a.id - b.id).map((l) => this.view(l, p, now)) : [];
    this.g.out.push({ id: p.id, msg: { t: 'market', v: 'mine', list, guest: p.pid ? undefined : true } });
  }
  /** 판매자가 월드에 있으면 올려 둔 것이 바뀌었음을 알린다 */
  private tellSeller(pid: string): void {
    const s = this.g.mail.find(pid);
    if (s) this.tellMine(s);
  }

  /**
   * 우편함에 물건이 붙은 우편이 한도만큼 쌓였는가. 그러면 올리기와 사기를 막는다:
   * 가방이 가득한 채 올리고 내리거나 사면 물건이 우편으로 가고, 그런 우편은 밀려나지 않아서 우편함이 한도 없는 창고가 된다.
   * 내리기와 기간 만료는 막지 않는다 (물건이 갈 곳이 없어지면 안 된다). 그래도 올려 둘 수 있는 수가 정해져 있어 넘치는 양은 그만큼이다.
   */
  private mailFull(p: Ent): boolean {
    if (p.mail.filter((m) => hasGoods(m.r)).length < MAIL_MAX) return false;
    this.g.notify(p, 'marketMailFull', MAIL_MAX);
    return true;
  }

  /** 물건을 올린다. 올리는 순간 판매자의 가방에서 빠진다 */
  private post(p: Ent, m: Record<string, unknown>): void {
    const g = this.g;
    if (!p.pid) { g.notify(p, 'marketGuest'); return; }
    if (g.field(p, 'lv') < MARKET.minLv) { g.notify(p, 'marketNeedLv', MARKET.minLv); return; }
    if (!int(m.price, MARKET.minPrice, MARKET.maxPrice)) { g.notify(p, 'marketPriceBad', MARKET.maxPrice); return; }
    if (this.own(p.pid).length >= MARKET.maxListings) { g.notify(p, 'marketFull', MARKET.maxListings); return; }
    if (this.mailFull(p)) return;
    if (this.listings.size >= MARKET.maxTotal) { g.notify(p, 'marketCrowded'); return; }
    const l: Listing = { id: this.nextId, seller: p.pid, name: p.name, n: 1, price: m.price, until: g.now() + MARKET.hours * 3600000 };
    if (m.uid !== undefined) {
      const it = int(m.uid, 1, Number.MAX_SAFE_INTEGER) ? p.gear.find((x) => x.uid === m.uid) : undefined;
      // 낀 장비와 보급형(상점에서 산 것)은 올릴 수 없다
      if (!it || p.worn[it.slot] === it.uid || isSupply(it)) { g.notify(p, 'marketCant'); return; }
      if (it.lock) { g.notify(p, 'gearLocked'); return; }
      if (ENHANCE.bindPlus > 0 && it.plus >= ENHANCE.bindPlus) { g.notify(p, 'marketBound', ENHANCE.bindPlus); return; } // 강화한 장비는 귀속
      g.bag.removeGear(p, it.uid, WHY.marketPost);
      it.uid = 0; // 장비 번호는 캐릭터 안에서만 뜻이 있다. 받는 사람의 가방에 들어갈 때 새로 붙는다
      l.gear = it;
      p.metaDirty = true;
    } else {
      if (!isMat(m.item) || !int(m.n, 1, itemCap(m.item))) { g.notify(p, 'marketCant'); return; }
      if (!g.bag.takeItem(p, m.item, m.n, WHY.marketPost)) { g.notify(p, 'noMats'); return; }
      l.item = m.item; l.n = m.n;
      p.dirty = true;
    }
    this.nextId++;
    this.listings.set(l.id, l);
    p.unsaved = true; g.saveDirty = true;
    g.notify(p, 'marketPosted', l.price);
    this.tellMine(p);
  }

  /** 물건을 그 사람에게 건넨다. 가방에 자리가 없거나 재료가 한도를 넘으면 넘는 만큼은 우편으로 간다 */
  private hand(p: Ent, l: Listing, kind: MailKind, why: string): void {
    const g = this.g, what = Market.what(l);
    if (l.gear) {
      if (!g.gear.put(p, l.gear, why)) g.mail.send(p, kind, [what, 1, l.price], { gear: [l.gear] });
    } else if (l.item) {
      const got = g.bag.putItem(p, l.item, l.n, why);
      if (l.n > got) g.mail.send(p, kind, [what, l.n - got, l.price], { items: { [l.item]: l.n - got } });
    }
    p.dirty = true; p.metaDirty = true; p.unsaved = true;
  }

  private buy(p: Ent, id: number): void {
    const g = this.g, l = this.listings.get(id);
    if (!p.pid) { g.notify(p, 'marketGuest'); return; }
    // 이미 팔렸거나 내려갔거나, 기간이 지나 곧 돌아갈 물건
    if (!l || l.until <= g.now()) { g.notify(p, 'marketGone'); return; }
    if (l.seller === p.pid) { g.notify(p, 'marketOwn'); return; }
    if (g.field(p, 'lv') < MARKET.minLv) { g.notify(p, 'marketNeedLv', MARKET.minLv); return; }
    if (this.mailFull(p)) return;
    // 값을 치른 뒤부터는 되돌리지 않는다: 먼저 목록에서 빼서 같은 물건이 두 번 팔리지 않게 한다
    if (!g.wallet.take(p, 'gold', l.price, WHY.marketBuy)) { g.notify(p, 'noGold'); return; }
    this.listings.delete(id);
    this.hand(p, l, 'marketBought', WHY.marketBuy);
    const fee = marketFee(l.price);
    this.burned += fee;
    g.mail.sendTo(l.seller, 'marketSold', [Market.what(l), l.n, l.price, fee], { gold: l.price - fee });
    g.saveDirty = true;
    g.notify(p, 'marketBought', l.price);
    this.tellSeller(l.seller);
  }

  /** 올린 사람이 직접 내린다 */
  private cancel(p: Ent, id: number): void {
    const g = this.g, l = this.listings.get(id);
    if (!p.pid) { g.notify(p, 'marketGuest'); return; }
    // 남의 물건은 내릴 수 없다: 없는 물건과 똑같이 답해서 번호로 남의 물건을 알아낼 수 없게 한다
    if (!l || l.seller !== p.pid) { g.notify(p, 'marketGone'); this.tellMine(p); return; }
    this.listings.delete(id);
    this.hand(p, l, 'marketBack', WHY.marketCancel);
    g.saveDirty = true;
    g.notify(p, 'marketCanceled');
    this.tellMine(p);
  }

  /** 기간이 지난 물건을 판매자에게 우편으로 돌려보낸다 (접속해 있지 않아도 간다) */
  sweep(): void {
    const g = this.g, now = g.now();
    for (const l of [...this.listings.values()]) {
      if (l.until > now) continue;
      this.listings.delete(l.id);
      g.mail.sendTo(l.seller, 'marketExpired', [Market.what(l), l.n, l.price], Market.goods(l));
      g.saveDirty = true;
      this.tellSeller(l.seller);
    }
  }

  /** 올라와 있는 물건의 수 (시험과 지표용) */
  get count(): number { return this.listings.size; }
  /** 올라와 있는 물건마다의 종류(장비 칸, 재료는 'item:아이템 id')와 낱개 값 (지표용) */
  listed(): { kind: string; price: number }[] { return [...this.listings.values()].map((l) => ({ kind: l.gear ? l.gear.slot : `item:${l.item}`, price: l.price / l.n })); }
  /** 지금까지 수수료로 사라진 골드 (시험과 지표용) */
  get taxed(): number { return this.burned; }
  /** 거래소가 맡고 있는 것: 장비의 수와 재료별 수량 (시험과 지표용) */
  held(): { gear: number; items: Record<string, number> } {
    const out = { gear: 0, items: {} as Record<string, number> };
    for (const l of this.listings.values()) { if (l.gear) out.gear++; else if (l.item) out.items[l.item] = (out.items[l.item] ?? 0) + l.n; }
    return out;
  }
}
