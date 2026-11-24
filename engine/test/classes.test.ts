// 직업 (서버 없이 게임 규칙만 돌린다)
import { SHOP } from '@game/shared/defs';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  // 갑옷: 사면 바로 입고, 받는 피해가 줄고, 저장된다
  const g = new Game();
  const p = g.players.spawn('armored', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  // 물건의 잠금은 게임의 규칙이 답한다 (이 게임에서는 주민의 귀환: test/deungbul/classes.test.ts). 여기서는 아무 열쇠도 열리지 않은 시험용 규칙으로 본다
  g.rules.unlocked = () => false;
  const slime = [...g.ents.values()].find((e) => e.type === 'slime' && !e.dead)!;
  p.x = SHOP.x; p.z = SHOP.z; p.gold = 200; p.maxHp = p.hp = 1000;
  g.combat.damage(slime, p, 100, false);
  check(p.hp === 900, '갑옷이 없으면 피해를 그대로 받는다');
  cmd({ t: 'buy', id: 'armor1' });
  check(p.armor === 'armor1' && p.gold === 120 && said().includes('bought') && !('armor1' in p.items), '가죽 갑옷을 사면 바로 입는다 (소지품에는 들어가지 않는다)');
  p.maxHp = 1000; p.hp = 900; // 장비를 바꾸면 최대 체력을 다시 구하므로, 시험용으로 늘려 둔 체력을 다시 맞춘다
  g.combat.damage(slime, p, 100, false);
  check(p.hp === 812, `가죽 갑옷을 입으면 받는 피해가 12% 준다 (체력 ${p.hp})`);
  cmd({ t: 'buy', id: 'armor1' });
  check(said().includes('alreadyBest') && p.gold === 120, '같은 등급의 갑옷은 다시 살 수 없다');
  cmd({ t: 'buy', id: 'armor2' });
  check(said().includes('notStocked') && p.armor === 'armor1', '쇠 갑옷은 브람이 돌아오기 전에는 상점에 없다');
  const back = g.players.spawn('armored', false, g.players.export(p));
  check(back.armor === 'armor1', '입은 갑옷이 저장되고 이어진다');
  const odd = g.players.spawn('odd', false, { ...g.players.export(p), armor: 'sword2', ext: {} });
  check(odd.armor === '', '갑옷이 아닌 것이 저장돼 있으면 버린다');
}
