// 필드 보스: 맞서는 사람이 늘수록 체력이 늘고, 예고한 뒤에 주변을 내려친다.
// 보스도 몬스터의 하나라서 이동과 기본 공격은 monsters.ts가 맡고, 여기서는 보스만의 것을 더한다.
import { BOSS } from '../../../shared/defs';
import { dist, ri, type Ent } from '../entity';
import type { Game } from '../game';

export class Boss {
  constructor(private g: Game) {
    g.ticks.push((dt) => this.tick(dt));
    g.on('monsterKilled', (m, hitters) => {
      if (m.def?.boss) g.announce('bossDown', m.type, hitters.length);
    });
  }

  /** 맞선 사람 수에 맞춰 체력을 다시 잡는다. 한 명이면 기본 체력이고, 한 명 늘 때마다 일정 비율씩 는다. */
  private rescale(m: Ent, base: number): void {
    const n = Math.min(BOSS.maxScale, m.hitters.size);
    if (n === m.scale) return;
    const max = Math.round(base * (1 + BOSS.hpPerPlayer * Math.max(0, n - 1)));
    // 사람이 늘면 늘어난 만큼 체력도 채워 주고, 줄면 넘치는 만큼만 깎는다. 아무도 없으면 가득 채운다
    m.hp = n === 0 ? max : n > m.scale ? m.hp + (max - m.maxHp) : Math.min(m.hp, max);
    m.maxHp = max;
    m.scale = n;
    this.g.emit(['mh', m.id, max]);
  }

  tick(dt: number): void {
    const g = this.g;
    for (const m of g.ents.values()) {
      const def = m.def;
      if (!def?.boss) continue;
      if (m.dead) { m.maxHp = def.hp; m.scale = 0; m.windup = 0; continue; } // 다시 나타날 때는 기본 체력으로
      this.rescale(m, def.hp);

      if (!m.targetId) { m.cast = BOSS.slamEveryS; m.windup = 0; continue; } // 싸우지 않을 때는 내려치지 않는다
      if (m.windup > 0) {
        m.windup -= dt;
        if (m.windup > 0) continue;
        // 예고가 끝났다: 그때 범위 안에 남아 있는 사람만 맞는다
        for (const p of [...g.ents.values()]) {
          if (p.kind === 'p' && dist(p, m) <= BOSS.slamRadius) g.combat.damage(m, p, ri(BOSS.slamDmg[0], BOSS.slamDmg[1]), true);
        }
        m.cast = BOSS.slamEveryS;
      } else {
        m.cast -= dt;
        if (m.cast <= 0) { m.windup = BOSS.slamWarnS; m.moving = false; g.emit(['s', m.id, 'slam', 0]); }
      }
    }
  }
}
