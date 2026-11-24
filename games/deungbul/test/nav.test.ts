// 길찾기 시험에서 가른 이 게임의 검사: 퀘스트의 목적지 (서버 없이 게임 규칙만 돌린다)
// 길찾기 자체의 검사는 틀의 시험 test/nav.test.ts에 있다.
import { QUESTS, SHOP_REACH, TOWER_REACH } from '../shared/defs';
import { check } from '@engine/test/harness';
import { newGame } from './game';

{
  const g = newGame();
  // 퀘스트 자동 이동: 마을에서 이동 명령 한 번으로 모든 퀘스트 목적지에 닿는다
  const reach = (at: { x: number; z: number }, within: number) => {
    const w = g.players.spawn('quester', false);
    g.command(w, { t: 'move', x: at.x, z: at.z });
    for (let i = 0; i < 20 * 50 && w.moving; i++) g.tick(0.05);
    const left = Math.hypot(w.x - at.x, w.z - at.z);
    g.players.leave(w.id);
    return left <= within;
  };
  const stops = QUESTS.flatMap((c) => c.steps.map((st) => ({ at: st.at, within: st.goal.kind === 'offer' || st.goal.kind === 'raid' ? TOWER_REACH : st.goal.kind === 'buy' ? SHOP_REACH : st.goal.kind === 'visit' ? st.goal.r : 9 })));
  check(stops.every((st) => reach(st.at, st.within)), `이동 명령 한 번으로 모든 퀘스트 목적지에 닿는다 (${stops.length}곳: 사냥터, 등탑, 상점, 대장간 터, 약초밭, 잿빛 숲 등탑, 트롤의 자리)`);
}
