// 틀만의 게임과 서버: 규칙 플러그인 없이(plugins: []) 만든 게임이 바탕 기능을 모두 돌리는가, 틀만의 서버가 접속·저장·프로토콜 번호를 다루는가.
// 시험용 내용 위에서 돈다 (예전에는 engine/test/framework.test.ts에 있었다). 등불지기의 옛 저장을 틀만의 게임이 읽는 검사는 games/deungbul/test/baseline.test.ts에 있다.
import { createHash } from 'node:crypto';
import { WebSocket } from 'ws';
import { CHANNEL, DUNGEONS, SHOPS } from '../../shared/defs';
import { PROTOCOL, type ServerMsg } from '../../shared/protocol';
import { MAP, PLAYER_SPEED } from '../../shared/world';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { channelOf, isField } from '../../server/game/layers';
import { startServer } from '../../server/net/server';
import { MemoryStore, type PlayerSave } from '../../server/store';
import { check, sleep, until } from '../harness';

/** 정해 둔 날의 낮 12시 (서버 현지 시간) */
const noon = (): number => new Date(2026, 0, 10, 12).getTime();
const SHOP = SHOPS[0], SPAWN = MAP.spawn;

// 아무것도 하지 않은 새 캐릭터는 저장하지 않는다 (engine/server/net/server.ts의 savePlayer). 틀의 칸(직업, 레벨, 경험치, 골드, 불씨)에 더해
// 게임이 g.rules.touched로 '진행이 있다'고 답한다 (등불지기에서는 퀘스트). 칸을 옮기기 전과 같은 캐릭터가 저장되고 같은 캐릭터가 저장되지 않는다.
// (게임의 진행만 있는 캐릭터가 저장되는지는 games/deungbul/test/framework.test.ts가 본다. 여기서는 틀만의 서버를 본다)
{
  const keyOf = (token: string) => createHash('sha256').update(token).digest('hex');
  // 틀만의 서버: 게임의 규칙이 없으면 틀의 칸만 본다
  const bareStore = new MemoryStore();
  const b = await startServer(0, { store: bareStore, game: { plugins: [] } });
  const bareVisit = async (token: string, touch: (e: Ent) => void): Promise<PlayerSave | null> => {
    const ws = new WebSocket(`ws://127.0.0.1:${b.port}`);
    const id = await new Promise<number>((done, fail) => {
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', token })));
      ws.on('message', (data) => { const m = JSON.parse(data.toString()) as { t: string; id?: number }; if (m.t === 'welcome') done(m.id!); });
      ws.on('error', fail);
    });
    touch(b.game.ents.get(id)!);
    ws.close();
    await until(() => !b.game.ents.has(id));
    return bareStore.loadPlayer(keyOf(token));
  };
  const bareIdle = await bareVisit('touch-token-bare-0009', () => {});
  const bareGold = await bareVisit('touch-token-bare-0010', (e) => { e.gold = 2; });
  check(bareIdle === null && bareGold?.gold === 2, '틀만의 서버도 아무것도 하지 않은 새 캐릭터는 저장하지 않고, 골드를 얻은 캐릭터는 저장한다');
  await b.close();
}

// ---------- 프로토콜 번호 ----------
{
  const s = await startServer(0, { store: new MemoryStore() });
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
  const welcome = await new Promise<{ v?: unknown }>((done, fail) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: '번호확인' })));
    ws.on('message', (data) => { const m = JSON.parse(data.toString()) as { t: string; v?: unknown }; if (m.t === 'welcome') done(m); });
    ws.on('error', fail);
  });
  check(Number.isInteger(PROTOCOL) && welcome.v === PROTOCOL, `접속하면 서버가 프로토콜 번호를 알려 준다 (v=${String(welcome.v)})`);
  ws.close();
  await s.close();
}

