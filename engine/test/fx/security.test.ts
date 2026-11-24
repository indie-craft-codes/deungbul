// 악용 막기: 서버 허점 검토에서 실제로 재현된 것들이 다시 생기지 않게 지킨다. (시험용 내용 위에서)
import http from 'node:http';
import { WebSocket } from 'ws';
import { DUNGEONS } from '../../shared/defs';
import { AREAS, areaAt } from '../../shared/world';
import { Game } from '../../server/game/game';
import { isClean, mask, tidy } from '../../server/net/moderation';
import { startServer } from '../../server/net/server';
import { MemoryStore } from '../../server/store';
import { check, connect, sleep, until } from '../harness';

const get = (port: number, path: string): Promise<number> => new Promise((ok) => {
  const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => { res.resume(); ok(res.statusCode ?? 0); });
  req.on('error', () => ok(-1));
  req.end();
});

// ---- 게임 규칙 (서버 없이)
{
  const g = new Game();
  const mk = (name: string) => { const p = g.players.spawn(name, false, null, 'key-' + name); g.classes.apply(p, 'knight'); p.lv = 12; g.players.refresh(p); p.hp = p.maxHp; return p; };
  const a = mk('가'), b = mk('나');

  // 직업을 바꿔도 쿨다운은 남는다
  const m = [...g.ents.values()].find((e) => e.kind === 'm' && !e.dead)!;
  a.x = m.x + 1; a.z = m.z; a.targetId = m.id;
  g.command(a, { t: 'skill', n: 0 });
  const cd = a.cds[0];
  g.classes.apply(a, 'ranger'); g.classes.apply(a, 'knight');
  check(cd > 0 && a.cds[0] === cd, '직업을 바꿔도 기술 쿨다운은 지워지지 않는다');

  // 걸어서 갈 수 없는 다른 지역을 찍으면 지금 지역 안으로 맞춘다
  a.x = AREAS[0].x1 - 10; a.z = 0;
  g.command(a, { t: 'move', x: (AREAS[1].x0 + AREAS[1].x1) / 2, z: 0 });
  check(areaAt(a.tx, a.tz) === 0, '들판에서 던전 지역을 찍어도 목적지는 들판 안이다');
  // 이동 명령을 몰아 보내도 길찾기가 틱 예산을 넘지 않는다
  const t0 = performance.now();
  for (let i = 0; i < 400; i++) { g.clock += 0.07; g.command(a, { t: 'move', x: -42 + (i % 2) * 0.5, z: -18 }); g.tick(0.05); }
  const per = (performance.now() - t0) / 400;
  check(per < 25, `길 없는 곳을 400번 찍어도 틱이 예산(50ms)의 절반 안이다 (틱당 ${per.toFixed(2)}ms)`);
  g.command(a, { t: 'move', x: 0, z: 6 });
  g.command(a, { t: 'move', x: 50, z: 6 });
  check(Math.abs(a.tx - 50) < 0.1, '빠르게 두 번 찍으면 마지막 것이 목적지다 (명령을 버리지 않는다)');

  // 파티: 다른 층에서는 처치를 나눠 받지 못한다
  g.command(a, { t: 'stop' });
  a.x = b.x; a.z = b.z;
  g.command(a, { t: 'party', a: 'invite', id: b.id });
  g.command(b, { t: 'party', a: 'accept' });
  const def = DUNGEONS.vault;
  for (const p of [a, b]) { p.x = def.portal.x + 1; p.z = def.portal.z; }
  g.command(a, { t: 'dungeon', id: 'vault' });
  const boss = [...g.ents.values()].find((e) => e.kind === 'm' && e.layer === a.layer && e.type === def.boss.type)!;
  b.x = boss.x + 1; b.z = boss.z; // b는 들판 층에서 같은 좌표에 서 있다
  const gold0 = b.gold, exp0 = b.exp + b.lv * 1e9;
  a.x = boss.x + 1; a.z = boss.z;
  g.combat.damage(a, boss, 999999, false);
  check(b.layer !== a.layer && b.gold === gold0 && b.exp + b.lv * 1e9 === exp0, '다른 층에 서 있는 파티원은 우두머리의 보상을 받지 못한다');

  // 초대 도배: 살아 있는 초대는 다시 보내지 않는다
  const c = mk('다'), d = mk('라');
  c.gold = 1000; c.x = d.x; c.z = d.z;
  g.command(c, { t: 'guild', a: 'create', name: '도배길드' });
  g.out = []; g.partyOut = [];
  for (let i = 0; i < 20; i++) { g.command(c, { t: 'guild', a: 'invite', id: d.id }); g.command(c, { t: 'party', a: 'invite', id: d.id }); }
  check(g.out.filter((o) => o.id === d.id && o.msg.t === 'guild').length === 1 && g.partyOut.filter((o) => o.id === d.id && o.msg.t === 'pinv').length === 1, '초대를 스무 번 보내도 상대에게는 한 번만 간다');
  g.command(d, { t: 'guild', a: 'create', name: '도배​길드' });
  check(g.guild.count === 1, '보이지 않는 글자만 다른 길드 이름은 만들 수 없다');

  // 깨진 저장
  const save = g.players.export(d);
  (save.ext as Record<string, unknown>).daily = { day: '2026-01-01', prog: { run_vault: 'x', hunt30: -5 }, got: [], streak: 2.5, last: '' };
  const back = g.players.spawn('라2', false, JSON.parse(JSON.stringify(save)));
  check(back.daily.prog.run_vault === undefined && back.daily.prog.hunt30 === undefined && Number.isInteger(back.daily.streak), '깨진 일일 진행 값은 버리고 출석 일수는 정수로 맞춘다');
  const g2 = new Game();
  let threw = false;
  try { g2.importWorld({ guilds: null, market: 5, rank: 'x', tower: {} } as never); } catch { threw = true; }
  check(!threw, '월드 저장의 한 칸이 깨져 있어도 읽다가 죽지 않는다');
}

