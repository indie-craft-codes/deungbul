// 전투 시험에서 가른 이 게임의 검사: 직업은 등탑 곁에서만 바꿀 수 있다 (등탑이 g.rules.canChangeClass를 채운다. 서버 없이 게임 규칙만 돌린다)
// 직업과 기술 자체의 검사는 틀의 시험 test/combat.test.ts에 있다.
import { TOWER } from '@engine/shared/world';
import { check } from '@engine/test/harness';
import { newGame } from './game';

{
  const g = newGame();
  const p = g.players.spawn('archer', false);
  const said = () => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };

  p.x = 40; p.z = 40;
  cmd({ t: 'class', id: 'archer' });
  cmd({ t: 'class', id: 'warrior' });
  check(said().includes('classFar') && p.cls === 'archer', '그 뒤에는 등탑에서 멀면 바꿀 수 없다');

  p.x = TOWER.x + 2; p.z = TOWER.z + 2; p.lv = 3;
  cmd({ t: 'class', id: 'warrior' });
  check(p.cls === 'warrior' && p.maxHp === 230 && said().includes('classChanged'), '등탑 가까이에서는 직업을 바꿀 수 있고 체력은 레벨을 따른다 (3레벨 전사: 230)');
}
