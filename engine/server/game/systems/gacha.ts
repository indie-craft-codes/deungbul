// [gacha] 뽑기: 배너(내용의 BANNERS)에서 1번·10번 뽑는다. 값은 게임 안의 재화(골드나 두 번째 재화)뿐이고 지갑(g.wallet)을 지난다: 현금·결제는 없다.
// 확률은 배너의 영웅마다의 무게(와 픽업)로만 정해지고, 화면의 공개 확률표와 이 시스템이 같은 셈(engine/shared/defs/collect.ts의 pullOdds, pickOdds)을 쓴다.
// 천장(BannerDef.pity): 사람마다·천장의 열쇠(pityKey: 배너 id, 무리 pityGroup가 있으면 'group:이름')마다 'pity.rarity 이상이 나오지 않은 뽑기의 수'를 세고, after번째 뽑기는 그 등급 이상의 칸에서만 뽑는다.
// 10번 뽑기의 보장(BannerDef.tenAtLeast): 앞의 아홉에 그 등급 이상이 없으면 열째는 그 등급 이상에서.
// 픽업(BannerDef.pickup)과 반반(fiftyFifty): 픽업의 등급이 나왔는데 픽업이 아니면 확정이 켜지고, 다음에 그 등급이 나오면 픽업이다. 확정도 천장의 열쇠마다 센다.
// 기간(start, end: UTC ms): 시계(g.time.open, engine/server/game/systems/clock.ts)로 열려 있는 배너에서만 뽑는다. 원격 설정(LIVE_KEYS에 'BANNERS.<id>.end' 같은 칸)으로 재시작 없이 늘리거나 당길 수 있다.
// 선택권(GACHA_RULES.select): 선택권 아이템 하나를 쓰고 그 목록의 영웅 하나를 얻는다 ({ t: 'gacha', a: 'select', item, hero }).
// 난수는 서버의 것이다(rng). 시험은 seededRng로 바꿔 끼워 같은 결과를 되풀이한다.
// 저장: 캐릭터의 ext 'gacha' ({ pity: { 열쇠: 셈 }, log: 최근 기록, sure?: { 열쇠: 1 } }). 본인에게는 개인 상태 'gacha'와, 뽑을 때마다 메시지 { t: 'gacha', b, got }.
import {
  BANNER_IDS, BANNER_TABLE, GACHA_RULES, GACHA_RULE_VIEW, SELECT_TICKETS, hasFiftyFifty, hasTimedBanners, heroDef, isBannerId, isHeroId, isItemId, nextSure, pickOdds, pityKey, poolOdds, pullOdds,
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

  constructor(private g: Game) {
    check(g);
    g.commands.set('gacha', (p, m) => {
      if (m.a === 'select') { if (typeof m.item === 'string' && typeof m.hero === 'string') this.select(p, m.item, m.hero); return; }
      if (isBannerId(m.id) && (m.n === 1 || m.n === 10)) this.draw(p, m.id, m.n);
    });
    g.saves.push({ name: 'gacha', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'gacha', state: (p): GachaMe => this.me(p) });
    g.on('playerLeft', (id) => { this.sure.delete(id); });
  }

  /** 개인 상태: 천장의 셈과 기록. 기간이 있는 배너가 있으면 지금 열린 배너와 남은 분, 반반이 있으면 확정 */
  private me(p: Ent): GachaMe {
    const out: GachaMe = { pity: { ...p.pity }, log: p.pulls };
    if (this.timed) {
      const now = this.g.now();
      out.open = Object.fromEntries(BANNER_IDS.filter((id) => this.g.time.open(BANNER_TABLE[id].start, BANNER_TABLE[id].end, now)).map((id) => { const end = BANNER_TABLE[id].end; return [id, end === undefined ? -1 : Math.max(1, Math.ceil((end - now) / 60000))]; }));
    }
    if (this.fifty) out.sure = { ...this.sure.get(p.id) };
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
    const normal = poolOdds(b.pool);
    if (!normal.length) return null;
    const cost = n === 10 ? b.ten : b.one;
    if (!g.wallet.take(p, b.cur, cost, GACHA_WHY)) { g.notify(p, 'costShort', b.cur); return null; }
    const got: PullGot[] = [];
    const key = pityKey(id);
    let count = p.pity[key] ?? 0, sure = this.sureOf(p, id);
    for (let i = 0; i < n; i++) {
      // 천장: after번째 뽑기(앞의 after-1번 동안 그 등급 이상이 없었다). 10번 뽑기의 열째: 앞의 아홉에 보장 등급 이상이 없었다
      const pity = !!b.pity && count + 1 >= b.pity.after;
      const ten = n === 10 && i === 9 && b.tenAtLeast !== undefined && !got.some((x) => x.r >= b.tenAtLeast!);
      const floor = Math.max(pity ? b.pity!.rarity : -1, ten ? b.tenAtLeast! : -1);
      // 확률표는 공개 확률표와 같은 셈 (pullOdds: 픽업이 없는 배너는 poolOdds와 같다)
      const odds = pullOdds(b, floor, sure);
      const o = pickOdds(odds.length ? odds : pullOdds(b, -1, sure), this.rng());
      if (!o) break;
      count = b.pity && o.rarity >= b.pity.rarity ? 0 : count + 1;
      sure = nextSure(b, o, sure);
      const r = g.roster.grant(p, o.hero);
      got.push({ h: o.hero, r: o.rarity, dup: r?.dup ?? false, n: r?.shards ?? 0, pity: floor >= 0 });
    }
    if (b.pity) p.pity[key] = count;
    if (b.fiftyFifty && b.pickup) { if (sure) this.sureMap(p)[key] = 1; else delete this.sureMap(p)[key]; }
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

  // ---------- 저장 ----------
  private saveOf(p: Ent): { pity: Record<string, number>; log: [number, string, string, number][]; sure?: Record<string, 1> } | undefined {
    const pity = Object.fromEntries(Object.entries(p.pity).filter(([, v]) => v > 0));
    const on = this.sure.get(p.id), sure = on && Object.keys(on).length ? { ...on } : undefined;
    if (!Object.keys(pity).length && !p.pulls.length && !sure) return undefined;
    // 확정이 없으면 예전과 같은 모양 (sure 칸이 없다)
    return { pity, log: p.pulls.map((l) => [l.at, l.b, l.h, l.pity ? 1 : 0]), ...(sure ? { sure } : {}) };
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
