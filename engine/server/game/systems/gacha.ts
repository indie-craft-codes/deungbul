// [gacha] 뽑기: 배너(내용의 BANNERS)에서 1번·10번 뽑는다. 값은 게임 안의 재화(골드나 두 번째 재화)뿐이고 지갑(g.wallet)을 지난다: 현금·결제는 없다.
// 확률은 배너의 영웅마다의 무게로만 정해지고, 화면의 공개 확률표와 이 시스템이 같은 셈(engine/shared/defs/collect.ts의 poolOdds, pickOdds)을 쓴다.
// 천장(BannerDef.pity): 사람마다·배너마다 'pity.rarity 이상이 나오지 않은 뽑기의 수'를 세고, after번째 뽑기는 그 등급 이상의 칸에서만 뽑는다.
// 10번 뽑기의 보장(BannerDef.tenAtLeast): 앞의 아홉에 그 등급 이상이 없으면 열째는 그 등급 이상에서.
// 난수는 서버의 것이다(rng). 시험은 seededRng로 바꿔 끼워 같은 결과를 되풀이한다.
// 저장: 캐릭터의 ext 'gacha' ({ pity: { 배너: 셈 }, log: 최근 기록 }). 본인에게는 개인 상태 'gacha'와, 뽑을 때마다 메시지 { t: 'gacha', b, got }.
import { BANNER_TABLE, GACHA_RULES, heroDef, isBannerId, isHeroId, pickOdds, poolOdds, type BannerDef, type GachaMe, type PullGot, type PullLog } from '../../../shared/defs';
import { readInt, type Ent } from '../entity';
import type { Game } from '../game';

/** 지갑에 넘기는 원인의 이름 (장부가 명령에 붙이는 이름과 같다) */
export const GACHA_WHY = 'cmd:gacha';

export class Gacha {
  /** 뽑기의 난수 (0 이상 1 미만). 기본은 Math.random. 시험은 seededRng(씨앗)로 바꾼다 */
  rng: () => number = Math.random;

  constructor(private g: Game) {
    g.commands.set('gacha', (p, m) => { if (isBannerId(m.id) && (m.n === 1 || m.n === 10)) this.draw(p, m.id, m.n); });
    g.saves.push({ name: 'gacha', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'gacha', state: (p): GachaMe => ({ pity: { ...p.pity }, log: p.pulls }) });
  }

  /** 그 배너의 천장 셈 (그 등급 이상이 나오지 않은 뽑기의 수) */
  pityOf(p: Ent, banner: string): number { return p.pity[banner] ?? 0; }

  /**
   * n번(1 또는 10) 뽑는다: 값을 치르고(모자라면 아무것도 하지 않는다), 영웅을 준다(roster.grant: 가진 것이면 조각).
   * 나온 것들을 돌려준다 (값을 치르지 못했으면 null)
   */
  draw(p: Ent, id: string, n: 1 | 10): PullGot[] | null {
    const g = this.g, b: BannerDef | undefined = BANNER_TABLE[id];
    if (!b || p.bot) return null;
    const normal = poolOdds(b.pool);
    if (!normal.length) return null;
    const cost = n === 10 ? b.ten : b.one;
    if (!g.wallet.take(p, b.cur, cost, GACHA_WHY)) { g.notify(p, 'costShort', b.cur); return null; }
    const got: PullGot[] = [];
    let count = this.pityOf(p, id);
    for (let i = 0; i < n; i++) {
      // 천장: after번째 뽑기(앞의 after-1번 동안 그 등급 이상이 없었다). 10번 뽑기의 열째: 앞의 아홉에 보장 등급 이상이 없었다
      const pity = !!b.pity && count + 1 >= b.pity.after;
      const ten = n === 10 && i === 9 && b.tenAtLeast !== undefined && !got.some((x) => x.r >= b.tenAtLeast!);
      const floor = Math.max(pity ? b.pity!.rarity : -1, ten ? b.tenAtLeast! : -1);
      const odds = floor >= 0 ? poolOdds(b.pool, floor) : normal;
      const o = pickOdds(odds.length ? odds : normal, this.rng());
      if (!o) break;
      count = b.pity && o.rarity >= b.pity.rarity ? 0 : count + 1;
      const r = g.roster.grant(p, o.hero);
      got.push({ h: o.hero, r: o.rarity, dup: r?.dup ?? false, n: r?.shards ?? 0, pity: floor >= 0 });
    }
    if (b.pity) p.pity[id] = count;
    const now = g.now();
    const logs: PullLog[] = got.map((x) => ({ at: now, b: id, h: x.h, r: x.r, pity: x.pity })).reverse();
    p.pulls = [...logs, ...p.pulls].slice(0, Math.max(0, GACHA_RULES.history));
    p.unsaved = true;
    g.out.push({ id: p.id, msg: { t: 'gacha', b: id, got } });
    return got;
  }

  // ---------- 저장 ----------
  private saveOf(p: Ent): { pity: Record<string, number>; log: [number, string, string, number][] } | undefined {
    const pity = Object.fromEntries(Object.entries(p.pity).filter(([, v]) => v > 0));
    if (!Object.keys(pity).length && !p.pulls.length) return undefined;
    return { pity, log: p.pulls.map((l) => [l.at, l.b, l.h, l.pity ? 1 : 0]) };
  }
  private loadOf(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const d = raw as { pity?: unknown; log?: unknown };
    if (typeof d.pity === 'object' && d.pity !== null) {
      for (const [id, v] of Object.entries(d.pity as Record<string, unknown>)) {
        const b = BANNER_TABLE[id];
        if (b?.pity) p.pity[id] = readInt(v, 0, b.pity.after - 1, 0);
      }
    }
    if (Array.isArray(d.log)) {
      p.pulls = d.log.filter((x): x is [number, string, string, number] => Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'string' && isHeroId(x[2]))
        .slice(0, Math.max(0, GACHA_RULES.history))
        .map(([at, b, h, pity]) => ({ at, b: b.slice(0, 32), h, r: heroDef(h).rarity, pity: pity === 1 }));
    }
  }
}
