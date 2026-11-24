// 상점의 잠금과 등불 맡기기(휴식 보너스): 이 게임의 규칙이 깔려 있어야 하는 검사 (서버 없이 게임 규칙만 돌린다)
// 상점 자체의 검사(사기, 마시기, 저장)는 틀의 시험 test/shop.test.ts에 있다. 여기서는 같은 차례로 사고 마신 뒤 이 게임의 것만 본다:
// 주민이 돌아와야 풀리는 물건(등탑이 g.rules.unlocked를 채운다)과 휴식 보너스.
import { REST, SHOP, restGain } from '../../shared/defs';
import { check } from '../harness';
import { newGame } from './game';

{
  let clock = 1_800_000_000_000;
  const g = newGame({ now: () => clock });
  const p = g.players.spawn('buyer', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  p.x = SHOP.x + 1; p.z = SHOP.z; p.gold = 100;

  cmd({ t: 'buy', id: 'sword3' });
  check(said().includes('notStocked') && p.gold === 100 && p.weapon === 'sword1', '브람이 돌아오기 전에는 등불검을 살 수 없다');
  cmd({ t: 'buy', id: 'sword2' });
  cmd({ t: 'buy', id: 'sword2' });
  cmd({ t: 'buy', id: 'potion' }); cmd({ t: 'buy', id: 'potion' });
  cmd({ t: 'buy', id: 'potion' });
  p.hp = 100;
  cmd({ t: 'use', id: 'potion' });
  p.hp = 100;
  cmd({ t: 'use', id: 'potion' });
  cmd({ t: 'buy', id: '__proto__' }); cmd({ t: 'buy', id: 5 }); cmd({ t: 'use', id: 'sword2' }); cmd({ t: 'buy', id: 'sword1' });
  p.x = 30; p.gold = 500;
  cmd({ t: 'buy', id: 'potion' });
  p.x = SHOP.x + 1;
  g.tower.load({ glow: 40, residents: [30, 60, 0] });
  cmd({ t: 'buy', id: 'sword3' }); cmd({ t: 'buy', id: 'tonic' });
  check(p.weapon === 'sword3' && p.items.tonic === 1 && g.mods.product('damage', p) === 1.45, '주민이 돌아오면 등불검과 진한 물약을 살 수 있다');

  // 저장했다가 3시간 뒤에 다시 들어온다
  check(restGain(5 * 60000) === 0 && restGain(3600000) === 40 && restGain(100 * 3600000) === REST.cap, '휴식 보너스: 10분 미만은 0, 시간당 40, 한도 320');
  const save = g.players.export(p);
  g.players.leave(p.id);
  clock += 3 * 3600000;
  g.notices = [];
  const back = g.players.spawn('buyer', false, save);
  check(back.rested === 120 && g.notices.some((n) => n.id === back.id && n.k === 'rested'), `3시간 쉬고 오면 휴식 보너스 120이 쌓인다 (${back.rested})`);
  const slime = [...g.ents.values()].find((e) => e.type === 'slime')!;
  back.x = slime.x + 1; back.z = slime.z;
  g.notices = [];
  g.combat.damage(back, slime, 9999, false);
  const kill = g.notices.find((n) => n.id === back.id && n.k === 'kill');
  check(kill?.a[1] === 24 && back.rested === 108 && back.gold > p.gold, `휴식 보너스가 있으면 처치 경험치가 2배이고 골드도 받는다 (경험치 ${kill?.a[1]}, 남은 보너스 ${back.rested})`);
}
