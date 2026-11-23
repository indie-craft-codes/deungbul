// 파티 (서버 없이 게임 규칙만 돌린다)
import { PARTY } from '../shared/defs';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  const g = new Game();
  const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((n) => g.players.spawn(n, false));
  const bot = g.players.spawn('Bot', true);
  const said = (p: { id: number }) => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (p: typeof a, m: Record<string, unknown>) => { g.notices = []; g.partyOut = []; g.command(p, m); };
  const members = (p: { id: number }) => g.party.membersOf(p.id).length;

  cmd(a, { t: 'party', a: 'invite', id: bot.id });
  check(said(a).includes('partyBusy'), '봇은 파티에 초대할 수 없다');
  cmd(a, { t: 'party', a: 'invite', id: b.id });
  check(said(a).includes('partyInvited') && g.partyOut.some((o) => o.id === b.id && o.msg.t === 'pinv' && o.msg.id === a.id), '초대하면 상대에게 초대가 간다');
  cmd(c, { t: 'party', a: 'invite', id: b.id });
  check(said(c).includes('partyBusy'), '다른 초대를 받고 있는 사람은 초대할 수 없다');
  cmd(b, { t: 'party', a: 'accept' });
  check(members(a) === 2 && members(b) === 2 && said(a).includes('partyJoined') && g.partyOut.filter((o) => o.msg.t === 'party' && o.msg.m.length === 2).length === 2, '수락하면 둘이 한 파티가 되고 서로의 상태를 받는다');
  cmd(c, { t: 'party', a: 'invite', id: b.id });
  check(said(c).includes('partyBusy'), '이미 파티가 있는 사람은 초대할 수 없다');
  cmd(b, { t: 'party', a: 'accept' });
  check(said(b).includes('partyGone') && members(b) === 2, '받은 초대가 없으면 수락해도 아무 일도 없다');

  // 보상 나눔: 한 대도 못 때린 파티원도 곁에 있으면 함께 받는다
  const slime = [...g.ents.values()].find((x) => x.type === 'slime')!;
  a.x = slime.x + 1; a.z = slime.z; b.x = slime.x + 6; b.z = slime.z; c.x = slime.x + 2; c.z = slime.z;
  g.notices = [];
  g.combat.damage(a, slime, 999, false);
  check(a.exp > 0 && b.exp === a.exp && b.sparks > 0 && c.exp === 0 && g.notices.some((n) => n.id === b.id && n.k === 'kill'), '파티원이 잡으면 곁의 파티원도 경험치와 불씨를 받고, 파티가 아닌 사람은 받지 않는다');
  check(b.qn === 1 && a.qn === 1, '퀘스트 진행도 함께 오른다');
  const wolf = [...g.ents.values()].find((x) => x.type === 'wolf')!;
  a.x = wolf.x + 1; a.z = wolf.z; b.x = wolf.x + PARTY.shareRange + 5; b.z = wolf.z;
  const before = b.exp;
  g.combat.damage(a, wolf, 999, false);
  check(b.exp === before, '멀리 있는 파티원은 받지 않는다');

  // 인원 제한과 거절
  a.x = b.x = c.x = d.x = e.x = 0; a.z = b.z = c.z = d.z = e.z = 3;
  cmd(a, { t: 'party', a: 'invite', id: c.id }); cmd(c, { t: 'party', a: 'accept' });
  cmd(b, { t: 'party', a: 'invite', id: d.id }); cmd(d, { t: 'party', a: 'accept' });
  check(members(a) === 4, '파티원 누구나 초대할 수 있고 네 명까지 모인다');
  cmd(a, { t: 'party', a: 'invite', id: e.id });
  check(said(a).includes('partyFull') && members(a) === 4, '다섯 번째는 초대할 수 없다');
  cmd(d, { t: 'party', a: 'leave' });
  check(members(a) === 3 && members(d) === 0 && said(d).includes('partyYouLeft') && said(a).includes('partyLeft') && g.partyOut.some((o) => o.id === d.id && o.msg.t === 'party' && o.msg.m.length === 0), '나가면 남은 사람들에게 알리고 나간 사람의 목록은 비워진다');
  cmd(a, { t: 'party', a: 'invite', id: e.id }); cmd(e, { t: 'party', a: 'decline' });
  check(said(a).includes('partyDeclined') && members(a) === 3, '거절하면 초대한 사람에게 알린다');
  cmd(a, { t: 'party', a: 'invite', id: e.id });
  for (let i = 0; i < (PARTY.inviteS + 1) * 20; i++) g.tick(0.05);
  cmd(e, { t: 'party', a: 'accept' });
  check(said(e).includes('partyGone') && members(e) === 0, '초대는 시간이 지나면 사라진다');

  // 접속이 끊기면 파티에서 빠지고, 혼자 남으면 풀린다
  g.notices = [];
  g.players.leave(c.id);
  check(members(a) === 2 && g.notices.some((n) => n.id === a.id && n.k === 'partyLeft' && n.a[0] === 'c'), '접속이 끊긴 사람은 파티에서 빠진다');
  cmd(b, { t: 'party', a: 'leave' });
  check(members(a) === 0 && said(a).includes('partyEnded'), '혼자 남으면 파티가 풀린다');
  g.partyOut = [];
  for (let i = 0; i < 20; i++) g.tick(0.05);
  check(g.partyOut.length === 0, '파티가 없으면 상태를 보내지 않는다');
}
