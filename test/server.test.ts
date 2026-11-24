// 통합 테스트: 서버를 띄우고 클라이언트를 붙여서 접속, 전투, 저장, 대화, 습격, 자리 비움 사냥을 확인한다.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FORGE, GLOW_START, RAID, nextRaidAt, SHOPS } from '../shared/defs';
import { MAX_X, MAX_Z, MIN_X, MIN_Z, PLAYER_SPEED, TOWER } from '../shared/world';
import { startServer } from '../server/net/server';
import { MemoryStore, SqliteStore } from '../server/store';
import { check, until, sleep, connect } from './harness';

// A는 저장된 캐릭터가 있는 상태로 시작한다 (불씨 5개, 레벨 3)
const store = new MemoryStore();
const TOKEN_A = 'test-token-aaaaaaaaaaaa';
const keyA = createHash('sha256').update(TOKEN_A).digest('hex');
store.savePlayer(keyA, { name: '가나다', lv: 3, exp: 5, need: 109, maxHp: 230, sparks: 5, contrib: 0 });

// 습격은 시험에서 직접 시작한다: 물결은 하나로 줄이고 시각표는 비운다
const raidCfg = { hours: [], waveAtS: [0] };

let server = await startServer(0, { store, game: { raid: raidCfg } });
try {
  const a = await connect(server.port, undefined, TOKEN_A);
  const b = await connect(server.port, '  <b>라마바사아자차카타파하</b>  ');
  const guest = await connect(server.port);

  check(a.name === '가나다' && (await until(() => a.sparks === 5 && a.lv === 3)), '토큰으로 접속하면 저장된 이름, 레벨, 불씨를 이어받는다');
  check(guest.name.length >= 4 && guest.name.length <= 12, `이름 없이 접속하면 무작위 이름이 붙는다 (${guest.name})`);
  check(await until(() => a.glow === GLOW_START), '접속하면 등탑 밝기를 받는다');
  guest.ws.close();

  check(await until(() => a.seen.has(b.id) && b.seen.has(a.id)), 'A와 B가 서로 보인다');
  check(a.seen.get(b.id)?.name.length === 12, '닉네임이 12자로 잘린다');

  // 이동이 상대에게 전달되는가
  const start = { x: a.you[0], z: a.you[1] };
  a.send({ t: 'move', x: start.x, z: start.z + 20 }); // 남쪽 길: 장애물이 없다
  await sleep(1000);
  const moved = Math.hypot(a.you[0] - start.x, a.you[1] - start.z);
  const atB = b.seen.get(a.id)!;
  check(moved > 3, `A가 서버에서 움직였다 (${moved.toFixed(2)})`);
  check(moved <= PLAYER_SPEED * 1.25, `A의 속도가 서버 한계 안이다 (1초에 ${moved.toFixed(2)}, 한계 ${PLAYER_SPEED})`);
  check(Math.hypot(atB.x - a.you[0], atB.z - a.you[1]) < 1.5, 'B가 보는 A의 위치가 서버 위치와 맞는다');

  // 월드 밖 좌표와 잘못된 입력
  a.send({ t: 'move', x: 99999, z: -99999 });
  a.ws.send('{"t":"move","x":"NaN","z":null}');
  a.ws.send('not json');
  await sleep(300);
  check(a.you[0] >= MIN_X && a.you[0] <= MAX_X && a.you[1] >= MIN_Z && a.you[1] <= MAX_Z && a.ws.readyState === a.ws.OPEN, '잘못된 입력에도 서버가 버티고 위치가 월드 안이다');

  // 정지
  a.send({ t: 'stop' });
  await sleep(250);
  const p1 = [a.you[0], a.you[1]];
  await sleep(400);
  check(Math.hypot(a.you[0] - p1[0], a.you[1] - p1[1]) < 0.01 && a.you[2] === 0, '정지 명령 뒤에 멈춘다');

  // 채팅
  b.send({ t: 'chat', text: '안녕하세요' });
  check(await until(() => a.chat.some((c) => c.endsWith('안녕하세요'))), '채팅이 전달된다');

  // 금칙어와 신고
  b.send({ t: 'rename', name: 'f.u.c.k왕' });
  check(await until(() => b.sys.some((s) => s === 'nameBad')), '금칙어가 든 이름으로는 바꿀 수 없다 (글자 사이에 점을 끼워도)');
  await sleep(750);
  b.send({ t: 'chat', text: '야 이 병신아 Fuck you' });
  check(await until(() => a.chat.some((c) => c.endsWith('야 이 **아 **** you'))), '금칙어는 별표로 가려져 전달된다');
  a.send({ t: 'report', id: b.id });
  check(await until(() => a.sys.some((s) => s.startsWith('reported:'))), '신고하면 접수됐다고 알린다');
  const rep = store.reports(5)[0];
  check(!!rep && rep.by === a.name && rep.byKey !== null && rep.targetKey === null && rep.lines.includes('야 이 병신아 Fuck you') && rep.lines.includes('안녕하세요'), '신고에는 누가 누구를 신고했는지와 상대의 최근 대화가 원문으로 남는다 (손님은 저장 키가 없다)');
  a.send({ t: 'report', id: b.id }); a.send({ t: 'report', id: a.id }); a.send({ t: 'report', id: 999999 });
  check(await until(() => a.sys.some((s) => s === 'reportWait')) && store.reports(5).length === 1, '같은 사람을 연달아 신고할 수 없고, 자신이나 없는 사람은 신고되지 않는다');

  // 이름 바꾸기
  a.send({ t: 'rename', name: '새이름' });
  check(await until(() => b.seen.get(a.id)?.name === '새이름'), '이름을 바꾸면 다른 접속자에게 반영된다');
  a.send({ t: 'rename', name: '또바꿈' });
  check(await until(() => a.sys.some((s) => s === 'renameWait')) && b.seen.get(a.id)?.name === '새이름', '이름을 연달아 바꿀 수는 없다');

  // 시야 밖으로 나가면 목록에서 빠지는가: A를 멀리 보낸다
  a.send({ t: 'move', x: -55, z: 55 });
  check(await until(() => !b.seen.has(a.id), 15000), 'A가 시야 밖으로 나가면 B의 목록에서 빠진다');

  // 전투: 슬라임 빈터로 가서 한 마리를 잡는다
  a.send({ t: 'move', x: -24, z: 22 });
  check(await until(() => [...a.mons.values()].includes('slime'), 20000), 'A가 슬라임을 본다');
  const slime = [...a.mons.entries()].find(([, type]) => type === 'slime')?.[0] ?? 0;
  a.send({ t: 'skill', n: 0 });
  check(await until(() => a.sys.some((s) => s === 'noTarget')) && a.cds.length === 0, '대상 없이 강타를 쓰면 거부된다');
  a.send({ t: 'attack', id: slime });
  check(await until(() => a.hits > 0, 15000), '공격 명령을 내리면 다가가서 피해를 준다');
  a.send({ t: 'skill', n: 0 });
  check(await until(() => a.cds.includes(0)), '사거리 안에서는 강타가 받아들여진다');
  a.send({ t: 'skill', n: 0 });
  await sleep(300);
  check(a.cds.filter((n) => n === 0).length === 1, '쿨다운 중에는 강타가 다시 나가지 않는다');
  check(await until(() => a.sparks >= 6, 20000), '처치하면 불씨를 받는다');
  a.send({ t: 'attack', id: b.id });
  await sleep(300);
  check(a.you[2] === 0, '다른 플레이어는 공격 대상이 되지 않는다');

  // 등탑: 멀리서는 못 바치고, 가까이 가서 바치면 밝기가 오른다
  const had = a.sparks;
  a.send({ t: 'offer', to: 'tower', n: 1 });
  check(await until(() => a.sys.some((s) => s === 'offerFar')) && a.glow === GLOW_START && a.sparks === had, '등탑에서 멀면 불씨를 바칠 수 없다');
  a.send({ t: 'move', x: TOWER.x, z: TOWER.z + 3 });
  check(await until(() => Math.hypot(a.you[0] - TOWER.x, a.you[1] - TOWER.z) < 5, 20000), 'A가 등탑으로 돌아온다');
  a.send({ t: 'offer', to: 'tower', n: 1 });
  check(await until(() => a.glow === GLOW_START + 1 && a.sparks === had - 1), '등탑에 바치면 밝기가 오르고 불씨가 줄어든다');
  a.send({ t: 'offer', to: 'resident', n: 2 });
  check(await until(() => a.residents[0] === 2 && a.sparks === had - 3 && a.contrib === 3), '주민 되돌리기에 바친 불씨가 모인다');
  a.send({ t: 'offer', to: 'tower', n: 9999 });
  check(await until(() => a.sparks === 0) && a.glow === GLOW_START + 1 + (had - 3), '가진 것보다 많이 바칠 수 없다');
  a.send({ t: 'offer', to: 'tower', n: -5 });
  a.ws.send('{"t":"offer","to":"x","n":1}');
  await sleep(300);
  check(a.sparks === 0 && a.ws.readyState === a.ws.OPEN, '잘못된 바치기 요청은 무시된다');

  // 메인 퀘스트 1장: 새로 온 사람이 처음부터 끝까지 따라간다 (위치와 불씨는 서버에서 직접 옮겨 시간을 줄인다)
  const TOKEN_Q = 'test-token-qqqqqqqqqqqq';
  const q = await connect(server.port, '퀘스트', TOKEN_Q);
  const g0 = server.game, qEnt = g0.ents.get(q.id)!;
  const isAt = (c: number, st: number, n = 0) => () => q.quest[0] === c && q.quest[1] === st && q.quest[2] === n;
  const place = (x: number, z: number) => { qEnt.x = x; qEnt.z = z; qEnt.moving = false; };
  const slay = (type: string, count: number) => {
    const list = [...g0.ents.values()].filter((e) => e.type === type && !e.dead && !e.raid).slice(0, count);
    for (const m of list) { place(m.x + 1, m.z); g0.combat.damage(qEnt, m, 9999, false); }
    return list.length;
  };
  check(await until(isAt(0, 0)), '처음 접속하면 1장 첫 단계에서 시작한다');
  check(slay('slime', 2) === 2 && (await until(isAt(0, 0, 2))), '슬라임을 잡으면 진행 수치가 오른다');
  slay('wisp', 1);
  await sleep(300);
  check(isAt(0, 0, 2)(), '다른 몬스터는 세지 않는다');
  check(slay('slime', 1) === 1 && (await until(isAt(0, 1))) && q.sys.some((x) => x.startsWith('questStep:')), '세 마리를 잡으면 다음 단계로 넘어가고 보상을 받는다');
  place(TOWER.x, TOWER.z + 3);
  await sleep(200);
  q.send({ t: 'offer', to: 'tower', n: 1 });
  check(await until(isAt(0, 2)), '등탑에 불씨를 바치면 다음 단계로 넘어간다');
  place(FORGE.x + 3, FORGE.z);
  check(await until(isAt(0, 3), 2000), '옛 대장간 터에 가면 다음 단계로 넘어간다');
  check(slay('shade_bram', 1) === 1 && (await until(isAt(0, 4))), '브람의 그림자를 쓰러뜨리면 다음 단계로 넘어간다');
  place(TOWER.x, TOWER.z + 3);
  qEnt.sparks = 9;
  await sleep(200);
  q.send({ t: 'offer', to: 'tower', n: 3 });
  check(await until(isAt(0, 4, 3)), '불씨를 일부만 바치면 그만큼만 진행된다');
  q.send({ t: 'offer', to: 'resident', n: 2 });
  check(await until(isAt(1, 0)) && q.sys.some((x) => x === 'questDone:bram'), '마지막 단계를 마치면 장이 끝나고 다음 장이 시작된다');
  q.ws.close();
  await sleep(300);
  const q2 = await connect(server.port, undefined, TOKEN_Q);
  check(await until(() => q2.quest[0] === 1 && q2.quest[1] === 0), '다시 접속해도 퀘스트 진행이 남는다');
  q2.ws.close();
  await sleep(300);

  // 습격 시각표
  const at = (h: number, m: number) => new Date(2026, 10, 23, h, m, 0, 0).getTime();
  check(nextRaidAt(at(19, 30), RAID) === at(20, 0) && nextRaidAt(at(20, 0), RAID) === at(21, 0) && nextRaidAt(at(9, 10), RAID) === at(12, 0) && nextRaidAt(at(23, 30), RAID) === at(RAID.hours[0], 0) + 86400000, '습격 시각표: 정해진 시각의 정각에 열리고, 마지막 시각이 지나면 다음 날 첫 시각이다');
  check(nextRaidAt(at(19, 32), { hours: [], everyMin: 5 }) === at(19, 35), '습격 간격 설정이 시각표보다 먼저다');

  // 습격: 시작하면 적이 나타나고, 다 막으면 밝기가 오르고 보상을 받는다
  const game = server.game, glow0 = a.glow;
  check(a.raid.phase === 'idle', '평소에는 습격이 없다');
  // 적의 수는 최근에 스스로 움직인 사람만 센다 (서 있기만 한 사람은 세지 않는다): 둘 다 방금 명령을 냈다
  a.send({ t: 'stop' }); b.send({ t: 'stop' });
  await until(() => [a, b].every((p) => game.clock - game.ents.get(p.id)!.lastAct < 5));
  game.raid.start();
  check(await until(() => a.raid.phase === 'active' && a.raid.foes === 10 && a.raid.towerMaxHp === RAID.towerHpBase + glow0 * 3), `습격이 시작되면 인원에 맞는 적이 온다 (2명: ${a.raid.foes}마리, 등탑 내구 ${a.raid.towerMaxHp})`);
  check(await until(() => [...game.ents.values()].filter((e) => e.raid).length === 10), '습격 적이 월드에 나타난다');
  const before = [...game.ents.values()].filter((e) => e.raid).map((e) => Math.hypot(e.x - TOWER.x, e.z - TOWER.z));
  await sleep(1500);
  const after = [...game.ents.values()].filter((e) => e.raid).map((e) => Math.hypot(e.x - TOWER.x, e.z - TOWER.z));
  check(after.length === 10 && after.reduce((s, d) => s + d, 0) < before.reduce((s, d) => s + d, 0) - 10, '습격 적이 등탑으로 다가온다');
  const aEnt = game.ents.get(a.id)!;
  for (const m of [...game.ents.values()]) if (m.raid) game.combat.damage(aEnt, m, 9999, false);
  check(await until(() => a.raid.phase === 'idle' && a.glow === glow0 + 10), '다 막으면 습격이 끝나고 밝기가 10 오른다');
  check(a.sys.some((s) => s === 'raidWon:10') && (await until(() => a.sys.some((s) => s.startsWith('raidReward:')) && a.sparks >= 5)), '막아 낸 사람은 보상을 받는다');
  check([...game.ents.values()].every((e) => !e.raid), '습격이 끝나면 습격 적이 남지 않는다');

  // 습격: 시간 안에 못 막으면 밝기가 내려간다
  const glow1 = a.glow;
  Object.assign(game.raid.cfg, { durationS: 1 });
  game.raid.start();
  check(await until(() => a.raid.phase === 'idle' && a.glow === glow1 + RAID.loseGlow, 5000) && a.sys.some((s) => s === `raidLost:${RAID.loseGlow}`), `못 막으면 밝기가 10 내려간다 (${glow1} → ${a.glow})`);
  check([...game.ents.values()].every((e) => !e.raid), '진 뒤에도 습격 적이 남지 않는다');
  await sleep(300);
  const glowEnd = a.glow, contribEnd = a.contrib, sparksEnd = a.sparks, resEnd = a.residents[0];

  // 과도한 메시지는 연결이 끊긴다
  for (let i = 0; i < 200; i++) b.send({ t: 'ping', c: i });
  check(await until(() => b.ws.readyState === b.ws.CLOSED), '메시지를 쏟아 보내면 연결이 끊긴다');

  check(await until(() => a.sys.some((s) => s.startsWith('left:'))), '나간 사실이 다른 접속자에게 알려진다');

  // 같은 토큰으로 또 접속하면 먼저 있던 연결이 끊긴다
  const a2 = await connect(server.port, undefined, TOKEN_A);
  check(await until(() => a.ws.readyState === a.ws.CLOSED) && a2.name === '새이름', '같은 캐릭터로 다시 접속하면 이전 연결이 끊긴다');
  a2.ws.close();

  // 서버를 껐다 켜도 등탑과 캐릭터가 남는다
  await server.close();
  server = await startServer(0, { store, game: { raid: raidCfg } });
  const a3 = await connect(server.port, undefined, TOKEN_A);
  check(await until(() => a3.glow === glowEnd && a3.residents[0] === resEnd && resEnd === 4), '서버를 다시 켜도 등탑 밝기와 주민 진행이 남는다');
  check(a3.name === '새이름' && (await until(() => a3.sparks === sparksEnd && a3.contrib === contribEnd && a3.lv >= 3)), '서버를 다시 켜도 캐릭터가 남는다');
  a3.ws.close();

  // 자리 비움 자동 사냥: 자동 사냥을 켠 채 끊기면 캐릭터가 남아 사냥하고, 다시 들어오면 그대로 이어받는다
  {
    const TOKEN_AWAY = 'away-token-0123456789';
    const h = await connect(server.port, '사냥꾼', TOKEN_AWAY);
    const ent = server.game.ents.get(h.id)!;
    const prey = [...server.game.ents.values()].find((m) => m.kind === 'm' && !m.dead && m.type === 'slime') ?? [...server.game.ents.values()].find((m) => m.kind === 'm' && !m.dead)!;
    ent.x = prey.x + 3; ent.z = prey.z;
    // 자리 비움 사냥은 직업을 고르고 조금 키운 캐릭터만 된다
    server.game.classes.apply(ent, 'warrior'); ent.lv = 5; server.game.players.refresh(ent); ent.hp = ent.maxHp;
    const exp0 = ent.exp, lv0 = ent.lv;
    h.send({ t: 'auto', on: true });
    await until(() => ent.auto);
    h.ws.close();
    check(await until(() => ent.targetId !== 0, 3000) && server.game.ents.has(ent.id), '자동 사냥을 켠 채 끊기면 캐릭터가 남아 몬스터를 노린다');
    check(await until(() => ent.exp !== exp0 || ent.lv !== lv0, 20000), '자리를 비운 동안 혼자 몬스터를 잡는다');
    const h2 = await connect(server.port, undefined, TOKEN_AWAY);
    check(h2.id === ent.id && (await until(() => h2.sys.some((x) => x.startsWith('awayBack:')))), '다시 접속하면 사냥하던 캐릭터를 그대로 이어받고 얻은 것을 알려 준다');
    // 자동 사냥을 끄고 나가면 평소처럼 나간다
    h2.send({ t: 'auto', on: false });
    await until(() => !ent.auto);
    h2.ws.close();
    check(await until(() => !server.game.ents.has(ent.id)), '자동 사냥을 끄고 나가면 캐릭터가 월드에서 빠진다');
  }

  // 잿빛 숲 등탑 곁의 상인에게서도 살 수 있다
  {
    const TOKEN_SHOP = 'shop-token-0123456789a';
    const h = await connect(server.port, '손님', TOKEN_SHOP);
    const ent = server.game.ents.get(h.id)!;
    ent.x = SHOPS[1].x + 1; ent.z = SHOPS[1].z; ent.gold = 100;
    h.send({ t: 'buy', id: 'potion' });
    check(await until(() => (ent.items.potion ?? 0) === 1), '잿빛 숲 등탑 곁의 상인에게서도 물약을 살 수 있다');
    ent.x = 60; ent.z = 30;
    h.send({ t: 'buy', id: 'potion' });
    check(await until(() => h.sys.includes('shopFar')) && ent.items.potion === 1, '상인이 없는 곳에서는 살 수 없다');
    ent.auto = false;
    h.ws.close();
  }

  // 다시 접속하면 마지막으로 있던 자리에서 시작한다
  {
    const TOKEN_POS = 'pos-token-0123456789ab';
    const h = await connect(server.port, '자리', TOKEN_POS);
    const ent = server.game.ents.get(h.id)!;
    ent.x = 40; ent.z = 5; ent.gold = 1; // 아무것도 하지 않은 새 캐릭터는 저장하지 않으므로 흔적을 남긴다
    h.ws.close();
    await until(() => !server.game.ents.has(ent.id));
    const h2 = await connect(server.port, undefined, TOKEN_POS);
    check(Math.hypot(h2.you[0] - 40, h2.you[1] - 5) < 3, '다시 접속하면 마지막으로 있던 자리에서 시작한다');
    h2.ws.close();
  }

  // 파일 저장소: 쓰고 닫았다가 다시 열어 읽는다
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deungbul-')), 'test.db');
  const db1 = new SqliteStore(file);
  db1.saveWorld({ glow: 77, residents: [30, 4, 0] });
  db1.savePlayer('k1', { name: '파일', lv: 4, exp: 1, need: 148, maxHp: 245, sparks: 9, contrib: 12 });
  db1.savePlayer('k1', { name: '파일2', lv: 5, exp: 2, need: 200, maxHp: 260, sparks: 1, contrib: 20 });
  db1.close();
  const db2 = new SqliteStore(file);
  const w = db2.loadWorld(), pl = db2.loadPlayer('k1');
  check(w?.glow === 77 && (w.residents as number[])[0] === 30 && pl?.name === '파일2' && pl.contrib === 20 && db2.loadPlayer('none') === null, '파일 저장소가 닫았다 열어도 값을 돌려준다');
  db2.close();
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
} finally {
  await server.close();
}