// ---------- 틀만의 게임 (docs/framework-plan.md의 단계 1) ----------
// 규칙 플러그인 없이(plugins: []) 만든 게임: 게임의 규칙 시스템이 없어도 바탕 기능이 돈다.
// 틀의 코드가 게임의 시스템(등불지기의 g.tower 같은 것)을 건드리면 그 자리에서 예외가 나게 해 둔다.
{
  const now = noon();
  const g = new Game({ plugins: [], now: () => now });
  const bare = g as unknown as Record<string, unknown>;
  const GAME_ONLY = ['tower', 'raid', 'quests', 'keepers'];
  check(GAME_ONLY.every((k) => bare[k] === undefined), 'plugins: []로 만들면 게임의 규칙 시스템(등불지기의 등탑·습격·퀘스트·등탑지기 같은 것)이 없다');
  const touched: string[] = [];
  for (const k of GAME_ONLY) Object.defineProperty(g, k, { get() { touched.push(k); throw new Error(`틀이 게임의 시스템 g.${k}를 건드렸다`); } });
  check(Object.keys(g.state()).length === 0 && !('tower' in g.exportWorld()) && !('keepers' in g.exportWorld()), `공유 상태에 등탑·습격 칸이 없고, 월드 저장에도 등탑 칸이 없다 (월드 저장: ${Object.keys(g.exportWorld()).join(', ')})`);

  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); };
  const said = (p: Ent) => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (p: Ent, m: Record<string, unknown>) => { g.notices = []; g.out = []; g.command(p, m); };
  const hero = (name: string, pid: string) => { const p = g.players.spawn(name, false, null, pid); g.classes.apply(p, 'knight'); p.lv = 12; p.gold = 5000; g.players.refresh(p); p.hp = p.maxHp; return p; };
  let threw = '';
  try {
    const p = hero('틀사람', 'bare-a'), mate = hero('틀동료', 'bare-b');
    g.players.spawn('Bot1', true);
    check(p.mail.some((m) => m.k === 'attend') && channelOf(p.layer) === 1, '접속하면 출석 우편을 받고 1채널에 선다');
    check(g.rules.siege === null && g.rules.unlocked('smith') && g.rules.speed(p) === PLAYER_SPEED && g.rules.canChangeClass(p), '규칙의 기본값: 몰려갈 곳이 없고, 잠긴 것이 없고, 걸음은 기본 속도이고, 직업은 어디서나 바꾼다');

    // 이동
    // 처음 서는 자리는 무작위라 찍은 곳이 건물에 걸릴 수 있다: 길이 트인 정해진 자리에서 잰다
    p.x = 0; p.z = 8;
    const from = { x: p.x, z: p.z };
    cmd(p, { t: 'move', x: p.x + 6, z: p.z + 4 });
    run(3);
    check(Math.hypot(p.x - from.x, p.z - from.z) > 5 && !p.moving, '이동: 찍은 곳까지 걸어간다');

    // 전투와 처치, 장비 줍기
    g.gear.random = () => 0; // 반드시 떨어뜨린다
    const m = [...g.ents.values()].find((e) => e.type === 'mite' && !e.dead && e.layer === p.layer)!;
    m.wait = 99; p.x = m.x + 1; p.z = m.z;
    const exp0 = p.exp + p.lv * 1e6, bag0 = p.gear.length;
    cmd(p, { t: 'attack', id: m.id });
    for (let i = 0; i < 400 && !m.dead; i++) g.tick(0.05);
    check(m.dead && p.exp + p.lv * 1e6 > exp0 && g.notices.some((n) => n.id === p.id && n.k === 'kill'), '전투: 몬스터를 쓰러뜨리면 경험치를 받는다');
    check(p.gear.length === bag0 + 1 && p.daily.prog.hunt30 === 1, '처치하면 장비가 떨어져 가방에 들어오고, 일일 임무가 세어진다');
    g.gear.random = Math.random;

    // 상점: 잠금 규칙이 없으므로 모든 물건이 열려 있다
    p.x = SHOP.x + 1; p.z = SHOP.z;
    cmd(p, { t: 'buy', id: 'draught' }); cmd(p, { t: 'buy', id: 'blade3' });
    check(p.items.draught === 1 && p.weapon === 'blade3', '상점: 물약과 (잠금 규칙이 있는 게임에서는 잠긴) 3단계 칼을 산다');

    // 우편
    const gold0 = p.gold;
    cmd(p, { t: 'mailClaim', id: 0 });
    check(p.mail.length === 0 && p.gold > gold0, '우편: 받은 우편을 열어 보상을 받는다');

    // 길드
    cmd(p, { t: 'guild', a: 'create', name: '틀모임' });
    check(g.guild.count === 1 && p.guild === '틀모임', '길드를 만든다');
    g.players.rename(p, '새이름');
    check(p.name === '새이름', '이름을 바꾼다 (게임의 명단 같은 것이 없어도 된다)');

    // 거래소
    const ring = g.gear.roll(3, 2, 'ring');
    g.gear.put(p, ring);
    cmd(p, { t: 'market', a: 'post', uid: ring.uid, price: 300 });
    check(g.market.count === 1 && said(p).includes('marketPosted'), '거래소에 장비를 올린다');

    // 채널
    run(CHANNEL.switchCdS + CHANNEL.calmS + 1);
    cmd(p, { t: 'channel', n: 2 });
    const told = g.out.filter((o) => o.id === p.id && o.msg.t === 'channels').pop()?.msg as Extract<ServerMsg, { t: 'channels' }> | undefined;
    check(channelOf(p.layer) === 2 && told?.me === 2 && told.foes === undefined, '채널을 바꾼다 (채널 소식에 습격의 적 칸은 없다)');

    // 던전
    const def = DUNGEONS.vault;
    p.x = def.portal.x + 1; p.z = def.portal.z;
    cmd(p, { t: 'dungeon', id: 'vault' });
    check(!isField(p.layer) && said(p).includes('dungeonEnter') && g.dungeon.count === 1, '던전에 들어간다');
    // 던전에서 쓰러지면 던전의 입구에서, 들판에서 쓰러지면 기본 자리(SPAWN)에서 일어난다
    check(g.rules.respawn(p).x === def.entry.x && g.rules.respawn(mate).x === SPAWN.x && g.rules.respawn(mate).id === '', '일어나는 자리: 던전 안은 입구, 들판은 기본 자리');

    // 수백 틱을 더 돈다 (봇, 몬스터, 주기 처리가 모두 도는 동안 예외가 없어야 한다)
    g.daily.add(mate, 'offer', 10); // 게임의 임무 종류를 틀이 몰라도 세기만 하면 된다
    run(30);
    // 저장과 읽기: 캐릭터와 월드
    const save = structuredClone(g.players.export(p)), world = structuredClone(g.exportWorld());
    const g2 = new Game({ plugins: [], now: () => now });
    g2.importWorld(world);
    const again = g2.players.spawn(save.name, false, save, 'bare-a');
    check(again.lv === p.lv && again.gear.length === p.gear.length && again.guild === '틀모임' && g2.market.count === 1, '틀만의 게임도 캐릭터와 월드를 저장하고 다시 읽는다');
    // 게임의 월드 저장(등불지기의 등탑 칸이 든 것)을 틀만의 게임이 읽는 검사는 games/deungbul/test/baseline.test.ts에 있다
  } catch (err) { threw = String(err); }
  check(threw === '' && touched.length === 0, `틀만의 게임이 예외 없이 돌고, 틀의 코드가 게임의 시스템을 건드리지 않는다${threw ? ` (${threw})` : ''}`);
}

