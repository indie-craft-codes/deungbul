// 핵심만 쓰는 게임(선택 모듈 0개): 서버가 돌고, 접속하고, 움직이고, 게임이 등록한 엔티티 종류(공)가 시야 안의 화면에 값과 함께 동기화되는가.
// 고르지 않은 모듈의 명령은 웹소켓으로 직접 보내도 아무 일도 일어나지 않고, 저장·전송에 모듈의 칸이 생기지 않는가.
import { createHash } from 'node:crypto';
import { WebSocket } from 'ws';
import { BALL_SPOTS, MAP } from '@game/shared/content';
import { CLASSES, ITEMS, MONSTERS, MODULES } from '../../shared/defs';
import { ALL_MODULES, checkModules } from '../../shared/modules';
import type { EnterInfo, ServerMsg } from '../../shared/protocol';
import { AOI, AOI_LEAVE, SNAP_EVERY, TICK_MS } from '../../shared/world';
import { Game } from '../../server/game/game';
import { partOwner } from '../../server/game/parts';
import { startServer } from '../../server/net/server';
import { MemoryStore } from '../../server/store';
import { check, until } from '../harness';
import { balls } from './server/balls';

const keyOf = (token: string) => createHash('sha256').update(token).digest('hex');


// ---------- 내용과 모듈 ----------
{
  check(MODULES.length === 0 && Object.keys(CLASSES).length === 0 && Object.keys(MONSTERS).length === 0 && Object.keys(ITEMS).length === 0,
    '핵심만 쓰는 내용: 모듈 0, 직업 0, 몬스터 0, 아이템 0 (적지 않은 이름은 틀의 기본값인 빈 표다)');
  check(AOI === 20 && AOI_LEAVE === 24 && TICK_MS === 50 && SNAP_EVERY === 2, `시야와 주기를 내용의 NET에서 읽는다 (시야 ${AOI}m/${AOI_LEAVE}m, 틱 ${TICK_MS}ms, ${SNAP_EVERY}틱마다)`);
  const g = new Game({ plugins: [balls] });
  const cmds = [...g.commands.keys()].sort();
  check(cmds.join(',') === 'channel,move,pick,stop', `핵심만의 게임에 등록된 명령은 핵심(이동, 멈춤, 채널)과 게임이 단 것뿐이다 (${cmds.join(', ')})`);
  check(g.saves.length === 0 && g.personal.length === 0 && g.shared.length === 0 && g.perFlush.length === 0, '핵심만의 게임에는 캐릭터 저장 칸, 개인 상태, 공유 상태, 성장 수치 메시지가 하나도 없다');
  check(g.worldSaves.map((w) => w.name).sort().join(',') === 'kind.ball,sanctions', `월드 저장 칸은 핵심의 것(제재)과 게임의 종류(kind.ball)뿐이다 (${g.worldSaves.map((w) => w.name).join(', ')})`);
  check(ALL_MODULES.every((m) => !g.has(m)) && [...g.ents.values()].every((e) => e.kind === 'ball'), '고른 모듈이 없고, 월드에는 게임이 놓은 공뿐이다 (몬스터가 없다)');
  let msg = '';
  try { g.wallet.add(g.players.spawn('a', false), 'gold', 1, ''); } catch (err) { msg = String(err); }
  check(msg.includes("'economy'") && msg.includes('MODULES'), `고르지 않은 모듈의 시스템을 건드리면 무엇을 고르라는지 알리는 오류가 난다 (${msg.slice(0, 80)}…)`);
  // 틱이 돈다: 사람은 걷고(전투 모듈 없이), 공은 게임의 틱을 받는다
  const p = g.players.spawn('걷는이', false);
  // 나는 자리는 처음 서는 곳 둘레의 아무 데나다: 동쪽의 우물(x 10)에 막혀 돌아가면 덜 걷는다. 정해진 자리에서 서쪽으로 걷는다
  p.x = 0; p.z = 0;
  g.movement.goTo(p, p.x - 6, p.z);
  const x0 = p.x, b0 = [...g.ents.values()].find((e) => e.kind === 'ball')!;
  for (let i = 0; i < 20; i++) g.tick(0.05);
  check(x0 - p.x > 4 && Number(b0.data.age) > 0.9, `전투 모듈 없이도 사람이 걷고(${(x0 - p.x).toFixed(1)}m), 게임의 종류가 틱을 받는다`);
  const out = g.players.export(p);
  check(Object.keys(out).sort().join(',') === 'at,ext,name,seen,v' && Object.keys(out.ext ?? {}).length === 0, `핵심만의 캐릭터 저장에는 핵심의 칸만 있다 (${Object.keys(out).join(', ')})`);
}

