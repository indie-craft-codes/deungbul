// 두 번째 구역 '잿빛 숲'과 두 번째 등탑 (서버 없이 게임 규칙만 돌린다)
import { RAID } from '../shared/defs';
import { TOWER, TOWERS, ZONE_SPLIT } from '../shared/world';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  const g = new Game();
  const p = g.players.spawn('숲지기', false);
  const ash = TOWERS[1];
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const told = () => g.announces.map((a) => `${a.k}:${a.a.join(',')}`);
  const mons = [...g.ents.values()].filter((e) => e.kind === 'm');
  const types = (zone: number) => [...new Set(mons.filter((m) => (m.x < ZONE_SPLIT ? 0 : 1) === zone).map((m) => m.type))].sort().join(',');
  check(types(1) === 'ash_troll,boar,goblin,lost_soldier' && !types(0).includes('boar'), `잿빛 숲에는 멧돼지, 고블린, 잊힌 병사와 잿빛 트롤이 산다 (등불 들판: ${types(0)})`);
  check(JSON.stringify(g.state().tower.glows) === '[40,0]', '두 번째 등탑은 꺼진 채로 시작한다');

  // 마을에서 잿빛 숲 등탑까지 걸어간다
  g.command(p, { t: 'move', x: ash.spawn.x, z: ash.spawn.z });
  let t = 0;
  while (p.moving && t < 40) { g.tick(0.05); t += 0.05; }
  check(Math.hypot(p.x - ash.spawn.x, p.z - ash.spawn.z) < 0.2 && t < 26 && said().includes('questStep') === false, `마을에서 잿빛 숲 등탑까지 이동 명령 한 번으로 간다 (${t.toFixed(0)}초)`);

  // 등탑이 꺼져 있으면 숲에서 쓰러져도 마을에서 일어난다
  const hurt = () => { const m = mons[0]; p.hp = 1; g.combat.damage(m, p, 99, false); };
  hurt();
  check(Math.hypot(p.x - TOWER.spawn.x, p.z - TOWER.spawn.z) < 1 && p.hp === p.maxHp && g.notices.some((n) => n.k === 'died' && n.a[0] === 'first'), '등탑이 꺼져 있으면 잿빛 숲에서 쓰러져도 첫불 마을에서 일어나고, 어디서 일어났는지 알린다');

  // 불씨를 바쳐 밝힌다
  p.x = ash.x + 2; p.z = ash.z + 2; p.sparks = 100;
  g.notices = []; g.announces = [];
  g.command(p, { t: 'offer', to: 'resident', n: 1 });
  check(said().includes('noResident') && p.sparks === 100, '주민 되돌리기는 첫불 마을 등탑에서만 된다');
  g.command(p, { t: 'offer', to: 'tower', n: 10 });
  check(JSON.stringify(g.state().tower.glows) === '[40,10]' && told().includes('towerLit:ash'), '두 번째 등탑에 불씨를 바치면 그 등탑만 밝아지고, 켜졌다고 알린다');
  g.announces = [];
  g.command(p, { t: 'offer', to: 'tower', n: 25 });
  check(g.tower.glows[1] === 35 && told().includes('stageChanged:1,ash') && g.tower.stageAt(ash.x) === 1 && g.tower.stageAt(0) === 1, '밝기 단계는 등탑마다 따로 오른다');
  p.x = ash.x + 20; p.z = 10;
  hurt();
  check(Math.hypot(p.x - ash.spawn.x, p.z - ash.spawn.z) < 1, '등탑이 켜지면 잿빛 숲에서 쓰러졌을 때 그 등탑에서 일어난다');
  p.x = 10; p.z = 20;
  hurt();
  check(Math.hypot(p.x - TOWER.spawn.x, p.z - TOWER.spawn.z) < 1, '등불 들판에서 쓰러지면 가까운 첫불 마을에서 일어난다');
  p.x = ash.x + 2; p.z = ash.z + 2;
  g.command(p, { t: 'class', id: 'archer' });
  g.notices = [];
  g.command(p, { t: 'class', id: 'warrior' });
  check(p.cls === 'warrior', '직업은 어느 등탑에서든 바꿀 수 있다');

  // 저장: 등탑별 밝기가 남고, 등탑이 하나뿐이던 때의 저장도 읽힌다
  const again = new Game();
  again.importWorld(g.exportWorld());
  check(JSON.stringify(again.state().tower.glows) === '[40,35]', '등탑별 밝기가 저장되고 다시 읽힌다');
  const old = new Game();
  old.importWorld({ tower: { glow: 77, residents: [30, 4, 0] } });
  check(JSON.stringify(old.state().tower.glows) === '[77,0]' && old.state().tower.glow === 77, '등탑이 하나뿐이던 때의 저장도 읽힌다');
  // 습격은 첫불 마을 등탑의 일이다. 마을에 사람이 없으면 열리지 않는다
  g.raid.start();
  check(g.raid.phase === 'idle', '등탑 근처에 사람이 없으면 습격이 열리지 않는다');
  const bot = g.players.spawn('Bot', true);
  bot.x = TOWER.x + 3; bot.z = TOWER.z + 3;
  g.raid.start();
  check(g.raid.phase === 'idle' && g.tower.glow === 40, '봇만 있을 때도 열리지 않고 밝기도 깎이지 않는다');
  p.x = TOWER.x + 3; p.z = TOWER.z + 3;
  g.raid.start();
  check(g.raid.phase === 'active' && g.raid.state().towerMaxHp === RAID.towerHpBase + 40 * 3 && g.raid.state().foes === RAID.base + RAID.perPlayer, '사람이 있으면 열리고, 적의 수는 봇을 빼고 센 사람 수를 따른다');
}
