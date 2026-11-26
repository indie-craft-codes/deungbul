// [squad] 편성: 가진 영웅 가운데 SQUAD_RULES.size까지 골라 함께 싸운다. 편성한 영웅은 월드의 엔티티(종류 'hero')로 서서
// 주인을 따라다니고, 주인 둘레의 몬스터를 스스로 노려 역할(HERO_ROLES)의 기본 공격과 기술(쿨다운마다)로 친다.
// 싸움의 셈은 전투 모듈 그대로다: 피해는 g.combat.damage, 기술은 g.combat.cast (영웅은 전투 모듈에 '사람 편의 종류'로 등록된다: registerAlly).
// 영웅이 준 피해는 주인이 준 것으로 쳐서 처치 보상·일일 임무가 주인에게 간다. 몬스터는 자기를 때린 영웅을 노리고, 영웅이 쓰러지면 reviveS 뒤 주인 곁에서 다시 일어난다.
// 영웅의 공격·체력은 영웅 모듈(roster)의 레벨과 별로 정해진다 (heroStats). 주인이 층(채널, 던전, 단계)을 옮기면 영웅도 따라 옮긴다.
// 저장: 캐릭터의 ext 'squad' (영웅 id의 목록). 본인에게는 개인 상태 'squad' ({ ids, power }).
// 화면은 종류 'hero'를 역할의 겉모습으로 그린다 (engine/client/hud/collect.ts의 registerKind). 상태 줄의 값은 [별, 레벨].
import { SQUAD_RULES, heroDef, heroRole, heroStats, isHeroId, isSkillId, skillDef, type SquadMe } from '../../../shared/defs';
import { resolve } from '../../../shared/sim';
import { clampInto } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