// 틀만의 서버: 접속, 공유 상태, 스냅샷, 끊고 저장하기까지 (통신 계층도 게임의 시스템 없이 돈다)
{
  const store = new MemoryStore();
  const s = await startServer(0, { store, game: { plugins: [] } });
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
  const got: ServerMsg[] = [];
  await new Promise<void>((done, fail) => {
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: '틀접속', token: 'bare-token-0001' })));
    ws.on('message', (data) => { got.push(JSON.parse(data.toString()) as ServerMsg); if (got.some((m) => m.t === 'snap') && got.some((m) => m.t === 'stat')) done(); });
    ws.on('error', fail);
  });
  const world = got.find((m) => m.t === 'world') as Extract<ServerMsg, { t: 'world' }> | undefined;
  check(got[0]?.t === 'welcome' && !!world && Object.keys(world.s).length === 0, '틀만의 서버에 접속하면 welcome, 빈 공유 상태, 스냅샷과 내 상태를 받는다');
  ws.send(JSON.stringify({ t: 'class', id: 'knight' }));
  ws.send(JSON.stringify({ t: 'move', x: 5, z: 8 }));
  await sleep(400);
  ws.close();
  await s.close();
  const saved = store.loadWorld();
  check(!!saved && !('tower' in saved) && 'mailbox' in saved, '틀만의 서버가 닫히며 저장한 월드에 등탑 칸이 없다');
}
