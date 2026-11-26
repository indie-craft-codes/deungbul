// 봇: 시험과 부하 확인용 가짜 플레이어. 돌아다니다 몬스터를 만나면 싸운다.
import { MAP } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

/** 봇이 돌아다니는 범위: 들판(맵 정의의 0번 지역)의 가장자리에서 이만큼 안쪽 */
const PAD_X = 12, PAD_Z = 18;

export class Bots {
  constructor(private g: Game) {}

  think(p: Ent, dt: number): void {
    const g = this.g;
    if (p.moving || (g.has('combat') && p.targetId)) return;
    p.wait -= dt;
    if (p.wait > 0) return;
    p.wait = 1 + Math.random() * 4;
    let near: Ent | null = null, nd = 45;
    for (const m of g.ents.values()) {
      if (m.kind !== 'm' || m.dead || m.layer !== p.layer) continue;
      const d = dist(p, m);
      if (d < nd) { nd = d; near = m; }
    }
    if (near && nd < 8) { p.targetId = near.id; return; } // 가까우면 싸운다 (몬스터는 전투 모듈이 놓는다: 몬스터가 있으면 전투의 칸도 있다)
    if (near && Math.random() < 0.35) { g.movement.goTo(p, near.x, near.z); return; } // 가끔은 찾아간다
    const a = MAP.areas[0];
    g.movement.goTo(p, a.x0 + PAD_X + Math.random() * (a.x1 - a.x0 - PAD_X * 2), (a.z0 + a.z1) / 2 + (Math.random() - 0.5) * (a.z1 - a.z0 - PAD_Z * 2));
  }
}
