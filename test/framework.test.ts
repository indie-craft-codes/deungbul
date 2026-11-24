// 틀과 게임을 가르는 작업의 안전망과 경계 (docs/framework-plan.md의 단계 0과 1).
// 구조를 고치다가 맵의 배치가 달라지거나 옛 저장이 다르게 읽히면 여기서 잡힌다.
//   - 맵 지문: buildWorld()가 놓는 장애물·나무·바위와 길찾기 격자가 그대로인가
//   - 저장 왕복: 견본(test/fixtures/)을 읽어 캐릭터와 월드를 만든 뒤 다시 저장한 값이 견본과 같은가
//   - 프로토콜 번호: 서버가 welcome에 번호를 싣는가
//   - 틀만의 게임: 규칙 플러그인 없이(plugins: []) 만든 게임과 서버가 도는가
//   - 의존 방향: 틀의 서버 파일이 이 게임의 규칙을 import하지 않는가
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { CHANNEL, DUNGEONS, SHOP, SPAWN } from '../shared/defs';
import { NavGrid } from '../shared/nav';
import { PROTOCOL, type ServerMsg } from '../shared/protocol';
import { PLAYER_SPEED, TOWER, buildWorld } from '../shared/world';
import type { Ent } from '../server/game/entity';
import { Game } from '../server/game/game';
import { channelOf, isField } from '../server/game/layers';
import { startServer } from '../server/net/server';
import { MemoryStore, type PlayerSave, type WorldSave } from '../server/store';
import { check, sleep } from './harness';

