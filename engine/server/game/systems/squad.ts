// [squad] 편성: 가진 영웅 가운데 SQUAD_RULES.size까지 골라 함께 싸운다. 편성한 영웅은 월드의 엔티티(종류 'hero')로 서서
// 주인을 따라다니고, 주인 둘레의 몬스터를 스스로 노려 역할(HERO_ROLES)의 기본 공격과 기술(쿨다운마다)로 친다.
// 싸움의 셈은 전투 모듈 그대로다: 피해는 g.combat.damage, 기술은 g.combat.cast (영웅은 전투 모듈에 '사람 편의 종류'로 등록된다: registerAlly).
// 영웅이 준 피해는 주인이 준 것으로 쳐서 처치 보상·일일 임무가 주인에게 간다. 몬스터는 자기를 때린 영웅을 노리고, 영웅이 쓰러지면 reviveS 뒤 주인 곁에서 다시 일어난다.
// 영웅의 공격·체력은 영웅 모듈(roster)의 레벨과 별로 정해진다 (heroStats). 주인이 층(채널, 던전, 단계)을 옮기면 영웅도 따라 옮긴다.
// 나타나는 곳 SQUAD_RULES.where: 'all'(기본) 어디서나 주인을 따라다닌다, 'stage' 주인의 단계 회차(stages: 대기실 포함)가 있을 때만 그 층에 선다.
//   'stage'에서 주인이 단계를 떠나 회차가 뒤에서 이어 가면(stages.detach) 영웅은 그 층의 단계 자리를 주인 대신 기준으로 삼아 싸운다 (anchor).
// 저장: 캐릭터의 ext 'squad' (영웅 id의 목록). 본인에게는 개인 상태 'squad' ({ ids, power }).
// 화면은 종류 'hero'를 역할의 겉모습으로 그린다 (engine/client/hud/collect.ts의 registerKind). 상태 줄의 값은 [별, 레벨].
// 선택 칸 (내용이 적어야 켜진다: engine/shared/defs/herogrow.ts):
//   진형 SQUAD_RULES.rows  앞줄은 주인 앞에, 뒷줄은 뒤에 선다. 앞줄 영웅은 둘레(taunt)에서 주인이나 뒷줄을 노리는 몬스터를 자기에게 돌리고, 줄마다의 덤(받는 피해·주는 피해)을 받는다.
//                          뒷줄은 저장의 'formation' ({ back: [영웅 id] }), 개인 상태 squad의 back. 명령 { t: 'squad', ids, back? }
//   시너지 SQUAD_RULES.synergy  편성에 같은 태그(HeroDef.tag)의 영웅이 n 이상이면 그 단의 덤. 개인 상태 squad의 syn
// 영웅의 공격·체력과 편성의 전투력은 squadView(장비·각성·기술 레벨·시너지까지)의 한 셈이다. 성장이 없는 게임에서는 예전(heroStats, heroPower의 합)과 같다.
import { SQUAD_RULES as SQUAD_RULES_IN, STAGE_RULES, arrangeRows, heroDef, heroRole, isHeroId, isSkillId, skillDef, squadView, type SquadMe, type SquadRules, type SquadView } from '../../../shared/defs';
import { resolve } from '../../../shared/sim';
import { clampInto } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

/** 영웅이 서는 자리: 주인의 뒤쪽 (주인이 바라보는 쪽을 앞으로). [옆, 앞뒤] (m) */
const SLOTS: readonly [number, number][] = [[-1.7, -1.3], [1.7, -1.3], [-2.8, -2.9], [2.8, -2.9], [0, -3.6], [-4, -1.2], [4, -1.2], [0, -5]];
/** 진형을 켠 게임: 앞줄은 주인 앞에, 뒷줄은 주인 뒤에 */
const FRONT: readonly [number, number][] = [[-1.5, 1.8], [1.5, 1.8], [0, 2.6], [-3, 1.4], [3, 1.4], [-4.4, 1], [4.4, 1]];
const BACK: readonly [number, number][] = [[-1.6, -1.8], [1.6, -1.8], [0, -2.8], [-3, -2.4], [3, -2.4], [-4.4, -2], [4.4, -2]];
/** 앞줄이 몬스터를 끄는 것을 살피는 주기(초) */
const TAUNT_S = 0.25;
/** 내용의 편성 규칙 (게임이 적은 타입 그대로 오므로 선택 칸을 읽으려고 틀의 타입으로 넓힌다) */
const SQUAD_RULES: SquadRules = SQUAD_RULES_IN;
const ROWS = SQUAD_RULES.rows;
/** 편성이 단계 안에서만 나타나는 게임 */
const STAGE_ONLY = SQUAD_RULES.where === 'stage';
/** 영웅의 생각 주기(초): 대상을 다시 고르는 간격 */
const THINK_S = 0.25;

