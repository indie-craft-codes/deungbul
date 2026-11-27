// [gacha] 뽑기: 배너(내용의 BANNERS)에서 1번·10번 뽑는다. 값은 게임 안의 재화(골드나 두 번째 재화)뿐이고 지갑(g.wallet)을 지난다: 현금·결제는 없다.
// 확률은 배너의 영웅마다의 무게(와 픽업)로만 정해진다. 굴림은 확률표의 단일 원본(engine/shared/defs/odds.ts의 bannerTable → pullStep → rollStep)에서만 한다:
// 화면의 확률표, 공개 페이지(odds 모듈), 이 시스템이 같은 표를 쓴다 (표의 확률은 engine/shared/defs/collect.ts의 pullOdds 그대로).
// odds 모듈을 고른 게임은 뽑을 때마다 추첨 기록(사람·시각·표의 버전·결과·치른 것)이 남는다 (engine/server/game/systems/odds.ts).
// 천장(BannerDef.pity): 사람마다·천장의 열쇠(pityKey: 배너 id, 무리 pityGroup가 있으면 'group:이름')마다 'pity.rarity 이상이 나오지 않은 뽑기의 수'를 세고, after번째 뽑기는 그 등급 이상의 칸에서만 뽑는다.
// 10번 뽑기의 보장(BannerDef.tenAtLeast): 앞의 아홉에 그 등급 이상이 없으면 열째는 그 등급 이상에서.
// 픽업(BannerDef.pickup)과 반반(fiftyFifty): 픽업의 등급이 나왔는데 픽업이 아니면 확정이 켜지고, 다음에 그 등급이 나오면 픽업이다. 확정도 천장의 열쇠마다 센다.
// 기간(start, end: UTC ms): 시계(g.time.open, engine/server/game/systems/clock.ts)로 열려 있는 배너에서만 뽑는다. 원격 설정(LIVE_KEYS에 'BANNERS.<id>.end' 같은 칸)으로 재시작 없이 늘리거나 당길 수 있다.
// 선택권(GACHA_RULES.select): 선택권 아이템 하나를 쓰고 그 목록의 영웅 하나를 얻는다 ({ t: 'gacha', a: 'select', item, hero }).
// 교환 상점(BannerDef.exchange, 묶음 D): 뽑을 때마다 천장의 열쇠마다 표식이 per개 쌓이고, cost개로 목록(exchangeHeroes)의 영웅 하나와 바꾼다 ({ t: 'gacha', a: 'trade', id, hero }).
//   확률은 바꾸지 않는다. 배너의 기간이 끝나면(같은 열쇠의 다른 배너가 열려 있지 않으면) 남은 표식을 end 규칙대로 정리한다(1분마다·접속할 때: 안내문 marksEnd).
// 난수는 서버의 것이다(rng). 시험은 seededRng로 바꿔 끼워 같은 결과를 되풀이한다.
// 저장: 캐릭터의 ext 'gacha' ({ pity: { 열쇠: 셈 }, log: 최근 기록, sure?: { 열쇠: 1 }, pts?: { 열쇠: 표식 } }). 본인에게는 개인 상태 'gacha'와, 뽑을 때마다 메시지 { t: 'gacha', b, got }.
import {
  BANNER_IDS, BANNER_TABLE, exchangeHeroes, GACHA_RULES, GACHA_RULE_VIEW, SELECT_TICKETS, bannerTable, hasFiftyFifty, hasTimedBanners, heroDef, isBannerId, isHeroId, isItemId, nextSure, pityKey, pullStep, rollStep,
  type BannerDef, type GachaMe, type PullGot, type PullLog,
} from '../../../shared/defs';
import { readInt, type Ent } from '../entity';
import type { Game } from '../game';

/** 지갑에 넘기는 원인의 이름 (장부가 명령에 붙이는 이름과 같다) */
export const GACHA_WHY = 'cmd:gacha';
/** 선택권을 쓴 것의 원인 이름 */
export const SELECT_WHY = 'cmd:gacha:select';

