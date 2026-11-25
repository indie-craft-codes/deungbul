// 몬스터: 빈터에 사는 것들의 생성과 AI. 습격으로 온 적도 여기서 움직인다.
import { CAMPS, LEASH, MONSTERS, MONSTER_AI, MONSTER_ATTACK_CD, MONSTER_ATTACK_RANGE, MONSTER_RANGED, type MonsterId, SLOW_FACTOR } from '../../../shared/defs';
import { dist, ri, type Ent } from '../entity';
import type { Game } from '../game';
import { fieldLayer, isField, notifyLayer } from '../layers';

/** 습격 적이 등탑에 이만큼 다가오면 등탑을 공격한다 */
/** 몰려온 적이 목표(g.rules.siege)에 이만큼 다가가면 도착한 것이다 (게임의 규칙이 그때 목표에 피해를 센다) */
export const SIEGE_REACH = 3.2;

/**
 * 몬스터가 대상과 싸우는 법 (MonsterDef.behavior의 이름으로 등록한다). 대상이 있고 놓치지 않았을 때 틱마다 불린다.
 * true를 돌려주면 그 틱은 이 행동이 맡은 것이고, false면 틀의 기본(쫓아가 붙어서 때린다)이 이어서 돈다.
 * 때릴 때는 m.strike(t)를 쓴다 (쿨다운을 지키고 피해를 낸다). 걷기는 a.walkTo(x, z) (느려짐이 반영된 빠르기로)
 */
export type MonsterBehavior = (a: MonsterAct) => boolean;
export interface MonsterAct {
  g: Game; m: Ent; t: Ent;
  /** m과 t 사이의 거리 */
  d: number;
  dt: number;
  /** 쿨다운이 끝났으면 대상을 때린다 (MONSTER_ATTACK_CD). 때렸으면 true */
  strike: () => boolean;
  /** 그 자리로 한 틱만큼 걷는다 */
  walkTo: (x: number, z: number) => void;
}

/** 틀이 가진 싸우는 법 */
const BUILTIN: Record<string, MonsterBehavior> = {
  // 떨어져서 쏜다: 사거리 안이면 서서 쏘고, 사거리의 절반보다 붙으면 한 걸음 물러선다 (집에서 너무 멀어지면 물러서지 않는다)
  ranged: (a) => {
    const range = a.m.def?.range ?? MONSTER_RANGED;
    if (a.d > range) return false; // 멀면 기본대로 다가간다
    if (a.d < range * 0.5 && Math.hypot(a.m.x - a.m.hx, a.m.z - a.m.hz) < LEASH * 0.6) {
      const k = 2 / Math.max(0.1, a.d);
      a.walkTo(a.m.x + (a.m.x - a.t.x) * k, a.m.z + (a.m.z - a.t.z) * k);
      return true;
    }
    a.m.moving = false;
    a.m.face = Math.atan2(a.t.x - a.m.x, a.t.z - a.m.z);
    a.strike();
    return true;
  },
  // 체력이 낮으면 달아난다: 대상의 반대쪽으로. 놓치면(loseRange) 틀이 집으로 돌려보내며 회복시킨다
  flee: (a) => {
    if (a.m.hp > a.m.maxHp * (a.m.def?.fleeAt ?? 0.3)) return false;
    const k = 4 / Math.max(0.1, a.d);
    a.walkTo(a.m.x + (a.m.x - a.t.x) * k, a.m.z + (a.m.z - a.t.z) * k);
    return true;
  },
};

export class Monsters {
  private behaviors = new Map<string, MonsterBehavior>(Object.entries(BUILTIN));
  /** 싸우는 법을 등록한다 (게임의 플러그인에서). 이름은 MonsterDef.behavior에 적는다. 틀의 이름(ranged, flee)을 덮어쓸 수도 있다 */
  addBehavior(name: string, fn: MonsterBehavior): void { this.behaviors.set(name, fn); }
  /** 그 이름의 싸우는 법이 있는가 (등록하지 않은 이름을 적은 몬스터는 기본대로 싸운다) */
  hasBehavior(name: string): boolean { return this.behaviors.has(name); }

  /**
   * 그 층의 몬스터를 쉬게 할 것인가. 기본은 '쉬지 않는다'이고, 채널 시스템이 사람 없는 채널을 쉬게 한다
   * (채널 수만큼 몬스터가 늘어도 틱 비용은 사람이 있는 채널만큼만 들게).
   */
  asleep: (layer: number) => boolean = () => false;

