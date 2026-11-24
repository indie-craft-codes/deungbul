// 이동: 장애물을 돌아서 도착한다 (서버 없이 게임 규칙만 돌린다. 시험용 내용 위에서)
import { SPOTS } from '@game/shared/content';
import { Game } from '../../server/game/game';
import { check } from '../harness';

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
  const post = walk(SPOTS.post.x - 11, SPOTS.post.z, SPOTS.post.x + 11, SPOTS.post.z, 8); // 기둥을 정면으로 지나는 길
  check(post.left < 0.2, `기둥에 정면으로 막혀도 돌아서 도착한다 (남은 거리 ${post.left.toFixed(2)})`);
  const camp = walk(-24, 20, SPOTS.stone.x, SPOTS.stone.z + 3, 10); // 무리가 사는 곳에서 가운데 돌 앞까지
  check(camp.left < 0.2, `무리가 사는 곳에서 가운데 돌까지 한 번에 간다 (남은 거리 ${camp.left.toFixed(2)})`);
  const pool = walk(2, 2, SPOTS.pool.x, SPOTS.pool.z, 12); // 웅덩이 한가운데는 갈 수 없는 곳
  check(!pool.moving && pool.left > SPOTS.pool.r, '갈 수 없는 곳을 찍으면 가장자리에서 멈춘다');
}
