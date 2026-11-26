// 이동: 목표를 향해 길을 찾아 걷고, 막히면 멈춘다. 플레이어의 이동/정지 명령을 받는다.
import { walk } from '../../../shared/nav';
import { AREAS, EDGE, areaAt, clampPoint } from '../../../shared/world';
import type { Ent } from '../entity';
import type { Game } from '../game';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 길을 처음부터 다시 세우는 일 사이의 가장 짧은 간격(초) */
const MOVE_GAP_S = 0.06;

export class Movement {
  constructor(private g: Game) {
    g.commands.set('move', (p, m) => {
      if (!num(m.x) || !num(m.z)) return;
      // 너무 잦은 명령이어도 버리지 않는다(빠르게 두 번 누르면 마지막 것이 목적지여야 한다).
      // 대신 길을 처음부터 다시 세우는 일만 간격을 둔다: 그 사이의 것은 목적지만 바뀌고, 걷는 쪽이 조금 뒤에 알아서 길을 다시 잡는다
      const soon = g.clock - p.lastMove < MOVE_GAP_S;
      if (!soon) p.lastMove = g.clock;
      const to = clampPoint(m.x, m.z);
      // 걸어서 갈 수 없는 다른 지역(던전 ↔ 들판)을 찍었으면 지금 있는 지역의 가장자리로 맞춘다.
      // 그대로 두면 길이 없는 곳을 향해 길찾기가 끝까지 헤매고, 그것을 되풀이시키면 서버가 멈춘다
      const here = AREAS[areaAt(p.x, p.z)];
      if (here && areaAt(to.x, to.z) !== areaAt(p.x, p.z)) {
        to.x = Math.min(here.x1 - EDGE, Math.max(here.x0 + EDGE, to.x));
        to.z = Math.min(here.z1 - EDGE, Math.max(here.z0 + EDGE, to.z));
      }
      const same = Math.hypot(to.x - p.tx, to.z - p.tz) < 0.3 && p.moving;
      this.goTo(p, to.x, to.z);
      if (!same && !soon) p.path = null; // 새로 찍은 곳: 길을 처음부터 다시 세운다
      if (g.has('combat')) p.targetId = 0; // 직접 움직이면 공격을 그만둔다
    });
    g.commands.set('stop', (p) => { p.moving = false; if (g.has('combat')) p.targetId = 0; });
  }

  /** 전투 모듈이 없는 게임의 사람 틱: 목표가 있으면 걷기만 한다 (전투가 있으면 전투의 tickPlayer가 추격과 함께 걷는다) */
  step(e: Ent, dt: number): void { if (e.moving) this.walk(e, this.g.rules.speed(e), dt); }

  goTo(e: Ent, x: number, z: number): void { e.tx = x; e.tz = z; e.moving = true; e.stuck = 0; }

  /** 한 틱만큼 걷는다. 도착하거나 막히면 moving이 꺼진다. 길찾기는 engine/shared/nav.ts가 한다 (클라이언트 예측과 같은 코드). */
  walk(e: Ent, speed: number, dt: number): void {
    walk(e, speed, dt, this.g.world.obstacles, this.g.nav, this.g.clock);
  }
}
