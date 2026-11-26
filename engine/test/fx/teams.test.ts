// 팀 모듈(engine/server/game/systems/teams.ts): 고르지 않으면 없다, 고르기·균형·옮기기, 자동으로 넣기, 나가면 빠짐, 팀과 사람의 점수, 점수판(공유 상태)과 내 팀(개인 상태),
// 사람에게 실리는 팀 번호(g.playerSync)와 게임의 값(syncAlso), 규칙 끄기(balance, switch), 저장(persist: 기본은 아무것도 저장하지 않는다), 실제 접속 둘.
import { MODULE_SAVES, RPG_MODULES } from '../../shared/modules';
import { TEAM_RULES } from '../../shared/defs';
import type { TeamBoard, TeamMe } from '../../shared/defs/teams';
import { Game } from '../../server/game/game';
import type { Ent } from '../../server/game/entity';
import { startServer } from '../../server/net/server';
import { MemoryStore } from '../../server/store';
import { check, connect, until } from '../harness';

const RULES = { ...TEAM_RULES };
const rules = (r: Partial<typeof RULES>) => Object.assign(TEAM_RULES, RULES, r);
const make = () => new Game({ modules: ['teams'] });
const said = (g: Game, p: Ent, k: string) => g.notices.some((n) => n.id === p.id && n.k === k);

// ---------- 고르지 않으면 없다 ----------
{
  const g = new Game();
  check(!RPG_MODULES.includes('teams') && !g.has('teams') && !g.commands.has('team') && !('teams' in g.state()), 'RPG_MODULES에는 팀이 없고, 고르지 않은 게임에는 명령·점수판이 없다');
  let threw = '';
  try { void g.teams.list; } catch (e) { threw = (e as Error).message; }
  check(threw.includes("'teams'"), `고르지 않은 모듈의 칸을 건드리면 무엇을 고르라는지 알린다 (${threw.slice(0, 40)}…)`);
  check(g.playerVals === null, '팀을 고르지 않은 게임은 사람에게 값을 싣지 않는다 (상태 줄이 예전과 같다)');
}

// ---------- 고르기, 균형, 옮기기 (팀 셋) ----------
{
  rules({});
  const g = make();
  const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((n) => g.players.spawn(n, false));
  check(g.commands.has('team') && g.teams.list.length === 3 && g.teams.index(a) === -1 && g.teams.of(a) === undefined, '처음에는 팀이 없다 (of는 undefined, index는 -1)');
  g.command(a, { t: 'team', team: 0 });
  check(g.teams.index(a) === 0 && g.teams.of(a)?.id === 'red' && said(g, a, 'teamJoined'), '빈 경기에서는 아무 팀이나 고른다 (of(p)가 팀의 정의)');
  g.notices = [];
  g.command(b, { t: 'team', team: 0 });
  check(g.teams.index(b) === -1 && said(g, b, 'teamFull'), '사람이 더 많은 팀으로는 갈 수 없다 (1 : 0 : 0에서 빨강으로)');
  g.command(b, { t: 'team', team: 1 });
  g.notices = [];
  g.command(c, { t: 'team', team: 1 });
  check(g.teams.index(c) === -1 && said(g, c, 'teamFull'), '팀이 셋이면 가장 적은 다른 팀(초록 0)과 견준다 (1 : 1 : 0에서 파랑으로 못 간다)');
  g.command(c, { t: 'team', team: 2 });
  g.command(d, { t: 'team', team: 1 });
  check(g.teams.index(d) === 1 && g.teams.count(1) === 2, '모두 같으면 어디로나 (1 : 1 : 1에서 파랑으로)');
  g.command(b, { t: 'team', team: 2 });
  check(g.teams.index(b) === 2 && g.teams.count(1) === 1 && g.teams.count(2) === 2, '옮길 때는 나를 빼고 센다 (1 : 2 : 1에서 파랑의 하나가 초록으로)');
  g.notices = [];
  g.command(e, { t: 'team', team: 2 });
  check(g.teams.index(e) === -1 && said(g, e, 'teamFull'), '1 : 1 : 2에서 초록으로는 못 간다');
  for (const bad of [3, -1, '0', null, 0.5, NaN, undefined]) g.command(e, { t: 'team', team: bad });
  check(g.teams.index(e) === -1, '없는 팀 번호와 이상한 값은 무시한다');
  check(g.teams.auto(e) === 0 && g.teams.index(e) === 0, '자동으로 넣기: 가장 적은 팀 (같으면 앞 팀)');
  check(JSON.stringify(g.teams.board()) === JSON.stringify({ score: [0, 0, 0], count: [2, 1, 2] }) && JSON.stringify((g.state() as { teams: TeamBoard }).teams.count) === '[2,1,2]', '점수판: 팀마다의 점수와 사람 수 (공유 상태 teams)');
  check([...g.teams.members(2)].map((p) => p.name).sort().join() === 'b,c' && g.teams.size === 5, '팀의 사람들');
  g.fire('playerLeft', a.id);
  check(g.teams.index(a.id) === -1 && g.teams.count(0) === 1, '나가면 팀에서 빠진다');
  g.teams.set(d, -1);
  check(g.teams.index(d) === -1, '게임이 규칙을 보지 않고 넣고 뺀다 (set, -1이면 뺀다)');
  g.teams.set(d, 0);
  check(g.teams.index(d) === 0, 'set은 균형을 보지 않는다');
}