// ---------- 모듈 고르기의 오류 ----------
{
  const err = (list: string[]): string => { try { checkModules(list); return ''; } catch (e) { return String(e); } };
  check(err(['market']).includes('market → items') && err(['market']).includes('market → mail'), '모듈의 의존이 빠지면 무엇이 빠졌는지 알린다 (market → items, gear, mail, economy)');
  check(err(['economy', 'combat']).includes('combat → classes') && err(['fly']).includes('모르는 모듈') && err([]) === '' && err(ALL_MODULES) === '', '모르는 모듈은 오류, 빈 목록과 전부는 된다');
  let thrown = '';
  try { new Game({ modules: ['dungeon'] }); } catch (e) { thrown = String(e); }
  check(thrown.includes('dungeon → combat'), '빠진 의존이 있으면 게임을 만들 때 멈춘다');
}

// ---------- 서버: 접속, 이동, 공의 동기화, 끈 모듈의 명령 ----------
{
  const store = new MemoryStore();
  const s = await startServer(0, { store, game: { plugins: [balls] } });
  const token = 'core-token-0000000001';
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
  const got: ServerMsg[] = [];
  ws.on('message', (data) => { got.push(JSON.parse(data.toString()) as ServerMsg); });
  await new Promise((ok, fail) => { ws.on('open', ok); ws.on('error', fail); });
  const send = (m: Record<string, unknown>) => ws.send(JSON.stringify(m));
  /** 서버가 앞서 보낸 메시지를 다 처리하고(ping → pong) 스냅샷을 두 번 더 보낼 때까지 기다린다: '아무 일도 없다'를 벽시계로 자지 않고 본다 */
  let pingNo = 1;
  const settled = async () => {
    const c = pingNo++;
    send({ t: 'ping', c });
    await until(() => got.some((m) => m.t === 'pong' && m.c === c));
    const n = got.filter((m) => m.t === 'snap').length;
    await until(() => got.filter((m) => m.t === 'snap').length >= n + 2);
  };
  send({ t: 'join', name: '공줍기', token });
  await until(() => got.some((m) => m.t === 'welcome'));
  const welcome = got.find((m): m is Extract<ServerMsg, { t: 'welcome' }> => m.t === 'welcome')!;
  const snaps = () => got.filter((m): m is Extract<ServerMsg, { t: 'snap' }> => m.t === 'snap');
  await until(() => snaps().some((m) => (m.enter ?? []).length > 0));
  const entered: EnterInfo[] = snaps().flatMap((m) => m.enter ?? []);
  const seenBalls = entered.filter((e) => e.kind === 'ball');
  const states = snaps().flatMap((m) => m.ents);
  const stateOf = (id: number) => states.filter((st) => st[0] === id).at(-1);
  const inSight = BALL_SPOTS.filter((b) => Math.hypot(b.x - MAP.spawn.x, b.z - MAP.spawn.z) < AOI - 6).length;
  check(welcome.id > 0 && seenBalls.length === inSight && seenBalls.every((b) => b.type === 'gold'), `접속하면 시야(${AOI}m) 안의 공 ${inSight}개만 종류 'ball'로 들어온다 (먼 공은 오지 않는다)`);
  check(seenBalls.every((b) => { const st = stateOf(b.id); return st?.length === 7 && st[5] === 1 && st[6] === 0; }), '공의 상태에는 게임이 정한 값 둘(빛남 1, 주운 사람 0)이 붙어 온다 (전투가 없어 체력 칸 없이 [id, x, z, 방향, 이동, …값])');
  check(entered.every((e) => !('hp' in e) && !('maxHp' in e) && !('w' in e) && !('c' in e)), '전투·아이템·직업이 없는 게임: 들어오는 엔티티에 체력·무기·직업 칸이 없다');
  check(!got.some((m) => m.t === 'stat' || m.t === 'meta'), '핵심만의 서버는 성장 수치(stat)와 장비·우편(meta) 메시지를 보내지 않는다');

  // 움직인다: 첫 공 곁으로
  const target = BALL_SPOTS[0];
  send({ t: 'move', x: target.x, z: target.z - 1.2 });
  const near = await until(() => { const you = snaps().at(-1)?.you; return !!you && Math.hypot(you[0] - target.x, you[1] - (target.z - 1.2)) < 0.6; }, 20_000);
  const me = s.game.ents.get(welcome.id)!;
  check(near && Math.hypot(me.x - target.x, me.z - (target.z - 1.2)) < 0.6, `이동 명령으로 서버의 내 자리가 옮겨지고 스냅샷의 you가 따라온다 (${me.x.toFixed(1)}, ${me.z.toFixed(1)})`);

  // 게임의 명령으로 공을 줍는다: 바뀐 값이 화면에 다시 온다
  const ball = seenBalls.find((b) => Math.hypot(b.x - target.x, b.z - target.z) < 0.5)!;
  const before = got.length;
  send({ t: 'pick' });
  const picked = await until(() => got.slice(before).some((m) => m.t === 'snap' && m.ents.some((st) => st[0] === ball.id && st[6] === welcome.id && st[5] === 0)));
  check(picked, '공을 주우면 그 공의 값(빛남 0, 주운 사람 = 나)이 바뀌어 다시 온다');

  // 고르지 않은 모듈의 명령: 무엇을 보내도 응답도 상태 변화도 없다
  const RPG = [
    { t: 'attack', id: ball.id }, { t: 'skill', n: 0 }, { t: 'class', id: 'knight' }, { t: 'buy', id: 'potion' }, { t: 'use', id: 'potion' }, { t: 'craft', id: 'x' },
    { t: 'equip', uid: 1 }, { t: 'enhance', uid: 1 }, { t: 'salvage', uids: [1] }, { t: 'bagUp' }, { t: 'mailClaim', id: 0 }, { t: 'stat', k: 'pow' },
    { t: 'skillUp', id: 'x' }, { t: 'party', a: 'leave' }, { t: 'guild', a: 'create', name: '길드' }, { t: 'gchat', text: '안녕' },
    { t: 'market', a: 'list' }, { t: 'rank' }, { t: 'dungeon', id: 'x' }, { t: 'auto', on: true },
  ];
  const mark = got.length;
  for (const m of RPG) send(m);
  await settled();
  const replies = got.slice(mark).filter((m) => m.t !== 'snap' && m.t !== 'pong').map((m) => m.t);
  check(RPG.every((m) => !s.game.commands.has(m.t)), `고르지 않은 모듈의 명령 ${RPG.length}가지는 서버에 등록되어 있지 않다`);
  // 상태 그대로: 모듈의 칸(자동 사냥, 직업, 골드, 노리는 대상 …)이 엔티티에 생기지 않았다 (핵심만의 엔티티에는 처음부터 없다: engine/server/game/parts.ts)
  const stray = Object.keys(me).filter((k) => partOwner(k) !== undefined);
  check(replies.length === 0 && ws.readyState === ws.OPEN && stray.length === 0, `웹소켓으로 직접 보내도 거절된다: 응답 없음(${replies.join(',') || '0개'}), 연결 유지, 상태 그대로 (모듈의 칸 ${stray.join(',') || '없음'})`);

  // 저장: 이름을 바꾸면 저장된다. 핵심의 칸만 있다
  send({ t: 'rename', name: '공지기' });
  await until(() => store.loadPlayer(keyOf(token)) !== null);
  const save = store.loadPlayer(keyOf(token));
  check(!!save && Object.keys(save).sort().join(',') === 'at,ext,name,seen,v' && Object.keys(save.ext ?? {}).length === 0, `핵심만의 캐릭터 저장에는 모듈의 칸이 없다 (${save ? Object.keys(save).join(', ') : '없음'})`);
  ws.close();
  await until(() => !s.game.ents.has(welcome.id));
  await s.close();
  // 월드 저장의 공: 다시 켜면 그대로 (주운 공은 빛나지 않는다)
  const world = store.loadWorld()!;
  const kept = world['kind.ball'] as { glow: number }[];
  check(Array.isArray(kept) && kept.length === BALL_SPOTS.length && kept.filter((b) => b.glow === 0).length === 1, `게임의 종류(save를 준 것)는 월드와 함께 저장된다 (kind.ball ${Array.isArray(kept) ? kept.length : 0}개, 주운 것 1개)`);
  const g2 = new Game({ plugins: [balls] });
  g2.importWorld(world);
  const back = [...g2.ents.values()].filter((e) => e.kind === 'ball');
  check(back.length === BALL_SPOTS.length && back.filter((b) => b.data.glow === 0).length === 1, '다시 켜면 처음 놓은 공을 지우고 저장된 공으로 되살린다 (둘이 겹치지 않는다)');
}

