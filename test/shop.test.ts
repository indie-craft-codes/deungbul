// 상점, 갑옷 (서버 없이 게임 규칙만 돌린다). 등불 맡기기(휴식 보너스)와 주민의 귀환은 이 게임의 것이라 test/deungbul/shop.test.ts에 있다
import { SHOP } from '../shared/defs';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  let clock = 1_800_000_000_000;
  const g = new Game({ now: () => clock });
  const p = g.players.spawn('buyer', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  p.x = SHOP.x + 1; p.z = SHOP.z; p.gold = 100;
  // 물건의 잠금은 게임의 규칙(g.rules.unlocked)이 답한다: 이 게임에서는 '그 주민이 돌아왔는가'이고, 그 연결은 test/deungbul/shop.test.ts가 본다.
  // 여기서는 시험용 규칙을 넣어 상점이 그 답을 따르는지 본다 (열쇠는 내용 정의의 needs: 등불검은 bram, 진한 물약은 mira)
  const opened = new Set<string>();
  g.rules.unlocked = (key) => opened.has(key);

  cmd({ t: 'buy', id: 'sword3' });
  check(said().includes('notStocked') && p.gold === 100 && p.weapon === 'sword1', '브람이 돌아오기 전에는 등불검을 살 수 없다');
  cmd({ t: 'buy', id: 'sword2' });
  check(p.weapon === 'sword2' && p.gold === 40 && g.mods.product('damage', p) === 1.2 && g.gears.length === 1, '철검을 사면 골드가 줄고 피해가 20% 오른다');
  cmd({ t: 'buy', id: 'sword2' });
  check(said().includes('alreadyBest') && p.gold === 40, '같은 무기를 또 살 수 없다');
  cmd({ t: 'buy', id: 'potion' }); cmd({ t: 'buy', id: 'potion' });
  check(p.items.potion === 2 && p.gold === 10, '물약을 사면 소지품에 쌓인다');
  cmd({ t: 'buy', id: 'potion' });
  check(said().includes('noGold') && p.items.potion === 2, '골드가 모자라면 살 수 없다');
  p.hp = 100;
  cmd({ t: 'use', id: 'potion' });
  check(p.hp === 180 && p.items.potion === 1 && p.itemCd > 0, '물약을 마시면 체력이 80 회복된다');
  p.hp = 100;
  cmd({ t: 'use', id: 'potion' });
  check(p.hp === 100 && p.items.potion === 1, '물약은 연달아 마실 수 없다');
  cmd({ t: 'buy', id: '__proto__' }); cmd({ t: 'buy', id: 5 }); cmd({ t: 'use', id: 'sword2' }); cmd({ t: 'buy', id: 'sword1' });
  check(p.gold === 10 && p.weapon === 'sword2' && p.items.potion === 1, '잘못된 구매와 사용 요청은 무시된다');
  p.x = 30; p.gold = 500;
  cmd({ t: 'buy', id: 'potion' });
  check(said().includes('shopFar') && p.gold === 500, '길 상인에게서 멀면 살 수 없다');
  p.x = SHOP.x + 1;
  opened.add('bram'); opened.add('mira');
  cmd({ t: 'buy', id: 'sword3' }); cmd({ t: 'buy', id: 'tonic' });
  check(p.weapon === 'sword3' && p.items.tonic === 1 && g.mods.product('damage', p) === 1.45, '주민이 돌아오면 등불검과 진한 물약을 살 수 있다');

  // 저장했다가 3시간 뒤에 다시 들어온다
  const save = g.players.export(p);
  g.players.leave(p.id);
  clock += 3 * 3600000;
  g.notices = [];
  const back = g.players.spawn('buyer', false, save);
  check(back.weapon === 'sword3' && back.gold === p.gold && back.items.potion === 1 && back.items.tonic === 1, '무기, 골드, 물약이 저장되고 다시 들어오면 그대로다');
}