export class Squad {
  /** 주인(엔티티 id) → 그 영웅들(엔티티) */
  private readonly out = new Map<number, Ent[]>();

  constructor(private g: Game) {
    g.defineKind('hero', {
      tick: (e, dt) => this.think(e, dt),
      sync: (e) => [this.stars(e), this.lv(e)],
    });
    g.combat.registerAlly('hero', {
      owner: (e) => this.ownerOf(e),
      down: (e) => this.down(e),
      // 영웅의 기술은 공격의 크기에 따라 커진다: 공격 10을 1배로. 기술 레벨과 주는 피해의 덤(sk)이 있으면 곱한다
      skillScale: (e) => { const base = Math.max(0.1, Number(e.data.atk ?? 10) / 10), k = Number(e.data.sk ?? 1); return k === 1 ? base : base * k; },
      // 받는 피해: 진형·장비·시너지의 덤 (없으면 1: 전투가 그대로 둔다)
      guard: (e) => Number(e.data.gd ?? 1),
    });
    g.commands.set('squad', (p, m) => { if (Array.isArray(m.ids)) this.set(p, m.ids, Array.isArray(m.back) ? m.back : undefined); });
    g.saves.push({ name: 'squad', save: (p) => (p.squad.length ? [...p.squad] : undefined), load: (p, raw) => this.loadOf(p, raw) });
    // 뒷줄 (진형을 켠 게임에서 뒷줄에 둔 영웅이 있을 때만)
    g.saves.push({ name: 'formation', save: (p) => (p.squadBack.length ? { back: [...p.squadBack] } : undefined), load: (p, raw) => this.loadRows(p, raw) });
    const syn = !!SQUAD_RULES.synergy;
    g.personal.push({
      name: 'squad',
      state: (p): SquadMe => {
        const v = this.view(p);
        return { ids: [...p.squad], power: v.power, ...(ROWS ? { back: [...p.squadBack] } : {}), ...(syn ? { syn: v.syn } : {}) };
      },
    });
    g.on('playerJoined', (p) => this.field(p));
    g.on('playerLeft', (id) => this.clear(id));
    g.on('heroChanged', (p, id) => {
      // 처음 얻은 영웅은 빈 자리에 저절로 (SQUAD_RULES.autoFill)
      if (SQUAD_RULES.autoFill && !p.squad.includes(id) && p.squad.length < SQUAD_RULES.size && g.roster.owned(p, id)) { p.squad.push(id); p.squadBack = arrangeRows(p.squad, p.squadBack); p.unsaved = true; this.field(p); this.refit(p); return; }
      for (const e of this.out.get(p.id) ?? []) if (e.type === id) this.apply(e, p, false);
    });
  }

  /** 편성의 모습: 영웅마다의 최종 값(장비·각성·기술 레벨·시너지), 켜진 시너지, 전투력 (engine/shared/defs/herogrow.ts의 squadView) */
  view(p: Ent): SquadView { return squadView(p.squad, p.squadBack, p.heroes, this.g.field(p, 'hgear')); }
  /** 편성한 영웅의 전투력의 합 (시너지까지. 성장이 없으면 영웅의 전투력의 합) */
  power(p: Ent): number { return this.view(p).power; }
  /** 뒷줄인가 (진형이 없으면 늘 아니다) */
  isBack(p: Ent, id: string): boolean { return !!ROWS && p.squadBack.includes(id); }
  /** 그 사람의 싸우는 영웅들 (월드의 엔티티) */
  heroes(p: Ent): readonly Ent[] { return this.out.get(p.id) ?? []; }

