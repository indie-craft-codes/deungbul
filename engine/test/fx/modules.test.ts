// 모듈 고르기 (engine/shared/modules.ts): 같은 시험용 내용(모듈 전부를 적었다)으로 모듈을 줄여 띄우면, 뺀 모듈의 명령은 웹소켓으로 보내도 거절되고
// 그 모듈의 칸은 저장되지도 보내지지도 않는가. 모듈을 다 쓰는 서버(대조군)에서는 같은 명령에 응답이 온다.
import { ALL_MODULES, type ModuleId } from '../../shared/modules';
import { hasDungeonKeys } from '../../shared/defs';
import type { ServerMsg } from '../../shared/protocol';
import { Game } from '../../server/game/game';
import { startServer } from '../../server/net/server';
import { MemoryStore } from '../../server/store';
import { check, connect, settle } from '../harness';

/** 뺄 모듈: 사람들 사이의 것과 일일 임무·순위·던전(던전은 일일 임무에 기댄다) */
const OFF: ModuleId[] = ['party', 'guild', 'market', 'daily', 'rank', 'dungeon'];
const ON = ALL_MODULES.filter((m) => !OFF.includes(m));

/** 그 서버에 둘이 붙어 뺀 모듈의 명령을 보내고, 돌아온 메시지의 종류를 모은다 */
async function probe(modules: readonly ModuleId[]): Promise<{ types: string[]; meta: Extract<ServerMsg, { t: 'meta' }>[]; g: Game; ext: string[] }> {
  const s = await startServer(0, { store: new MemoryStore(), game: { modules } });
  const types: string[] = [], meta: Extract<ServerMsg, { t: 'meta' }>[] = [];
  const a = await connect(s.port, '모듈갑', 'modules-token-a-000001', (m) => { types.push(m.t); if (m.t === 'meta') meta.push(m); });
  const b = await connect(s.port, '모듈을', 'modules-token-b-000001');
  await settle(a, 2); // 접속 직후에 오는 것들을 먼저 다 받는다
  types.length = 0;
  for (const m of [
    { t: 'guild', a: 'create', name: '모듈길드' }, { t: 'market', a: 'list' }, { t: 'market', a: 'mine' }, { t: 'rank' },
    { t: 'party', a: 'invite', id: b.id }, { t: 'dungeon', id: 'nope' }, { t: 'gchat', text: '안녕' },
  ] as const) a.send(m as never);
  await settle(a, 2); // 보낸 명령을 다 처리하고 틱이 두 번 더 돈 뒤 (즉답이든 틱에서 나오는 답이든 이미 왔다)
  const g = s.game, e = g.ents.get(a.id)!;
  const ext = Object.keys(g.players.export(e).ext ?? {});
  a.ws.close(); b.ws.close();
  await s.close();
  return { types: [...new Set(types)], meta, g, ext };
}

{
  const off = await probe(ON);
  const full = await probe(ALL_MODULES);
  check(OFF.every((m) => !off.g.has(m)) && ['guild', 'market', 'rank', 'party', 'dungeon', 'gchat'].every((c) => !off.g.commands.has(c)), `뺀 모듈(${OFF.join(', ')})의 명령은 서버에 등록되어 있지 않다`);
  check(!off.types.some((t) => ['guild', 'market', 'rank', 'pinv', 'party', 'dungeon'].includes(t)), `뺀 모듈의 명령을 웹소켓으로 보내면 거절된다: 응답이 없다 (받은 것: ${off.types.join(', ') || '없음'})`);
  check(full.types.includes('rank') && full.types.includes('market'), `대조: 모듈을 다 쓰는 서버는 같은 명령에 응답한다 (${full.types.join(', ')})`);
  const lastOff = off.meta.at(-1), lastFull = full.meta.at(-1);
  check(!!lastOff && lastOff.daily === undefined && lastOff.power === undefined && Array.isArray(lastOff.gear) && Array.isArray(lastOff.mail) && !!lastFull?.daily && lastFull.power !== undefined,
    '장비·우편 메시지(meta)에는 고른 모듈의 칸만 온다: 일일 임무·전투력이 없고 장비·우편은 있다');
  check(!off.ext.includes('daily') && full.ext.includes('daily') && off.ext.includes('gear'), `캐릭터 저장의 칸도 고른 모듈의 것만이다 (뺀 서버 ${off.ext.join(', ')})`);
  check(!off.g.worldSaves.some((w) => ['guilds', 'market', 'rank'].includes(w.name)) && full.g.worldSaves.some((w) => w.name === 'guilds'), '월드 저장에도 뺀 모듈(길드, 거래소, 순위)의 칸이 없다');
}