// ---- 금칙어와 이름 다듬기
{
  check(!isClean('fu​ck') && !isClean('ｆｕｃｋ') && !isClean('씨​발') && !isClean('ㅅㅂ') && !isClean('씨.발'), '보이지 않는 글자, 전각 글자, 점을 끼운 금칙어와 자모 금칙어도 걸린다');
  check(mask('ㅋㅋㅋㅋ ㅠㅠ') === 'ㅋㅋㅋㅋ ㅠㅠ' && tidy('ㅋㅋ맨') === 'ㅋㅋ맨', '낱글자 자모(ㅋㅋ, ㅠㅠ)는 다듬어도 그대로다');
  check(mask('혹시?발견했어') === '혹시?발견했어' && mask('즉시-발송') === '즉시-발송' && mask('택시2발') === '택시2발', '물음표, 하이픈, 숫자가 낀 정상 문장은 가리지 않는다');
  check(mask('this hit hard') === 'this hit hard' && mask('시 발표') === '시 발표' && mask('다시 발사') === '다시 발사', '낱말 사이에 걸친 것은 가리지 않는다');
  check(tidy('가​나‮다ㅤ') === '가나다', '눈에 보이지 않는 글자를 지운다');
}

// ---- 통신 계층
{
  const store = new MemoryStore();
  const server = await startServer(0, { store, maxPerIp: 6, maxAway: 1 });
  try {
    // 깨진 주소로 서버가 죽지 않는다
    const bad = [await get(server.port, '/%'), await get(server.port, '/a%00b'), await get(server.port, '/..%2f..%2fpackage.json')];
    const alive = await connect(server.port, '살아있나', 'alive-token-0123456789');
    check(bad[0] === 400 && bad[1] === 400 && (bad[2] === 403 || bad[2] === 404) && alive.id > 0, `깨진 주소를 받아도 서버가 죽지 않는다 (응답 ${bad.join(', ')})`);
    alive.ws.close();

    // 밀려난 옛 연결은 캐릭터를 움직이거나 저장을 덮어쓰지 못한다
    const T = 'ghost-token-0123456789ab';
    const a1 = await connect(server.port, '유령', T);
    a1.send({ t: 'class', id: 'knight' });
    await until(() => !!server.game.ents.get(a1.id)?.cls);
    server.game.ents.get(a1.id)!.gold = 4500;
    a1.ws.pause(); // 닫기 신호를 못 본 척한다
    const a2 = await connect(server.port, undefined, T);
    const e2 = server.game.ents.get(a2.id)!;
    e2.gold = 0; e2.unsaved = true;
    a2.ws.close();
    await until(() => !server.game.ents.has(a2.id));
    a1.ws.resume();
    try { a1.send({ t: 'rename', name: '유령1' }); } catch { /* 이미 닫혔으면 그것으로 됐다 */ }
    await sleep(300);
    const a3 = await connect(server.port, undefined, T);
    check(server.game.ents.get(a3.id)!.gold === 0 && a3.name === '유령', '밀려난 연결이 보낸 명령은 버려지고, 저장을 옛 상태로 되돌리지 못한다');
    a3.ws.close();

    // 접속해 있는 사람의 이름으로는 바꿀 수 없다
    const n1 = await connect(server.port, '챔피언', 'name-token-0123456789aa'), n2 = await connect(server.port, '도전자', 'name-token-0123456789bb');
    n2.send({ t: 'rename', name: '챔피언' });
    check(await until(() => n2.sys.includes('nameTaken')) && server.game.ents.get(n2.id)!.name === '도전자', '접속해 있는 다른 사람의 이름으로는 바꿀 수 없다');
    const n3 = await connect(server.port, '챔피언', 'name-token-0123456789cc');
    check(n3.name !== '챔피언', '같은 이름으로 들어오면 숫자가 붙는다');
    // 접속하지 않은 사람의 이름도 차지할 수 없다 (저장된 캐릭터가 있을 때)
    server.game.ents.get(n1.id)!.gold = 1;
    n1.ws.close();
    await until(() => !server.game.ents.has(n1.id));
    n2.send({ t: 'rename', name: '챔피언' });
    await sleep(300);
    check(server.game.ents.get(n2.id)!.name === '도전자', '접속하지 않은 사람의 이름도 차지할 수 없다');
    // 이름만 바꾸고 나가도 그 이름이 남는다
    const r1 = await connect(server.port, '임시', 'rename-token-0123456789');
    r1.send({ t: 'rename', name: '내가고른이름' });
    await until(() => server.game.ents.get(r1.id)?.name === '내가고른이름');
    r1.ws.close();
    await until(() => !server.game.ents.has(r1.id));
    const r2 = await connect(server.port, undefined, 'rename-token-0123456789');
    check(r2.name === '내가고른이름', '이름만 바꾸고 나가도 다음 접속에 그 이름이 남는다');
    r2.ws.close();
    n2.ws.close(); n3.ws.close();
    await sleep(200);

    // 막 만든 캐릭터는 자동 사냥을 켜고 끊어도 남지 않는다. 키운 캐릭터도 정해진 수까지만 남는다
    const fresh = await connect(server.port, '새내기', 'away-token-0123456789aa');
    fresh.send({ t: 'auto', on: true });
    await until(() => !!server.game.ents.get(fresh.id)?.auto);
    fresh.ws.close();
    check(await until(() => !server.game.ents.has(fresh.id)), '막 만든 캐릭터는 자리 비움 사냥으로 남지 않는다');
    const stay: number[] = [];
    for (const k of ['aa', 'bb']) {
      const p = await connect(server.port, '키운이' + k, 'grown-token-0123456789' + k);
      p.send({ t: 'class', id: 'knight' });
      await until(() => !!server.game.ents.get(p.id)?.cls);
      const e = server.game.ents.get(p.id)!;
      e.lv = 5;
      p.send({ t: 'auto', on: true });
      await until(() => e.auto);
      stay.push(p.id);
      p.ws.close();
      await sleep(250);
    }
    check(server.game.ents.has(stay[0]) && !server.game.ents.has(stay[1]), '자리 비움 캐릭터는 상한(시험에서는 1명)까지만 남는다');

    // 한 주소에서 여는 연결 수에 상한이 있다
    const socks: WebSocket[] = [];
    let refused = 0;
    for (let i = 0; i < 9; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
      ws.on('message', (d) => { if (d.toString().includes('"full"')) refused++; });
      ws.on('error', () => {});
      socks.push(ws);
    }
    await sleep(500);
    check(refused === 3, `한 주소에서 6개를 넘는 연결은 받지 않는다 (9개 가운데 ${refused}개 거절)`);
    for (const ws of socks) ws.terminate();
  } finally {
    await server.close();
  }
}