  /**
   * 편성을 바꾼다: 가진 영웅만, 겹치지 않게, SQUAD_RULES.size까지. 틀린 것이 있으면 아무것도 바꾸지 않는다.
   * back(진형을 켠 게임): 뒷줄에 둘 영웅. 주지 않으면 지금의 뒷줄을 지킨다. 한 줄이 넘치면 넘친 영웅을 다른 줄로 (arrangeRows)
   */
  set(p: Ent, raw: readonly unknown[], back?: readonly unknown[]): boolean {
    const ids = raw.filter((x): x is string => isHeroId(x));
    if (ids.length !== raw.length || ids.length > SQUAD_RULES.size || new Set(ids).size !== ids.length || ids.some((id) => !this.g.roster.owned(p, id))) return false;
    p.squad = ids;
    if (ROWS) p.squadBack = arrangeRows(ids, back ? back.filter((x): x is string => typeof x === 'string') : p.squadBack);
    p.unsaved = true;
    this.field(p);
    this.refit(p);
    return true;
  }

  /** 편성이 바뀐 뒤: 남아 있던 영웅의 값을 다시 맞춘다 (시너지와 줄의 덤은 편성 전체에 달렸다). 시너지도 진형도 없으면 할 일이 없다 */
  private refit(p: Ent): void {
    if (!ROWS && !SQUAD_RULES.synergy) return;
    const v = this.view(p);
    for (const e of this.out.get(p.id) ?? []) this.apply(e, p, false, v);
  }

  /** 영웅이 지금 나타나도 되는가 (SQUAD_RULES.where 'stage'면 단계의 회차가 있을 때만) */
  private allowed(p: Ent): boolean { return !STAGE_ONLY || (this.g.has('stages') && !!this.g.stages.runOf(p)); }
  /**
   * 영웅이 기준으로 삼는 자리: 주인. 단, 'stage'에서 회차가 뒤에서 이어 가는 중이면(주인이 다른 층) 그 층의 단계 자리.
   * 주인의 엔티티 그대로이거나 자리·층·방향만 가진 것
   */
  private anchor(o: Ent): Pick<Ent, 'x' | 'z' | 'layer' | 'face'> {
    if (!STAGE_ONLY || !this.g.has('stages')) return o;
    const r = this.g.stages.runOf(o);
    return r && r.bg ? { x: STAGE_RULES.arena.x, z: STAGE_RULES.arena.z + 3, layer: r.layer, face: 0 } : o;
  }

  /** 편성대로 영웅을 세운다: 빠진 영웅은 치우고, 새로 든 영웅은 주인 곁에 놓는다 (봇에게는 영웅이 없다) */
  field(p: Ent): void {
    const g = this.g;
    if (p.bot || p.kind !== 'p' || g.ents.get(p.id) !== p) return;
    const now = this.out.get(p.id) ?? [];
    if (!this.allowed(p)) { for (const e of now) g.remove(e.id); this.out.delete(p.id); return; }
    const keep = now.filter((e) => p.squad.includes(e.type) && g.ents.has(e.id));
    for (const e of now) if (!keep.includes(e)) g.remove(e.id);
    for (const id of p.squad) {
      if (keep.some((e) => e.type === id) || !g.roster.owned(p, id)) continue;
      const at = this.spot(p, id), a = this.anchor(p);
      const e = g.place('hero', { x: at.x, z: at.z, type: id, name: '', layer: a.layer, face: a.face });
      e.data.owner = p.id;
      this.apply(e, p, true);
      keep.push(e);
    }
    keep.sort((a, b) => p.squad.indexOf(a.type) - p.squad.indexOf(b.type));
    this.out.set(p.id, keep);
  }

  /** 주인이 떠났다: 영웅을 치운다 */
  private clear(id: number): void {
    for (const e of this.out.get(id) ?? []) this.g.remove(e.id);
    this.out.delete(id);
  }

  /** 영웅의 공격·체력을 맞춘다 (레벨과 별, 그리고 켠 게임은 장비·각성·기술 레벨·시너지·줄). full이면 체력을 가득 (아니면 비율을 지킨다) */
  private apply(e: Ent, p: Ent, full: boolean, v: SquadView = this.view(p)): void {
    const h = this.g.roster.owned(p, e.type), s = v.heroes[e.type];
    if (!h || !s) return;
    const ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    e.data.atk = s.atk; e.data.lv = h.lv; e.data.stars = h.stars;
    // 싸움의 배율: 기본 공격(dm), 기술(sk), 받는 피해(gd). 1이면 적지 않는다 (예전과 같은 셈)
    const dm = 1 + s.fight.dmg, sk = s.skillMul * dm, gd = 1 - s.fight.guard;
    if (dm !== 1) e.data.dm = dm; else delete e.data.dm;
    if (sk !== 1) e.data.sk = sk; else delete e.data.sk;
    if (gd !== 1) e.data.gd = gd; else delete e.data.gd;
    e.maxHp = Math.max(1, s.hp);
    e.hp = full ? e.maxHp : Math.max(1, Math.round(e.maxHp * ratio));
    this.g.emit(['mh', e.id, e.maxHp]);
  }