const fixture = <T>(name: string): T => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
const hash = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex').slice(0, 16);
/** 두 값이 다른 자리의 목록 (칸의 순서는 따지지 않는다). 같으면 빈 목록 */
function diff(a: unknown, b: unknown, at = ''): string[] {
  if (a === b) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return [`${at || '(전체)'}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
  const A = a as Record<string, unknown>, B = b as Record<string, unknown>;
  return [...new Set([...Object.keys(A), ...Object.keys(B)])].flatMap((k) => diff(A[k], B[k], at ? `${at}.${k}` : k));
}
/** 'YYYY-M-D' 꼴 날짜의 낮 12시 (서버 현지 시간). 날짜를 못 읽으면 정해 둔 날 */
function noonOf(day: unknown): number {
  const m = typeof day === 'string' ? /^(\d+)-(\d+)-(\d+)$/.exec(day) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : new Date(2026, 0, 10, 12).getTime();
}

// ---------- 맵 지문 ----------
// 값이 달라졌다면 맵이 달라진 것이다: 서버의 충돌 판정, 길찾기, 화면의 나무와 바위가 모두 바뀐다.
// 맵을 일부러 고친 것이 아니라면(정의를 옮기기만 했다면) 장애물을 넣는 순서나 난수를 쓰는 횟수가 바뀌지 않았는지 본다.
{
  const w = buildWorld();
  const f = (n: number) => n.toFixed(3);
  const text = [
    w.obstacles.map((o) => `${f(o.x)},${f(o.z)},${f(o.r)}`).join(';'),
    w.trees.map((d) => `${f(d.x)},${f(d.z)},${f(d.s)},${f(d.rot)}`).join(';'),
    w.rocks.map((d) => `${f(d.x)},${f(d.z)},${f(d.s)},${f(d.rot)}`).join(';'),
  ].join('|');
  const counts = `${w.obstacles.length}/${w.trees.length}/${w.rocks.length}`;
  check(counts === '411/448/80', `맵의 장애물/나무/바위 수가 그대로다 (${counts})`);
  check(hash(text) === '30280907b7a7711f', `맵 지문이 그대로다: 장애물·나무·바위의 좌표와 크기 (${hash(text)})`);
  const blocked = (new NavGrid(w.obstacles) as unknown as { blocked: Uint8Array }).blocked;
  const n = blocked.reduce((sum, v) => sum + v, 0);
  check(n === 17461 && hash(blocked) === '03e74551f70ac7e0', `길찾기 격자의 막힌 칸이 그대로다 (${n}칸, ${hash(blocked)})`);
}

// ---------- 캐릭터 저장의 왕복 ----------
// 견본을 읽어 캐릭터를 만들고 곧바로 다시 저장한다. 견본에 있던 칸은 값이 그대로여야 한다.
// 비교에서 빼거나 다듬어 비교하는 칸 (지금 코드가 원래 그렇게 읽는 것):
//   seen           저장한 시각이다. 떠나 있던 시간이 0이 되도록 시험이 '지금'으로 바꿔 넣는다 (방치 보상과 휴식 보너스가 붙지 않게)
//   ext.vitals     나갈 때의 몸 상태(체력 비율, 쿨다운, 저장 시각)라 접속할 때마다 새로 적힌다
//   items          0개짜리 줄은 읽을 때 버린다 ({ potion: 0 } → {})
//   ext.build      비어 있던 능력치 칸이 0으로 채워진다 ({} → { pow: 0, … }). 0인 칸은 없는 것으로 보고 비교한다
//   ext.gear       목록의 순서(낀 것이 앞으로 온다)는 따지지 않는다. 낀 무기가 없던 저장은 든 무기(weapon)를 낱개 장비로 새로 받으므로,
//                  '견본의 장비가 모두 그대로 있고 끼고 있던 것을 그대로 끼고 있다'까지만 본다
// 견본에 없던 칸(옛 저장의 ext, armor, at 등)은 새로 생기는 것이라 따지지 않는다. 대신 한 번 더 왕복해서 그대로인지 본다.
{
  const samples = fixture<{ note: string; save: PlayerSave }[]>('players');
  type Bag = Record<string, unknown>;
  type GearSave = { list: { uid: number }[]; worn: Bag; seq: number };
  const nonZero = (o: unknown): Bag => Object.fromEntries(Object.entries((o ?? {}) as Bag).filter(([, v]) => v !== 0));
  /** 비교할 모양으로 다듬는다 (위의 목록) */
  const norm = (s: PlayerSave): Bag => {
    const { seen: _seen, ext, ...rest } = structuredClone(s);
    const { vitals: _vitals, ...kept } = (ext ?? {}) as Bag;
    if (kept.build) { const b = kept.build as { stats?: unknown; skillLv?: unknown }; kept.build = { stats: nonZero(b.stats), skillLv: b.skillLv ?? {} }; }
    if (kept.gear) { const gear = kept.gear as GearSave; gear.list.sort((x, y) => x.uid - y.uid); }
    return { ...rest, ...(rest.items ? { items: nonZero(rest.items) } : {}), ext: kept };
  };
  /** 견본을 읽어 캐릭터를 만들고 다시 저장한 값 */
  const roundTrip = (save: PlayerSave, now: number, pid: string): PlayerSave => {
    const g = new Game({ now: () => now });
    const p = g.players.spawn(save.name, false, { ...structuredClone(save), seen: now }, pid);
    return structuredClone(g.players.export(p));
  };
  const bad: string[] = [];
  samples.forEach(({ save }, i) => {
    const now = noonOf(((save.ext ?? {}).daily as { last?: unknown } | undefined)?.last);
    const out = roundTrip(save, now, `fx-${i}`);
    const was = norm(save), is = norm(out), wasExt = was.ext as Bag, isExt = is.ext as Bag;
    const d: string[] = [];
    for (const k of Object.keys(was)) if (k !== 'ext') d.push(...diff(was[k], is[k], k));
    for (const k of Object.keys(wasExt)) {
      if (k !== 'gear') { d.push(...diff(wasExt[k], isExt[k], `ext.${k}`)); continue; }
      const a = wasExt.gear as GearSave, b = isExt.gear as GearSave;
      for (const it of a.list) d.push(...diff(it, b.list.find((x) => x.uid === it.uid), `ext.gear.list[uid ${it.uid}]`));
      for (const slot of Object.keys(a.worn)) d.push(...diff(a.worn[slot], b.worn[slot], `ext.gear.worn.${slot}`));
      if (b.seq < a.seq) d.push(`ext.gear.seq: ${a.seq} > ${b.seq}`);
    }
    // 한 번 더: 방금 저장한 값을 읽어 다시 저장하면 (시각과 몸 상태 말고는) 똑같아야 한다
    d.push(...diff(is, norm(roundTrip(out, now, `fx-${i}`))).map((x) => `다시 읽기 ${x}`));
    bad.push(...d.map((x) => `견본 ${i + 1} (${save.name}) ${x}`));
  });
  for (const line of bad) console.log('  ' + line);
  check(bad.length === 0, `캐릭터 저장 견본 ${samples.length}개를 읽어 다시 저장하면 값이 그대로다`);

  // 옛 칸이 캐릭터의 상태로 옳게 읽혔는지도 본다 (저장 칸을 옮기는 단계에서 읽는 길이 끊기지 않게)
  const old = samples.find((s) => s.save.ext === undefined && s.save.quest && s.save.quest[0] > 0 && (s.save.tier ?? 0) > 0)!.save;
  const g = new Game({ now: () => noonOf(null) });
  const p = g.players.spawn(old.name, false, { ...old, seen: noonOf(null) }, 'fx-old');
  check(p.qc === old.quest![0] && p.qs === old.quest![1] && p.qn === old.quest![2] && p.sparks === old.sparks && p.contrib === old.contrib && p.tier === old.tier && p.rested === old.rested && p.gold === old.gold && p.cls === old.cls,
    'ext가 없던 때의 저장에서 퀘스트·불씨·기여·기여 단계·휴식·골드·직업이 그대로 읽힌다');
  check(p.gear.some((x) => x.base === old.weapon && p.worn.weapon === x.uid) && p.mail.some((m) => m.k === 'attend'), 'ext가 없던 때의 캐릭터도 낀 무기를 낱개 장비로 받고, 그날의 출석 우편을 받는다');
}

// ---------- 월드 저장의 왕복 ----------
// 등탑지기 명단은 날이 바뀌면 비우므로, 시계를 저장된 날에 맞춘다.
{
  const samples = fixture<{ note: string; world: WorldSave; expect?: WorldSave }[]>('worlds');
  const bad: string[] = [];
  samples.forEach(({ world, expect }, i) => {
    const now = noonOf((world.keepers as { day?: unknown } | undefined)?.day);
    const g = new Game({ now: () => now });
    g.importWorld(structuredClone(world));
    const out = structuredClone(g.exportWorld());
    // 옛 형식은 읽으면 지금 형식으로 바뀐다: 견본에 적어 둔 '읽은 뒤의 모습'과 비교한다
    bad.push(...diff(expect ?? world, out).map((x) => `월드 견본 ${i + 1} ${x}`));
    const again = new Game({ now: () => now });
    again.importWorld(structuredClone(out));
    const out2 = structuredClone(again.exportWorld());
    // 등탑지기 명단의 날짜가 비어 있었으면(명단이 없던 옛 저장) 읽을 때 오늘로 채워진다: 그 칸은 따지지 않는다
    const k1 = out.keepers as { day: string }, k2 = out2.keepers as { day: string };
    if (k1.day === '') k2.day = '';
    bad.push(...diff(out, out2).map((x) => `월드 견본 ${i + 1} 다시 읽기 ${x}`));
  });
  for (const line of bad) console.log('  ' + line);
  check(bad.length === 0, `월드 저장 견본 ${samples.length}개(옛 형식 { glow, residents } 포함)를 읽어 다시 저장하면 값이 그대로다`);
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
// 규칙 플러그인 없이(plugins: []) 만든 게임: 등탑·습격·등탑지기·퀘스트가 없어도 바탕 기능이 돈다.
// 틀의 코드가 g.tower 같은 게임의 시스템을 건드리면 그 자리에서 예외가 나게 해 둔다.
{
  const now = noonOf(null);
  const g = new Game({ plugins: [], now: () => now });
  const bare = g as unknown as Record<string, unknown>;
  const GAME_ONLY = ['tower', 'raid', 'quests', 'keepers'];
  check(GAME_ONLY.every((k) => bare[k] === undefined), 'plugins: []로 만들면 등탑·습격·퀘스트·등탑지기 시스템이 없다');
  const touched: string[] = [];
  for (const k of GAME_ONLY) Object.defineProperty(g, k, { get() { touched.push(k); throw new Error(`틀이 게임의 시스템 g.${k}를 건드렸다`); } });
  check(Object.keys(g.state()).length === 0 && !('tower' in g.exportWorld()) && !('keepers' in g.exportWorld()), `공유 상태에 등탑·습격 칸이 없고, 월드 저장에도 등탑 칸이 없다 (월드 저장: ${Object.keys(g.exportWorld()).join(', ')})`);

  const run = (seconds: number) => { for (let i = 0; i < seconds * 20; i++) g.tick(0.05); };
  const said = (p: Ent) => g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  const cmd = (p: Ent, m: Record<string, unknown>) => { g.notices = []; g.out = []; g.command(p, m); };
  const hero = (name: string, pid: string) => { const p = g.players.spawn(name, false, null, pid); g.classes.apply(p, 'warrior'); p.lv = 12; p.gold = 5000; g.players.refresh(p); p.hp = p.maxHp; return p; };
  let threw = '';
  try {
    const p = hero('틀사람', 'bare-a'), mate = hero('틀동료', 'bare-b');
    g.players.spawn('Bot1', true);
    check(p.mail.some((m) => m.k === 'attend') && channelOf(p.layer) === 1, '접속하면 출석 우편을 받고 1채널에 선다');
    check(g.rules.siege === null && g.rules.unlocked('bram') && g.rules.speed(p) === PLAYER_SPEED && g.rules.canChangeClass(p), '규칙의 기본값: 몰려갈 곳이 없고, 잠긴 것이 없고, 걸음은 기본 속도이고, 직업은 어디서나 바꾼다');

    // 이동
    const from = { x: p.x, z: p.z };
    cmd(p, { t: 'move', x: p.x + 6, z: p.z + 4 });
    run(3);
    check(Math.hypot(p.x - from.x, p.z - from.z) > 5 && !p.moving, '이동: 찍은 곳까지 걸어간다');

    // 전투와 처치, 장비 줍기
    g.gear.random = () => 0; // 반드시 떨어뜨린다
    const m = [...g.ents.values()].find((e) => e.type === 'slime' && !e.dead && e.layer === p.layer)!;
    m.wait = 99; p.x = m.x + 1; p.z = m.z;
    const exp0 = p.exp + p.lv * 1e6, bag0 = p.gear.length;
    cmd(p, { t: 'attack', id: m.id });
    for (let i = 0; i < 400 && !m.dead; i++) g.tick(0.05);
    check(m.dead && p.exp + p.lv * 1e6 > exp0 && g.notices.some((n) => n.id === p.id && n.k === 'kill'), '전투: 몬스터를 쓰러뜨리면 경험치를 받는다');
    check(p.gear.length === bag0 + 1 && p.daily.prog.kill30 === 1, '처치하면 장비가 떨어져 가방에 들어오고, 일일 임무가 세어진다');
    g.gear.random = Math.random;

    // 상점: 잠금 규칙이 없으므로 모든 물건이 열려 있다
    p.x = SHOP.x + 1; p.z = SHOP.z;
    cmd(p, { t: 'buy', id: 'potion' }); cmd(p, { t: 'buy', id: 'sword3' });
    check(p.items.potion === 1 && p.weapon === 'sword3', '상점: 물약과 (이 게임에서는 주민이 돌아와야 풀리는) 등불검을 산다');

    // 우편
    const gold0 = p.gold;
    cmd(p, { t: 'mailClaim', id: 0 });
    check(p.mail.length === 0 && p.gold > gold0, '우편: 받은 우편을 열어 보상을 받는다');

    // 길드
    cmd(p, { t: 'guild', a: 'create', name: '틀모임' });
    check(g.guild.count === 1 && p.guild === '틀모임', '길드를 만든다');
    g.players.rename(p, '새이름');
    check(p.name === '새이름', '이름을 바꾼다 (등탑지기 명단이 없어도 된다)');

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
    const def = DUNGEONS.crypt;
    p.x = def.portal.x + 1; p.z = def.portal.z;
    cmd(p, { t: 'dungeon', id: 'crypt' });
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
    // 이 게임(등불지기)의 월드 저장을 틀만의 게임이 읽어도 죽지 않는다: 모르는 칸은 건너뛴다
    for (const { world: w } of fixture<{ world: WorldSave }[]>('worlds')) g2.importWorld(structuredClone(w));
    check(!('tower' in g2.exportWorld()), '등탑이 든 월드 저장과 옛 형식의 월드 저장을 읽어도, 모르는 칸은 건너뛴다');
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
  ws.send(JSON.stringify({ t: 'class', id: 'warrior' }));
  ws.send(JSON.stringify({ t: 'move', x: 5, z: 8 }));
  await sleep(400);
  ws.close();
  await s.close();
  const saved = store.loadWorld();
  check(!!saved && !('tower' in saved) && 'mailbox' in saved, '틀만의 서버가 닫히며 저장한 월드에 등탑 칸이 없다');
}

// ---------- 의존 방향 ----------
// 틀로 분류한 서버 파일은 이 게임의 규칙(등탑, 습격, 등탑지기, 퀘스트)과 그것을 까는 플러그인을 import하지 않는다.
// 게임 규칙(server/game)은 통신 계층(server/net)을 import하지 않는다. import 문을 읽어 검사한다 (타입만 가져오는 것도 센다).
// server/main.ts는 이 게임의 서버를 띄우는 진입점이라 검사하지 않는다 (플러그인을 고르는 자리다).
{
  const root = new URL('../', import.meta.url);
  const GAME_FILES = ['server/game/deungbul.ts', ...['tower', 'raid', 'keepers', 'quests'].map((n) => `server/game/systems/${n}.ts`)];
  /** 아직 지키지 못하는 것. 뒤의 단계가 줄여 간다 */
  const EXCEPTIONS = [
    // new Game()이 이 게임의 규칙을 기본으로 깐다 (기존 코드와 시험이 그렇게 쓴다). 시험을 틀과 게임으로 가를 때 기본값을 뒤집고 지운다
    'server/game/game.ts -> server/game/deungbul.ts',
  ];
  const list = (dir: string): string[] => fs.readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? list(`${dir}${d.name}/`) : d.name.endsWith('.ts') ? [`${dir}${d.name}`] : []));
  /** 그 파일이 import하는 저장소 안의 파일들 (상대 경로만 따라간다) */
  const importsOf = (file: string): string[] => {
    const src = fs.readFileSync(new URL(file, root), 'utf8');
    const specs = [...src.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]|\bdeclare\s+module\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4]);
    return specs.filter((sp) => sp.startsWith('.')).map((sp) => new URL(sp, new URL(file, root)).href.slice(root.href.length)).map((p) => (p.endsWith('.ts') ? p : `${p}.ts`));
  };
  const engine = [...list('server/game/'), ...list('server/net/'), ...list('server/store/'), 'server/text.ts'].filter((f) => !GAME_FILES.includes(f));
  const found: string[] = [];
  for (const f of engine) for (const to of importsOf(f)) if (GAME_FILES.includes(to)) found.push(`${f} -> ${to}`);
  const extra = found.filter((x) => !EXCEPTIONS.includes(x)), stale = EXCEPTIONS.filter((x) => !found.includes(x));
  for (const x of extra) console.log('  ' + x);
  check(engine.length >= 30 && importsOf('server/game/deungbul.ts').filter((x) => GAME_FILES.includes(x)).length === 4 && importsOf('server/net/server.ts').includes('server/game/game.ts'), `import 문을 읽어 낸다 (틀의 서버 파일 ${engine.length}개)`);
  check(extra.length === 0, `틀의 서버 파일은 이 게임의 규칙 시스템과 플러그인을 import하지 않는다 (예외 ${EXCEPTIONS.length}건)`);
  check(stale.length === 0, `예외 목록에 이미 풀린 것이 남아 있지 않다${stale.length ? `: ${stale.join(', ')}` : ''}`);
  const toNet = list('server/game/').flatMap((f) => importsOf(f).filter((to) => to.startsWith('server/net/')).map((to) => `${f} -> ${to}`));
  for (const x of toNet) console.log('  ' + x);
  check(toNet.length === 0, '게임 규칙(server/game)은 통신 계층(server/net)을 import하지 않는다');
}

// ---------- 뒤집은 결합이 그대로 도는가 (이 게임의 규칙이 깔린 게임) ----------
// 일일 임무는 'offered' 사건을 듣지 않고 등탑이 직접 알린다. 이름 바꾸기는 등탑지기를 직접 부르지 않고 사건으로 알린다.
{
  const now = noonOf(null);
  const g = new Game({ now: () => now });
  g.tower.load({ glows: [40, 0], residents: [30, 60, 100] }); // 할멈까지 돌아와 등탑지기의 일이 열려 있다
  const p = g.players.spawn('바치는이', false, null, 'offer-key');
  g.classes.apply(p, 'warrior');
  p.x = TOWER.x + 1; p.z = TOWER.z + 2; p.sparks = 50;
  g.notices = [];
  g.command(p, { t: 'offer', to: 'tower', n: 4 });
  check(p.daily.prog.offer10 === 4 && !p.daily.got.includes('offer10'), '불씨를 바치면 일일 임무(불씨 10개 바치기)가 그만큼 세어진다');
  g.command(p, { t: 'offer', to: 'tower', n: 7 });
  const keys = g.notices.filter((n) => n.id === p.id).map((n) => n.k);
  check(p.daily.prog.offer10 === 10 && p.daily.got.includes('offer10') && p.mail.some((m) => m.k === 'daily' && m.a[0] === 'offer10'), '10개를 채우면 임무 보상이 우편으로 온다 (넘친 것은 세지 않는다)');
  check(keys.join() === 'offered,offered,tierUp,mailNew', `안내문의 순서가 그대로다: 바침, 기여 단계 보상, 임무 우편 (${keys.join()})`);
  g.players.rename(p, '새이름');
  check(g.state().keepers.some((r) => r.name === '새이름' && r.n === 11), '이름을 바꾸면 등탑지기 명단의 내 줄도 따라 바뀐다');
  check(g.channels.busy?.() === false && g.channels.extraFoes?.() === undefined, '습격이 채널의 접점(바쁜 때, 남은 적)을 채워 두었다: 평소에는 바쁘지 않고 남은 적이 없다');
}

// ---------- 의존 방향: 클라이언트 (docs/framework-plan.md의 단계 6a) ----------
// 6a에서 가른 틀 쪽 화면 파일은 이 게임의 것을 직접 읽지 않고 rules(client/src/rules.ts)와 등록 접점(addNpc, onKey)을 거친다.
// 내용은 통로(shared/defs, shared/world)로 들어오므로 파일 경로만으로는 알 수 없다: 가져오는 이름까지 본다.
// 아직 못 지키는 파일(main.ts, state.ts, actions.ts, hud/panels.ts, hud/near.ts, hud/minimap.ts, scene/view.ts 등)은 6b와 7에서 풀리는 대로 CLEAN에 더한다.
{
  const root = new URL('../', import.meta.url);
  const read = (file: string): string => fs.readFileSync(new URL(file, root), 'utf8');
  /** 이번에 깨끗해진 틀 쪽 클라이언트 파일 */
  const CLEAN = ['rules.ts', 'bus.ts', 'input.ts', 'entities.ts', 'hud/shop.ts', 'hud/forge.ts', 'hud/notify.ts'].map((f) => `client/src/${f}`);
  /** 이 게임의 클라이언트 파일 (game/ 아래와, 아직 옮기지 않은 게임 전용 화면) */
  const isGameClient = (f: string): boolean => f.startsWith('client/src/game/') || ['client/src/hud/quest.ts', 'client/src/hud/marks.ts', 'client/src/scene/scenery.ts'].includes(f);
  /** 이 게임에만 있는 내용 정의 */
  const GAME_CONTENT = ['residents', 'tower', 'raid', 'quests'].map((n) => `shared/content/${n}.ts`);
  /** 그 내용 파일들이 내보내는 이름 + 맵 정의 가운데 이 게임의 것 + 클라이언트 상태 가운데 이 게임의 것 */
  const GAME_NAMES = new Set([
    ...GAME_CONTENT.flatMap((f) => [...read(f).matchAll(/^export\s+(?:const|function|type|interface|class|enum)\s+(\w+)/gm)].map((m) => m[1])),
    'TOWERS', 'TOWER', 'TOWN', 'POND', 'HOUSES', 'CLEARINGS', 'ZONE_SPLIT', 'ZONE_COUNT', 'zoneOf', 'onPath',
    'stage', 'zoneGlow', 'myZone', 'raidLeft',
  ]);
  /** 그 파일의 import: 저장소 안의 대상 파일과 가져오는 이름들 */
  const importsOf = (file: string): { to: string; names: string[] }[] =>
    [...read(file).matchAll(/\bimport\s+(?:type\s+)?(?:(\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s*)?['"](\.[^'"]+)['"]/g)].map((m) => ({
      to: new URL(m[2], new URL(file, root)).href.slice(root.href.length).replace(/(\.ts)?$/, '.ts'),
      names: (m[1] ?? '').startsWith('{') ? m[1].slice(1, -1).split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]).filter(Boolean) : [],
    }));
  const breaks = (file: string): string[] => [
    ...importsOf(file).flatMap((i) => [
      ...(isGameClient(i.to) || GAME_CONTENT.includes(i.to) ? [`${file} -> ${i.to}`] : []),
      ...i.names.filter((n) => GAME_NAMES.has(n)).map((n) => `${file} -> ${n} (${i.to})`),
    ]),
    // 공유 상태(S.world)와 퀘스트 진행(S.quest)의 모양은 이 게임의 것이다: 틀은 rules에 묻는다
    ...(/\bS\.(world|quest)\s*\./.test(read(file)) ? [`${file} -> S.world / S.quest`] : []),
  ];
  const found = CLEAN.flatMap(breaks);
  for (const x of found) console.log('  ' + x);
  const game = breaks('client/src/game/deungbul.ts');
  check(GAME_NAMES.has('RESIDENTS') && GAME_NAMES.has('speedFor') && GAME_NAMES.has('QUESTS') && ['RESIDENTS', 'speedFor', 'TOWERS', 'stage', 'S.world'].every((n) => game.some((x) => x.includes(n))) && game.some((x) => x.endsWith('-> client/src/hud/quest.ts')),
    `클라이언트의 import 문과 가져오는 이름을 읽어 낸다 (이 게임의 이름 ${GAME_NAMES.size}개, 게임 모듈에서 ${game.length}건)`);
  check(found.length === 0, `6a에서 가른 틀 쪽 화면 파일 ${CLEAN.length}개는 이 게임의 클라이언트 모듈과 게임 전용 내용(주민, 등탑, 습격, 퀘스트)을 import하지 않는다`);
  check(importsOf('client/src/modules.ts').some((i) => i.to === 'client/src/game/deungbul.ts') && !CLEAN.includes('client/src/modules.ts'), '이 게임의 클라이언트 모듈은 모듈 목록(modules.ts)만 안다');
}
