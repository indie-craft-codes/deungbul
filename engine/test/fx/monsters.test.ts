// 몬스터: 집에서 멀리 끌려 나오면 돌아간다 (서버 없이 게임 규칙만 돌린다. 시험용 내용 위에서)
import { Game } from '../../server/game/game';
import { check } from '../harness';

{
  // 집에서 멀리 끌려 나온 몬스터: 옆에 사람이 있어도 집으로 돌아간 뒤에 다시 싸운다
  const g = new Game();
  const p = g.players.spawn('knight', false);
  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); };
  const m = [...g.ents.values()].find((e) => e.type === 'raider' && !e.dead)!;
  const far = 22;
  m.x = m.hx + far; m.z = m.hz; p.x = m.x + 1; p.z = m.z; m.targetId = p.id; p.hp = p.maxHp = 100000;
  run(1);
  check(m.homing && m.targetId === 0, '멀리 끌려 나온 약탈자(먼저 덤비는 몬스터)는 대상을 놓고 집으로 돌아간다');
  run(12);
  const home = Math.hypot(m.x - m.hx, m.z - m.hz);
  check(!m.homing && home < 8, `옆에 사람이 있어도 집 근처까지 걸어간다 (집까지 ${home.toFixed(1)})`);
  p.x = m.x + 1; p.z = m.z;
  g.command(p, { t: 'attack', id: m.id });
  run(3);
  check(m.hp < m.maxHp || m.dead, '집에 돌아온 뒤에는 다시 맞고 피해를 입는다');
}
