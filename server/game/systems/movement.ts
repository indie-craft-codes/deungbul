// 이동: 목표를 향해 길을 찾아 걷고, 막히면 멈춘다. 플레이어의 이동/정지 명령을 받는다.
import { walk } from '../../../shared/nav';
import { clampPoint } from '../../../shared/world';
import type { Ent } from '../entity';
import type { Game } from '../game';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class Movement {
  constructor(private g: Game) {
    g.commands.set('move', (p, m) => {
      if (!num(m.x) || !num(m.z)) return;
      const to = clampPoint(m.x, m.z);
      this.goTo(p, to.x, to.z);
      p.path = null; // 새로 찍은 곳: 길을 처음부터 다시 세운다
      p.targetId = 0; // 직접 움직이면 공격을 그만둔다
    });
    g.commands.set('stop', (p) => { p.moving = false; p.targetId = 0; });
  }

  goTo(e: Ent, x: number, z: number): void { e.tx = x; e.tz = z; e.moving = true; e.stuck = 0; }

  /** 한 틱만큼 걷는다. 도착하거나 막히면 moving이 꺼진다. 길찾기는 shared/nav.ts가 한다 (클라이언트 예측과 같은 코드). */
  walk(e: Ent, speed: number, dt: number): void {
    walk(e, speed, dt, this.g.world.obstacles, this.g.nav, this.g.clock);
  }
}
