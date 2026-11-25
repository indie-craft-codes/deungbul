// 기술 효과의 종류: 강화(buff), 돌진(dash), 지속 피해(dot), 기절(stun)과 느려짐(slow). (서버 없이 게임 규칙만 돌린다. 시험용 내용 위에서)
// 시험용 내용의 기술 가운데 직업에 들지 않은 것(rally, ward, focus, charge, bash, venom, quake)을 g.combat.cast로 낸다.
import { Game } from '../../server/game/game';
import type { Ent } from '../../server/game/entity';
import { check } from '../harness';

function bench() {
  const g = new Game();
  const run = (seconds: number) => { for (let i = 0, n = Math.round(seconds * 20); i < n; i++) g.tick(0.05); };
  const hero = (name: string, x: number, z: number): Ent => { const p = g.players.spawn(name, false); g.classes.apply(p, 'knight'); p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; return p; };
  /** 때려도 죽지 않고 움직이지 않는 과녁 */
  const dummy = (x: number, z: number): Ent => { const m = g.monsters.spawn('hound', x, z); m.hp = m.maxHp = 100000; m.wait = 999; m.def = { ...m.def!, aggro: 0 }; return m; };
  const hurt = (m: Ent, fn: () => void): number => { const before = m.hp; fn(); return before - m.hp; };
  const events = (k: string) => g.events.filter((e) => e[0] === k);
  return { g, run, hero, dummy, hurt, events };
}

// ---------- 강화: 주는 피해, 받는 피해, 치명타, 아군, 끝나는 시간 ----------
{
  const { g, run, hero, dummy, hurt, events } = bench();
  const p = hero('강화', 40, 40), near = hero('곁', 43, 40), far = hero('멀리', 70, 40), m = dummy(41.5, 40);
  const base = hurt(m, () => g.combat.cast(p, 'bash', m));
  g.events = [];
  g.combat.cast(p, 'rally');
  const up = hurt(m, () => g.combat.cast(p, 'bash', m));
  check(up >= Math.round(base * 1.5) - 1 && up <= Math.round(base * 1.5) + 1, `주는 피해 강화(+50%): ${base} → ${up}`);
  check(near.buffs.some((b) => b.skill === 'rally') && !far.buffs.some((b) => b.skill === 'rally'), '아군 강화는 반경(6) 안의 사람에게만 걸린다');
  check(events('buff').length === 2 && events('buff').every((e) => e[2] === 'rally' && e[3] === 6), `강화가 걸린 사람마다 'buff' 사건을 보낸다 (${events('buff').length}건)`);
  g.combat.cast(p, 'rally');
  check(p.buffs.filter((b) => b.skill === 'rally').length === 1, '같은 기술을 다시 쓰면 겹치지 않고 시간만 새로 흐른다');

  const d0 = hurt(p, () => g.combat.damage(m, p, 100, false));
  g.combat.cast(p, 'ward');
  const d1 = hurt(p, () => g.combat.damage(m, p, 100, false));
  check(d1 >= Math.round(d0 * 0.6) - 1 && d1 <= Math.round(d0 * 0.6) + 1, `받는 피해 강화(−40%): ${d0} → ${d1}`);
  p.hp = p.maxHp;

  const crit0 = g.mods.sum('crit', p);
  g.combat.cast(p, 'focus');
  check(g.mods.sum('crit', p) >= crit0 + 1 - 1e-9, '치명타 확률 강화는 더하는 값이다');
  run(6.2);
  check(p.buffs.length === 0 && g.mods.sum('crit', p) === crit0 && g.mods.product('damage', p) === g.mods.product('damage', near), '시간이 지나면 강화가 모두 풀린다 (보정도 처음으로)');
  const after = hurt(m, () => g.combat.cast(p, 'bash', m));
  check(after === base, `풀린 뒤의 피해는 처음과 같다 (${after})`);
}

