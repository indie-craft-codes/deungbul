// 이동: 장애물을 돌아서 도착한다 (서버 없이 게임 규칙만 돌린다)
import { POND, TOWER } from '@game/shared/world';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  const g = new Game();
  const walk = (fx: number, fz: number, tx: number, tz: number, seconds: number) => {
    const p = g.players.spawn('walker', false);
    p.x = fx; p.z = fz;
    g.movement.goTo(p, tx, tz);
    for (let i = 0; i < seconds * 20 && p.moving; i++) g.tick(0.05);
    const out = { left: Math.hypot(p.x - tx, p.z - tz), moving: p.moving };
    g.players.leave(p.id);
    return out;
  };
  const house = walk(-20, 9, 2, 9, 8); // 집(-9, 9)을 정면으로 지나는 길
  check(house.left < 0.2, `집에 정면으로 막혀도 돌아서 도착한다 (남은 거리 ${house.left.toFixed(2)})`);
  const camp = walk(-24, 20, TOWER.x, TOWER.z + 3, 10); // 슬라임 들판에서 등탑 앞까지
  check(camp.left < 0.2, `슬라임 들판에서 등탑까지 한 번에 간다 (남은 거리 ${camp.left.toFixed(2)})`);
  const pond = walk(2, 2, POND.x, POND.z, 12); // 연못 한가운데는 갈 수 없는 곳
  check(!pond.moving && pond.left > POND.r, '갈 수 없는 곳을 찍으면 가장자리에서 멈춘다');
}
