// [roster의 카드 손질] HERO_RULES.cards를 적은 게임만 만든다 (Roster가 만든다): 넘친 조각, 합성, 환원, 잠금, 일괄 성장. 셈은 engine/shared/defs/cardgrow.ts.
//   넘친 조각  다 키운 카드(별·각성이 최대)가 받는 조각은 overflow.item으로 바뀐다 (roster.grant가 spill을 부른다). 남아 있던 조각은 { t: 'card', a: 'convert', id }
//   합성      { t: 'card', a: 'fuse', r }: 잠그지 않은 r 등급 카드의 조각 need(r)개 → 표 'fuse:r'(확률표의 단일 원본)에서 한 단계 위 카드 하나. odds 모듈이 있으면 추첨 기록(종류 fuse)
//   환원      { t: 'card', a: 'reset', id }: 레벨(과 기술 레벨)을 1로, 쓴 값의 refund 비율을 돌려준다 (재화는 지갑, 재료는 가방, 넘치면 우편). 잠근 카드는 하지 않는다
//   잠금      { t: 'card', a: 'lock', id, on }: 저장과 개인 상태 heroes의 줄 끝에 1 (roster.ts의 line)
//   일괄 성장  { t: 'card', a: 'levels', id, n }(n번, 0이면 최대까지), { t: 'card', a: 'stars', id? }(그 카드, 없으면 모든 카드의 별을 조각이 되는 만큼)
// 원인 이름: cmd:card:fuse·reset·convert (레벨 업은 roster와 같은 cmd:hero:level). 안내문: card* (engine/shared/messages.ts)
import { HERO_RULES as HERO_RULES_IN, bulkLevel, bulkStars, cardMaxed, cardRules, fuseNeed, fusePick, fuseHave, fuseTable, heroDef, isHeroId, isItemId, overflowGot, resetBack, rollStep, type HeroRules } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { giveNow } from './goods';
import type { Roster } from './roster';

const HR: HeroRules = HERO_RULES_IN;
export const CARD_WHY = { fuse: 'cmd:card:fuse', reset: 'cmd:card:reset', convert: 'cmd:card:convert' } as const;

export class CardGrow {
  /** 합성의 난수 (시험은 seededRng로 바꾼다) */
  rng: () => number = Math.random;

  constructor(private g: Game, private roster: Roster) {
    const c = cardRules();
    const it = c?.overflow?.item;
    if (it !== undefined && (!g.has('items') || !isItemId(it))) throw new Error(`[cards] HERO_RULES.cards.overflow.item '${it}': items 모듈과 ITEMS의 아이템이어야 합니다`);
    if (c?.reset && !(c.reset.refund >= 0 && c.reset.refund <= 1)) throw new Error('[cards] HERO_RULES.cards.reset.refund는 0~1이어야 합니다');
    g.commands.set('card', (p, m) => {
      if (p.bot) return;
      if (m.a === 'fuse') { if (c?.fuse && typeof m.r === 'number' && Number.isInteger(m.r)) this.fuse(p, m.r); return; }
      if (m.a === 'stars') { if (c?.bulk && (m.id === undefined || isHeroId(m.id))) this.stars(p, m.id); return; }
      if (!isHeroId(m.id)) return;
      if (m.a === 'convert') { if (c?.overflow) this.convert(p, m.id); }
      else if (m.a === 'reset') { if (c?.reset) this.reset(p, m.id); }
      else if (m.a === 'lock') { if (c?.lock) this.lock(p, m.id, m.on === true); }
      else if (m.a === 'levels') { if (c?.bulk && typeof m.n === 'number' && Number.isInteger(m.n)) this.levels(p, m.id, m.n); }
    });
  }

  /**
   * 넘친 조각: 다 키운 카드라면 받은 조각 n개를 아이템으로 바꾼다 (가방의 한도까지). 바꾼 조각(used)과 받은 아이템(got).
   * quiet가 아니면 안내문 cardOverflow (뽑기는 결과 창에 보인다)
   */
  spill(p: Ent, id: string, n: number, quiet = false): { used: number; got: number } {
    const o = cardRules()?.overflow, h = this.roster.owned(p, id);
    if (!o || !h || !cardMaxed(h) || !(n > 0) || !this.g.has('items') || !isItemId(o.item)) return { used: 0, got: 0 };
    const r = heroDef(id).rarity, room = this.g.bag.room(p, o.item);
    let used = n;
    while (used > 0 && overflowGot(r, used) > room) used = Math.min(used - 1, Math.floor(room / Math.max(1e-9, o.rate(r))));
    const want = overflowGot(r, used);
    if (!(want > 0)) return { used: 0, got: 0 };
    const got = this.g.bag.putItem(p, o.item, want, CARD_WHY.convert);
    if (!quiet) this.g.notify(p, 'cardOverflow', id, used, o.item, got);
    return { used, got };
  }