// ---------- 돌진: 대상 앞까지 움직이고, 닿으면 피해와 기절 ----------
{
  const { g, run, hero, dummy, events } = bench();
  const p = hero('돌진', 30, 40), m = dummy(37, 40);
  m.wait = 0; m.def = { ...m.def!, aggro: 9 };
  const hp0 = m.hp;
  g.events = [];
  g.combat.cast(p, 'charge', m);
  const gap = Math.hypot(p.x - m.x, p.z - m.z);
  check(gap > 0.8 && gap <= 2.6 && p.x > 33, `대상 앞까지 단숨에 움직인다 (남은 거리 ${gap.toFixed(2)})`);
  check(m.hp === hp0 - 10 && m.stunUntil > g.clock && events('stun').length === 1, '닿은 대상에게 피해를 주고 기절시킨다');
  const at = { x: m.x, z: m.z }, cd = m.atkCd;
  run(1.5);
  check(m.x === at.x && m.z === at.z && m.atkCd === cd && p.hp === p.maxHp, '기절한 동안은 움직이지도 때리지도 않는다');
  const q = hero('빈돌진', 10, 10);
  q.face = 0; // +z 쪽을 본다
  g.combat.cast(q, 'charge');
  check(Math.abs(q.z - 18) < 0.01 && Math.abs(q.x - 10) < 0.01, `대상이 없으면 바라보는 쪽으로 정해진 거리(8)만큼 (${q.x.toFixed(1)}, ${q.z.toFixed(1)})`);
  const r = hero('벽돌진', 0, 0);
  r.face = Math.PI; // -z 쪽으로 멀리
  for (let i = 0; i < 30; i++) g.combat.cast(r, 'charge');
  check(Number.isFinite(r.x) && Number.isFinite(r.z) && Math.abs(r.z) < 500, `맵 끝에서 더 나가지 않는다 (${r.x.toFixed(1)}, ${r.z.toFixed(1)})`);
}

// ---------- 지속 피해: 1초마다, 정해진 시간만, 범위, 건 사람이 떠나면 그친다 ----------
{
  const { g, run, hero, dummy, hurt } = bench();
  const p = hero('독', 40, 40), m = dummy(45, 40), m2 = dummy(47, 41), far = dummy(60, 40);
  g.combat.cast(p, 'venom', m);
  check(m.dots.length === 1 && m.hitters.has(p.id), '지속 피해가 걸리고, 건 사람이 처치 보상을 나눌 사람에 든다');
  const tick1 = hurt(m, () => run(1.02));
  const total = tick1 + hurt(m, () => run(3.5));
  check(tick1 === 5 && total === 20 && m.dots.length === 0, `1초마다 5씩, 4초 동안 (첫 1초 ${tick1}, 모두 ${total})`);
  g.combat.cast(p, 'venom', m); run(0.5); g.combat.cast(p, 'venom', m);
  check(m.dots.length === 1, '같은 사람이 다시 걸면 겹치지 않는다');
  // 지속 피해를 맞은 몬스터는 건 사람을 쫓는다(위에서 자리를 옮겼다): 그 자리 곁과 먼 곳에 과녁을 다시 놓는다
  m2.x = m.x + 2; m2.z = m.z + 1; far.x = m.x + 15; far.z = m.z;
  g.combat.cast(p, 'quake', m);
  check(m2.dots.some((d) => d.skill === 'quake') && !far.dots.length, `범위 지속 피해는 대상 둘레(4) 안의 적 모두에게 (곁 ${m2.dots.length}, 먼 곳 ${far.dots.length}, 거리 ${Math.hypot(m.x - m2.x, m.z - m2.z).toFixed(1)}, ${Math.hypot(m.x - far.x, m.z - far.z).toFixed(1)})`);
  g.ents.delete(p.id);
  const after = hurt(m2, () => run(2));
  check(after === 0 && m2.dots.length === 0, '건 사람이 떠나면 그친다');
}

// ---------- 기절과 느려짐이 있는 단일 공격, 죽으면 효과가 지워진다 ----------
{
  const { g, run, hero, dummy } = bench();
  const p = hero('때림', 40, 40), m = dummy(42, 40);
  g.combat.cast(p, 'bash', m);
  check(m.stunUntil > g.clock && m.slowUntil > g.clock, '단일 공격에도 기절·느려짐을 붙일 수 있다');
  g.combat.cast(p, 'venom', m);
  m.hp = 3;
  run(1.1);
  check(m.dead && m.dots.length === 0 && m.stunUntil === 0 && m.slowUntil === 0, '죽으면 지속 피해·기절·느려짐이 지워진다');
}
