// 버섯 동굴의 시험: 이 게임의 내용으로 뜨는가, 세 가지 싸우는 법(ranged, flee, 등록한 lunge), 상점, 직업, 던전, 저장 왕복.
import { DUNGEONS, MONSTERS, SHOPS } from '../shared/content';
import { installCave, LUNGE } from '../server/cave';
import { type Ent, Game, MemoryStore, startServer } from '@engine/server';
import { maxHpFor } from '@engine/shared/defs';
import { check, connect } from '@engine/testing';

{
  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [installCave], now: () => clock });
  const p = g.players.spawn('glimmer', false);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.announces = []; g.command(p, m); };
  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); clock += seconds * 1000; };
  const at = (e: Ent, x: number, z: number) => { e.x = x; e.z = z; e.moving = false; e.path = null; e.targetId = 0; };
  const gap = (a: Ent, b: Ent) => Math.hypot(a.x - b.x, a.z - b.z);

  const types = new Set([...g.ents.values()].filter((e) => e.kind === 'm').map((e) => e.type));
  check(types.has('sporeling') && types.has('puffcap') && types.has('lurker'), `이 게임의 내용으로 떴다: ${[...types].join(', ')}`);
  check(g.monsters.hasBehavior('lunge') && g.monsters.hasBehavior('ranged') && g.monsters.hasBehavior('flee'), '싸우는 법 셋이 있다 (lunge는 플러그인이 등록)');

  // 직업
  cmd({ t: 'class', id: 'digger' });
  check(p.cls === 'digger' && p.maxHp === maxHpFor('digger', 1), '직업을 고르면 그 직업의 체력이 된다');

  // 쏘는 것: 떨어진 채로 때린다
  at(p, -35, 35); p.hp = p.maxHp = 5000;
  const puff = g.monsters.spawn('puffcap', -30, 35);
  puff.targetId = p.id;
  run(4);
  check(p.hp < 5000 && gap(p, puff) > 3, `뻥버섯은 떨어져서 쏜다 (거리 ${gap(p, puff).toFixed(1)}m, 받은 피해 ${5000 - p.hp})`);
  // 붙으면 물러선다
  at(p, puff.x + 1, puff.z);
  run(1.5);
  check(gap(p, puff) > 2.5, `붙으면 물러선다 (거리 ${gap(p, puff).toFixed(1)}m)`);
  g.remove(puff.id);

  // 달아나는 것
  at(p, -35, -35); p.hp = 5000;
  const sp = g.monsters.spawn('sporeling', -34, -35);
  sp.targetId = p.id; sp.hp = Math.floor(MONSTERS.sporeling.hp * 0.3);
  run(2);
  check(gap(p, sp) > 4, `체력이 낮은 포자돌이는 달아난다 (거리 ${gap(p, sp).toFixed(1)}m)`);
  g.remove(sp.id);

  // 등록한 싸우는 법: 거리를 두고 기를 모은 뒤 덤빈다
  at(p, 35, -35); p.hp = 5000;
  const lk = g.monsters.spawn('lurker', 35 + LUNGE.keep + 2, -35);
  lk.targetId = p.id;
  let minGap = 99, hits = 0, prev = p.hp;
  for (let i = 0; i < 100; i++) { g.tick(0.05); clock += 50; minGap = Math.min(minGap, gap(p, lk)); if (p.hp < prev) hits++; prev = p.hp; }
  check(hits > 0 && minGap <= LUNGE.leap + 0.2, `숨은갓은 덤벼서 때린다 (때린 횟수 ${hits}, 가장 가까운 거리 ${minGap.toFixed(1)}m)`);
  g.remove(lk.id);

  // 상점
  at(p, SHOPS[0].x + 1, SHOPS[0].z); p.gold = 100;
  cmd({ t: 'buy', id: 'broth' }); cmd({ t: 'buy', id: 'pick2' });
  check(p.items.broth === 1 && p.weapon === 'pick2' && p.gold === 100 - 12 - 60, '상인 곁에서 수프와 곡괭이를 산다');

  // 던전: 문 곁에서 들어간다
  at(p, DUNGEONS.deep.portal.x + 1, DUNGEONS.deep.portal.z);
  cmd({ t: 'dungeon', id: 'deep' });
  run(0.5);
  check(p.x > 150, `문 곁에서 깊은 굴에 들어간다 (자리 ${p.x.toFixed(0)}, ${p.z.toFixed(0)})`);
}

// 저장 왕복과 접속
{
  const store = new MemoryStore();
  let server = await startServer(0, { store, game: { plugins: [installCave] } });
  const a = await connect(server.port, '동굴손님', 'token-cave-test-000001');
  check(a.id > 0, '접속하면 캐릭터가 생긴다');
  const p = server.game.ents.get(a.id)!;
  server.game.wallet.add(p, 'gold', 50, 'test');
  p.unsaved = true;
  a.ws.close();
  await server.close();
  server = await startServer(0, { store, game: { plugins: [installCave] } });
  const b = await connect(server.port, '동굴손님', 'token-cave-test-000001');
  const q = server.game.ents.get(b.id)!;
  check(b.name === '동굴손님' && q.gold >= 50, `서버를 다시 켜도 캐릭터와 골드가 남는다 (${q.gold})`);
  b.ws.close();
  await server.close();
}