  /** 다 키운 카드에 남아 있던 조각을 바꾼다 (넘친 조각). 바꾼 수 */
  convert(p: Ent, id: string): number {
    const h = this.roster.owned(p, id);
    if (!h || !cardMaxed(h) || h.shards <= 0) return 0;
    const sp = this.spill(p, id, h.shards);
    h.shards -= sp.used;
    if (sp.used) p.unsaved = true;
    else this.g.notify(p, 'cardFull', cardRules()!.overflow!.item);
    return sp.got;
  }

  /** 잠금을 켜거나 끈다 */
  lock(p: Ent, id: string, on: boolean): void {
    const h = this.roster.owned(p, id);
    if (!h || !!h.lock === on) return;
    if (on) h.lock = true; else delete h.lock;
    p.unsaved = true;
    this.g.notify(p, 'cardLock', id, on ? 1 : 0);
  }

  /** 합성: r 등급의 조각 need(r)개 → 한 단계 위 카드 하나 (추첨은 확률표 'fuse:r'에서). 얻은 카드 (안 되면 null) */
  fuse(p: Ent, r: number): string | null {
    const g = this.g, t = fuseTable(r), step = t?.steps[0];
    if (!t || !step) return null;
    const pick = fusePick(r, p.heroes, (id) => !!p.heroes[id].lock);
    if (!pick) { g.notify(p, 'cardFuseNo', r, fuseHave(r, p.heroes, (id) => !!p.heroes[id].lock), fuseNeed(r)); return null; }
    const o = rollStep(step, this.rng());
    if (!o) return null;
    for (const [id, n] of pick) p.heroes[id].shards -= n;
    const got = this.roster.grant(p, o.id, true);
    if (g.has('odds')) g.odds.record(p, 'fuse', t, [step.key], [o.id], { cur: `shards:${r}`, n: fuseNeed(r) });
    p.unsaved = true;
    g.track('card_fuse', { r, h: o.id }, p);
    g.notify(p, 'cardFused', r, o.id, got?.dup ? 1 : 0, got?.shards ?? 0, got?.x ?? 0);
    return o.id;
  }

  /** 환원: 레벨(과 기술 레벨)을 1로, 쓴 값의 일부를 돌려준다. 잠근 카드는 하지 않는다 */
  reset(p: Ent, id: string): boolean {
    const g = this.g, h = this.roster.owned(p, id);
    if (!h) return false;
    if (h.lock) { g.notify(p, 'cardIsLocked', id); return false; }
    const back = resetBack(id, h);
    if (!back) { g.notify(p, 'cardNoReset', id); return false; }
    h.lv = 1; delete h.skill;
    giveNow(g, p, { ...back.cur, ...(Object.keys(back.items).length ? { items: back.items } : {}) }, CARD_WHY.reset);
    p.unsaved = true;
    g.notify(p, 'cardReset', id, ...Object.entries({ ...back.cur, ...back.items }).flat());
    g.fire('heroChanged', p, id);
    return true;
  }

  /** 레벨을 n번(0이면 최대까지) 한꺼번에: 값은 한 번에 치른다 (원인은 레벨 업과 같다). 오른 레벨의 수 */
  levels(p: Ent, id: string, n: number): number {
    const g = this.g, h = this.roster.owned(p, id);
    if (!h) return 0;
    if (h.lv >= HR.maxLv(h.stars)) { g.notify(p, 'heroMaxLv', id); return 0; }
    const plan = bulkLevel(id, h.lv, h.stars, n > 0 ? n : Infinity, g.field(p, HR.levelCur));
    if (!plan.n || !g.wallet.take(p, HR.levelCur, plan.cost, 'cmd:hero:level')) { g.notify(p, 'costShort', HR.levelCur); return 0; }
    h.lv += plan.n;
    p.unsaved = true;
    g.notify(p, 'heroUp', id, h.lv);
    g.fire('heroChanged', p, id);
    return plan.n;
  }

  /** 별을 조각이 되는 만큼 (id가 없으면 가진 카드 모두). 오른 별의 수 */
  stars(p: Ent, id?: string): number {
    const g = this.g, ids = id === undefined ? Object.keys(p.heroes) : this.roster.owned(p, id) ? [id] : [];
    let heroes = 0, total = 0;
    for (const x of ids) {
      const h = p.heroes[x], plan = bulkStars(h.stars, h.shards);
      if (!plan.n) continue;
      h.shards -= plan.cost; h.stars += plan.n;
      heroes++; total += plan.n;
      g.fire('heroChanged', p, x);
    }
    if (total) { p.unsaved = true; g.notify(p, 'cardStars', heroes, total); }
    else if (id !== undefined) { const h = p.heroes[id]; if (h && h.stars < HR.maxStars) g.notify(p, 'heroShards', id, HR.starCost(h.stars) - h.shards); }
    else g.notify(p, 'cardStarsNone');
    return total;
  }
}
