// 예제 게임의 시험. 틀의 기능(이동, 전투, 처치, 상점, 저장)이 이 게임의 내용 위에서 돌고, 이 게임의 규칙(모닥불)이 돌고,
// 다른 게임(등불지기)의 것은 여기에 없다는 것을 본다. 틀이 바뀌어 예제가 깨지면 여기서 잡힌다.
// 실행: npm run test:sample (tsx --tsconfig games/sample/tsconfig.json: 별칭 @game이 이 게임을 가리켜야 한다)
import { CAMPS, CLASSES, DUNGEONS, FORGES, MONSTERS, SHOPS } from '../shared/content';
import { BONFIRE } from '../shared/content/bonfire';
import { installSample } from '../server/sample';
import type { Ent } from '@engine/server/game/entity';
import { Game } from '@engine/server/game/game';
import { startServer } from '@engine/server/net/server';
import { MemoryStore } from '@engine/server/store';
import { maxHpFor } from '@engine/shared/defs';
import type { ServerMsg } from '@engine/shared/protocol';
import { check, connect, until } from '@engine/test/harness';

// ---------- 규칙만 (서버 없이) ----------
{
  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [installSample], now: () => clock });
  const p = g.players.spawn('hunter', false);
  const said = () => g.notices.filter((n) => n.id === p.id);
  const cmd = (m: Record<string, unknown>) => { g.notices = []; g.announces = []; g.command(p, m); };
  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); clock += seconds * 1000; };
  const alive = (type: string) => [...g.ents.values()].filter((e) => e.kind === 'm' && e.type === type && !e.dead);
  /** 그 몬스터를 쓰러뜨릴 때까지 싸운다 (체력을 깎아 두어 금방 끝낸다) */
  const hunt = (m: Ent) => { m.hp = 1; p.x = m.x + 1; p.z = m.z; p.hp = p.maxHp; cmd({ t: 'attack', id: m.id }); for (let i = 0; i < 60 && !m.dead; i++) g.tick(0.05); };
  const at = (x: number, z: number) => { p.x = x; p.z = z; p.moving = false; p.path = null; p.targetId = 0; };

  // 내용: 이 게임의 것만 있다
  const types = new Set([...g.ents.values()].filter((e) => e.kind === 'm').map((e) => e.type));
  check([...types].sort().join() === Object.keys(MONSTERS).sort().join() && Object.keys(CLASSES).length === 2 && Object.keys(DUNGEONS).length === 0 && FORGES.length === 0 && SHOPS.length === 1,
    `이 게임의 내용으로 떴다: 몬스터 ${[...types].join(', ')}, 직업 둘, 상인 하나, 던전과 대장간은 없다`);

  // 직업과 이동
  cmd({ t: 'class', id: 'hunter' });
  check(p.cls === 'hunter' && p.maxHp === maxHpFor('hunter', 1) && p.weapon === 'axe1', '직업을 고르면 그 직업의 체력이 되고 처음 무기를 든다');
  at(0, 6);
  cmd({ t: 'move', x: 5, z: 9 });
  run(3);
  check(Math.hypot(p.x - 5, p.z - 9) < 0.5, '이동 명령으로 걸어간다');

  // 전투와 처치: 경험치와 골드를 받고, 두 번째 재화(sparks)는 이 게임에 없으므로 늘 0이다
  const rabbit = alive('rabbit')[0];
  hunt(rabbit);
  const kill = said().find((n) => n.k === 'kill');
  check(rabbit.dead && p.exp === MONSTERS.rabbit.exp && p.gold >= MONSTERS.rabbit.gold[0] && p.sparks === 0 && kill?.a[0] === 'rabbit' && kill.a[2] === 0, '토끼를 잡으면 경험치와 골드를 받는다 (두 번째 재화는 0)');
  for (let i = 0; i < 12 && p.lv < 2; i++) { const m = alive('rabbit')[0] ?? alive('boar')[0]; hunt(m); }
  check(p.lv === 2 && p.maxHp === maxHpFor('hunter', 2), '경험치가 차면 레벨이 오른다');

  // 상점
  at(SHOPS[0].x + 1, SHOPS[0].z); p.gold = 100;
  cmd({ t: 'buy', id: 'stew' }); cmd({ t: 'buy', id: 'axe2' });
  check(p.items.stew === 1 && p.weapon === 'axe2' && p.gold === 100 - 12 - 60, '상인 곁에서 스튜와 도끼를 산다');
  at(30, 30);
  cmd({ t: 'buy', id: 'stew' });
  check(said().some((n) => n.k === 'shopFar') && p.items.stew === 1, '상인에게서 멀면 살 수 없다');

  // 이 게임의 규칙: 모닥불
  at(BONFIRE.x, BONFIRE.z + 3);
  cmd({ t: 'feed', n: 1 });
  check(said().some((n) => n.k === 'noLogs') && g.bonfire.heat === 0, '장작이 없으면 넣을 수 없다');
  hunt(alive('bear')[0]);
  check(p.items.log === 1 && said().some((n) => n.k === 'loot' && n.a[0] === 'log'), '곰을 잡으면 장작을 얻는다 (틀의 재료 떨어뜨리기)');
  at(30, 30);
  cmd({ t: 'feed', n: 1 });
  check(said().some((n) => n.k === 'bonfireFar') && p.items.log === 1, '모닥불에서 멀면 넣을 수 없다');
  check(g.mods.product('regen', p) === 1, '불이 꺼져 있으면 회복은 평소대로다');
  at(BONFIRE.x, BONFIRE.z + 3);
  p.items.log = 3;
  cmd({ t: 'feed', n: 2 }); cmd({ t: 'feed', n: 1.5 }); cmd({ t: 'feed', n: -1 }); cmd({ t: 'feed' });
  check(g.bonfire.heat === 2 * BONFIRE.heatPerLog && p.items.log === 1 && p.fed === 2 && g.state().bonfire.heat === 20, '장작 둘을 넣으면 온기가 오르고 내 장작이 준다 (잘못된 수는 무시된다)');
  cmd({ t: 'feed', n: 99 });
  check(p.items.log === 0 && p.fed === 3 && said().some((n) => n.k === 'fed' && n.a[0] === 1 && n.a[1] === 30), '가진 것보다 많이 넣으려 하면 가진 만큼만 들어간다');
  check(g.mods.product('regen', p) === BONFIRE.regen, '불 곁에서는 회복이 빨라진다 (g.mods)');
  at(30, 30);
  check(g.mods.product('regen', p) === 1, '불에서 멀면 평소대로다');
  check(p.daily.prog.feed5 === 3, "일일 임무 '장작 넣기'가 세어진다 (게임의 사건 fed → 틀의 g.daily)");
  run(BONFIRE.coolS + 1);
  check(g.state().bonfire.heat === 29 && g.bonfire.heat < 29, '온기는 시간이 지나면 식는다');

  // 규칙의 접점: 일어나는 자리, 직업을 바꿀 수 있는 곳
  const spot = g.rules.respawn(p);
  cmd({ t: 'class', id: 'woodcutter' });
  check(spot.id === 'bonfire' && Math.hypot(spot.x - BONFIRE.x, spot.z - BONFIRE.z) <= BONFIRE.reach && said().some((n) => n.k === 'classFar') && p.cls === 'hunter', '쓰러지면 모닥불 앞에서 일어나고, 직업은 모닥불 곁에서만 바꾼다 (g.rules)');
  at(BONFIRE.x, BONFIRE.z + 3);
  cmd({ t: 'class', id: 'woodcutter' });
  check(p.cls === 'woodcutter', '모닥불 곁에서는 직업을 바꾼다');

  // 저장 왕복: 틀의 칸(레벨, 골드, 직업, 장비, 소지품)과 이 게임의 칸(넣은 장작, 온기)
  p.items.log = 4;
  const save = JSON.parse(JSON.stringify(g.players.export(p))), world = JSON.parse(JSON.stringify(g.exportWorld()));
  const g2 = new Game({ plugins: [installSample], now: () => clock });
  g2.importWorld(world);
  const q = g2.players.spawn(save.name, false, save, 'pid');
  check(q.lv === p.lv && q.gold === p.gold && q.cls === 'woodcutter' && q.weapon === 'axe2' && q.items.stew === 1 && q.items.log === 4 && q.fed === 3, '캐릭터를 저장했다 읽으면 틀의 칸과 이 게임의 칸(넣은 장작)이 그대로다');
  check(Math.abs(g2.bonfire.heat - g.bonfire.heat) < 1 && g2.bonfire.heat > 0, '월드를 저장했다 읽으면 모닥불의 온기가 그대로다');
  check(JSON.stringify(Object.keys(save.ext).sort()).includes('"bonfire"') && save.ext.bonfire.fed === 3 && world.bonfire.heat > 0 && !('contrib' in save) && !('quest' in save), '이 게임의 저장 칸은 자기 이름(bonfire)으로 적히고, 다른 게임의 칸은 없다');

  // 다른 게임(등불지기)의 것이 없다
  const has = (k: string) => k in g;
  cmd({ t: 'offer', to: 'tower', n: 1 }); cmd({ t: 'dungeon', id: 'crypt' }); cmd({ t: 'craft', id: 'axe2' }); cmd({ t: 'craft', id: 'sword3' }); cmd({ t: 'buy', id: 'potion' }); cmd({ t: 'class', id: 'warrior' });
  run(2);
  check(!has('tower') && !has('raid') && !has('quests') && !has('keepers') && !has('rest') && !g.commands.has('offer') && Object.keys(g.state()).join() === 'bonfire' && g.personal.map((x) => x.name).filter((k) => k !== 'bag' && k !== 'salvage').join() === 'fed' && g.rules.siege === null,
    '등탑·습격·퀘스트·등탑지기·휴식 시스템과 불씨 바치기 명령이 없다 (공유 상태는 bonfire, 게임의 개인 상태는 fed뿐. 틀의 가방·분해 칸은 따로 있다)');
  // 가루를 주지 않는 게임(defaults의 SALVAGE.dust가 비어 있다): 분해·자동 분해·가방 넓히기가 꺼져 있고, 화면도 개인 상태(on: false)를 보고 그리지 않는다
  {
    const it = g.gear.roll(1); g.bag.giveGear(p, it, 'test');
    const gold = p.gold = 1e6, n = p.gear.length;
    cmd({ t: 'salvage', uids: [it.uid] }); cmd({ t: 'autoSalvage', rar: 0 }); cmd({ t: 'bagUp' });
    const st = g.personal.find((x) => x.name === 'salvage')!.state(p) as { on: boolean; auto: number };
    check(p.gear.length === n && p.autoSalvage === -1 && p.bagUp === 0 && p.gold === gold && st.on === false && st.auto === -1, '분해·자동 분해·가방 넓히기가 없는 게임이다: 명령은 아무것도 바꾸지 않고, 개인 상태는 분해가 꺼져 있다고 알린다');
  }
  check(p.cls === 'woodcutter' && p.weapon === 'axe2' && g.dungeon.count === 0 && [...g.ents.values()].every((e) => !e.def?.boss && !e.raid), '없는 던전·제작·아이템·직업을 가리키는 명령은 아무 일도 하지 않는다 (보스와 습격 몹도 없다)');
  check(CAMPS.every((c) => c.types.every((t) => t in MONSTERS)), '무리의 몬스터는 모두 이 게임의 몬스터다');
}