/** 영웅이 서는 자리: 주인의 뒤쪽 (주인이 바라보는 쪽을 앞으로). [옆, 앞뒤] (m) */
const SLOTS: readonly [number, number][] = [[-1.7, -1.3], [1.7, -1.3], [-2.8, -2.9], [2.8, -2.9], [0, -3.6], [-4, -1.2], [4, -1.2], [0, -5]];
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
      // 영웅의 기술은 공격의 크기에 따라 커진다: 공격 10을 1배로
      skillScale: (e) => Math.max(0.1, Number(e.data.atk ?? 10) / 10),
    });
    g.commands.set('squad', (p, m) => { if (Array.isArray(m.ids)) this.set(p, m.ids); });
    g.saves.push({ name: 'squad', save: (p) => (p.squad.length ? [...p.squad] : undefined), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'squad', state: (p): SquadMe => ({ ids: [...p.squad], power: this.power(p) }) });
    g.on('playerJoined', (p) => this.field(p));
    g.on('playerLeft', (id) => this.clear(id));
    g.on('heroChanged', (p, id) => {
      // 처음 얻은 영웅은 빈 자리에 저절로 (SQUAD_RULES.autoFill)
      if (SQUAD_RULES.autoFill && !p.squad.includes(id) && p.squad.length < SQUAD_RULES.size && g.roster.owned(p, id)) { p.squad.push(id); p.unsaved = true; this.field(p); return; }
      for (const e of this.out.get(p.id) ?? []) if (e.type === id) this.apply(e, p, false);
    });
  }

  /** 편성한 영웅의 전투력의 합 */
  power(p: Ent): number { return p.squad.reduce((s, id) => s + this.g.roster.power(p, id), 0); }
  /** 그 사람의 싸우는 영웅들 (월드의 엔티티) */
  heroes(p: Ent): readonly Ent[] { return this.out.get(p.id) ?? []; }

  /** 편성을 바꾼다: 가진 영웅만, 겹치지 않게, SQUAD_RULES.size까지. 틀린 것이 있으면 아무것도 바꾸지 않는다 */
  set(p: Ent, raw: readonly unknown[]): boolean {
    const ids = raw.filter((x): x is string => isHeroId(x));
    if (ids.length !== raw.length || ids.length > SQUAD_RULES.size || new Set(ids).size !== ids.length || ids.some((id) => !this.g.roster.owned(p, id))) return false;
    p.squad = ids;
    p.unsaved = true;
    this.field(p);
    return true;
  }

  /** 편성대로 영웅을 세운다: 빠진 영웅은 치우고, 새로 든 영웅은 주인 곁에 놓는다 (봇에게는 영웅이 없다) */
  field(p: Ent): void {
    const g = this.g;
    if (p.bot || p.kind !== 'p' || g.ents.get(p.id) !== p) return;
    const now = this.out.get(p.id) ?? [];
    const keep = now.filter((e) => p.squad.includes(e.type) && g.ents.has(e.id));
    for (const e of now) if (!keep.includes(e)) g.remove(e.id);
    for (const id of p.squad) {
      if (keep.some((e) => e.type === id) || !g.roster.owned(p, id)) continue;
      const at = this.spot(p, p.squad.indexOf(id));
      const e = g.place('hero', { x: at.x, z: at.z, type: id, name: '', layer: p.layer, face: p.face });
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

  /** 영웅의 공격·체력을 레벨과 별에 맞춘다. full이면 체력을 가득 (아니면 비율을 지킨다) */
  private apply(e: Ent, p: Ent, full: boolean): void {
    const h = this.g.roster.owned(p, e.type);
    if (!h) return;
    const s = heroStats(e.type, h.lv, h.stars), ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    e.data.atk = s.atk; e.data.lv = h.lv; e.data.stars = h.stars;
    e.maxHp = Math.max(1, s.hp);
    e.hp = full ? e.maxHp : Math.max(1, Math.round(e.maxHp * ratio));
    this.g.emit(['mh', e.id, e.maxHp]);
  }

  private stars(e: Ent): number { return Number(e.data.stars ?? 1); }
  private lv(e: Ent): number { return Number(e.data.lv ?? 1); }
  private ownerOf(e: Ent): Ent | undefined { const o = this.g.ents.get(Number(e.data.owner ?? 0)); return o && o.kind === 'p' ? o : undefined; }

  /** 주인 곁에서 그 자리(편성의 몇째)의 서는 곳 */
  private spot(p: Ent, slot: number): { x: number; z: number } {
    const [sx, sz] = SLOTS[Math.max(0, slot) % SLOTS.length];
    const c = Math.cos(p.face), s = Math.sin(p.face);
    // 앞 = (sin face, cos face), 옆 = (cos face, -sin face)
    return { x: p.x + sx * c + sz * s, z: p.z - sx * s + sz * c };
  }

  /** 주인 곁으로 바로 옮긴다 (층을 옮겼거나 너무 멀어졌다) */
  private jump(e: Ent, p: Ent): void {
    const at = this.spot(p, p.squad.indexOf(e.type));
    e.layer = p.layer; e.x = at.x; e.z = at.z; e.tx = e.x; e.tz = e.z; e.moving = false; e.path = null; e.targetId = 0;
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
    const g = this.g, o = this.ownerOf(e);
    if (!o) { g.remove(e.id); return; }
    if (e.dead) {
      e.respawn -= dt;
      if (e.respawn <= 0) { e.dead = false; e.hp = e.maxHp; e.lastHurt = -99; this.jump(e, o); }
      return;
    }
    if (e.layer !== o.layer || dist(e, o) > SQUAD_RULES.leash * 2) { this.jump(e, o); return; }
    const role = heroRole(e.type);
    if (e.atkCd > 0) e.atkCd -= dt;
    if (e.cds.length === 0) e.cds = [0];
    if (e.cds[0] > 0) e.cds[0] = Math.max(0, e.cds[0] - dt);
    // 싸우지 않은 지 4초가 지나면 회복한다
    if (e.hp < e.maxHp && g.clock - e.lastHurt > 4) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * SQUAD_RULES.regen * dt);

    // 대상: 지금 대상이 살아 있고 주인 곁(leash)이면 그대로. 아니면 생각할 때마다 주인의 대상이나 주인 둘레(seek)에서 가장 가까운 몬스터
    let t = g.ents.get(e.targetId);
    if (!t || t.dead || t.kind !== 'm' || t.layer !== e.layer || dist(o, t) > SQUAD_RULES.leash) { t = undefined; e.targetId = 0; }
    e.wait -= dt;
    if (!t && e.wait <= 0) {
      e.wait = THINK_S;
      const mine = g.ents.get(o.targetId);
      if (mine && mine.kind === 'm' && !mine.dead && mine.layer === e.layer) t = mine;
      else {
        let best = SQUAD_RULES.seek;
        for (const m of g.ents.values()) {
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
      const at = this.spot(o, o.squad.indexOf(e.type));
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
      const atk = Number(e.data.atk ?? heroDef(e.type).atk);
      g.combat.damage(e, t, Math.max(1, Math.round(atk * (0.9 + Math.random() * 0.2))), false);
    }
  }

  // ---------- 저장 ----------
  private loadOf(p: Ent, raw: unknown): void {
    if (!Array.isArray(raw)) return;
    const ids = raw.filter((x): x is string => isHeroId(x));
    p.squad = [...new Set(ids)].slice(0, SQUAD_RULES.size);
  }
}