export class Gacha {
  /** 뽑기의 난수 (0 이상 1 미만). 기본은 Math.random. 시험은 seededRng(씨앗)로 바꾼다 */
  rng: () => number = Math.random;
  private readonly timed = hasTimedBanners();
  private readonly fifty = hasFiftyFifty();
  /** 사람(엔티티 id) → 반반의 확정이 켜진 천장의 열쇠들 (반반을 쓰는 게임만. 엔티티의 칸을 늘리지 않게 시스템이 맡는다) */
  private readonly sure = new Map<number, Record<string, 1>>();
  private sureMap(p: Ent): Record<string, 1> { let m = this.sure.get(p.id); if (!m) this.sure.set(p.id, m = {}); return m; }
  /** 교환 상점을 쓰는 배너가 있는가 (없으면 표식의 칸이 생기지 않는다) */
  private readonly trades = BANNER_IDS.some((id) => !!BANNER_TABLE[id].exchange);
  /** 사람(엔티티 id) → 천장의 열쇠 → 쌓인 표식 */
  private readonly pts = new Map<number, Record<string, number>>();
  private ptsMap(p: Ent): Record<string, number> { let m = this.pts.get(p.id); if (!m) this.pts.set(p.id, m = {}); return m; }
  private sweepAt = 0;

  constructor(private g: Game) {
    check(g);
    g.commands.set('gacha', (p, m) => {
      if (m.a === 'select') { if (typeof m.item === 'string' && typeof m.hero === 'string') this.select(p, m.item, m.hero); return; }
      if (m.a === 'trade') { if (isBannerId(m.id) && typeof m.hero === 'string') this.trade(p, m.id, m.hero); return; }
      if (isBannerId(m.id) && (m.n === 1 || m.n === 10)) this.draw(p, m.id, m.n);
    });
    g.saves.push({ name: 'gacha', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'gacha', state: (p): GachaMe => this.me(p) });
    g.on('playerLeft', (id) => { this.sure.delete(id); this.pts.delete(id); });
    if (this.trades) {
      g.on('playerJoined', (p) => this.settle(p));
      g.ticks.push((dt) => { this.sweepAt += dt; if (this.sweepAt < 60) return; this.sweepAt = 0; for (const e of g.ents.values()) if (e.kind === 'p' && !e.bot) this.settle(e); });
    }
  }

  /** 개인 상태: 천장의 셈과 기록. 기간이 있는 배너가 있으면 지금 열린 배너와 남은 분, 반반이 있으면 확정 */
  private me(p: Ent): GachaMe {
    const out: GachaMe = { pity: { ...p.pity }, log: p.pulls };
    if (this.timed) {
      const now = this.g.now();
      out.open = Object.fromEntries(BANNER_IDS.filter((id) => this.g.time.open(BANNER_TABLE[id].start, BANNER_TABLE[id].end, now)).map((id) => { const end = BANNER_TABLE[id].end; return [id, end === undefined ? -1 : Math.max(1, Math.ceil((end - now) / 60000))]; }));
    }
    if (this.fifty) out.sure = { ...this.sure.get(p.id) };
    if (this.trades) out.pts = { ...this.pts.get(p.id) };
    return out;
  }

  /** 그 배너의 천장 셈 (그 등급 이상이 나오지 않은 뽑기의 수. 무리의 배너는 함께 센다) */
  pityOf(p: Ent, banner: string): number { return p.pity[pityKey(banner)] ?? 0; }
  /** 그 배너의 반반 확정이 켜져 있는가 (다음 픽업 등급은 픽업) */
  sureOf(p: Ent, banner: string): boolean { return !!this.sure.get(p.id)?.[pityKey(banner)]; }
  /** 지금(서버 시계) 열려 있는 배너인가 */
  isOpen(banner: string): boolean { const b = BANNER_TABLE[banner]; return !!b && this.g.time.open(b.start, b.end); }

