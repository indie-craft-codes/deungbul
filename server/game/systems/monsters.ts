// 몬스터: 빈터에 사는 것들의 생성과 AI. 습격으로 온 적도 여기서 움직인다.
import { CAMPS, LEASH, MONSTERS, MONSTER_ATTACK_CD, MONSTER_ATTACK_RANGE, type MonsterId, SLOW_FACTOR } from '../../../shared/defs';
import { dist, ri, type Ent } from '../entity';
import type { Game } from '../game';
import { fieldLayer, notifyLayer } from '../layers';

/** 습격 적이 등탑에 이만큼 다가오면 등탑을 공격한다 */
export const TOWER_ATTACK_RANGE = 3.2;

export class Monsters {
  /**
   * 그 층의 몬스터를 쉬게 할 것인가. 기본은 '쉬지 않는다'이고, 채널 시스템이 사람 없는 채널을 쉬게 한다
   * (채널 수만큼 몬스터가 늘어도 틱 비용은 사람이 있는 채널만큼만 들게).
   */
  asleep: (layer: number) => boolean = () => false;

  constructor(private g: Game) {
    this.populate(fieldLayer(1)); // 나머지 채널은 채널 시스템이 놓는다
    // 습격 적은 죽으면 다시 나오지 않는다
    g.on('monsterKilled', (m) => { if (m.raid) g.remove(m.id); });
  }

  /** 들판의 한 층(채널)에 빈터의 몬스터를 놓는다. 층마다 따로 살고 따로 되살아난다 */
  populate(layer: number): void {
    for (const camp of CAMPS) {
      camp.types.forEach((type, i) => {
        const a = (i / camp.types.length) * Math.PI * 2 + 0.4, r = 2.5 + (i % 3) * 2;
        this.spawn(type, camp.x + Math.cos(a) * r, camp.z + Math.sin(a) * r).layer = layer;
      });
    }
  }

  spawn(type: MonsterId, x: number, z: number, raid = false): Ent {
    const def = MONSTERS[type];
    const m = this.g.create('m', type, '', x, z, def.hp);
    m.def = def; m.raid = raid; m.wait = Math.random() * 4;
    return m;
  }

  /** 습격 적이 등탑에 붙어 있는가 */
  atTower(m: Ent): boolean {
    const at = this.g.rules.siege;
    return !!at && m.raid && !m.dead && !m.targetId && dist(m, at) <= TOWER_ATTACK_RANGE;
  }

  /**
   * 쉬는 동안의 몬스터. 싸우다 만 흔적(대상, 깎인 체력, 때린 사람)을 지우고 집에 돌려놓는다:
   * 사람이 다시 왔을 때 지난 싸움이 이어져 있으면 안 된다. 습격 적은 그 자리에 멈춰만 있는다 (없어지면 습격을 피하는 수가 된다).
   */
  private rest(m: Ent): void {
    if (m.raid || (!m.targetId && !m.homing && !m.moving && m.hp >= m.maxHp && m.hitters.size === 0)) return;
    m.targetId = 0; m.homing = false; m.moving = false; m.path = null; m.hp = m.maxHp; m.hitters.clear();
    m.x = m.hx; m.z = m.hz; m.tx = m.x; m.tz = m.z;
  }

  tick(m: Ent, dt: number): void {
    const g = this.g, def = m.def!;
    if (m.dead) {
      m.respawn -= dt;
      if (m.respawn <= 0) { m.dead = false; m.hp = m.maxHp; m.x = m.hx; m.z = m.hz; m.moving = false; m.path = null; m.wait = 1; m.homing = false; if (def.boss) notifyLayer(g, m.layer, 'bossUp', m.type); } // 보스는 채널마다 따로라서 그 채널에만 알린다
      return;
    }
    // 보는 사람이 없는 층: 되살아나는 시간만 흐르고(위) 나머지는 건너뛴다
    if (this.asleep(m.layer)) { this.rest(m); return; }
    if (m.atkCd > 0) m.atkCd -= dt;
    if (m.windup > 0) return; // 보스가 내려치려고 힘을 모으는 중: 그 자리에 선다

    const speed = g.clock < m.slowUntil ? def.speed * SLOW_FACTOR : def.speed; // 느려지는 기술에 맞았다

    // 집으로 돌아가는 중: 도착할 때까지 아무도 쫓지 않는다 (돌아서자마자 다시 대상을 잡아 제자리에 얼어붙지 않게)
    if (m.homing) {
      m.targetId = 0; m.hp = m.maxHp; m.hitters.clear();
      g.movement.walk(m, def.speed * 1.5, dt);
      if (!m.moving || Math.hypot(m.x - m.hx, m.z - m.hz) < 2) m.homing = false;
      return;
    }

    if (!m.targetId && def.aggro > 0 && !m.raid) {
      for (const p of g.ents.values()) {
        if (p.kind === 'p' && p.layer === m.layer && dist(p, m) < def.aggro) { m.targetId = p.id; break; }
      }
    }
    if (m.targetId) {
      const t = g.ents.get(m.targetId);
      const lost = !t || t.layer !== m.layer || dist(m, t) > 26 || (!m.raid && Math.hypot(m.x - m.hx, m.z - m.hz) > LEASH);
      if (lost) {
        m.targetId = 0;
        if (!m.raid) { m.hp = m.maxHp; m.hitters.clear(); g.movement.goTo(m, m.hx, m.hz); m.homing = Math.hypot(m.x - m.hx, m.z - m.hz) > 2; } // 집으로 돌아가며 회복한다
        return;
      }
      if (dist(m, t) > MONSTER_ATTACK_RANGE) {
        g.movement.goTo(m, t.x, t.z);
        g.movement.walk(m, speed, dt);
      } else {
        m.moving = false;
        m.face = Math.atan2(t.x - m.x, t.z - m.z);
        if (m.atkCd <= 0) { m.atkCd = MONSTER_ATTACK_CD; g.combat.damage(m, t, ri(def.dmg[0], def.dmg[1]), false); }
      }
      return;
    }

    const siege = g.rules.siege;
    if (m.raid && siege) {
      // 습격 적: 맞서는 사람이 없으면 지켜야 할 곳(등탑)으로 간다. 그곳을 치는 것은 습격 시스템이 센다
      if (dist(m, siege) > TOWER_ATTACK_RANGE) { g.movement.goTo(m, siege.x, siege.z); g.movement.walk(m, speed, dt); }
      else { m.moving = false; m.face = Math.atan2(siege.x - m.x, siege.z - m.z); }
      return;
    }

    // 평소: 집 근처를 어슬렁거린다
    if (m.moving) { g.movement.walk(m, 1.3, dt); return; }
    m.wait -= dt;
    if (m.wait <= 0) {
      m.wait = 2 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3.5;
      g.movement.goTo(m, m.hx + Math.cos(a) * r, m.hz + Math.sin(a) * r);
    }
  }
}