  private stars(e: Ent): number { return Number(e.data.stars ?? 1); }
  private lv(e: Ent): number { return Number(e.data.lv ?? 1); }
  private ownerOf(e: Ent): Ent | undefined { const o = this.g.ents.get(Number(e.data.owner ?? 0)); return o && o.kind === 'p' ? o : undefined; }

  /** 주인 곁에서 그 영웅의 서는 곳: 편성의 몇째 (진형을 켠 게임은 그 줄의 몇째로 앞줄은 앞, 뒷줄은 뒤) */
  private spot(o: Ent, id: string): { x: number; z: number } {
    const p = o, a = this.anchor(o);
    let sx: number, sz: number;
    if (ROWS) {
      const back = p.squadBack.includes(id), row = p.squad.filter((x) => p.squadBack.includes(x) === back), list = back ? BACK : FRONT;
      [sx, sz] = list[Math.max(0, row.indexOf(id)) % list.length];
    } else [sx, sz] = SLOTS[Math.max(0, p.squad.indexOf(id)) % SLOTS.length];
    const c = Math.cos(a.face), s = Math.sin(a.face);
    // 앞 = (sin face, cos face), 옆 = (cos face, -sin face)
    return { x: a.x + sx * c + sz * s, z: a.z - sx * s + sz * c };
  }

  /** 주인 곁으로 바로 옮긴다 (층을 옮겼거나 너무 멀어졌다) */
  private jump(e: Ent, p: Ent): void {
    const at = this.spot(p, e.type);
    e.layer = this.anchor(p).layer; e.x = at.x; e.z = at.z; e.tx = e.x; e.tz = e.z; e.moving = false; e.path = null; e.targetId = 0;
    clampInto(e); resolve(e, this.g.world.obstacles);
    this.g.emit(['r', e.id]);
  }

  /** 체력이 0이 되었다: 쉬었다가 주인 곁에서 다시 일어난다 */
  private down(e: Ent): void {
    const g = this.g;
    e.dead = true; e.moving = false; e.targetId = 0; e.dots = []; e.buffs = []; e.respawn = SQUAD_RULES.reviveS;
    g.emit(['d', e.id]);
    for (const m of g.ents.values()) if (m.targetId === e.id) m.targetId = 0;
  }

  /** 영웅 하나의 틱: 따라가기, 대상 고르기, 다가가 치기, 기술 */
  private think(e: Ent, dt: number): void {
    const g = this.g, owner = this.ownerOf(e);
    if (!owner) { g.remove(e.id); return; }
    if (STAGE_ONLY && !this.allowed(owner)) { this.field(owner); return; }
    // 기준 자리: 주인 (단계가 뒤에서 이어 가면 그 층의 단계 자리)
    const o = this.anchor(owner);
    if (e.dead) {
      e.respawn -= dt;
      if (e.respawn <= 0) { e.dead = false; e.hp = e.maxHp; e.lastHurt = -99; this.jump(e, owner); }
      return;
    }
    if (e.layer !== o.layer || dist(e, o) > SQUAD_RULES.leash * 2) { this.jump(e, owner); return; }
    const role = heroRole(e.type);
    if (e.atkCd > 0) e.atkCd -= dt;
    if (e.cds.length === 0) e.cds = [0];
    if (e.cds[0] > 0) e.cds[0] = Math.max(0, e.cds[0] - dt);
    // 싸우지 않은 지 4초가 지나면 회복한다
    if (e.hp < e.maxHp && g.clock - e.lastHurt > 4) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * SQUAD_RULES.regen * dt);
    // 앞줄: 주인이나 뒷줄을 노리는 몬스터를 자기에게 돌린다
    if (ROWS && ROWS.taunt > 0 && !owner.squadBack.includes(e.type)) this.taunt(e, owner, dt);

