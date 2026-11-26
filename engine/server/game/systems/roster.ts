// [roster] 동료(영웅): 사람마다 가진 영웅의 레벨·별·조각. 레벨 업은 재화(지갑), 별 올리기는 모아 둔 조각으로.
// 영웅의 표와 규칙은 내용의 HEROES, HERO_RARITIES, HERO_ROLES, HERO_RULES (engine/shared/defs/collect.ts). 화면의 짝은 engine/client/hud/collect.ts의 '영웅' 탭.
// 영웅을 얻는 길은 이 시스템의 grant 하나다: 뽑기(gacha)와 게임의 보상(퀘스트, 첫 단계)이 부른다. 이미 가진 영웅이면 그 등급의 조각(HeroRarityDef.shards)이 된다.
// 저장은 캐릭터의 ext 'roster' ({ 영웅 id: [레벨, 별, 조각] }), 본인에게는 개인 상태 'heroes'(같은 모양).
// 영웅의 능력치가 바뀌면 사건 heroChanged(p, id)를 낸다: 편성(squad)이 싸우는 영웅의 체력·공격을 맞춘다.
import { HERO_RULES, heroDef, heroPower, isHeroId, rarityDef, type HeroesMe, type OwnedHero } from '../../../shared/defs';
import { readInt, type Ent } from '../entity';
import type { Game } from '../game';

/** 지갑에 넘기는 원인의 이름 (장부가 명령에 붙이는 이름과 같다) */
export const ROSTER_WHY = { level: 'cmd:hero:level' } as const;

export class Roster {
  constructor(private g: Game) {
    g.commands.set('hero', (p, m) => {
      if (!isHeroId(m.id)) return;
      if (m.a === 'level') this.levelUp(p, m.id);
      else if (m.a === 'star') this.starUp(p, m.id);
    });
    g.saves.push({ name: 'roster', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'heroes', state: (p): HeroesMe => Object.fromEntries(Object.entries(p.heroes).map(([id, h]) => [id, [h.lv, h.stars, h.shards]])) });
  }

  /** 그 영웅을 가졌으면 그 상태 (없으면 undefined) */
  owned(p: Ent, id: string): OwnedHero | undefined { return Object.hasOwn(p.heroes, id) ? p.heroes[id] : undefined; }
  /** 가진 영웅의 전투력 (없으면 0) */
  power(p: Ent, id: string): number { const h = this.owned(p, id); return h ? heroPower(id, h.lv, h.stars) : 0; }

  /**
   * 영웅을 준다 (뽑기·보상). 처음이면 1레벨·그 등급의 처음 별로 얻고, 이미 가졌으면 그 등급의 조각이 된다.
   * 돌려주는 것: 이미 가졌던 것인가와 받은 조각. 없는 영웅이면 null
   */
  grant(p: Ent, id: string): { dup: boolean; shards: number } | null {
    if (!isHeroId(id)) return null;
    const r = rarityDef(heroDef(id).rarity), had = this.owned(p, id);
    p.unsaved = true;
    if (had) { had.shards = Math.min(1e6, had.shards + r.shards); return { dup: true, shards: r.shards }; }
    p.heroes[id] = { lv: 1, stars: Math.max(1, Math.min(HERO_RULES.maxStars, r.stars)), shards: 0 };
    this.g.notify(p, 'heroNew', id);
    this.g.fire('heroChanged', p, id);
    return { dup: false, shards: 0 };
  }

  /** 레벨을 하나 올린다: 그 별의 상한(HERO_RULES.maxLv) 아래에서, 정한 재화를 치르고 */
  levelUp(p: Ent, id: string): boolean {
    const g = this.g, h = this.owned(p, id);
    if (!h) return false;
    if (h.lv >= HERO_RULES.maxLv(h.stars)) { g.notify(p, 'heroMaxLv', id); return false; }
    const cost = HERO_RULES.levelCost(h.lv, heroDef(id).rarity);
    if (!g.wallet.take(p, HERO_RULES.levelCur, cost, ROSTER_WHY.level)) { g.notify(p, 'costShort', HERO_RULES.levelCur); return false; }
    h.lv++;
    p.unsaved = true;
    g.notify(p, 'heroUp', id, h.lv);
    g.fire('heroChanged', p, id);
    return true;
  }

  /** 별을 하나 올린다: 모아 둔 조각(HERO_RULES.starCost)으로. 별의 상한은 HERO_RULES.maxStars */
  starUp(p: Ent, id: string): boolean {
    const g = this.g, h = this.owned(p, id);
    if (!h || h.stars >= HERO_RULES.maxStars) return false;
    const need = HERO_RULES.starCost(h.stars);
    if (h.shards < need) { g.notify(p, 'heroShards', id, need - h.shards); return false; }
    h.shards -= need; h.stars++;
    p.unsaved = true;
    g.notify(p, 'heroStar', id, h.stars);
    g.fire('heroChanged', p, id);
    return true;
  }

  // ---------- 저장 ----------
  private saveOf(p: Ent): Record<string, [number, number, number]> | undefined {
    const ids = Object.keys(p.heroes);
    return ids.length ? Object.fromEntries(ids.map((id) => [id, [p.heroes[id].lv, p.heroes[id].stars, p.heroes[id].shards]])) : undefined;
  }
  /** 깨진 값과 내용에서 빠진 영웅은 건너뛴다 (그 영웅을 다시 넣으면 다음 저장부터는 사라진다: 빠진 영웅의 것은 지킬 길이 없다) */
  private loadOf(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!isHeroId(id) || !Array.isArray(v)) continue;
      const stars = readInt(v[1], 1, HERO_RULES.maxStars, rarityDef(heroDef(id).rarity).stars);
      p.heroes[id] = { lv: readInt(v[0], 1, HERO_RULES.maxLv(stars), 1), stars, shards: readInt(v[2], 0, 1e6, 0) };
    }
  }
}
