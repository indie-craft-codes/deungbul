// 봇: 시험과 부하 확인용 가짜 플레이어. 돌아다니다 몬스터를 만나면 싸운다.
import { MAX_X, MIN_X } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

export class Bots {
  constructor(private g: Game) {}

  think(p: Ent, dt: number): void {
    const g = this.g;
    if (p.moving || p.targetId) return;
    p.wait -= dt;
    if (p.wait > 0) return;
    p.wait = 1 + Math.random() * 4;
    let near: Ent | null = null, nd = 45;
    for (const m of g.ents.values()) {
      if (m.kind !== 'm' || m.dead || m.layer !== p.layer) continue;
      const d = dist(p, m);
      if (d < nd) { nd = d; near = m; }
    }
    if (near && nd < 8) { p.targetId = near.id; return; } // 가까우면 싸운다
    if (near && Math.random() < 0.35) { g.movement.goTo(p, near.x, near.z); return; } // 가끔은 찾아간다
    g.movement.goTo(p, MIN_X + 12 + Math.random() * (MAX_X - MIN_X - 24), (Math.random() - 0.5) * 84);
  }
}