// ---------- 봇과 긴 시간: 틀의 나머지(봇, 몬스터의 움직임과 되살아남, 주기 처리)가 이 게임의 내용 위에서 죽지 않고 돈다 ----------
{
  const g = new Game({ plugins: [installSample] });
  const bots = [1, 2, 3, 4].map((i) => g.players.spawn(`Bot${i}`, true));
  let threw = '';
  try { for (let i = 0; i < 120 * 20; i++) g.tick(0.05); } catch (err) { threw = String(err); }
  check(threw === '' && bots.every((b) => b.cls in CLASSES) && bots.some((b) => b.exp > 0 || b.lv > 1), `봇 넷이 2분 동안 돌아다니며 사냥한다${threw ? ': ' + threw : ''}`);
}

// ---------- 서버를 띄워서: 접속, 메시지, 재시작 뒤의 저장 ----------
{
  const store = new MemoryStore();
  let server = await startServer(0, { store, game: { plugins: [installSample] } });
  /** 이 게임의 메시지(공유 상태, 개인 상태)를 받아 둔다: 틀의 가짜 클라이언트는 틀의 메시지만 읽는다 */
  const seen = { heat: -1, fed: -1, keys: '', stat: null as Extract<ServerMsg, { t: 'stat' }> | null };
  const onMsg = (m: ServerMsg) => {
    if (m.t === 'world') { seen.heat = m.s.bonfire.heat; seen.keys = Object.keys(m.s).join(); }
    else if (m.t === 'me' && m.k === 'fed') seen.fed = m.s as number;
  };
  const a = await connect(server.port, '야영객', 'token-sample-test-0001', onMsg);
  check(await until(() => seen.heat === 0 && seen.fed === 0 && seen.keys === 'bonfire'), '접속하면 공유 상태(모닥불의 온기)와 개인 상태(넣은 장작)가 온다');
  a.send({ t: 'class', id: 'hunter' });
  const me = [...server.game.ents.values()].find((e) => e.id === a.id)!;
  await until(() => me.cls === 'hunter');
  me.x = BONFIRE.x; me.z = BONFIRE.z + 3; me.items.log = 2;
  a.send({ t: 'feed', n: 2 });
  check(await until(() => seen.heat === 2 * BONFIRE.heatPerLog && seen.fed === 2) && a.sys.some((s) => s.startsWith('fed:2')) && a.sys.some((s) => s.startsWith('bonfireLit:')), '장작을 넣으면 안내문이 오고 모두의 온기와 내 기록이 바뀐다');
  check(a.sparks === 0 && a.mons.size > 0 && [...a.mons.values()].every((t) => t in MONSTERS), '보이는 몬스터는 이 게임의 것이고 두 번째 재화는 0이다');
  a.ws.close();
  await server.close();

  server = await startServer(0, { store, game: { plugins: [installSample] } });
  seen.heat = -1; seen.fed = -1;
  const b = await connect(server.port, undefined, 'token-sample-test-0001', onMsg);
  check(b.name === '야영객' && await until(() => seen.fed === 2 && seen.heat > 0 && b.lv === 1), '서버를 다시 켜도 캐릭터(넣은 장작)와 모닥불의 온기가 남는다');
  b.ws.close();
  await server.close();
}