// ---------- 점수 ----------
{
  rules({});
  const g = make();
  const p = g.players.spawn('striker', false), q = g.players.spawn('keeper', false);
  g.command(p, { t: 'team', team: 0 }); g.command(q, { t: 'team', team: 1 });
  g.teams.add(0); g.teams.add(0); g.teams.add(1, 3); g.teams.add(7); g.teams.add(0, NaN);
  check(g.teams.score(0) === 2 && g.teams.score(1) === 3 && g.teams.leader() === 1, '팀에 점수를 더한다 (없는 팀과 수가 아닌 값은 무시), 가장 많은 팀');
  g.teams.addPlayer(p, 2);
  check(g.teams.playerScore(p) === 2 && g.teams.playerScore(q) === 0, '사람마다의 점수');
  const personal = g.personal.find((x) => x.name === 'team')!;
  check(JSON.stringify(personal.state(p) as TeamMe) === JSON.stringify({ i: 0, score: 2 }), '내 팀과 내 점수는 개인 상태(team)로 간다');
  g.teams.add(0);
  check(g.teams.leader() === -1, '같으면 앞선 팀이 없다');
  g.teams.reset();
  check(g.teams.score(0) === 0 && g.teams.score(1) === 0 && g.teams.playerScore(p) === 2, '새 판: 팀의 점수만 0 (사람의 점수는 그대로)');
  g.teams.reset(true);
  check(g.teams.playerScore(p) === 0, 'reset(true)는 사람의 점수도 0');
  // 사람에게 실리는 값: [팀 번호, …게임의 값]
  check(JSON.stringify(g.playerVals?.(p)) === '[0]' && JSON.stringify(g.playerVals?.(g.players.spawn('x', false))) === '[-1]', '사람의 상태 줄에 팀 번호가 실린다 (없으면 -1)');
  g.teams.syncAlso((e) => [e.name.length]);
  check(JSON.stringify(g.playerVals?.(p)) === '[0,7]', '게임의 값은 syncAlso로 팀 번호 뒤에');
}

// ---------- 규칙 끄기: 균형 없음, 옮기기 없음 ----------
{
  rules({ balance: false, switch: false });
  const g = make();
  const [a, b] = ['a', 'b'].map((n) => g.players.spawn(n, false));
  g.command(a, { t: 'team', team: 0 }); g.command(b, { t: 'team', team: 0 });
  check(g.teams.count(0) === 2, 'balance가 꺼지면 많은 팀으로도 간다');
  g.notices = [];
  g.command(a, { t: 'team', team: 1 });
  check(g.teams.index(a) === 0 && said(g, a, 'teamStay'), 'switch가 꺼지면 팀을 옮길 수 없다고 알린다');
  rules({});
}