  /**
   * n번(1 또는 10) 뽑는다: 값을 치르고(모자라면 아무것도 하지 않는다), 영웅을 준다(roster.grant: 가진 것이면 조각).
   * 나온 것들을 돌려준다 (닫힌 배너이거나 값을 치르지 못했으면 null)
   */
  draw(p: Ent, id: string, n: 1 | 10): PullGot[] | null {
    const g = this.g, b: BannerDef | undefined = BANNER_TABLE[id];
    if (!b || p.bot) return null;
    if (!g.time.open(b.start, b.end)) { g.notify(p, 'bannerClosed', id); return null; }
    // 이 뽑기가 쓰는 확률표 (평소·천장·10번 보장·반반 확정의 단계): 뽑기 판에 든 영웅이 없으면 null
    const table = bannerTable(id);
    if (!table) return null;
    const cost = n === 10 ? b.ten : b.one;
    if (!g.wallet.take(p, b.cur, cost, GACHA_WHY)) { g.notify(p, 'costShort', b.cur); return null; }
    const paid = g.wallet.lastTake;
    const got: PullGot[] = [], steps: string[] = [];
    const key = pityKey(id);
    let count = p.pity[key] ?? 0, sure = this.sureOf(p, id);
    for (let i = 0; i < n; i++) {
      // 천장: after번째 뽑기(앞의 after-1번 동안 그 등급 이상이 없었다). 10번 뽑기의 열째: 앞의 아홉에 보장 등급 이상이 없었다
      const pity = !!b.pity && count + 1 >= b.pity.after;
      const ten = n === 10 && i === 9 && b.tenAtLeast !== undefined && !got.some((x) => x.r >= b.tenAtLeast!);
      const floor = Math.max(pity ? b.pity!.rarity : -1, ten ? b.tenAtLeast! : -1);
      // 그 바닥 등급·확정의 단계에서 굴린다 (그 등급 이상의 영웅이 없으면 평소의 단계: 표의 확률은 공개 확률표와 같은 pullOdds)
      const step = pullStep(table, floor, sure), o = step && rollStep(step, this.rng());
      if (!step || !o) break;
      const hero = o.id, rarity = o.r ?? heroDef(o.id).rarity;
      steps.push(step.key);
      count = b.pity && rarity >= b.pity.rarity ? 0 : count + 1;
      sure = nextSure(b, { hero, rarity }, sure);
      const r = g.roster.grant(p, hero, true);
      got.push({ h: hero, r: rarity, dup: r?.dup ?? false, n: r?.shards ?? 0, pity: floor >= 0, ...(r?.x ? { x: r.x } : {}) });
    }
    if (g.has('odds')) g.odds.record(p, 'gacha', table, steps, got.map((x) => x.h), { cur: b.cur, n: cost, ...(paid ? { kinds: paid } : {}) });
    if (b.pity) p.pity[key] = count;
    if (b.fiftyFifty && b.pickup) { if (sure) this.sureMap(p)[key] = 1; else delete this.sureMap(p)[key]; }
    if (b.exchange && got.length) { const m = this.ptsMap(p); m[key] = (m[key] ?? 0) + Math.max(0, Math.floor(b.exchange.per)) * got.length; }
    const now = g.now();
    const logs: PullLog[] = got.map((x) => ({ at: now, b: id, h: x.h, r: x.r, pity: x.pity })).reverse();
    p.pulls = [...logs, ...p.pulls].slice(0, Math.max(0, GACHA_RULES.history));
    p.unsaved = true;
    g.out.push({ id: p.id, msg: { t: 'gacha', b: id, got } });
    return got;
  }

  /**
   * 선택권(GACHA_RULES.select의 아이템) 하나를 쓰고 그 목록의 영웅 하나를 얻는다 (가진 영웅이면 조각).
   * 목록에 없는 영웅, 없는 선택권은 받지 않는다. 선택권이 없으면 안내문 itemShort. 얻은 것을 돌려준다 (안 되면 null)
   */
  select(p: Ent, item: string, hero: string): { dup: boolean; shards: number } | null {
    const g = this.g, list = SELECT_TICKETS[item];
    if (p.bot || !list || !list.includes(hero) || !g.has('items') || !isItemId(item)) return null;
    if (!g.bag.takeItem(p, item, 1, SELECT_WHY)) { g.notify(p, 'itemShort', item, 1, g.bag.count(p, item)); return null; }
    const r = g.roster.grant(p, hero);
    if (!r) return null;
    p.unsaved = true;
    g.notify(p, 'heroPicked', hero, r.dup ? 1 : 0, r.shards);
    return r;
  }

