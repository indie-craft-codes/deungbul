// 전투: 피해와 죽음, 플레이어의 공격·기술 명령, 플레이어의 틱(쿨다운, 회복, 추격과 자동 공격).
import { ATTACK_CD, COMBAT, RESPAWN_S, SKILL_SLOTS, classOf, skillDef, type BuffMod, type SkillId } from '../../../shared/defs';
import { resolve } from '../../../shared/sim';
import { AOI_LEAVE, clampInto } from '../../../shared/world';
import { dist, ri, type Ent } from '../entity';
import type { Game } from '../game';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 사람 편에서 싸우는 엔티티 종류 (편성 모듈의 영웅 'hero'처럼 g.defineKind로 놓은 것): 몬스터를 때리고 몬스터에게 맞는다.
 * 등록하지 않은 종류는 예전처럼 다룬다 (등록한 것이 없으면 전투의 셈은 예전과 같다)
 */
export interface AllyKind {
  /** 그 엔티티의 주인 (처치 보상과 '때렸다' 사건은 주인의 것으로 친다). 없으면 undefined */
  owner: (e: Ent) => Ent | undefined;
  /** 체력이 0이 되었다 (쓰러뜨린 것은 by). 엔티티를 치우거나 쉬게 하는 것은 등록한 쪽의 일이다 */
  down: (e: Ent, by: Ent) => void;
  /** 그 엔티티가 쓰는 기술의 피해·회복에 곱하는 값 (없으면 1) */
  skillScale?: (e: Ent) => number;
}

export class Combat {
  /** 사람 편에서 싸우는 종류: 종류 id → AllyKind (registerAlly) */
  readonly allies = new Map<string, AllyKind>();
  /** 사람 편에서 싸우는 종류를 등록한다: 그 종류가 몬스터에게 준 피해는 주인의 것으로 치고, 체력이 0이 되면 down을 부른다 */
  registerAlly(kind: string, def: AllyKind): void { this.allies.set(kind, def); }
  /** 사람이거나 사람 편의 엔티티인가 (몬스터가 노리고, 아군 회복·강화를 받는다) */
  friendly(e: Ent): boolean { return e.kind === 'p' || this.allies.has(e.kind); }

  constructor(private g: Game) {
    g.commands.set('attack', (p, m) => {
      if (!num(m.id)) return;
      const t = g.ents.get(m.id);
      if (!t || t.kind !== 'm' || t.dead || t.layer !== p.layer || dist(p, t) > AOI_LEAVE) return;
      p.targetId = t.id; p.stuck = 0;
    });
    g.commands.set('skill', (p, m) => { if (num(m.n)) this.useSkill(p, m.n); });
    // 기술의 강화(buff)가 보정 목록에 들어간다: 지금 걸려 있는 것만 (시간이 지난 것은 tickEffects가 지우지만, 지우기 전이라도 셈에 넣지 않는다)
    const live = (p: Ent | undefined, mod: BuffMod) => (p ? p.buffs.filter((b) => b.mod === mod && b.until > g.clock) : []);
    g.mods.provide('damage', (p) => live(p, 'damage').reduce((v, b) => v * (1 + b.value), 1));
    g.mods.provide('guard', (p) => live(p, 'guard').reduce((v, b) => v * Math.max(0.1, 1 - b.value), 1));
    g.mods.provide('regen', (p) => live(p, 'regen').reduce((v, b) => v * (1 + b.value), 1));
    g.mods.provide('crit', (p) => live(p, 'crit').reduce((v, b) => v + b.value, 0));
  }

