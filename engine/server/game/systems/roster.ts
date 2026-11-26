// [roster] 동료(영웅): 사람마다 가진 영웅의 레벨·별·조각. 레벨 업은 재화(지갑), 별 올리기는 모아 둔 조각으로.
// 영웅의 표와 규칙은 내용의 HEROES, HERO_RARITIES, HERO_ROLES, HERO_RULES (engine/shared/defs/collect.ts). 화면의 짝은 engine/client/hud/collect.ts의 '영웅' 탭.
// 영웅을 얻는 길은 이 시스템의 grant 하나다: 뽑기(gacha)와 게임의 보상(퀘스트, 첫 단계)이 부른다. 이미 가진 영웅이면 그 등급의 조각(HeroRarityDef.shards)이 된다.
// 저장은 캐릭터의 ext 'roster' ({ 영웅 id: [레벨, 별, 조각] }), 본인에게는 개인 상태 'heroes'(같은 모양).
// 영웅의 능력치가 바뀌면 사건 heroChanged(p, id)를 낸다: 편성(squad)이 싸우는 영웅의 체력·공격을 맞춘다.
// 선택 칸 (내용이 적어야 켜진다: engine/shared/defs/herogrow.ts): 기술 레벨(HERO_RULES.skill: 재료로 올리고 기술의 피해·회복이 커진다),
// 각성(HERO_RULES.awaken: 별이 최대인 영웅이 조각과 재료로 오르고 공격·체력 배율과 패시브를 얻는다). 켠 게임은 저장과 개인 상태의 줄이 [.., 기술 레벨, 각성]까지 길어진다.
// 전투력은 heroFull(장비·각성·기술 레벨까지)의 한 셈이다. 성장이 없는 게임에서는 heroPower(레벨, 별)와 같다.
import { HERO_RULES as HERO_RULES_IN, awakenMax, awakenOf, gearOn, heroDef, heroFull, heroGrowthOn, isHeroId, rarityDef, skillMax, skillOf, type HeroesMe, type HeroRules, type OwnedHero } from '../../../shared/defs';
import { readInt, type Ent } from '../entity';
import type { Game } from '../game';
import { payCost } from './herocost';

/** 내용의 영웅 규칙 (게임이 적은 타입 그대로 오므로 선택 칸을 읽으려고 틀의 타입으로 넓힌다) */
const HERO_RULES: HeroRules = HERO_RULES_IN;

/** 지갑에 넘기는 원인의 이름 (장부가 명령에 붙이는 이름과 같다) */
export const ROSTER_WHY = { level: 'cmd:hero:level', skill: 'cmd:hero:skill', awaken: 'cmd:hero:awaken' } as const;
/** 개인 상태와 저장의 한 줄: [레벨, 별, 조각] (기술 레벨·각성을 켰으면 [.., 기술 레벨, 각성]) */
const line = (h: OwnedHero, long: boolean): HeroesMe[string] => (long ? [h.lv, h.stars, h.shards, skillOf(h), awakenOf(h)] : [h.lv, h.stars, h.shards]);

