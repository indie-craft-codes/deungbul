// 통합 테스트: 서버를 띄우고 클라이언트를 붙여서 접속, 전투, 저장, 대화, 자리 비움 사냥을 확인한다. (등탑·퀘스트·습격은 이 게임의 것: games/deungbul/test/server.test.ts)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHOPS } from '../shared/defs';
import { MAX_X, MAX_Z, MIN_X, MIN_Z, PLAYER_SPEED } from '@game/shared/world';
import { startServer } from '../server/net/server';
import { MemoryStore, SqliteStore } from '../server/store';
import { check, until, sleep, connect } from './harness';

// A는 저장된 캐릭터가 있는 상태로 시작한다 (불씨 5개, 레벨 3)
const store = new MemoryStore();
const TOKEN_A = 'test-token-aaaaaaaaaaaa';
const keyA = createHash('sha256').update(TOKEN_A).digest('hex');
store.savePlayer(keyA, { name: '가나다', lv: 3, exp: 5, need: 109, maxHp: 230, sparks: 5, contrib: 0 });

let server = await startServer(0, { store });
try {
  const a = await connect(server.port, undefined, TOKEN_A);
  const b = await connect(server.port, '  <b>라마바사아자차카타파하</b>  ');
  const guest = await connect(server.port);

  check(a.name === '가나다' && (await until(() => a.sparks === 5 && a.lv === 3)), '토큰으로 접속하면 저장된 이름, 레벨, 불씨를 이어받는다');
  check(guest.name.length >= 4 && guest.name.length <= 12, `이름 없이 접속하면 무작위 이름이 붙는다 (${guest.name})`);
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

  const sparksEnd = a.sparks;

  // 과도한 메시지는 연결이 끊긴다
  for (let i = 0; i < 200; i++) b.send({ t: 'ping', c: i });
  check(await until(() => b.ws.readyState === b.ws.CLOSED), '메시지를 쏟아 보내면 연결이 끊긴다');

  check(await until(() => a.sys.some((s) => s.startsWith('left:'))), '나간 사실이 다른 접속자에게 알려진다');

  // 같은 토큰으로 또 접속하면 먼저 있던 연결이 끊긴다
  const a2 = await connect(server.port, undefined, TOKEN_A);
  check(await until(() => a.ws.readyState === a.ws.CLOSED) && a2.name === '새이름', '같은 캐릭터로 다시 접속하면 이전 연결이 끊긴다');
  a2.ws.close();

  // 서버를 껐다 켜도 캐릭터가 남는다
  await server.close();
  server = await startServer(0, { store });
  const a3 = await connect(server.port, undefined, TOKEN_A);
  check(a3.name === '새이름' && (await until(() => a3.sparks === sparksEnd && a3.lv >= 3)), '서버를 다시 켜도 캐릭터가 남는다');
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
