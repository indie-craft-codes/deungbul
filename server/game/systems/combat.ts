// 전투: 피해와 죽음, 플레이어의 공격·기술 명령, 플레이어의 틱(쿨다운, 회복, 추격과 자동 공격).
import { ATTACK_CD, RESPAWN_S, SKILL_SLOTS, classOf, skillDef } from '../../../shared/defs';
import { resolve } from '../../../shared/sim';
import { AOI_LEAVE } from '../../../shared/world';
import { dist, ri, type Ent } from '../entity';
import type { Game } from '../game';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class Combat {
  constructor(private g: Game) {
    g.commands.set('attack', (p, m) => {
      if (!num(m.id)) return;
      const t = g.ents.get(m.id);
      if (!t || t.kind !== 'm' || t.dead || t.layer !== p.layer || dist(p, t) > AOI_LEAVE) return;
      p.targetId = t.id; p.stuck = 0;
    });
    g.commands.set('skill', (p, m) => { if (num(m.n)) this.useSkill(p, m.n); });
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
      if (!target || target.dead) { g.notify(p, 'noTarget'); return; }
      if (dist(p, target) > def.range) { g.notify(p, 'tooFar'); return; }
      p.face = Math.atan2(target.x - p.x, target.z - p.z);
    }
    g.emit(['s', p.id, id, target?.id ?? 0]);
    // 기술 이름이 아니라 효과의 종류로 처리한다 (shared/content/combat.ts의 SkillEffect)
    const fx = def.effect;
    switch (fx.kind) {
      case 'hit': if (target) this.damage(p, target, ri(fx.dmg[0], fx.dmg[1]), true); break;
      case 'area': {
        const slow = fx.slow;
        this.area(p, fx.at === 'target' && target ? target : p, def.radius ?? 0, fx.dmg[0], fx.dmg[1], slow ? (m) => { m.slowUntil = g.clock + slow; } : undefined);
        break;
      }
      case 'heal': {
        // allies면 나와 주변의 사람들을 함께 살린다
        for (const e of fx.allies ? [...g.ents.values()] : [p]) {
          if (e.kind !== 'p' || e.layer !== p.layer || (e !== p && dist(p, e) > (def.radius ?? 0))) continue;
          const amount = Math.round(Math.min(fx.amount, e.maxHp - e.hp));
          if (amount < 1 && e !== p) continue;
          e.hp += amount;
          g.emit(['heal', e.id, amount]);
        }
        break;
      }
    }
    p.cds[n] = def.cd;
    g.cdAcks.push({ id: p.id, n, ms: def.cd * 1000 });
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
    dst.hp -= amount;
    dst.lastHurt = this.g.clock;
    this.g.emit(['h', src.id, dst.id, amount, crit ? 1 : 0]);
    if (dst.kind === 'm') {
      if (src.kind === 'p') dst.hitters.add(src.id);
      if (!dst.targetId) dst.targetId = src.id;
      if (dst.hp <= 0) this.killMonster(dst);
    } else if (dst.hp <= 0) this.killPlayer(dst);
  }

  private killMonster(m: Ent): void {
    const g = this.g;
    m.hp = 0; m.dead = true; m.respawn = m.def?.respawn ?? RESPAWN_S; m.moving = false; m.targetId = 0;
    g.emit(['d', m.id]);
    const hitters: Ent[] = [];
    for (const id of m.hitters) {
      const p = g.ents.get(id);
      if (p && p.kind === 'p' && dist(p, m) <= AOI_LEAVE) hitters.push(p);
    }
    m.hitters.clear();
    for (const e of g.ents.values()) if (e.targetId === m.id) e.targetId = 0;
    // 곁에 있던 파티원도 함께 잡은 것으로 친다
    g.fire('monsterKilled', m, g.party.share(hitters, m));
  }

  private killPlayer(p: Ent): void {
    const g = this.g;
    // 벌은 없다: 켜져 있는 가장 가까운 등탑 앞에서 온전한 체력으로 다시 일어난다
    const at = g.rules.respawn(p);
    p.hp = p.maxHp; p.x = at.x; p.z = at.z; p.moving = false; p.path = null; p.targetId = 0; p.lastHurt = -99;
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
    if (p.hp < p.maxHp && g.clock - p.lastHurt > 5) p.hp = Math.min(p.maxHp, p.hp + 4 * g.mods.product('regen', p) * dt);
    // 이동 속도는 클라이언트가 같은 식으로 예측하므로 보정 목록이 아니라, 내가 있는 구역의 등탑 단계에서 바로 구한다
    const speed = g.rules.speed(p);

    if (!p.targetId) { if (p.moving) g.movement.walk(p, speed, dt); return; }
    const t = g.ents.get(p.targetId);
    if (!t || t.dead || dist(p, t) > AOI_LEAVE) { p.targetId = 0; p.moving = false; return; }
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
      const crit = Math.random() < 0.15 + g.mods.sum('crit', p);
      const hit = ri(cls.basic[0], cls.basic[1]);
      this.damage(p, t, crit ? Math.round(hit * 1.8) : hit, crit);
    }
  }
}
