// 파티 시험에서 가른 이 게임의 검사: 파티원이 잡은 몬스터는 곁의 파티원의 퀘스트에도 세어진다 (서버 없이 게임 규칙만 돌린다)
// 파티 자체의 검사는 틀의 시험 test/party.test.ts에 있다.
import { check } from '../harness';
import { newGame } from './game';

{
  const g = newGame();
  const [a, b] = ['a', 'b'].map((n) => g.players.spawn(n, false));
  const cmd = (p: typeof a, m: Record<string, unknown>) => { g.notices = []; g.partyOut = []; g.command(p, m); };
  cmd(a, { t: 'party', a: 'invite', id: b.id });
  cmd(b, { t: 'party', a: 'accept' });

  // 보상 나눔: 한 대도 못 때린 파티원도 곁에 있으면 함께 받는다
  const slime = [...g.ents.values()].find((x) => x.type === 'slime')!;
  a.x = slime.x + 1; a.z = slime.z; b.x = slime.x + 6; b.z = slime.z;
  g.notices = [];
  g.combat.damage(a, slime, 999, false);
  check(b.qn === 1 && a.qn === 1, '퀘스트 진행도 함께 오른다');
}