// ---------- 종류 등록의 오류 ----------
{
  const g = new Game();
  const bad = (f: () => void): boolean => { try { f(); return false; } catch { return true; } };
  check(bad(() => g.defineKind('p', {})) && bad(() => g.defineKind('Ball', {})) && bad(() => g.place('nope', { x: 0, z: 0 })), "틀의 종류('p', 'm'), 이상한 이름, 등록하지 않은 종류는 오류로 알린다");
}

// ---------- 화면의 뼈대: 모듈의 요소 ----------
{
  const { SKELETON } = await import('../../client/hud/skeleton');
  const marks = [...SKELETON.matchAll(/data-mod="([^"]*)"/g)].map((m) => m[1]);
  const bad = marks.flatMap((m) => m.split(/\s+/)).filter((m) => !(ALL_MODULES as readonly string[]).includes(m));
  // 핵심만의 게임에서 빠지는 요소: 체력·경험치 막대, 재화, 가방, 기술 단추, 대상 창, 상점, 직업 고르기 …
  const ids = (re: RegExp) => [...SKELETON.matchAll(re)].map((m) => m[1]);
  const modIds = ids(/id="(\w+)"[^>]*data-mod=/g);
  check(marks.length >= 18 && bad.length === 0 && ['bagBtn', 'skills', 'tgt', 'shop', 'classPick', 'autoBtn', 'tabBtn', 'party', 'bag'].every((id) => modIds.includes(id)),
    `뼈대의 모듈 요소(data-mod ${marks.length}곳)는 아는 모듈 이름만 적고, 가방·기술·대상·상점·직업 고르기·자동 사냥이 모듈의 것으로 표시되어 있다${bad.length ? ': 모르는 ' + bad.join(', ') : ''}`);
  check(['myName', 'menuBtn', 'lang', 'chat', 'minimap', 'mapBtn', 'wmap', 'menu', 'gate', 'pcard'].every((id) => SKELETON.includes(`id="${id}"`) && !modIds.includes(id)), '이름·메뉴·언어·대화·지도·접속 화면·사람 카드는 핵심이다 (모든 게임에 있다)');
}

