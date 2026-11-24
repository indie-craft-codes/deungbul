// 전투와 기술 (서버 없이 게임 규칙만 돌린다)
import { MONSTERS } from '../shared/defs';
import { TOWER } from '@game/shared/world';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  const g = new Game();
  const p = g.players.spawn('archer', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); };
  const slimes = () => [...g.ents.values()].filter((e) => e.type === 'slime' && !e.dead);
  // 직업을 바꿀 수 있는 자리는 게임의 규칙(g.rules.canChangeClass)이 답한다: 이 게임에서는 등탑 곁이고, 그 연결은 test/deungbul/combat.test.ts가 본다.
  // 여기서는 같은 뜻의 시험용 규칙(정해 둔 자리에서 6 안)을 넣어 직업 시스템이 그 답을 따르는지 본다
  g.rules.canChangeClass = (q) => Math.hypot(q.x - TOWER.x, q.z - TOWER.z) < 6;

  check(p.cls === '' && p.maxHp === 200, '처음에는 직업이 없고 전사와 같은 체력이다');
  p.x = 40; p.z = 40;
  cmd({ t: 'class', id: 'archer' });
  check(p.cls === 'archer' && p.maxHp === 170 && p.hp === 170 && g.gears.some((x) => x.id === p.id && x.cls === 'archer'), '처음 한 번은 어디서든 직업을 고를 수 있다 (궁수: 체력 170)');
  cmd({ t: 'class', id: 'warrior' });
  check(said().includes('classFar') && p.cls === 'archer', '그 뒤에는 등탑에서 멀면 바꿀 수 없다');
  cmd({ t: 'class', id: 'wizard' }); cmd({ t: 'class', id: 7 });
  check(p.cls === 'archer', '없는 직업은 무시된다');

  // 궁수는 멀리서 쏜다: 8만큼 떨어진 곳에서 공격하면 다가가지 않는다
  const target = slimes()[0];
  target.wait = 99; // 시험 동안 가만히 있게 한다
  p.x = target.x + 8; p.z = target.z;
  const stood = { x: p.x, z: p.z };
  cmd({ t: 'attack', id: target.id });
  run(1.2);
  check(target.hp < target.maxHp && p.x === stood.x && p.z === stood.z,`궁수는 사거리 안이면 제자리에서 쏜다 (슬라임 체력 ${target.hp}/${target.maxHp})`);
  p.x = target.x + 14;
  p.cds = [0, 0, 0];
  cmd({ t: 'skill', n: 0 });
  check(said().includes('tooFar') && p.cds[0] === 0, '조준 사격은 사거리(11) 밖에서 쓸 수 없다');

  // 화살비: 대상 주변의 여럿을 한꺼번에 맞힌다
  const pack = slimes().slice(0, 3);
  pack.forEach((m, i) => { m.hp = m.maxHp; m.x = -24 + i; m.z = 16; m.wait = 99; m.moving = false; });
  p.x = pack[0].x + 8; p.z = pack[0].z; p.targetId = pack[0].id; p.cds = [0, 0, 0];
  g.events = [];
  cmd({ t: 'skill', n: 1 });
  check(pack.every((m) => m.hp < m.maxHp) && g.events.some((e) => e[0] === 's' && e[2] === 'volley' && e[3] === pack[0].id) && p.cds[1] === 9, '화살비는 대상 주변의 여럿을 맞힌다');

  // 전사는 붙어야 한다: 같은 거리에서 공격하면 다가간다
  p.x = TOWER.x + 2; p.z = TOWER.z + 2; p.lv = 3;
  cmd({ t: 'class', id: 'warrior' });
  check(p.cls === 'warrior' && p.maxHp === 230 && said().includes('classChanged'), '등탑 가까이에서는 직업을 바꿀 수 있고 체력은 레벨을 따른다 (3레벨 전사: 230)');
  const t2 = slimes().find((m) => !pack.includes(m))!;
  t2.wait = 99; t2.hp = t2.maxHp;
  p.x = t2.x + 8; p.z = t2.z;
  cmd({ t: 'attack', id: t2.id });
  run(0.5);
  check(t2.hp === t2.maxHp && Math.hypot(p.x - t2.x, p.z - t2.z) < 7, '전사는 같은 거리에서 먼저 다가간다');

  // 마법사: 멀리서 쏘고, 느리게 하고, 곁의 사람을 살린다
  p.x = TOWER.x + 2; p.z = TOWER.z + 2; p.targetId = 0;
  cmd({ t: 'class', id: 'mage' });
  check(p.cls === 'mage' && p.maxHp === 180, '마법사는 체력이 가장 적다 (3레벨: 180)');
  const cold = slimes().slice(0, 2);
  cold.forEach((m, i) => { m.hp = m.maxHp; m.x = -24 + i; m.z = 16; m.wait = 99; m.moving = false; m.targetId = 0; });
  p.x = cold[0].x + 8; p.z = cold[0].z; p.targetId = cold[0].id; p.cds = [0, 0, 0]; p.atkCd = 99;
  cmd({ t: 'skill', n: 1 });
  check(cold.every((m) => m.hp < m.maxHp && m.slowUntil > g.clock) && p.cds[1] === 10, '서리는 대상 주변의 여럿을 맞히고 느리게 한다');
  const before = { x: cold[0].x, z: cold[0].z };
  run(1);
  const slowStep = Math.hypot(cold[0].x - before.x, cold[0].z - before.z);
  check(slowStep > 0.3 && slowStep < MONSTERS.slime.speed * 0.5 + 0.2, `느려진 몬스터는 절반 빠르기로 다가온다 (1초에 ${slowStep.toFixed(2)})`);
  const friend = g.players.spawn('friend', false), far = g.players.spawn('far', false);
  friend.x = p.x + 3; friend.z = p.z; friend.hp = 50; far.x = p.x + 20; far.z = p.z; far.hp = 50; p.hp = 100;
  g.events = [];
  cmd({ t: 'skill', n: 2 });
  check(p.hp === 145 && friend.hp === 95 && far.hp === 50 && g.events.filter((e) => e[0] === 'heal').length === 2, '치유의 빛은 나와 가까운 사람을 살리고, 먼 사람에게는 닿지 않는다');
  p.x = TOWER.x + 2; p.z = TOWER.z + 2; p.targetId = 0;
  cmd({ t: 'class', id: 'warrior' });

  const save = g.players.export(p);
  const again = g.players.spawn('archer', false, { ...save, cls: 'archer' });
  check(again.cls === 'archer' && again.maxHp === 200 && save.cls === 'warrior', '직업이 저장되고, 다시 들어오면 직업과 레벨에 맞는 체력이 된다 (3레벨 궁수: 200)');
}