  /** n번 칸의 기술을 쓴다. 칸에 든 기술은 직업마다 다르다. */
  private useSkill(p: Ent, n: number): void {
    const g = this.g;
    if (!Number.isInteger(n) || n < 0 || n >= SKILL_SLOTS || p.cds[n] > 0) return;
    const id = classOf(p.cls).skills[n], def = skillDef(id);
    // 대상이 필요한 기술: 대상과 사거리를 확인한다
    let target: Ent | undefined;
    if (def.range !== undefined) {
      target = g.ents.get(p.targetId);
      if (!target || target.dead || target.layer !== p.layer) { g.notify(p, 'noTarget'); return; }
      if (dist(p, target) > def.range) { g.notify(p, 'tooFar'); return; }
      p.face = Math.atan2(target.x - p.x, target.z - p.z);
    }
    g.emit(['s', p.id, id, target?.id ?? 0]);
    this.cast(p, id, target);
    p.cds[n] = def.cd;
    g.cdAcks.push({ id: p.id, n, ms: def.cd * 1000 });
  }

  /**
   * 기술의 효과를 낸다. 기술 이름이 아니라 효과의 종류로 처리한다 (engine/shared/defs/combat.ts의 SkillEffect).
   * 쿨다운과 사거리는 부른 쪽(useSkill)이 본다. 시험과 게임의 규칙도 이것으로 효과만 낼 수 있다
   */
  cast(p: Ent, id: SkillId, target?: Ent): void {
    const ally = this.allies.get(p.kind);
    const g = this.g, def = skillDef(id), fx = def.effect, up = ally ? ally.skillScale?.(p) ?? 1 : g.has('build') ? g.build.skillScale(p, id) : 1; // 강화한 기술은 피해와 회복이 커진다 (사람 편의 종류는 그 종류가 정한 배율)
    const stun = (m: Ent, s: number | undefined) => { if (s && !m.dead && m.kind === 'm') { m.stunUntil = g.clock + s; m.moving = false; g.emit(['stun', m.id, s]); } };
    /** 나와(allies면 범위 안의 사람들도) 같은 층의 사람들 */
    const friends = (allies: boolean | undefined): Ent[] => (allies ? [...g.ents.values()] : [p]).filter((e) => (e.kind === 'p' || (this.allies.size > 0 && this.allies.has(e.kind))) && !e.dead && e.layer === p.layer && (e === p || dist(p, e) <= (def.radius ?? 0)));
    switch (fx.kind) {
      case 'hit':
        if (!target) break;
        if (fx.slow && target.kind === 'm') target.slowUntil = g.clock + fx.slow;
        stun(target, fx.stun);
        this.damage(p, target, Math.round(ri(fx.dmg[0], fx.dmg[1]) * up), true);
        break;
      case 'area': {
        const slow = fx.slow;
        this.area(p, fx.at === 'target' && target ? target : p, def.radius ?? 0, Math.round(fx.dmg[0] * up), Math.round(fx.dmg[1] * up), slow ? (m) => { m.slowUntil = g.clock + slow; } : undefined);
        break;
      }
      case 'heal': {
        // allies면 나와 주변의 사람들을 함께 살린다
        for (const e of friends(fx.allies)) {
          const amount = Math.round(Math.min(fx.amount * up, e.maxHp - e.hp));
          if (amount < 1 && e !== p) continue;
          e.hp += amount;
          g.emit(['heal', e.id, amount]);
        }
        break;
      }
      case 'buff': {
        // 같은 기술의 강화는 새로 건다(시간이 처음부터). 강화한 기술은 비율이 커진다
        for (const e of friends(fx.allies)) {
          e.buffs = e.buffs.filter((b) => b.skill !== id);
          e.buffs.push({ skill: id, mod: fx.mod, value: fx.value * up, until: g.clock + fx.dur });
          e.dirty = true;
          g.emit(['buff', e.id, id, fx.dur]);
        }
        break;
      }
      case 'dash': {
        // 대상이 있으면 대상 앞까지(붙어 서는 거리를 남기고), 없으면 바라보는 쪽으로
        const dx = target ? target.x - p.x : Math.sin(p.face), dz = target ? target.z - p.z : Math.cos(p.face);
        const len = Math.hypot(dx, dz) || 1, go = target ? Math.max(0, Math.min(fx.dist, len - 1.2)) : fx.dist;
        p.x += (dx / len) * go; p.z += (dz / len) * go;
        clampInto(p); resolve(p, g.world.obstacles);
        p.tx = p.x; p.tz = p.z; p.moving = false; p.path = null;
        if (target && !target.dead && dist(p, target) <= 2.6) {
          stun(target, fx.stun);
          if (fx.dmg) this.damage(p, target, Math.round(ri(fx.dmg[0], fx.dmg[1]) * up), true);
        }
        break;
      }
      case 'dot': {
        const hit = fx.area && target
          ? [...g.ents.values()].filter((m) => m.kind === 'm' && !m.dead && m.layer === p.layer && dist(target, m) <= (def.radius ?? 0))
          : target && target.kind === 'm' && !target.dead ? [target] : [];
        for (const m of hit) {
          m.dots = m.dots.filter((d) => !(d.src === p.id && d.skill === id));
          m.dots.push({ src: p.id, skill: id, dps: Math.max(1, Math.round(fx.dps * up)), until: g.clock + fx.dur, next: 1 });
          m.hitters.add(p.id);
          if (!m.targetId) m.targetId = p.id;
        }
        break;
      }
    }
  }

