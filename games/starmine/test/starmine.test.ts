// 별가루 광산의 시험: 틀의 기능이 이 게임의 내용 위에서 돌고, 이 게임의 규칙(별빛 채굴기와 각인)이 맞게 도는지 본다.
// 실행: npm run test:starmine (tsx --tsconfig games/starmine/tsconfig.json)
import { CAMPS, CLASSES, MONSTERS, SHOPS, SKILL_DEFS } from '../shared/content';
import { DRILL, drillCap, ENGRAVE } from '../shared/content/drill';
import { installStarmine } from '../server/starmine';
import { type Ent, Game, MemoryStore, startServer } from '@engine/server';
import type { ServerMsg } from '@engine/shared';
import { check, connect, until } from '@engine/testing';

const MIN = 60_000;

// ---------- 규칙만 (서버 없이) ----------
{
  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [installStarmine], now: () => clock });
  const p = g.players.spawn('digger', false);
  const said = () => g.notices.filter((n) => n.id === p.id);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.announces = []; g.command(p, m); };
  /** 시계를 minutes분 앞으로 돌리고 서버의 1초 주기를 한 번 돈다 */
  const pass = (minutes: number) => { clock += minutes * MIN; g.tick(0.5); g.tick(0.5); };
  const view = () => g.personal.find((x) => x.name === 'drill')!.state(p) as { lv: number; stash: number; rate: number; cap: number; engrave: number };

  // 내용
  const types = new Set([...g.ents.values()].filter((e) => e.kind === 'm').map((e) => e.type));
  const kinds = new Set(Object.values(SKILL_DEFS).map((s) => s.effect.kind));
  check([...types].sort().join() === Object.keys(MONSTERS).sort().join() && Object.keys(CLASSES).length === 2 && SHOPS.length === 1, `이 게임의 내용으로 떴다: 몬스터 ${[...types].join(', ')}, 직업 둘, 상인 하나`);
  check(kinds.size === 6 && Object.values(CLASSES).every((c) => c.skills.length === 3), '직업마다 기술 셋, 효과 여섯 가지(hit, dash, buff, area, dot, heal)를 모두 쓴다');
  check(Object.values(MONSTERS).some((m) => 'behavior' in m && m.behavior === 'ranged') && Object.values(MONSTERS).some((m) => 'behavior' in m && m.behavior === 'flee'), '쏘는 몬스터와 달아나는 몬스터가 있다');
  check(CAMPS.every((c) => c.types.every((t) => t in MONSTERS)), '무리의 몬스터는 모두 이 게임의 몬스터다');

  // 채굴기가 없으면 아무것도 쌓이지 않는다
  cmd({ t: 'class', id: 'miner' });
  pass(30);
  check(p.drill.lv === 0 && view().stash === 0 && view().rate === 0, '채굴기가 없으면 별가루가 쌓이지 않는다');
  cmd({ t: 'drillTake' });
  check(said().some((n) => n.k === 'drillEmpty') && p.sparks === 0, '빈 저장고는 거둘 수 없다');

  // 짓기: 골드가 모자라면 안 된다, 있으면 값만큼 빠진다
  cmd({ t: 'drillUp' });
  check(p.drill.lv === 0 && said().some((n) => n.k === 'drillPoor' && n.a[0] === DRILL.cost(0)), '골드가 모자라면 짓지 못하고 필요한 값을 알린다');
  g.wallet.add(p, 'gold', 1000, 'test');
  cmd({ t: 'drillUp' });
  check(p.drill.lv === 1 && p.gold === 1000 - DRILL.cost(0) && said().some((n) => n.k === 'drillUp' && n.a[0] === 1), `짓는 값은 ${DRILL.cost(0)}골드다`);
  check(DRILL.cost(1) > DRILL.cost(0) && DRILL.cost(2) > DRILL.cost(1) && DRILL.cost(1) === 72, '올리는 값은 레벨마다 오른다 (40 → 72 → …)');

  // 생산: 1분에 rate씩
  pass(10);
  check(view().stash === DRILL.rate(1) * 10 && view().rate === 2 && view().cap === drillCap(1), `Lv 1은 1분에 ${DRILL.rate(1)}: 10분에 ${DRILL.rate(1) * 10}이 쌓인다`);
  cmd({ t: 'drillTake' });
  check(p.sparks === 20 && view().stash === 0 && said().some((n) => n.k === 'drillTook' && n.a[0] === 20), '거두면 별가루가 지갑에 들어가고 저장고가 빈다');
  check(p.daily.prog.collect3 === 1, "일일 임무 '별가루 거두기'가 세어진다");

  // 한도: 저장고는 capMin분 어치에서 멈춘다
  pass(DRILL.capMin * 5);
  check(view().stash === drillCap(1) && drillCap(1) === DRILL.rate(1) * DRILL.capMin, `오래 두어도 저장고 한도(${drillCap(1)})에서 멈춘다`);
  cmd({ t: 'drillTake' });
  check(p.sparks === 20 + drillCap(1), '가득 찬 저장고를 거두면 한도만큼 받는다');

  // 올리면 빨라진다 (그 순간까지의 몫은 옛 속도로 셈한다)
  const gold = p.gold;
  pass(1);
  cmd({ t: 'drillUp' });
  check(p.drill.lv === 2 && p.gold === gold - DRILL.cost(1) && Math.floor(p.drill.stash) === DRILL.rate(1), '올리기 전까지의 몫은 옛 속도로 남는다');
  pass(4);
  check(view().stash === DRILL.rate(1) + DRILL.rate(2) * 4 && view().rate === 5, `Lv 2는 1분에 ${DRILL.rate(2)}`);

  // 가장 높은 레벨
  p.drill.lv = DRILL.maxLv;
  const before = p.gold;
  cmd({ t: 'drillUp' });
  check(p.drill.lv === DRILL.maxLv && p.gold === before && said().some((n) => n.k === 'drillMax'), '가장 높은 레벨에서는 더 올리지 않는다');
  p.drill.lv = 2;

  // 각인: 별가루를 쓰고 주는 피해가 오른다
  check(g.mods.product('damage', p) === 1, '각인이 없으면 피해는 그대로다');
  p.sparks = 0;
  cmd({ t: 'engrave' });
  check(p.drill.engrave === 0 && said().some((n) => n.k === 'engravePoor' && n.a[0] === ENGRAVE.cost(0)), '별가루가 모자라면 각인하지 못한다');
  g.wallet.add(p, 'sparks', 100, 'test');
  cmd({ t: 'engrave' });
  check(p.drill.engrave === 1 && p.sparks === 100 - ENGRAVE.cost(0) && Math.abs(g.mods.product('damage', p) - 1.05) < 1e-9, '각인 Lv 1: 별가루 30을 쓰고 주는 피해 ×1.05');

  // 저장 왕복과 자리를 비운 동안: 저장의 마지막 시각부터 시간으로 셈한다
  cmd({ t: 'drillTake' });
  const save = JSON.parse(JSON.stringify(g.players.export(p)));
  check(save.ext.drill.lv === 2 && save.ext.drill.engrave === 1 && save.ext.drill.stash === 0 && save.ext.drill.at === clock, "캐릭터 저장에 채굴기 칸이 자기 이름(drill)으로 적힌다");
  clock += 30 * MIN;
  const g2 = new Game({ plugins: [installStarmine], now: () => clock });
  const q = g2.players.spawn(save.name, false, save, 'pid');
  g2.drill.accrue(q);
  check(q.drill.lv === 2 && q.drill.engrave === 1 && Math.floor(q.drill.stash) === DRILL.rate(2) * 30, '나가 있던 30분 동안의 몫이 다시 들어오면 쌓여 있다');
  // 깨진 저장: 앞날의 시각, 너무 큰 레벨, 한도를 넘는 저장고
  const bad = JSON.parse(JSON.stringify(save));
  bad.ext.drill = { lv: 99, stash: 1e12, at: clock + 1e9, engrave: -3 };
  const r = g2.players.spawn('bad', false, bad, 'pid2');
  g2.drill.accrue(r);
  check(r.drill.lv === DRILL.maxLv && r.drill.stash === drillCap(DRILL.maxLv) && r.drill.at === clock && r.drill.engrave === 0, '깨진 저장은 한도 안으로 읽고, 앞날의 시각은 지금으로 바꾼다');
  check(g.rules.touched?.(p) === true && g2.rules.respawn(q).id === 'mine', '채굴기가 있는 캐릭터는 저장 대상이고, 쓰러지면 광산 입구에서 일어난다');
}