  constructor(private g: Game) {
    this.populate(fieldLayer(1)); // 나머지 채널은 채널 시스템이 놓는다
    // 습격 적은 죽으면 다시 나오지 않는다
    g.on('monsterKilled', (m) => { if (m.swarm) g.remove(m.id); });
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

  spawn(type: MonsterId, x: number, z: number, swarm = false): Ent {
    const def = MONSTERS[type];
    const m = this.g.create('m', type, '', x, z, def.hp);
    m.def = def; m.swarm = swarm; m.wait = Math.random() * 4;
    return m;
  }

  /** 습격 적이 등탑에 붙어 있는가 */
  atSiege(m: Ent): boolean {
    const at = this.g.rules.siege;
    return !!at && m.swarm && !m.dead && !m.targetId && dist(m, at) <= SIEGE_REACH;
  }

  /**
   * 쉬는 동안의 몬스터. 싸우다 만 흔적(대상, 깎인 체력, 때린 사람)을 지우고 집에 돌려놓는다:
   * 사람이 다시 왔을 때 지난 싸움이 이어져 있으면 안 된다. 습격 적은 그 자리에 멈춰만 있는다 (없어지면 습격을 피하는 수가 된다).
   */
  private rest(m: Ent): void {
    if (m.swarm || (!m.targetId && !m.homing && !m.moving && m.hp >= m.maxHp && m.hitters.size === 0)) return;
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
    if (g.clock < m.stunUntil) { m.moving = false; return; } // 기절: 움직이지도 때리지도 못한다

    const speed = g.clock < m.slowUntil ? def.speed * SLOW_FACTOR : def.speed; // 느려지는 기술에 맞았다

    // 집으로 돌아가는 중: 도착할 때까지 아무도 쫓지 않는다 (돌아서자마자 다시 대상을 잡아 제자리에 얼어붙지 않게)
    if (m.homing) {
      m.targetId = 0; m.hp = m.maxHp; m.hitters.clear();
      g.movement.walk(m, def.speed * MONSTER_AI.homeSpeed, dt);
      if (!m.moving || Math.hypot(m.x - m.hx, m.z - m.hz) < 2) m.homing = false;
      return;
    }

    if (!m.targetId && def.aggro > 0 && !m.swarm) {
      for (const p of g.ents.values()) {
        if (p.kind === 'p' && p.layer === m.layer && dist(p, m) < def.aggro) { m.targetId = p.id; break; }
      }
    }
    if (m.targetId) {
      const t = g.ents.get(m.targetId);
      const lost = !t || t.layer !== m.layer || dist(m, t) > MONSTER_AI.loseRange || (!m.swarm && Math.hypot(m.x - m.hx, m.z - m.hz) > LEASH);
      if (lost) {
        m.targetId = 0;
        // 들판의 몬스터는 집으로 돌아가며 회복한다. 던전 안의 몬스터는 체력을 그대로 둔다: 쉬어 가는 자동 사냥이 물러설 때마다 우두머리가 다 회복해 끝내 깨지 못하던 것 (검토 6)
        if (!m.swarm) { if (isField(m.layer)) { m.hp = m.maxHp; m.hitters.clear(); } g.movement.goTo(m, m.hx, m.hz); m.homing = Math.hypot(m.x - m.hx, m.z - m.hz) > 2; }
        return;
      }
      const strike = (): boolean => { if (m.atkCd > 0) return false; m.atkCd = MONSTER_ATTACK_CD; g.combat.damage(m, t, ri(def.dmg[0], def.dmg[1]), false); return true; };
      const fn = def.behavior ? this.behaviors.get(def.behavior) : undefined;
      if (fn && fn({ g, m, t, d: dist(m, t), dt, strike, walkTo: (x, z) => { g.movement.goTo(m, x, z); g.movement.walk(m, speed, dt); } })) return;
      if (dist(m, t) > MONSTER_ATTACK_RANGE) {
        g.movement.goTo(m, t.x, t.z);
        g.movement.walk(m, speed, dt);
      } else {
        m.moving = false;
        m.face = Math.atan2(t.x - m.x, t.z - m.z);
        strike();
      }
      return;
    }

    const siege = g.rules.siege;
    if (m.swarm && siege) {
      // 습격 적: 맞서는 사람이 없으면 지켜야 할 곳(등탑)으로 간다. 그곳을 치는 것은 습격 시스템이 센다
      if (dist(m, siege) > SIEGE_REACH) { g.movement.goTo(m, siege.x, siege.z); g.movement.walk(m, speed, dt); }
      else { m.moving = false; m.face = Math.atan2(siege.x - m.x, siege.z - m.z); }
      return;
    }

    // 평소: 집 근처를 어슬렁거린다
    if (m.moving) { g.movement.walk(m, MONSTER_AI.wanderSpeed, dt); return; }
    m.wait -= dt;
    if (m.wait <= 0) {
      m.wait = 2 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 3.5;
      g.movement.goTo(m, m.hx + Math.cos(a) * r, m.hz + Math.sin(a) * r);
    }
  }
}