// ---------- 전투 없이 재화·아이템·성장만 고른 게임 ----------
{
  const modules = ['economy', 'growth', 'items', 'mail', 'daily', 'idle', 'party', 'rank'] as const;
  const store = new MemoryStore();
  const s = await startServer(0, { store, game: { modules, plugins: [balls] } });
  const g = s.game;
  const ws = new WebSocket(`ws://127.0.0.1:${s.port}`);
  const got: ServerMsg[] = [];
  ws.on('message', (data) => { got.push(JSON.parse(data.toString()) as ServerMsg); });
  await new Promise((ok, fail) => { ws.on('open', ok); ws.on('error', fail); });
  ws.send(JSON.stringify({ t: 'join', name: '가게', token: 'core-token-shop-00001' }));
  await until(() => got.some((m) => m.t === 'welcome'));
  const id = (got.find((m) => m.t === 'welcome') as { id: number }).id, p = g.ents.get(id)!;
  g.wallet.add(p, 'gold', 50, ''); g.wallet.add(p, 'exp', 1000, '');
  await until(() => got.some((m) => m.t === 'stat' && m.gold === 50));
  const stat = got.filter((m): m is Extract<ServerMsg, { t: 'stat' }> => m.t === 'stat').at(-1)!;
  check(!g.has('combat') && stat.gold === 50 && (stat.lv ?? 0) > 1 && stat.maxHp === undefined && stat.cls === undefined && stat.items !== undefined,
    `전투·직업 없이 재화·성장·아이템만 고른 게임: 골드와 레벨이 오르고, 본인에게 그 칸만 간다 (체력·직업 칸이 없다: Lv${stat.lv})`);
  ws.send(JSON.stringify({ t: 'rank' }));
  await until(() => got.some((m) => m.t === 'rank'));
  check(got.some((m) => m.t === 'rank') && !g.commands.has('attack') && !g.commands.has('class') && g.commands.has('buy'), '그 게임에는 상점·순위의 명령이 있고 공격·직업의 명령은 없다');
  ws.close();
  await s.close();
}
