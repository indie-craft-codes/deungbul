// 던전: 문으로 들어가는 인스턴스 (서버 없이 게임 규칙만 돌린다. 시계는 시험이 직접 돌린다)
import { DUNGEONS, PORTAL_REACH, runKey } from '../shared/defs';
import { AREAS, areaAt, clampPoint } from '../shared/world';
import { Game } from '../server/game/game';
import { check } from './harness';

{
  let clock = new Date(2026, 0, 10, 12).getTime();
  const g = new Game({ now: () => clock });
  const def = DUNGEONS.crypt;
  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); };
  const said = (p: { id: number }) => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (p: Parameters<typeof g.command>[0], m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  const hero = (name: string) => { const p = g.players.spawn(name, false); g.classes.apply(p, 'warrior'); p.lv = 12; g.players.refresh(p); p.hp = p.maxHp; return p; };
  const toPortal = (p: { x: number; z: number }) => { p.x = def.portal.x + 1; p.z = def.portal.z; };
  const inCrypt = (p: { x: number; z: number }) => AREAS[areaAt(p.x, p.z)]?.id === 'crypt';

  // 지역: 들판과 던전 사이는 걸어서 넘을 수 없다
  const walker = g.players.spawn('걷는이', false);
  walker.x = 170; walker.z = 0;
  g.movement.goTo(walker, 266, 0);
  for (let i = 0; i < 400 && walker.moving; i++) g.tick(0.05);
  const stray = clampPoint(200, 0);
  check(walker.x < 180 && !inCrypt(walker) && stray.x < 180, `들판과 던전 사이는 걸어서 넘을 수 없다 (동쪽 끝 ${walker.x.toFixed(0)}에서 멈춘다)`);
  g.players.leave(walker.id);

  const a = hero('앞장'), mate = hero('동료');
  // 파티는 밖에서 맺어 둔다
  toPortal(a); toPortal(mate);
  g.command(a, { t: 'party', a: 'invite', id: mate.id });
  g.command(mate, { t: 'party', a: 'accept' });
  a.x = 0; a.z = 6;
  // 들어갈 수 없는 경우
  cmd(a, { t: 'dungeon', id: 'crypt' });
  check(said(a).includes('dungeonFar') && a.layer === 0, `문에서 멀면(${PORTAL_REACH}m 밖) 들어갈 수 없다`);
  toPortal(a);
  a.lv = def.minLv - 1;
  cmd(a, { t: 'dungeon', id: 'crypt' });
  check(said(a).includes('dungeonLevel') && a.layer === 0, '레벨이 모자라면 들어갈 수 없다');
  a.lv = 12;

  // 들어간다: 나만의 인스턴스가 생기고 몬스터가 놓인다
  const fieldMob = [...g.ents.values()].find((m) => m.kind === 'm' && !m.dead)!;
  cmd(a, { t: 'dungeon', id: 'crypt' });
  const mobs = () => [...g.ents.values()].filter((m) => m.kind === 'm' && m.layer === a.layer && a.layer !== 0);
  const total = def.packs.reduce((s, p) => s + p.n, 0) + 1;
  check(a.layer > 0 && inCrypt(a) && said(a).includes('dungeonEnter') && g.dungeon.count === 1 && mobs().length === total, `들어가면 나만의 인스턴스가 생기고 몬스터 ${total}마리가 놓인다`);
  check(a.daily.prog[runKey('crypt')] === 1, '들어간 횟수를 센다');

  // 층이 다르면 서로 싸우지 않는다
  const hp0 = fieldMob.hp;
  g.combat.damage(a, fieldMob, 50, false);
  check(fieldMob.hp === hp0, '다른 층의 몬스터는 때릴 수 없다');

  // 다른 사람은 다른 인스턴스로 들어간다. 파티원은 같은 인스턴스로 들어온다
  const other = hero('남');
  toPortal(other);
  cmd(other, { t: 'dungeon', id: 'crypt' });
  check(other.layer > 0 && other.layer !== a.layer && g.dungeon.count === 2, '파티가 아닌 사람은 다른 인스턴스로 들어간다');
  cmd(mate, { t: 'dungeon', id: 'crypt' });
  check(mate.layer === a.layer && g.dungeon.count === 2, '파티원은 같은 인스턴스로 들어온다');

  // 안에서 쓰러지면 던전 입구에서 다시 일어난다
  a.x = 300; a.z = 0;
  g.combat.damage(mobs()[0], a, 99999, false);
  check(a.layer > 0 && Math.hypot(a.x - def.entry.x, a.z - def.entry.z) < 2 && a.hp === a.maxHp, '안에서 쓰러지면 던전 입구에서 다시 일어난다');

  // 우두머리를 잡으면 안에 있는 사람 모두 보상을 받고, 잠시 뒤 밖으로 나온다
  g.gear.random = () => 0.99; // 잡은 몬스터가 우연히 장비를 떨어뜨려 수가 흔들리지 않게 한다 (보상 장비의 등급은 가장 높게 나온다)
  const gearA = a.gear.length, gearM = mate.gear.length;
  const boss = mobs().find((m) => m.type === def.boss.type)!;
  for (const m of mobs()) if (m !== boss) { a.x = m.x + 1; a.z = m.z; g.combat.damage(a, m, 99999, false); }
  check(mobs().length === 1, '던전의 몬스터는 잡으면 다시 나오지 않는다');
  a.x = boss.x + 1; a.z = boss.z;
  g.notices = [];
  g.combat.damage(a, boss, 99999, false);
  const got = (p: typeof a) => p.mail.some((m) => m.k === 'dungeon' && m.a[0] === 'crypt');
  check(got(a) && got(mate) && a.gear.length === gearA + 1 && mate.gear.length === gearM + 1 && a.gear[a.gear.length - 1].rar >= def.dropRar && said(a).includes('dungeonClear'), '우두머리를 잡으면 모두 우편 보상과 희귀 이상의 장비를 받는다');
  run(def.exitS + 1);
  check(a.layer === 0 && mate.layer === 0 && !inCrypt(a) && Math.hypot(a.x - def.portal.x, a.z - def.portal.z) < 5 && g.dungeon.count === 1, '끝낸 뒤 잠시 지나면 문 앞으로 나오고 인스턴스가 사라진다');

  // 스스로 나오면 인스턴스가 정리된다
  cmd(other, { t: 'dungeonLeave' });
  run(1);
  check(other.layer === 0 && said(other).length >= 0 && g.dungeon.count === 0 && ![...g.ents.values()].some((m) => m.kind === 'm' && m.layer !== 0), '모두 나가면 인스턴스와 그 몬스터가 사라진다');

  // 제한 시간을 넘기면 실패하고 밖으로 나온다
  toPortal(a);
  cmd(a, { t: 'dungeon', id: 'crypt' });
  g.notices = [];
  run(def.timeS + 1);
  check(a.layer === 0 && said(a).includes('dungeonFail') && g.dungeon.count === 0, '제한 시간을 넘기면 실패하고 밖으로 나온다');

  // 하루 횟수
  toPortal(a);
  cmd(a, { t: 'dungeon', id: 'crypt' });
  g.fire('playerDropped', a);
  check(a.layer === 0 && !inCrypt(a), '안에서 접속이 끊기면 문 앞으로 나온 뒤에 저장된다');
  run(1);
  toPortal(a);
  cmd(a, { t: 'dungeon', id: 'crypt' });
  check(said(a).includes('dungeonNoRuns') && a.layer === 0 && a.daily.prog[runKey('crypt')] === def.perDay, `하루 ${def.perDay}번까지만 들어갈 수 있다`);
  clock += 24 * 3600000;
  cmd(a, { t: 'dungeon', id: 'crypt' });
  check(a.layer > 0, '날이 바뀌면 다시 들어갈 수 있다');

  // 인스턴스 없이 던전 안에서 접속하면(서버 재시작) 문 앞으로 나온다
  const save = g.players.export(a);
  save.at = [300, 0];
  const back = new Game({ now: () => clock }).players.spawn('앞장', false, save);
  check(back.layer === 0 && !inCrypt(back), '서버가 다시 켜진 뒤 던전 안에서 접속하면 문 앞으로 나온다');
}
