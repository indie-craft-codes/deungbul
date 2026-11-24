// 필드 보스 (서버 없이 게임 규칙만 돌린다)
import { ZONE_SPLIT } from '@game/shared/world';
import { MONSTERS } from '../shared/defs';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  const H = MONSTERS.ash_troll.hp; // 수치를 바꿔도 검사를 고치지 않게 정의에서 읽는다
  const g = new Game();
  const troll = [...g.ents.values()].find((e) => e.type === 'ash_troll')!;
  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); };
  // 보스는 채널마다 따로라서 소식은 그 채널(층)의 사람에게만 간다: 서버 전체 알림이 아니라 싸운 사람이 받은 안내문을 본다
  const told = (p: { id: number }) => g.notices.filter((n) => n.id === p.id).map((n) => `${n.k}:${n.a.join(',')}`);
  const fighter = (name: string, dx: number) => { const p = g.players.spawn(name, false); p.x = troll.x + dx; p.z = troll.z; p.maxHp = p.hp = 5000; return p; };
  check(!!troll && troll.x > ZONE_SPLIT && troll.maxHp === H, '잿빛 트롤이 잿빛 숲에 기본 체력으로 있다');
  troll.wait = 999; // 시험 동안 어슬렁거리지 않게
  run(0.5); // 서버가 평소처럼 돌고 있던 상태에서 시작한다

  const p1 = fighter('하나', 3), p2 = fighter('둘', -3), far = fighter('멀리', 12);
  g.combat.damage(p1, troll, 100, false);
  run(0.1);
  check(troll.maxHp === H && troll.hp === H - 100, '혼자 맞서면 기본 체력 그대로다');
  g.events = [];
  g.combat.damage(p2, troll, 100, false);
  run(0.1);
  check(troll.maxHp === H * 1.6 && troll.hp === H - 100 - 100 + H * 0.6 && g.events.some((e) => e[0] === 'mh' && e[1] === troll.id && e[2] === H * 1.6), `둘이 맞서면 체력이 60% 늘고, 늘어난 만큼 채워진다 (${troll.hp}/${troll.maxHp})`);

  // 내려치기: 예고가 먼저 나오고, 예고가 끝났을 때 범위 안에 있는 사람만 맞는다
  g.events = [];
  const hp1 = p1.hp, hp2 = p2.hp, hpFar = far.hp;
  let warned = -1, t = 0;
  while (t < 12 && warned < 0) { g.tick(0.05); t += 0.05; if (g.events.some((e) => e[0] === 's' && e[2] === 'slam')) warned = t; }
  check(warned > 5 && warned < 9, `싸움이 시작되고 8초쯤 뒤에 내려치기를 예고한다 (${warned.toFixed(1)}초)`);
  p2.x = troll.x - 9; // 예고를 보고 물러난다
  const slamOnly = () => g.events.filter((e) => e[0] === 'h' && e[1] === troll.id && e[4] === 1);
  g.events = [];
  run(1.4);
  const hit = slamOnly().map((e) => e[2]);
  check(hit.includes(p1.id) && !hit.includes(p2.id) && !hit.includes(far.id) && p1.hp < hp1 && far.hp === hpFar, '남아 있던 사람만 맞고, 물러난 사람과 멀리 있던 사람은 맞지 않는다');
  void hp2;

  // 쓰러뜨리면 함께 싸운 사람 모두가 보상을 받고, 한참 뒤에 기본 체력으로 다시 나타난다
  p2.x = troll.x - 3;
  const gold1 = p1.gold, gold2 = p2.gold;
  g.notices = [];
  g.combat.damage(p1, troll, 99999, false);
  check(troll.dead && p1.gold >= gold1 + 80 && p2.gold >= gold2 + 80 && told(p1).includes('bossDown:ash_troll,2') && told(far).includes('bossDown:ash_troll,2'), '쓰러뜨리면 함께 싸운 둘 모두가 보상을 받고, 그 채널의 모두에게 알린다');
  run(10);
  check(troll.dead, '보통 몬스터처럼 8초 만에 다시 나타나지 않는다');
  g.notices = [];
  run(295);
  check(!troll.dead && troll.maxHp === H && troll.hp === H && told(p1).includes('bossUp:ash_troll'), '5분 뒤에 기본 체력으로 다시 나타나고, 그 채널의 모두에게 알린다');

  // 멀리 끌고 가면 돌아가서 회복하고, 체력도 기본으로 돌아간다
  g.combat.damage(p1, troll, 100, false); g.combat.damage(p2, troll, 100, false);
  run(0.1);
  p1.x = troll.hx - 40; p2.x = troll.hx - 40; far.x = troll.hx - 40;
  run(12);
  check(troll.maxHp === H && troll.hp === H && troll.targetId === 0, '멀리 끌고 가면 돌아가서 회복하고 체력도 기본으로 돌아간다');
}