    // 대상: 지금 대상이 살아 있고 주인 곁(leash)이면 그대로. 아니면 생각할 때마다 주인의 대상이나 주인 둘레(seek)에서 가장 가까운 몬스터
    let t = g.ents.get(e.targetId);
    if (!t || t.dead || t.kind !== 'm' || t.layer !== e.layer || dist(o, t) > SQUAD_RULES.leash) { t = undefined; e.targetId = 0; }
    e.wait -= dt;
    if (!t && e.wait <= 0) {
      e.wait = THINK_S;
      const mine = o === owner ? g.ents.get(owner.targetId) : undefined;
      if (mine && mine.kind === 'm' && !mine.dead && mine.layer === e.layer) t = mine;
      else {
        let best = SQUAD_RULES.seek;
        for (const m of g.monstersIn(e.layer)) {
          if (m.kind !== 'm' || m.dead || m.homing || m.layer !== e.layer) continue;
          if (m.def?.boss && m.targetId === 0 && !m.swarm) continue; // 들판의 필드 보스는 주인이 먼저 건드릴 때까지 두고 본다
          const d = dist(o, m);
          if (d < best) { best = d; t = m; }
        }
      }
      if (t) e.targetId = t.id;
    }

    if (!t) {
      // 따라가기: 주인 뒤쪽의 내 자리로
      const at = this.spot(owner, e.type);
      if (dist(e, at) > 1.2) { g.movement.goTo(e, at.x, at.z); g.movement.walk(e, role.speed * (dist(e, o) > 8 ? 1.4 : 1), dt); }
      else { e.moving = false; e.face = o.face; }
      return;
    }
    const d = dist(e, t);
    if (d > role.range) { g.movement.goTo(e, t.x, t.z); g.movement.walk(e, role.speed, dt); return; }
    e.moving = false;
    e.face = Math.atan2(t.x - e.x, t.z - e.z);
    // 기술: 쿨다운이 끝났고 사거리 안이면 (대상이 필요 없는 기술은 곧바로)
    if (role.skill && isSkillId(role.skill) && e.cds[0] <= 0) {
      const sd = skillDef(role.skill);
      if (sd.range === undefined || d <= sd.range) {
        g.emit(['s', e.id, role.skill, t.id]);
        g.combat.cast(e, role.skill, t);
        e.cds[0] = sd.cd;
        return;
      }
    }
    if (e.atkCd <= 0) {
      e.atkCd = role.atkCd;
      const atk = Number(e.data.atk ?? heroDef(e.type).atk), dm = Number(e.data.dm ?? 1);
      g.combat.damage(e, t, Math.max(1, Math.round((dm === 1 ? atk : atk * dm) * (0.9 + Math.random() * 0.2))), false);
    }
  }

  /** 앞줄 영웅의 도발: 둘레(ROWS.taunt) 안에서 주인이나 같은 주인의 뒷줄 영웅을 노리는 몬스터를 자기에게 돌린다 (진형을 켠 게임만) */
  private taunt(e: Ent, o: Ent, dt: number): void {
    const t = (Number(e.data.tt ?? 0) || 0) - dt;
    if (t > 0) { e.data.tt = t; return; }
    e.data.tt = TAUNT_S;
    const g = this.g, reach = ROWS!.taunt, mine = new Set<number>([o.id]);
    for (const h of this.out.get(o.id) ?? []) if (h !== e && o.squadBack.includes(h.type)) mine.add(h.id);
    for (const m of g.monstersIn(e.layer)) {
      if (m.kind !== 'm' || m.dead || m.layer !== e.layer || !mine.has(m.targetId) || dist(m, e) > reach) continue;
      m.targetId = e.id;
    }
  }

  // ---------- 저장 ----------
  private loadOf(p: Ent, raw: unknown): void {
    if (!Array.isArray(raw)) return;
    const ids = raw.filter((x): x is string => isHeroId(x));
    p.squad = [...new Set(ids)].slice(0, SQUAD_RULES.size);
    if (ROWS) p.squadBack = arrangeRows(p.squad, p.squadBack);
  }
  /** 뒷줄: 편성에 든 영웅만 (편성은 먼저 읽힌다). 진형을 끈 게임은 그대로 지켜 둔다 (다시 켜면 이어진다) */
  private loadRows(p: Ent, raw: unknown): void {
    const back = (raw as { back?: unknown } | null)?.back;
    if (!Array.isArray(back)) return;
    const ids = [...new Set(back.filter((x): x is string => isHeroId(x) && p.squad.includes(x)))];
    p.squadBack = ROWS ? arrangeRows(p.squad, ids) : ids;
  }
}
