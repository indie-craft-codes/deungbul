// 통합 테스트 (이 게임의 규칙): 등불지기의 서버를 띄우고 클라이언트를 붙여서 등탑, 메인 퀘스트, 습격, 그 저장을 확인한다.
// 접속·이동·대화·전투·자리 비움 사냥처럼 틀의 것은 test/server.test.ts가 본다. 여기서는 같은 차례로 준비만 하고(이름 바꾸기, 슬라임 한 마리) 이 게임의 것만 검사한다.
import { createHash } from 'node:crypto';
import { FORGE, GLOW_START, RAID, nextRaidAt } from '../shared/defs';
import { TOWER } from '../shared/world';
import { MemoryStore } from '@engine/server/store';
import { check, until, sleep } from '@engine/test/harness';
import { connectDeungbul as connect } from './peer';
import { startDeungbul } from './game';

// A는 저장된 캐릭터가 있는 상태로 시작한다 (불씨 5개, 레벨 3)
const store = new MemoryStore();
const TOKEN_A = 'test-token-aaaaaaaaaaaa';
const keyA = createHash('sha256').update(TOKEN_A).digest('hex');
store.savePlayer(keyA, { name: '가나다', lv: 3, exp: 5, need: 109, maxHp: 230, sparks: 5, contrib: 0 });

// 습격은 시험에서 직접 시작한다: 물결은 하나로 줄이고 시각표는 비운다
const raidCfg = { hours: [], waveAtS: [0] };

let server = await startDeungbul(0, { store, game: { raid: raidCfg } });
try {
  const a = await connect(server.port, undefined, TOKEN_A);
  const b = await connect(server.port, '  <b>라마바사아자차카타파하</b>  ');

  check(await until(() => a.glow === GLOW_START), '접속하면 등탑 밝기를 받는다');

  // 준비 (검사는 test/server.test.ts에 있다): 이름을 바꾸고, 슬라임 빈터로 가서 한 마리를 잡아 불씨를 얻는다
  await until(() => a.seen.has(b.id) && b.seen.has(a.id));
  a.send({ t: 'rename', name: '새이름' });
  await until(() => b.seen.get(a.id)?.name === '새이름');
  a.send({ t: 'move', x: -24, z: 22 });
  await until(() => [...a.mons.values()].includes('slime'), 20000);
  const slime = [...a.mons.entries()].find(([, type]) => type === 'slime')?.[0] ?? 0;
  a.send({ t: 'attack', id: slime });
  await until(() => a.sparks >= 6, 20000);

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

  // 서버를 껐다 켜도 등탑과 캐릭터가 남는다
  a.ws.close(); b.ws.close();
  await sleep(300);
  await server.close();
  server = await startDeungbul(0, { store, game: { raid: raidCfg } });
  const a3 = await connect(server.port, undefined, TOKEN_A);
  check(await until(() => a3.glow === glowEnd && a3.residents[0] === resEnd && resEnd === 4), '서버를 다시 켜도 등탑 밝기와 주민 진행이 남는다');
  check(a3.name === '새이름' && (await until(() => a3.sparks === sparksEnd && a3.contrib === contribEnd && a3.lv >= 3)), '서버를 다시 켜도 캐릭터가 남는다');
  a3.ws.close();
} finally {
  await server.close();
}