// ---------- 봇과 긴 시간: 틀의 나머지가 이 게임의 내용 위에서 죽지 않고 돈다 ----------
{
  const g = new Game({ plugins: [installStarmine] });
  const bots = [1, 2, 3, 4].map((i) => g.players.spawn(`Bot${i}`, true));
  let threw = '';
  try { for (let i = 0; i < 120 * 20; i++) g.tick(0.05); } catch (err) { threw = String(err); }
  check(threw === '' && bots.every((b) => b.cls in CLASSES) && bots.some((b) => b.exp > 0 || b.lv > 1), `봇 넷이 2분 동안 돌아다니며 사냥한다${threw ? ': ' + threw : ''}`);
}

// ---------- 서버를 띄워서: 접속, 개인 상태, 나가 있던 동안의 몫 ----------
{
  let clock = 1_800_000_000_000;
  const store = new MemoryStore();
  const game = { plugins: [installStarmine], now: () => clock };
  let server = await startServer(0, { store, game });
  const seen = { drill: null as { lv: number; stash: number; rate: number } | null };
  const onMsg = (m: ServerMsg) => { if (m.t === 'me' && m.k === 'drill') seen.drill = m.s as typeof seen.drill; };
  const a = await connect(server.port, '광부', 'token-starmine-test-001', onMsg);
  check(await until(() => seen.drill?.lv === 0), '접속하면 채굴기의 개인 상태가 온다');
  a.send({ t: 'class', id: 'seer' });
  const me = [...server.game.ents.values()].find((e) => e.id === a.id) as Ent;
  await until(() => me.cls === 'seer');
  server.game.wallet.add(me, 'gold', 200, 'test');
  a.send({ t: 'drillUp' });
  check(await until(() => seen.drill?.lv === 1 && seen.drill.rate === DRILL.rate(1)) && a.sys.some((s) => s.startsWith('drillUp:1')), '짓기 명령을 보내면 안내문이 오고 개인 상태가 바뀐다');
  a.ws.close();
  await until(() => ![...server.game.ents.values()].some((e) => e.id === me.id));
  await server.close();

  clock += 45 * MIN;
  server = await startServer(0, { store, game });
  seen.drill = null;
  const b = await connect(server.port, undefined, 'token-starmine-test-001', onMsg);
  check(b.name === '광부' && await until(() => seen.drill?.lv === 1 && seen.drill.stash === DRILL.rate(1) * 45), '서버를 다시 켜고 45분 뒤에 들어오면 그동안의 별가루가 저장고에 있다');
  check(await until(() => b.sys.some((s) => s.startsWith(`drillAway:${DRILL.rate(1) * 45}:45`))), '나가 있던 동안 캔 양을 알린다');
  b.ws.close();
  await server.close();
}
