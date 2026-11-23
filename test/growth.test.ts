// 성장의 틀: 드롭 장비와 강화, 우편, 방치 보상, 일일 임무와 출석, 순위 (서버 없이 게임 규칙만 돌린다)
import { Game } from '../server/game/game';
import { check } from './harness';

{
  let clock = new Date(2026, 0, 10, 12).getTime();
  const g = new Game({ now: () => clock });
  const p = g.players.spawn('수집가', false);
  g.classes.apply(p, 'warrior');
  check(p.mail.length === 1 && p.mail[0].k === 'attend' && p.mail[0].a[0] === 1, '그날 처음 접속하면 출석 1일째 보상이 우편으로 온다');

  // 장비: 줍고, 끼면 수치가 오른다
  const hp0 = p.maxHp, dmg0 = g.mods.product('damage', p);
  g.gear.random = () => 0.5;
  check(p.gear.length === 1 && p.gear[0].base === 'sword1' && p.worn.weapon === p.gear[0].uid, '처음 든 무기도 낱개 장비로 가방에 있고 끼고 있다');
  const n0 = p.gear.length;
  check(g.gear.give(p, g.gear.roll(3, 3, 'ring')) && p.gear.length === n0 + 1 && p.gear[n0].opts.length === 4, '빛나는 등급 장비는 옵션이 네 개다');
  const it = p.gear[n0];
  g.command(p, { t: 'equip', uid: it.uid });
  check(p.worn[it.slot] === it.uid && p.maxHp > hp0 && g.mods.product('damage', p) > dmg0 && g.mods.sum('crit', p) > 0 && g.mods.product('guard', p) < 1, '장비를 끼면 체력, 공격 피해, 치명타, 받는 피해가 좋아진다');

  // 강화: 성공하면 단계와 수치가 오르고, 실패하면 골드만 든다
  p.gold = 10000;
  const hp1 = p.maxHp;
  g.gear.random = () => 0;
  g.command(p, { t: 'enhance', uid: it.uid });
  check(it.plus === 1 && p.maxHp > hp1 && p.gold < 10000, '강화에 성공하면 단계가 오르고 수치가 커진다');
  const gold1 = p.gold;
  g.gear.random = () => 0.999;
  g.command(p, { t: 'enhance', uid: it.uid });
  check(it.plus === 1 && p.gold < gold1, '강화에 실패하면 골드만 들고 장비는 그대로다');
  check(p.daily.got.includes('enhance1') && p.mail.some((m) => m.k === 'daily' && m.a[0] === 'enhance1'), '일일 임무(강화 1번)를 채우면 보상이 우편으로 온다');

  // 몬스터가 장비를 떨어뜨린다
  g.gear.random = () => 0;
  const prey = [...g.ents.values()].find((m) => m.kind === 'm' && !m.dead && !m.def?.boss)!;
  p.x = prey.x + 1; p.z = prey.z;
  g.combat.damage(p, prey, 99999, false);
  const drop = p.gear[p.gear.length - 1];
  check(p.gear.length === n0 + 2 && drop.slot === 'weapon' && !!drop.base, '몬스터를 잡으면 확률로 장비가 떨어진다 (무기도 떨어진다)');
  // 떨어진 무기로 바꿔 끼면 겉모습 값이 따라가고, 들고 있는 무기는 팔 수 없다
  g.command(p, { t: 'equip', uid: drop.uid });
  check(p.worn.weapon === drop.uid && p.weapon === drop.base, '떨어진 무기를 끼면 든 무기가 바뀐다');
  g.command(p, { t: 'sell', uid: drop.uid });
  g.command(p, { t: 'unequip', slot: 'weapon' });
  check(p.gear.includes(drop) && p.worn.weapon === drop.uid, '들고 있는 무기는 팔거나 뺄 수 없다');
  // 무기를 강화하면 기본 공격 피해도 커진다
  g.command(p, { t: 'equip', uid: p.gear[0].uid });
  const before = g.mods.product('damage', p);
  g.gear.random = () => 0;
  const sword2 = g.gear.plain('sword2');
  g.gear.give(p, sword2);
  g.command(p, { t: 'equip', uid: sword2.uid });
  const worn2 = g.mods.product('damage', p);
  g.command(p, { t: 'enhance', uid: sword2.uid });
  check(worn2 > before && g.mods.product('damage', p) > worn2 && sword2.plus === 1, '무기를 강화하면 기본 공격 피해도 커진다');
  // 보급형(사거나 만든 것)은 +5까지만, 몬스터가 떨어뜨린 것은 +10까지 강화된다
  p.gold = 1e6;
  for (let i = 0; i < 12; i++) { g.command(p, { t: 'enhance', uid: sword2.uid }); g.command(p, { t: 'enhance', uid: drop.uid }); }
  check(sword2.plus === 5 && drop.plus === 10 && drop.opts.length > 0, '보급형은 +5까지, 떨어진 장비는 +10까지 강화된다');
  p.gold = 10000;
  g.command(p, { t: 'equip', uid: p.gear[0].uid });
  const gold2 = p.gold, count = p.gear.length;
  g.command(p, { t: 'sell', uid: sword2.uid });
  g.command(p, { t: 'sell', uid: drop.uid });
  check(p.gear.length === count - 2 && p.gold > gold2, '장비를 팔면 골드를 받는다');

  // 일일 임무: 30마리
  g.daily.add(p, 'kill', 29);
  check(p.daily.got.includes('kill30') && p.daily.prog.kill30 === 30, '일일 임무(30마리)의 진행이 쌓여 완료된다');

  // 우편: 모두 받기
  const gold3 = p.gold, mails = p.mail.length;
  g.command(p, { t: 'mailClaim', id: 0 });
  check(mails >= 3 && p.mail.length === 0 && p.gold > gold3, '우편을 모두 받으면 보상이 들어오고 우편함이 빈다');

  // 순위
  g.rank.tick(99);
  check(g.rank.top()[0]?.name === '수집가' && g.rank.top()[0].power === g.rank.power(p), '순위표에 전투력으로 오른다');

  // 저장했다가 세 시간 뒤에 읽는다: 장비가 남고, 방치 보상이 온다. 같은 날이라 출석은 다시 오지 않는다
  const save = JSON.parse(JSON.stringify(g.players.export(p)));
  clock += 3 * 3600000;
  const g2 = new Game({ now: () => clock });
  const p2 = g2.players.spawn('수집가', false, save);
  check(p2.gear.length === p.gear.length && p2.gear.find((x) => x.uid === it.uid)?.plus === 1 && p2.worn[it.slot] === it.uid && p2.worn.weapon === p.worn.weapon && p2.weapon === 'sword1' && p2.maxHp === p.maxHp, '장비와 강화 단계, 낀 상태가 저장되고 다시 읽힌다');
  check(p2.mail.length === 1 && p2.mail[0].k === 'idle' && p2.mail[0].a[0] === 180 && (p2.mail[0].r.gold ?? 0) > 0, '세 시간 쉬고 돌아오면 방치 보상이 우편으로 온다');
  check(p2.daily.got.includes('kill30'), '일일 임무의 진행이 저장된다');

  // 다음 날: 출석이 이어지고 임무가 새로 시작한다
  const save2 = JSON.parse(JSON.stringify(g2.players.export(p2)));
  clock += 24 * 3600000;
  const p3 = new Game({ now: () => clock }).players.spawn('수집가', false, save2);
  check(p3.daily.streak === 2 && p3.daily.got.length === 0 && p3.mail.some((m) => m.k === 'attend' && m.a[0] === 2), '다음 날 접속하면 출석이 2일째가 되고 임무가 새로 시작한다');
}