  /** 걸려 있는 강화와 지속 피해의 시간을 흘린다 (모든 엔티티, 매 틱) */
  tickEffects(e: Ent, dt: number): void {
    const g = this.g;
    if (e.buffs.length && e.buffs.some((b) => b.until <= g.clock)) { e.buffs = e.buffs.filter((b) => b.until > g.clock); e.dirty = true; }
    if (!e.dots.length) return;
    if (e.dead) { e.dots = []; return; }
    for (const d of [...e.dots]) {
      d.next -= dt;
      if (d.next > 0) continue;
      d.next += 1;
      const src = g.ents.get(d.src);
      // 건 사람이 떠났거나 다른 층으로 갔으면 그친다
      if (!src || src.layer !== e.layer) { e.dots = e.dots.filter((x) => x !== d); continue; }
      this.damage(src, e, d.dps, false);
      if (e.dead) return;
    }
    e.dots = e.dots.filter((d) => d.until > g.clock);
  }

  /** center 주변 radius 안의 몬스터 모두에게 피해를 준다. also가 있으면 맞은 몬스터마다 부른다. */
  private area(src: Ent, center: { x: number; z: number }, radius: number, min: number, max: number, also?: (m: Ent) => void): void {
    const at = { x: center.x, z: center.z }; // 대상이 죽어 사라져도 자리는 남는다
    for (const m of [...this.g.ents.values()]) {
      if (m.kind === 'm' && !m.dead && m.layer === src.layer && dist(at, m) <= radius) { also?.(m); this.damage(src, m, ri(min, max), false); }
    }
  }

  damage(src: Ent, dst: Ent, amount: number, crit: boolean): void {
    if (dst.dead || src.layer !== dst.layer) return;
    if (src.kind === 'p') amount = Math.round(amount * this.g.mods.product('damage', src));
    if (dst.kind === 'p') amount = Math.max(1, Math.round(amount * this.g.mods.product('guard', dst)));
    const before = dst.hp;
    dst.hp -= amount;
    dst.lastHurt = this.g.clock;
    this.g.emit(['h', src.id, dst.id, amount, crit ? 1 : 0]);
    if (dst.kind === 'm') {
      if (src.kind === 'p') { dst.hitters.add(src.id); src.lastAct = this.g.clock; this.g.fire('hit', src, dst, Math.max(0, Math.min(amount, before))); }
      else if (this.allies.size > 0) {
        // 사람 편의 종류가 때렸다: 주인이 때린 것으로 친다 (처치 보상, 일일 임무)
        const owner = this.allies.get(src.kind)?.owner(src);
        if (owner && owner.kind === 'p') { dst.hitters.add(owner.id); this.g.fire('hit', owner, dst, Math.max(0, Math.min(amount, before))); }
      }
      if (!dst.targetId) dst.targetId = src.id;
      if (dst.hp <= 0) this.killMonster(dst);
    } else if (dst.hp <= 0) {
      const ally = this.allies.size > 0 ? this.allies.get(dst.kind) : undefined;
      if (ally) { dst.hp = 0; ally.down(dst, src); } else this.killPlayer(dst);
    }
  }

