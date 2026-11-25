// 던전: 문으로 들어가는 인스턴스 (서버 없이 게임 규칙만 돌린다. 시계는 시험이 직접 돌린다. 시험용 내용 위에서)
import { DUNGEONS, PORTAL_REACH, runKey } from '../../shared/defs';
import { AREAS, areaAt, clampPoint } from '../../shared/world';
import { Game } from '../../server/game/game';
import { isField } from '../../server/game/layers';
import { check } from '../harness';

{
  let clock = new Date(2026, 0, 10, 12).getTime();
  const g = new Game({ now: () => clock });
  const def = DUNGEONS.vault;
  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); };
  const said = (p: { id: number }) => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (p: Parameters<typeof g.command>[0], m: Record<string, unknown>) => { g.notices = []; g.command(p, m); };
  const hero = (name: string) => { const p = g.players.spawn(name, false); g.classes.apply(p, 'knight'); p.lv = 12; g.players.refresh(p); p.hp = p.maxHp; return p; };
  const toPortal = (p: { x: number; z: number }) => { p.x = def.portal.x + 1; p.z = def.portal.z; };
  const inVault = (p: { x: number; z: number }) => AREAS[areaAt(p.x, p.z)]?.id === 'vault';

  // 지역: 들판과 던전 사이는 걸어서 넘을 수 없다
  const walker = g.players.spawn('걷는이', false);
  const field = AREAS[0], gap = (field.x1 + AREAS[1].x0) / 2; // 들판의 동쪽 끝과 던전 사이의 빈 곳
  walker.x = field.x1 - 10; walker.z = 0;
  g.movement.goTo(walker, def.entry.x, def.entry.z);
  for (let i = 0; i < 400 && walker.moving; i++) g.tick(0.05);
  const stray = clampPoint(gap, 0);
  check(walker.x <= field.x1 && !inVault(walker) && stray.x <= field.x1, `들판과 던전 사이는 걸어서 넘을 수 없다 (동쪽 끝 ${walker.x.toFixed(0)}에서 멈춘다)`);
  g.players.leave(walker.id);

  const a = hero('앞장'), mate = hero('동료');
  // 파티는 밖에서 맺어 둔다
  toPortal(a); toPortal(mate);
  g.command(a, { t: 'party', a: 'invite', id: mate.id });
  g.command(mate, { t: 'party', a: 'accept' });
  a.x = 0; a.z = 6;
  // 들어갈 수 없는 경우
  cmd(a, { t: 'dungeon', id: 'vault' });
  check(said(a).includes('dungeonFar') && isField(a.layer), `문에서 멀면(${PORTAL_REACH}m 밖) 들어갈 수 없다`);
  toPortal(a);
  a.lv = def.minLv - 1;
  cmd(a, { t: 'dungeon', id: 'vault' });
  check(said(a).includes('dungeonLevel') && isField(a.layer), '레벨이 모자라면 들어갈 수 없다');
  a.lv = 12;

  // 들어간다: 나만의 인스턴스가 생기고 몬스터가 놓인다
  const fieldMob = [...g.ents.values()].find((m) => m.kind === 'm' && !m.dead)!;
  cmd(a, { t: 'dungeon', id: 'vault' });
  const mobs = () => [...g.ents.values()].filter((m) => m.kind === 'm' && m.layer === a.layer && !isField(a.layer));
  const total = def.packs.reduce((s, p) => s + p.n, 0) + 1;
  check(!isField(a.layer) && inVault(a) && said(a).includes('dungeonEnter') && g.dungeon.count === 1 && mobs().length === total, `들어가면 나만의 인스턴스가 생기고 몬스터 ${total}마리가 놓인다`);
  check(a.daily.prog[runKey('vault')] === 1, '들어간 횟수를 센다');

  // 층이 다르면 서로 싸우지 않는다
  const hp0 = fieldMob.hp;
  g.combat.damage(a, fieldMob, 50, false);
  check(fieldMob.hp === hp0, '다른 층의 몬스터는 때릴 수 없다');

  // 다른 사람은 다른 인스턴스로 들어간다. 파티원은 같은 인스턴스로 들어온다
  const other = hero('남');
  toPortal(other);
  cmd(other, { t: 'dungeon', id: 'vault' });
  check(!isField(other.layer) && other.layer !== a.layer && g.dungeon.count === 2, '파티가 아닌 사람은 다른 인스턴스로 들어간다');
  cmd(mate, { t: 'dungeon', id: 'vault' });
  check(mate.layer === a.layer && g.dungeon.count === 2, '파티원은 같은 인스턴스로 들어온다');

  // 안에서 쓰러지면 던전 입구에서 다시 일어난다
  a.x = 300; a.z = 0;
  g.combat.damage(mobs()[0], a, 99999, false);
  check(!isField(a.layer) && Math.hypot(a.x - def.entry.x, a.z - def.entry.z) < 2 && a.hp === a.maxHp, '안에서 쓰러지면 던전 입구에서 다시 일어난다');

  // 우두머리를 잡으면 안에 있는 사람 모두 보상을 받고, 잠시 뒤 밖으로 나온다
  g.gear.random = () => 0.99; // 잡은 몬스터가 우연히 장비를 떨어뜨려 수가 흔들리지 않게 한다 (보상 장비의 등급은 가장 높게 나온다)
  const gearA = a.gear.length, gearM = mate.gear.length;
  const boss = mobs().find((m) => m.type === def.boss.type)!;
  for (const m of mobs()) if (m !== boss) { a.x = m.x + 1; a.z = m.z; g.combat.damage(a, m, 99999, false); }
  check(mobs().length === 1, '던전의 몬스터는 잡으면 다시 나오지 않는다');
  a.x = boss.x + 1; a.z = boss.z;
  g.notices = [];
  g.combat.damage(a, boss, 99999, false);
  const got = (p: typeof a) => p.mail.some((m) => m.k === 'dungeon' && m.a[0] === 'vault');
  check(got(a) && got(mate) && a.gear.length === gearA + 1 && mate.gear.length === gearM + 1 && a.gear[a.gear.length - 1].rar >= def.dropRar && said(a).includes('dungeonClear'), '우두머리를 잡으면 모두 우편 보상과 희귀 이상의 장비를 받는다');
  run(def.exitS + 1);
  check(isField(a.layer) && isField(mate.layer) && !inVault(a) && Math.hypot(a.x - def.portal.x, a.z - def.portal.z) < 5 && g.dungeon.count === 1, '끝낸 뒤 잠시 지나면 문 앞으로 나오고 인스턴스가 사라진다');

  // 스스로 나오면 인스턴스가 정리된다
  cmd(other, { t: 'dungeonLeave' });
  run(1);
  check(isField(other.layer) && said(other).length >= 0 && g.dungeon.count === 0 && ![...g.ents.values()].some((m) => m.kind === 'm' && !isField(m.layer)), '모두 나가면 인스턴스와 그 몬스터가 사라진다');

  // 제한 시간을 넘기면 실패하고 밖으로 나온다
  toPortal(a);
  cmd(a, { t: 'dungeon', id: 'vault' });
  g.notices = [];
  run(def.timeS + 1);
  check(isField(a.layer) && said(a).includes('dungeonFail') && g.dungeon.count === 0, '제한 시간을 넘기면 실패하고 밖으로 나온다');

  // 하루 횟수
  toPortal(a);
  cmd(a, { t: 'dungeon', id: 'vault' });
  g.fire('playerDropped', a);
  check(isField(a.layer) && !inVault(a), '안에서 접속이 끊기면 문 앞으로 나온 뒤에 저장된다');
  run(1);
  toPortal(a);
  cmd(a, { t: 'dungeon', id: 'vault' });
  check(said(a).includes('dungeonNoRuns') && isField(a.layer) && a.daily.prog[runKey('vault')] === def.perDay, `하루 ${def.perDay}번까지만 들어갈 수 있다`);
  clock += 24 * 3600000;
  cmd(a, { t: 'dungeon', id: 'vault' });
  check(!isField(a.layer), '날이 바뀌면 다시 들어갈 수 있다');

  // 인스턴스 없이 던전 안에서 접속하면(서버 재시작) 문 앞으로 나온다
  const save = g.players.export(a);
  save.at = [300, 0];
  const back = new Game({ now: () => clock }).players.spawn('앞장', false, save);
  check(isField(back.layer) && !inVault(back), '서버가 다시 켜진 뒤 던전 안에서 접속하면 문 앞으로 나온다');
}