// ---------- 저장: 기본은 아무것도, persist면 사람의 팀·점수와 팀의 점수 ----------
{
  rules({});
  const g = make();
  const p = g.players.spawn('saver', false, null, 'key-1');
  g.command(p, { t: 'team', team: 1 }); g.teams.add(1, 4); g.teams.addPlayer(p, 3);
  const save = g.players.export(p), world = g.exportWorld();
  check(save.ext?.teams === undefined && world.teams === undefined && !g.saves.some((s) => s.name === 'teams'), '기본(persist 꺼짐)은 아무것도 저장하지 않는다');

  rules({ persist: true });
  const h = make();
  const q = h.players.spawn('saver', false, null, 'key-2');
  h.command(q, { t: 'team', team: 2 }); h.teams.add(2, 5); h.teams.addPlayer(q, 3);
  const s2 = h.players.export(q), w2 = h.exportWorld();
  check(JSON.stringify(s2.ext?.teams) === JSON.stringify({ t: 'green', s: 3 }) && JSON.stringify(w2.teams) === JSON.stringify({ red: 0, blue: 0, green: 5 }) && q.unsaved,
    `persist: 캐릭터에 팀 id와 점수, 월드에 팀 id → 점수 (${JSON.stringify(s2.ext?.teams)} / ${JSON.stringify(w2.teams)})`);
  check(MODULE_SAVES.player.teams === 'teams' && MODULE_SAVES.world.teams === 'teams', '저장 칸은 모듈의 저장 칸 표(MODULE_SAVES)에 있다');
  const k = make();
  k.importWorld(structuredClone(w2));
  const back = k.players.spawn('saver', false, structuredClone(s2), 'key-2');
  check(k.teams.index(back) === 2 && k.teams.playerScore(back) === 3 && k.teams.score(2) === 5, '다시 읽으면 같은 팀, 같은 점수');
  const odd = k.players.spawn('odd', false, { name: 'odd', ext: { teams: { t: 'purple', s: 'x' } } }, 'key-3');
  check(k.teams.index(odd) === -1 && k.teams.playerScore(odd) === 0, '없는 팀 id와 깨진 점수는 버린다');
  // 모듈을 끈 게임은 그 칸을 읽은 그대로 두었다가 다시 적는다
  const off = new Game({ modules: [] });
  const kept = off.players.spawn('saver', false, structuredClone(s2), 'key-2');
  off.importWorld(structuredClone(w2));
  check(JSON.stringify(off.players.export(kept).ext?.teams) === JSON.stringify(s2.ext?.teams) && JSON.stringify(off.exportWorld().teams) === JSON.stringify(w2.teams), '팀을 끈 게임도 저장된 팀 칸을 지우지 않는다');
  rules({});
}

// ---------- 실제 접속 둘: 고르기, 점수판, 상태 줄의 팀 번호 ----------
{
  rules({});
  const server = await startServer(0, { store: new MemoryStore(), game: { modules: ['teams'] } });
  const g = server.game;
  const boards: TeamBoard[][] = [[], []], mine: TeamMe[][] = [[], []];
  const listen = (i: number) => (m: { t: string; s?: unknown; k?: string }) => {
    if (m.t === 'world') { const b = (m.s as { teams?: TeamBoard }).teams; if (b) boards[i].push(b); }
    if (m.t === 'me' && m.k === 'team') mine[i].push(m.s as TeamMe);
  };
  try {
    const a = await connect(server.port, 'Ann', undefined, listen(0));
    const b = await connect(server.port, 'Ben', undefined, listen(1));
    a.send({ t: 'team', team: 0 });
    await until(() => mine[0].at(-1)?.i === 0);
    b.send({ t: 'team', team: 0 });
    await until(() => b.sys.some((s) => s.startsWith('teamFull')));
    b.send({ t: 'team', team: 1 });
    await until(() => mine[1].at(-1)?.i === 1 && boards[0].at(-1)?.count.join() === '1,1,0');
    check(boards[0].at(-1)?.count.join() === '1,1,0' && b.sys.some((s) => s.startsWith('teamFull')), '접속한 둘이 팀을 고르고 점수판의 사람 수가 두 화면에 간다');
    await until(() => a.lines.get(b.id)?.at(-1) === 1 && b.lines.get(a.id)?.at(-1) === 0 && a.youRaw.at(-1) === 0);
    check(a.lines.get(b.id)?.at(-1) === 1 && b.lines.get(a.id)?.at(-1) === 0 && a.youRaw.at(-1) === 0, `남의 팀은 상태 줄의 끝에, 내 팀은 you의 끝에 (${JSON.stringify(a.lines.get(b.id))})`);
    g.teams.add(1, 2); g.teams.addPlayer(g.ents.get(b.id)!, 1);
    await until(() => boards[0].at(-1)?.score.join() === '0,2,0' && mine[1].at(-1)?.score === 1);
    check(boards[0].at(-1)?.score.join() === '0,2,0' && mine[1].at(-1)?.score === 1, '점수가 오르면 점수판과 내 점수가 간다');
    a.ws.close();
    await until(() => boards[1].at(-1)?.count.join() === '0,1,0');
    check(boards[1].at(-1)?.count.join() === '0,1,0', '나가면 점수판에서 빠진다');
    b.ws.close();
  } finally {
    await server.close();
  }
}