export class Roster {
  constructor(private g: Game) {
    g.commands.set('hero', (p, m) => {
      if (!isHeroId(m.id)) return;
      if (m.a === 'level') this.levelUp(p, m.id);
      else if (m.a === 'star') this.starUp(p, m.id);
      else if (m.a === 'skill') this.skillUp(p, m.id);
      else if (m.a === 'awaken') this.awakenUp(p, m.id);
    });
    g.saves.push({ name: 'roster', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    const long = heroGrowthOn();
    g.personal.push({ name: 'heroes', state: (p): HeroesMe => Object.fromEntries(Object.entries(p.heroes).map(([id, h]) => [id, line(h, long)])) });
  }

  /** 그 영웅을 가졌으면 그 상태 (없으면 undefined) */
  owned(p: Ent, id: string): OwnedHero | undefined { return Object.hasOwn(p.heroes, id) ? p.heroes[id] : undefined; }
  /** 가진 영웅의 전투력 (없으면 0): 장비·각성·기술 레벨까지 (편성의 시너지는 g.squad.power가 더한다) */
  power(p: Ent, id: string): number { const h = this.owned(p, id); return h ? heroFull(id, h, gearOn(this.g.field(p, 'hgear'), id)).power : 0; }

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

  /** 기술 레벨을 하나 올린다 (HERO_RULES.skill): 그 별·각성의 상한 아래에서, 정한 값(재화·재료)을 치르고 */
  skillUp(p: Ent, id: string): boolean {
    const g = this.g, h = this.owned(p, id), rules = HERO_RULES.skill;
    if (!h || !rules) return false;
    const lv = skillOf(h);
    if (lv >= skillMax(h.stars, awakenOf(h))) { g.notify(p, 'heroSkillMax', id); return false; }
    if (!payCost(g, p, rules.cost(lv, heroDef(id).rarity), ROSTER_WHY.skill)) return false;
    h.skill = lv + 1;
    p.unsaved = true;
    g.notify(p, 'heroSkillUp', id, h.skill);
    g.fire('heroChanged', p, id);
    return true;
  }

  /** 각성을 한 단계 올린다 (HERO_RULES.awaken): 별이 최대여야 하고, 그 단계의 조각과 값을 치른다 */
  awakenUp(p: Ent, id: string): boolean {
    const g = this.g, h = this.owned(p, id), steps = HERO_RULES.awaken?.steps;
    if (!h || !steps) return false;
    const aw = awakenOf(h), step = steps[aw];
    if (!step) { g.notify(p, 'heroAwakenMax', id); return false; }
    if (h.stars < HERO_RULES.maxStars) { g.notify(p, 'heroAwakenStars', id, HERO_RULES.maxStars); return false; }
    if (h.shards < step.shards) { g.notify(p, 'heroShards', id, step.shards - h.shards); return false; }
    if (step.cost && !payCost(g, p, step.cost, ROSTER_WHY.awaken)) return false;
    h.shards -= step.shards; h.awaken = aw + 1;
    p.unsaved = true;
    g.notify(p, 'heroAwaken', id, h.awaken);
    g.fire('heroChanged', p, id);
    return true;
  }

  // ---------- 저장 ----------
  /** 영웅마다 [레벨, 별, 조각]. 기술 레벨이나 각성이 오른 영웅만 [.., 기술 레벨, 각성]까지 (그것을 쓰지 않은 저장은 예전과 같다) */
  private saveOf(p: Ent): HeroesMe | undefined {
    const ids = Object.keys(p.heroes);
    return ids.length ? Object.fromEntries(ids.map((id) => { const h = p.heroes[id]; return [id, line(h, skillOf(h) > 1 || awakenOf(h) > 0)]; })) : undefined;
  }
  /** 깨진 값과 내용에서 빠진 영웅은 건너뛴다 (그 영웅을 다시 넣으면 다음 저장부터는 사라진다: 빠진 영웅의 것은 지킬 길이 없다) */
  private loadOf(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!isHeroId(id) || !Array.isArray(v)) continue;
      const stars = readInt(v[1], 1, HERO_RULES.maxStars, rarityDef(heroDef(id).rarity).stars);
      const h: OwnedHero = p.heroes[id] = { lv: readInt(v[0], 1, HERO_RULES.maxLv(stars), 1), stars, shards: readInt(v[2], 0, 1e6, 0) };
      // 기술 레벨과 각성: 있는 저장만. 내용에서 그 규칙을 뺐으면 값을 지켜 둔다 (다시 켜면 이어진다)
      if (v.length > 3) {
        const aw = readInt(v[4], 0, HERO_RULES.awaken ? awakenMax() : 1e4, 0);
        const sk = readInt(v[3], 1, HERO_RULES.skill ? skillMax(stars, aw) : 1e4, 1);
        if (sk > 1) h.skill = sk;
        if (aw > 0) h.awaken = aw;
      }
    }
  }
}
