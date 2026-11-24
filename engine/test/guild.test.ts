// 길드 (서버 없이 게임 규칙만 돌린다)
import { GUILD } from '../shared/defs';
import type { ServerMsg } from '../shared/protocol';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  const g = new Game();
  const mk = (name: string, pid: string, lv = 10) => { const p = g.players.spawn(name, false, null, pid); g.classes.apply(p, 'warrior'); p.lv = lv; p.gold = 5000; return p; };
  const said = (p: { id: number }) => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (p: Parameters<typeof g.command>[0], m: Record<string, unknown>) => { g.notices = []; g.out = []; g.casts = []; g.command(p, m); };
  const view = (p: { id: number }) => (g.out.filter((o) => o.id === p.id && o.msg.t === 'guild').pop()?.msg as Extract<ServerMsg, { t: 'guild' }> | undefined);
  const a = mk('길드장', 'key-a'), b = mk('둘째', 'key-b'), c = mk('셋째', 'key-c'), guest = mk('손님', ''), low = mk('새내기', 'key-low', 2);

  // 만들기의 조건
  cmd(guest, { t: 'guild', a: 'create', name: '등불회' });
  check(said(guest).includes('guildGuest'), '손님은 길드를 만들 수 없다');
  cmd(low, { t: 'guild', a: 'create', name: '등불회' });
  check(said(low).includes('guildNeedLv'), `레벨 ${GUILD.createLv}부터 만들 수 있다`);
  cmd(a, { t: 'guild', a: 'create', name: '가' });
  check(said(a).includes('guildNameBad') && g.guild.count === 0, '이름이 너무 짧으면 만들 수 없다');
  cmd(a, { t: 'guild', a: 'create', name: '등불회' });
  check(g.guild.count === 1 && a.gold === 5000 - GUILD.createGold && a.guild === '등불회' && view(a)?.g?.leader === true && g.casts.some((m) => m.t === 'gtag' && m.id === a.id && m.g === '등불회'), '길드를 만들면 골드가 들고, 길드장이 되고, 이름표에 길드 이름이 붙는다');
  cmd(b, { t: 'guild', a: 'create', name: '등불회' });
  check(said(b).includes('guildNameTaken'), '같은 이름의 길드는 만들 수 없다');

  // 초대와 가입
  cmd(b, { t: 'guild', a: 'invite', id: c.id });
  check(g.out.length === 0, '길드가 없는 사람은 초대할 수 없다');
  cmd(a, { t: 'guild', a: 'invite', id: guest.id });
  check(said(a).includes('guildBusy'), '손님은 초대할 수 없다');
  cmd(a, { t: 'guild', a: 'invite', id: b.id });
  check(said(a).includes('guildInvited') && view(b)?.invite?.name === '등불회', '길드장이 초대하면 상대에게 초대가 간다');
  cmd(b, { t: 'guild', a: 'accept' });
  check(b.guild === '등불회' && view(b)?.g?.members.length === 2 && view(a)?.g?.members.length === 2 && said(a).includes('guildJoined'), '수락하면 길드원이 되고 모두에게 알린다');
  cmd(b, { t: 'guild', a: 'invite', id: c.id });
  check(said(b).includes('guildNotLeader'), '길드원은 초대할 수 없다');
  cmd(a, { t: 'guild', a: 'invite', id: c.id });
  cmd(c, { t: 'guild', a: 'accept' });

  // 길드 대화: 길드원에게만 간다
  cmd(b, { t: 'gchat', text: '안녕하세요' });
  const got = (p: { id: number }) => g.out.some((o) => o.id === p.id && o.msg.t === 'chat' && o.msg.ch === 'g' && o.msg.text === '안녕하세요');
  check(got(a) && got(b) && got(c) && !got(guest), '길드 대화는 길드원에게만 간다');
  cmd(guest, { t: 'gchat', text: '저기요' });
  check(said(guest).includes('guildNone'), '길드가 없으면 길드 대화를 할 수 없다');

  // 기부: 길드 레벨이 오르고 경험치 보너스가 붙는다
  check(g.mods.sum('exp', a) === GUILD.expPerLevel && g.mods.sum('exp', guest) === 0, '길드 레벨 1의 경험치 보너스가 길드원에게만 붙는다');
  cmd(b, { t: 'guild', a: 'give', n: GUILD.expPerGuildLevel });
  check(b.gold === 5000 - GUILD.expPerGuildLevel && view(a)?.g?.lv === 2 && said(a).includes('guildLevelUp') && Math.abs(g.mods.sum('exp', c) - 2 * GUILD.expPerLevel) < 1e-9, '기부하면 길드 레벨이 오르고 보너스가 커진다');
  cmd(b, { t: 'guild', a: 'give', n: 999999 });
  check(said(b).includes('noGold'), '가진 것보다 많이 기부할 수 없다');
  const slime = [...g.ents.values()].find((e) => e.kind === 'm' && e.type === 'slime' && !e.dead)!;
  const exp0 = c.exp + c.lv * 1e6;
  c.need = 1e9; c.x = slime.x + 1; c.z = slime.z;
  g.combat.damage(c, slime, 99999, false);
  check(c.exp + c.lv * 1e6 - exp0 === 12 + Math.round(12 * 2 * GUILD.expPerLevel), `길드 보너스만큼 처치 경험치를 더 받는다 (+${c.exp + c.lv * 1e6 - exp0})`);

  // 공지, 추방, 탈퇴
  cmd(a, { t: 'guild', a: 'notice', text: '저녁 8시 습격' });
  check(view(c)?.g?.notice === '저녁 8시 습격', '길드장이 공지를 올리면 모두에게 보인다');
  cmd(b, { t: 'guild', a: 'kick', pid: 'key-c' });
  check(said(b).includes('guildNotLeader') && c.guild === '등불회', '길드원은 추방할 수 없다');
  cmd(a, { t: 'guild', a: 'kick', pid: 'key-c' });
  check(c.guild === '' && said(c).includes('guildKicked') && view(c)?.g === null && view(a)?.g?.members.length === 2, '길드장이 추방하면 길드에서 빠진다');

  // 저장했다가 읽는다: 접속해 있지 않은 길드원도 남는다
  const world = JSON.parse(JSON.stringify(g.exportWorld()));
  const g2 = new Game();
  g2.importWorld(world);
  const b2 = g2.players.spawn('둘째', false, null, 'key-b');
  check(g2.guild.count === 1 && b2.guild === '등불회' && g2.mods.sum('exp', b2) > 0, '길드가 월드와 함께 저장되고 다시 읽힌다');

  // 길드장이 나가면 가장 많이 기부한 사람이 잇고, 모두 나가면 길드가 사라진다
  cmd(a, { t: 'guild', a: 'leave' });
  check(a.guild === '' && view(b)?.g?.leader === true && g.guild.count === 1, '길드장이 나가면 남은 사람이 길드장이 된다');
  cmd(b, { t: 'guild', a: 'leave' });
  check(g.guild.count === 0 && b.guild === '', '모두 나가면 길드가 사라진다');
}