  private killMonster(m: Ent): void {
    const g = this.g;
    m.hp = 0; m.dead = true; m.respawn = m.def?.respawn ?? RESPAWN_S; m.moving = false; m.targetId = 0; m.dots = []; m.stunUntil = 0; m.slowUntil = 0;
    g.emit(['d', m.id]);
    const hitters: Ent[] = [];
    for (const id of m.hitters) {
      const p = g.ents.get(id);
      if (p && p.kind === 'p' && p.layer === m.layer && dist(p, m) <= AOI_LEAVE) hitters.push(p);
    }
    m.hitters.clear();
    for (const e of g.ents.values()) if (e.targetId === m.id) e.targetId = 0;
    // 곁에 있던 파티원도 함께 잡은 것으로 친다
    g.fire('monsterKilled', m, g.has('party') ? g.party.share(hitters, m) : hitters);
  }

  private killPlayer(p: Ent): void {
    const g = this.g;
    // 벌은 없다: 게임이 정한 곳(g.rules.respawn)에서 온전한 체력으로 다시 일어난다
    const at = g.rules.respawn(p);
    p.hp = p.maxHp; p.x = at.x; p.z = at.z; p.moving = false; p.path = null; p.targetId = 0; p.lastHurt = -99; p.dots = [];
    resolve(p, g.world.obstacles);
    g.emit(['r', p.id]);
    g.notify(p, 'died', at.id);
    for (const e of g.ents.values()) {
      if (e.kind === 'm') { e.hitters.delete(p.id); if (e.targetId === p.id) e.targetId = 0; }
    }
    g.fire('playerDied', p);
  }

  tickPlayer(p: Ent, dt: number): void {
    const g = this.g, cls = classOf(p.cls);
    if (p.atkCd > 0) p.atkCd -= dt;
    if (p.itemCd > 0) p.itemCd -= dt;
    for (let i = 0; i < p.cds.length; i++) if (p.cds[i] > 0) p.cds[i] = Math.max(0, p.cds[i] - dt);
    if (p.hp < p.maxHp && g.clock - p.lastHurt > COMBAT.regenAfterS) p.hp = Math.min(p.maxHp, p.hp + COMBAT.regenPerS * g.mods.product('regen', p) * dt);
    // 이동 속도는 클라이언트가 같은 식으로 예측하므로 보정 목록이 아니라 게임의 규칙(g.rules.speed)에서 바로 구한다
    const speed = g.rules.speed(p);

    if (!p.targetId) { if (p.moving) g.movement.walk(p, speed, dt); return; }
    const t = g.ents.get(p.targetId);
    if (!t || t.dead || t.layer !== p.layer || dist(p, t) > AOI_LEAVE) { p.targetId = 0; p.moving = false; return; }
    // 사거리 밖이면 다가간다 (전사는 붙고, 궁수는 멀리서 멈춘다)
    if (dist(p, t) > cls.range) {
      p.tx = t.x; p.tz = t.z; p.moving = true;
      g.movement.walk(p, speed, dt);
      if (!p.moving && dist(p, t) > cls.range + 0.5) p.targetId = 0; // 막혀서 못 간다
      return;
    }
    p.moving = false;
    p.face = Math.atan2(t.x - p.x, t.z - p.z);
    if (p.atkCd <= 0) {
      p.atkCd = ATTACK_CD;
      const crit = Math.random() < COMBAT.critChance + g.mods.sum('crit', p);
      const hit = ri(cls.basic[0], cls.basic[1]);
      this.damage(p, t, crit ? Math.round(hit * COMBAT.critMult) : hit, crit);
    }
  }
}