  // ---------- 교환 상점 ----------
  /** 그 배너의 표식 (천장의 열쇠마다) */
  ptsOf(p: Ent, banner: string): number { return this.pts.get(p.id)?.[pityKey(banner)] ?? 0; }
  /** 표식 cost개로 목록의 영웅 하나를 얻는다 (가진 영웅이면 조각). 열린 배너에서만. 얻은 것을 돌려준다 (안 되면 null) */
  trade(p: Ent, id: string, hero: string): { dup: boolean; shards: number } | null {
    const g = this.g, b = BANNER_TABLE[id], x = b?.exchange;
    if (!b || !x || p.bot) return null;
    if (!g.time.open(b.start, b.end)) { g.notify(p, 'exchangeNo', id, 2); return null; }
    if (!exchangeHeroes(b).includes(hero)) { g.notify(p, 'exchangeNo', id, 1); return null; }
    const key = pityKey(id), m = this.ptsMap(p), have = m[key] ?? 0, cost = Math.max(1, Math.floor(x.cost));
    if (have < cost) { g.notify(p, 'exchangeNo', id, 0); return null; }
    const r = g.roster.grant(p, hero);
    if (!r) return null;
    m[key] = have - cost;
    p.unsaved = true;
    g.track('gacha_trade', { b: id, h: hero, cost }, p);
    g.notify(p, 'exchanged', id, hero, r.dup ? 1 : 0, r.shards);
    return r;
  }
  /** 기간이 끝난 배너의 남은 표식을 정리한다 (같은 열쇠의 다른 배너가 열려 있으면 그대로) */
  settle(p: Ent): void {
    const m = this.pts.get(p.id);
    if (!m || p.bot) return;
    const g = this.g, now = g.now();
    for (const [key, n] of Object.entries(m)) {
      if (n <= 0) { delete m[key]; continue; }
      const mates = BANNER_IDS.filter((x) => pityKey(x) === key && BANNER_TABLE[x].exchange);
      if (!mates.length || mates.some((x) => g.time.open(BANNER_TABLE[x].start, BANNER_TABLE[x].end, now))) continue;
      // 모두 닫혔다: 가장 늦게 닫힌 배너의 규칙 (아직 열리지 않은 배너가 있으면 이어지게 남긴다)
      if (mates.some((x) => (BANNER_TABLE[x].start ?? 0) > now)) continue;
      const last = mates.reduce((a, x) => ((BANNER_TABLE[x].end ?? Infinity) > (BANNER_TABLE[a].end ?? Infinity) ? x : a)), end = BANNER_TABLE[last].exchange!.end ?? 'keep';
      if (end === 'keep') continue;
      delete m[key];
      const got = typeof end === 'object' ? g.wallet.add(p, end.cur, Math.floor(n * end.rate), 'gachaMarks') : 0;
      p.unsaved = true;
      g.notify(p, 'marksEnd', last, n, got, typeof end === 'object' ? end.cur : '');
    }
  }