// 틱: 전투를 뺀 게임에는 몬스터가 없고 틱도 돌지 않는다 (사람은 걷는다)
{
  const g = new Game({ modules: ['economy', 'items'] });
  check(![...g.ents.values()].some((e) => e.kind === 'm') && g.ticks.length === 3, `전투를 뺀 게임에는 몬스터가 놓이지 않고, 모듈의 틱이 없다 (틱 ${g.ticks.length}개: 핵심의 시계·원격 설정, 채널)`);
  const p = g.players.spawn('걷기', false);
  const x0 = p.x;
  g.movement.goTo(p, p.x + 5, p.z);
  for (let i = 0; i < 20; i++) g.tick(0.05);
  check(p.x > x0 + 3, `전투가 없어도 사람은 걷는다 (${(p.x - x0).toFixed(1)}m)`);
}

// 모듈을 꺼도 그 칸의 저장은 사라지지 않는다 (engine/shared/modules.ts의 MODULE_SAVES): 끈 게임이 읽고 다시 적은 저장을 다 켠 게임이 읽으면 그대로다
{
  const { MODULE_SAVES } = await import('../../shared/modules');
  const full = new Game();
  const playerNames = full.saves.map((s) => s.name), worldNames = full.worldSaves.map((s) => s.name).filter((n) => n !== 'sanctions');
  // 표의 칸 가운데 이 게임이 고른 모듈의 것 (팀은 RPG_MODULES에 없고, 골라도 TEAM_RULES.persist일 때만 저장한다: teams.test가 본다)
  // 던전의 열쇠(keys)는 열쇠를 쓰는 던전이 있는 게임만 저장한다 (시험용 내용의 던전은 하루 횟수만 쓴다)
  const pickedSaves = Object.entries(MODULE_SAVES.player).filter(([n, m]) => full.has(m) && (n !== 'keys' || hasDungeonKeys()));
  check(!hasDungeonKeys() && !full.saves.some((s) => s.name === 'keys') && !full.personal.some((x) => x.name === 'keys') && !full.commands.has('dungeonKey'),
    '열쇠를 쓰는 던전이 없는 게임(하루 횟수만)에는 열쇠의 저장 칸·개인 상태·명령이 없다 (등불지기의 던전과 같다)');
  check(['hero', 'gacha', 'squad', 'stage'].every((c) => !full.commands.has(c)) && !full.kinds.has('hero') && !full.saves.some((s) => ['roster', 'gacha', 'squad', 'stages'].includes(s.name)),
    'RPG_MODULES의 게임에는 수집형 모듈의 명령·영웅 종류·저장 칸이 없다');
  check(playerNames.every((n) => n in MODULE_SAVES.player) && worldNames.every((n) => n in MODULE_SAVES.world) && playerNames.length === pickedSaves.length,
    `모듈의 저장 칸 표(MODULE_SAVES)가 실제로 등록되는 칸과 같다 (캐릭터 ${playerNames.join(', ')} / 월드 ${worldNames.join(', ')})`);
  const p = full.players.spawn('맡김', false, null, 'kept-key');
  full.wallet.add(p, 'gold', 777, ''); full.classes.choose(p, 'knight');
  full.mail.send(p, 'idle', [10], { gold: 5 });
  const save = full.players.export(p);
  const world = full.exportWorld();
  // 재화·우편·직업을 끈 게임 (아이템과 장비도: 그것들이 재화에 기댄다)
  const lean = new Game({ modules: ['party'] });
  const q = lean.players.spawn(save.name, false, structuredClone(save), 'kept-key');
  const again = lean.players.export(q);
  lean.importWorld(structuredClone(world));
  const world2 = lean.exportWorld();
  check(again.gold === 777 && again.cls === 'knight' && JSON.stringify(again.ext?.mail) === JSON.stringify(save.ext?.mail) && again.lv === save.lv,
    '모듈을 끈 게임이 읽고 다시 적은 캐릭터 저장에도 그 모듈의 칸(골드, 직업, 레벨, 우편)이 그대로 남는다');
  check(JSON.stringify(world2.market) === JSON.stringify(world.market) && JSON.stringify(world2.guilds) === JSON.stringify(world.guilds) && JSON.stringify(world2.mailbox) === JSON.stringify(world.mailbox),
    '월드 저장의 끈 모듈 칸(거래소, 길드, 맡긴 우편)도 그대로 남는다');
  const back = new Game().players.spawn(again.name, false, again, 'kept-key');
  check(back.gold === 777 && back.cls === 'knight' && back.mail.length === p.mail.length, '다시 켠 게임은 그 칸을 이어서 읽는다 (골드, 직업, 우편)');
}
