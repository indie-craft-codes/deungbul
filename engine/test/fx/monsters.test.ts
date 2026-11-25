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

// ---------- 싸우는 법(MonsterDef.behavior): 틀의 ranged·flee와 게임이 등록한 것 ----------
{
  const g = new Game();
  const run = (seconds: number) => { for (let i = 0, n = Math.round(seconds * 20); i < n; i++) g.tick(0.05); };
  const at = (name: string, x: number, z: number) => { const p = g.players.spawn(name, false); p.x = p.tx = x; p.z = p.tz = z; p.moving = false; p.hp = p.maxHp = 1e6; return p; };
  const gap = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

  // ranged: 사거리(7) 안에서 서서 쏜다. 붙으면 물러선다
  const p = at('과녁', 40, 40);
  const s = g.monsters.spawn('slinger', 45, 40);
  s.targetId = p.id;
  const hp0 = p.hp;
  run(3);
  check(p.hp < hp0 && gap(s, p) > 3, `떨어져서 쏘는 몬스터는 다가오지 않고 그 자리에서 때린다 (거리 ${gap(s, p).toFixed(1)}m)`);
  s.x = 41; s.z = 40;
  run(1);
  check(gap(s, p) > 2, `붙으면 한 걸음 물러선다 (거리 ${gap(s, p).toFixed(1)}m)`);
  g.remove(s.id);

  // flee: 체력이 40% 아래면 달아난다
  const q = at('쫓는이', -40, 40);
  const k = g.monsters.spawn('skulk', -39, 40);
  k.targetId = q.id; k.hp = k.maxHp * 0.3;
  run(1.5);
  check(gap(k, q) > 4, `체력이 낮은 몬스터는 달아난다 (거리 ${gap(k, q).toFixed(1)}m)`);
  g.remove(k.id);

  // 게임이 등록한 것: 'shove'는 때리지 않고 대상을 밀어낸다. 등록하기 전에는 기본대로 싸운다
  const r = at('밀리는이', -40, -40);
  const b = g.monsters.spawn('bouncer', -39, -40);
  b.targetId = r.id;
  const hpR = r.hp;
  run(2);
  check(r.hp < hpR, '등록되지 않은 싸우는 법을 적은 몬스터는 기본대로 붙어서 때린다');
  let shoves = 0;
  g.monsters.addBehavior('shove', (a) => { if (a.d > 2) return false; a.t.x += 3; shoves++; return true; });
  const x0 = r.x, hp1 = r.hp;
  run(1);
  check(shoves > 0 && r.x > x0 && r.hp === hp1, `등록한 싸우는 법이 기본을 대신한다 (밀어낸 횟수 ${shoves}, 피해 없음)`);
  check(g.monsters.hasBehavior('ranged') && g.monsters.hasBehavior('flee') && g.monsters.hasBehavior('shove') && !g.monsters.hasBehavior('nope'), '틀의 싸우는 법 둘과 등록한 것이 있다');
}
