// 상점 (서버 없이 게임 규칙만 돌린다. 시험용 내용 위에서). 등불 맡기기(휴식 보너스)와 주민의 귀환은 이 게임의 것이라 games/deungbul/test/shop.test.ts에 있다
import { SHOPS } from '../../shared/defs';
import { Game } from '../../server/game/game';
import { check } from '../harness';

{
  let clock = 1_800_000_000_000;
  const g = new Game({ now: () => clock });
  const SHOP = SHOPS[0];
  const p = g.players.spawn('buyer', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  p.x = SHOP.x + 1; p.z = SHOP.z; p.gold = 100;
  // 물건의 잠금은 게임의 규칙(g.rules.unlocked)이 답한다: 이 게임에서는 '그 주민이 돌아왔는가'이고, 그 연결은 games/deungbul/test/shop.test.ts가 본다.
  // 여기서는 시험용 규칙을 넣어 상점이 그 답을 따르는지 본다 (열쇠는 내용 정의의 needs: 3단계 칼은 smith, 진한 물약은 healer)
  const opened = new Set<string>();
  g.rules.unlocked = (key) => opened.has(key);

  cmd({ t: 'buy', id: 'blade3' });
  check(said().includes('notStocked') && p.gold === 100 && p.weapon === 'blade1', '열쇠가 열리기 전에는 잠긴 칼을 살 수 없다');
  cmd({ t: 'buy', id: 'blade2' });
  check(p.weapon === 'blade2' && p.gold === 40 && g.mods.product('damage', p) === 1.2 && g.gears.length === 1, '2단계 칼을 사면 골드가 줄고 피해가 20% 오른다');
  cmd({ t: 'buy', id: 'blade2' });
  check(said().includes('alreadyBest') && p.gold === 40, '같은 무기를 또 살 수 없다');
  cmd({ t: 'buy', id: 'draught' }); cmd({ t: 'buy', id: 'draught' });
  check(p.items.draught === 2 && p.gold === 10, '물약을 사면 소지품에 쌓인다');
  cmd({ t: 'buy', id: 'draught' });
  check(said().includes('noGold') && p.items.draught === 2, '골드가 모자라면 살 수 없다');
  p.hp = 100;
  cmd({ t: 'use', id: 'draught' });
  check(p.hp === 180 && p.items.draught === 1 && p.itemCd > 0, '물약을 마시면 체력이 80 회복된다');
  p.hp = 100;
  cmd({ t: 'use', id: 'draught' });
  check(p.hp === 100 && p.items.draught === 1, '물약은 연달아 마실 수 없다');
  cmd({ t: 'buy', id: '__proto__' }); cmd({ t: 'buy', id: 5 }); cmd({ t: 'use', id: 'blade2' }); cmd({ t: 'buy', id: 'blade1' });
  check(p.gold === 10 && p.weapon === 'blade2' && p.items.draught === 1, '잘못된 구매와 사용 요청은 무시된다');
  p.x = 30; p.gold = 500;
  cmd({ t: 'buy', id: 'draught' });
  check(said().includes('shopFar') && p.gold === 500, '상인에게서 멀면 살 수 없다');
  p.x = SHOP.x + 1;
  opened.add('smith'); opened.add('healer');
  cmd({ t: 'buy', id: 'blade3' }); cmd({ t: 'buy', id: 'brew' });
  check(p.weapon === 'blade3' && p.items.brew === 1 && g.mods.product('damage', p) === 1.45, '열쇠가 열리면 잠긴 칼과 진한 물약을 살 수 있다');

  // 저장했다가 3시간 뒤에 다시 들어온다
  const save = g.players.export(p);
  g.players.leave(p.id);
  clock += 3 * 3600000;
  g.notices = [];
  const back = g.players.spawn('buyer', false, save);
  check(back.weapon === 'blade3' && back.gold === p.gold && back.items.draught === 1 && back.items.brew === 1, '무기, 골드, 물약이 저장되고 다시 들어오면 그대로다');
}

// ---------- 장비 가방이 가득 차면 무기·갑옷을 사지 못한다 (값을 치르기 전에 막는다. 31 / 30이 되던 것) ----------
{
  const g = new Game();
  const SHOP = SHOPS[0];
  const p = g.players.spawn('가득', false);
  p.x = SHOP.x + 1; p.z = SHOP.z; p.gold = 10000;
  while (!g.bag.full(p)) g.bag.giveGear(p, g.gear.plain('blade1'), '');
  const n = p.gear.length, gold = p.gold;
  g.notices = [];
  g.command(p, { t: 'buy', id: 'blade2' });
  check(p.gear.length === n && p.gold === gold && g.notices.some((x) => x.id === p.id && x.k === 'gearBagFull'), `가방이 가득 차면(${n}칸) 무기를 사지 못하고 골드도 그대로다`);
  g.command(p, { t: 'buy', id: 'draught' });
  check(p.items.draught === 1, '물약은 장비 가방과 상관없이 산다');
}
