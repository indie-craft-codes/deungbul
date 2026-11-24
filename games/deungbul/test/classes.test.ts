// 직업 시험에서 가른 이 게임의 검사: 주민이 돌아와야 상점에 나오는 갑옷 (서버 없이 게임 규칙만 돌린다)
// 갑옷 자체의 검사는 틀의 시험 engine/test/classes.test.ts에 있다.
import { SHOP } from '../shared/defs';
import { check } from '@engine/test/harness';
import { newGame } from './game';

{
  const g = newGame();
  const p = g.players.spawn('armored', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  p.x = SHOP.x; p.z = SHOP.z; p.gold = 200;
  cmd({ t: 'buy', id: 'armor1' });
  cmd({ t: 'buy', id: 'armor2' });
  check(said().includes('notStocked') && p.armor === 'armor1', '쇠 갑옷은 브람이 돌아오기 전에는 상점에 없다');
}