  // ---------- 저장 ----------
  private saveOf(p: Ent): { pity: Record<string, number>; log: [number, string, string, number][]; sure?: Record<string, 1>; pts?: Record<string, number> } | undefined {
    const pity = Object.fromEntries(Object.entries(p.pity).filter(([, v]) => v > 0));
    const on = this.sure.get(p.id), sure = on && Object.keys(on).length ? { ...on } : undefined;
    const pm = this.pts.get(p.id), pts = pm && Object.values(pm).some((v) => v > 0) ? Object.fromEntries(Object.entries(pm).filter(([, v]) => v > 0)) : undefined;
    if (!Object.keys(pity).length && !p.pulls.length && !sure && !pts) return undefined;
    // 확정·표식이 없으면 예전과 같은 모양 (sure·pts 칸이 없다)
    return { pity, log: p.pulls.map((l) => [l.at, l.b, l.h, l.pity ? 1 : 0]), ...(sure ? { sure } : {}), ...(pts ? { pts } : {}) };
  }
  private loadOf(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const d = raw as { pity?: unknown; log?: unknown; sure?: unknown };
    if (typeof d.pity === 'object' && d.pity !== null) {
      for (const [k, v] of Object.entries(d.pity as Record<string, unknown>)) {
        // 열쇠는 배너 id나 무리('group:이름'). 무리에 든 배너의 예전 셈(배너 id에 적힌 것)은 무리의 셈으로 옮긴다 (무리의 셈이 이미 있으면 그것)
        const key = BANNER_TABLE[k] ? pityKey(k) : k, b = pityBanner(key);
        if (!b?.pity || (key !== k && Object.hasOwn(d.pity as object, key))) continue;
        p.pity[key] = readInt(v, 0, b.pity.after - 1, 0);
      }
    }
    if (typeof d.sure === 'object' && d.sure !== null) {
      for (const [key, v] of Object.entries(d.sure as Record<string, unknown>)) {
        if (v === 1 && BANNER_IDS.some((x) => pityKey(x) === key && !!BANNER_TABLE[x].fiftyFifty && !!BANNER_TABLE[x].pickup)) this.sureMap(p)[key] = 1;
      }
    }
    const pts = (d as { pts?: unknown }).pts;
    if (this.trades && typeof pts === 'object' && pts !== null) {
      for (const [key, v] of Object.entries(pts as Record<string, unknown>)) if (BANNER_IDS.some((x) => pityKey(x) === key && BANNER_TABLE[x].exchange)) this.ptsMap(p)[key] = readInt(v, 0, 1e6, 0);
    }
    if (Array.isArray(d.log)) {
      p.pulls = d.log.filter((x): x is [number, string, string, number] => Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'string' && isHeroId(x[2]))
        .slice(0, Math.max(0, GACHA_RULES.history))
        .map(([at, b, h, pity]) => ({ at, b: b.slice(0, 32), h, r: heroDef(h).rarity, pity: pity === 1 }));
    }
  }
}

/** 천장의 열쇠(배너 id나 'group:이름')를 쓰는 배너 하나 (천장의 규칙을 읽으려고. 무리의 배너들은 규칙이 같다. 없으면 undefined) */
function pityBanner(key: string): BannerDef | undefined {
  const id = BANNER_IDS.find((x) => pityKey(x) === key);
  return id ? BANNER_TABLE[id] : undefined;
}

/** 내용의 확인 (시작할 때): 픽업 영웅이 그 배너에 있는가, 천장 무리의 규칙이 같은가, 선택권의 아이템과 영웅이 있는가 */
function check(g: Game): void {
  const groups = new Map<string, string>();
  for (const id of BANNER_IDS) {
    const b = BANNER_TABLE[id];
    if (b.pickup && (!b.pool.some((s) => s.hero === b.pickup!.hero && s.w > 0) || !(b.pickup.share >= 0 && b.pickup.share <= 1))) throw new Error(`[gacha] 배너 ${id}의 픽업 영웅 '${b.pickup.hero}'이 뽑기 판(pool)에 없거나 share가 0~1이 아닙니다`);
    if (b.fiftyFifty && !b.pickup) throw new Error(`[gacha] 배너 ${id}는 반반(fiftyFifty)을 쓰지만 픽업(pickup)이 없습니다`);
    if (b.pityGroup) {
      const rule = JSON.stringify(b.pity ?? null), was = groups.get(b.pityGroup);
      if (was !== undefined && was !== rule) throw new Error(`[gacha] 천장 무리 '${b.pityGroup}'의 배너들은 천장(pity)이 같아야 합니다 (${id})`);
      groups.set(b.pityGroup, rule);
      if (BANNER_TABLE[`group:${b.pityGroup}`]) throw new Error(`[gacha] 배너 id 'group:${b.pityGroup}'은 천장 무리의 열쇠와 겹칩니다`);
    }
  }
  for (const [item, heroes] of Object.entries(GACHA_RULE_VIEW.select ?? {})) {
    if (!g.has('items')) throw new Error('[gacha] 선택권(GACHA_RULES.select)은 items 모듈이 있어야 씁니다');
    if (!isItemId(item)) throw new Error(`[gacha] 선택권 '${item}'이 ITEMS에 없습니다`);
    const bad = heroes.filter((h) => !isHeroId(h));
    if (bad.length) throw new Error(`[gacha] 선택권 '${item}'의 영웅 ${bad.join(', ')}이 HEROES에 없습니다`);
  }
}
