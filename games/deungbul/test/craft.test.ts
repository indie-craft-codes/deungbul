// 제작 시험에서 가른 이 게임의 검사: 대장간은 대장장이가 돌아와야 열린다 (서버 없이 게임 규칙만 돌린다)
// 제작 자체의 검사는 틀의 시험 engine/test/craft.test.ts에 있다.
import { SMITHY, RESIDENTS } from '../shared/defs';
import { check } from '@engine/test/harness';
import { newGame } from './game';

{
  const g = newGame();
  const p = g.players.spawn('smith', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  p.gold = 500; p.items = { iron: 8, hide: 5 };
  p.x = SMITHY.x + 1; p.z = SMITHY.z + 1;
  cmd({ t: 'craft', id: 'sword4' });
  check(said().includes('forgeClosed') && p.weapon === 'sword1', '대장장이가 돌아오기 전에는 만들 수 없다');
  g.tower.load({ glows: [40, 0], residents: [RESIDENTS[0].need, 0, 0] });
  cmd({ t: 'craft', id: 'sword4' });
  check(said().includes('noMats') && !said().includes('forgeClosed'), '대장장이가 돌아오면 대장간이 열린다 (재료가 모자랄 뿐이다)');
}