// 파티원이 던전에 들어가면 아직 밖에 있는 파티원에게 알린다
{
  const g = new Game({ now: () => new Date(2026, 0, 10, 12).getTime() });
  const def = DUNGEONS.vault;
  const hero = (name: string) => { const p = g.players.spawn(name, false); g.classes.apply(p, 'knight'); p.lv = 12; g.players.refresh(p); p.x = def.portal.x + 1; p.z = def.portal.z; return p; };
  const told = (p: { id: number }) => g.notices.filter((n) => n.id === p.id && n.k === 'dungeonMate');
  const a = hero('앞장'), b = hero('동료'), c = hero('막내'), stranger = hero('남');
  for (const m of [b, c]) { g.command(a, { t: 'party', a: 'invite', id: m.id }); g.command(m, { t: 'party', a: 'accept' }); }

  g.notices = [];
  g.command(a, { t: 'dungeon', id: 'vault' });
  check(told(b).length === 1 && told(c).length === 1 && told(b)[0].a[0] === '앞장' && told(b)[0].a[1] === 'vault', '파티원이 던전에 들어가면 밖에 있는 파티원에게 누가 어디에 들어갔는지 알린다');
  check(told(a).length === 0 && told(stranger).length === 0, '들어간 본인과 파티가 아닌 사람에게는 알리지 않는다');

  g.notices = [];
  g.command(b, { t: 'dungeon', id: 'vault' });
  check(b.layer === a.layer && told(c).length === 1 && told(a).length === 0, '뒤따라 들어가면 아직 밖에 있는 파티원에게만 알린다 (이미 같은 곳에 있는 사람은 빼고)');
}

// ---------- 끊겼다 곧 돌아오면 같은 회차로 (후반부 검토: 끊길 때마다 하루 횟수와 우두머리 진행이 날아갔다) ----------
{
  const { DUNGEON_HOLD_S } = await import('../../server/game/systems/dungeon');
  const g = new Game();
  const def = DUNGEONS.vault;
  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); };
  const hero = (name: string, pid: string, save: Parameters<typeof g.players.spawn>[2] = null) => { const p = g.players.spawn(name, false, save, pid); if (!save) { g.classes.apply(p, 'knight'); p.lv = 12; g.players.refresh(p); p.hp = p.maxHp; } return p; };
  const drop = (p: ReturnType<typeof hero>) => { g.fire('playerDropped', p); const save = JSON.parse(JSON.stringify(g.players.export(p))); g.players.leave(p.id); return save; };

  const p = hero('끊긴이', 'pid-drop');
  p.x = def.portal.x + 1; p.z = def.portal.z;
  g.command(p, { t: 'dungeon', id: 'vault' });
  const r0 = g.dungeon.runOf(p)!;
  const boss = [...g.ents.values()].find((e) => e.type === def.boss.type && e.layer === p.layer)!;
  boss.hp = Math.round(boss.maxHp * 0.4);
  const used = p.daily.prog[runKey('vault')];
  const save = drop(p);
  run(30);
  const back = hero('끊긴이', 'pid-drop', save);
  const r1 = g.dungeon.runOf(back);
  check(!!r1 && r1.id === 'vault' && !isField(back.layer) && back.layer === boss.layer && boss.hp === Math.round(boss.maxHp * 0.4) && back.daily.prog[runKey('vault')] === used && !!r0,
    `30초 안에 다시 접속하면 같은 회차로 돌아간다 (우두머리 체력 그대로, 하루 횟수를 더 쓰지 않는다)`);

  const save2 = drop(back);
  run(DUNGEON_HOLD_S + 5);
  const late = hero('끊긴이', 'pid-drop', save2);
  check(!g.dungeon.runOf(late) && isField(late.layer) && g.dungeon.count === 0, `${DUNGEON_HOLD_S}초가 지나 접속하면 밖(들판)에서 시작하고 회차는 닫힌다`);
}
