// 소탕·픽업 배너·선택권·오프라인 진행을 실제 서버와 접속으로 (정해진 서버 시계: 별똥별 배너가 열린 때):
//   열린 배너(개인 상태 gacha.open)에 한정 배너가 있고 다음 배너는 없다, 닫힌 배너는 bannerClosed, 픽업 배너의 10번 뽑기,
//   깨지 않은 단계는 sweepLocked, 깬 단계의 소탕 결과(메시지 sweep)와 소탕권, 열쇠 던전을 끝낸 뒤의 소탕, 선택권,
//   나갔다가 서버 시계로 한 시간 뒤에 들어오면 단계가 나아가 있고(돌아왔을 때의 창 idleBack 하나로만 알린다: 안내문 stageAway는 없다) 방치 우편의 제목 값에 진행이 적힌다.
import { seededRng, type GachaMe, type HeroesMe, type KeysMe, type StageMe, type SweepGot } from '../../shared/defs';
import type { ServerMsg } from '../../shared/protocol';
import { check, settle, until, type Peer } from '../harness';
import { clearLayer, heathServer, join, leave } from './netbench';

interface Seen { heroes?: HeroesMe; gacha?: GachaMe; stage?: StageMe; keys?: KeysMe; sweeps: SweepGot[]; pulls: number; mail: { k: string; a: (string | number)[] }[]; backs: { from?: string; to?: string; n?: number }[] }
const fresh = (): Seen => ({ sweeps: [], pulls: 0, mail: [], backs: [] });
const listen = (s: Seen) => (m: ServerMsg) => {
  if (m.t === 'me') {
    if (m.k === 'heroes') s.heroes = m.s as HeroesMe;
    else if (m.k === 'gacha') s.gacha = m.s as GachaMe;
    else if (m.k === 'stage') s.stage = m.s as StageMe;
    else if (m.k === 'keys') s.keys = m.s as KeysMe;
  } else if (m.t === 'sweep') s.sweeps.push(m.got);
  else if (m.t === 'gacha') s.pulls++;
  else if (m.t === 'meta' && m.mail) s.mail = m.mail;
  else if (m.t === 'idleBack') s.backs.push({ from: m.from, to: m.to, n: m.n });
};

let T = Date.UTC(2026, 10, 22, 9, 0, 0); // 별똥별(11월 20일부터 2주)이 열린 때
const { server, g } = await heathServer(() => T);
g.gacha.rng = seededRng(5); // 뽑기 결과(편성의 전투력)를 정해 둔다
try {
  const sa = fresh();
  const a: Peer = await join(server, 'Sweeper', 'collect-sweep-token-a-01', listen(sa));
  await until(() => !!sa.gacha && !!sa.stage?.run && !!sa.keys);
  check(!!sa.gacha?.open && sa.gacha.open.dawn === -1 && (sa.gacha.open.starfall ?? 0) > 0 && !('stormcall' in sa.gacha.open), `열린 배너: 상시(-1)와 별똥별(남은 ${sa.gacha?.open?.starfall}분), 다음 배너(폭풍)는 없다`);
  a.send({ t: 'gacha', id: 'stormcall', n: 1 });
  a.send({ t: 'gacha', id: 'starfall', n: 10 });
  await until(() => sa.pulls === 1 && a.sys.some((x) => x.startsWith('bannerClosed')));
  check(a.sys.includes('bannerClosed:stormcall') && sa.pulls === 1 && (sa.gacha?.pity['group:limited'] ?? -1) >= 0, '닫힌 배너는 bannerClosed, 열린 픽업 배너의 10번 뽑기는 되고 천장 무리의 셈이 개인 상태에 온다');
  // 단계 소탕
  const ea = g.ents.get(a.id)!;
  a.send({ t: 'stage', a: 'sweep', id: '1-1', n: 1 });
  await until(() => a.sys.some((x) => x.startsWith('sweepLocked')));
  check(a.sys.includes('sweepLocked:stage:1-1') && ea.items.sweepticket === 5, '아직 깨지 않은 단계는 sweepLocked (소탕권 그대로)');
  ea.stage.best = '1-2'; ea.stage.cur = '1-3';
  a.send({ t: 'stage', a: 'sweep', id: '1-2', n: 2 });
  await until(() => sa.sweeps.length === 1);
  check(sa.sweeps[0].k === 'stage' && sa.sweeps[0].id === '1-2' && sa.sweeps[0].n === 2 && sa.sweeps[0].cur.gold === 120 && ea.items.sweepticket === 3 && a.sys.includes('swept:stage:1-2:2'), `깬 단계 소탕 ×2: 결과 메시지(골드 ${sa.sweeps[0]?.cur.gold}), 소탕권 5 → ${ea.items.sweepticket}`);
  // 던전: 끝내고 나서 소탕
  a.send({ t: 'stage', a: 'leave' });
  await until(() => !sa.stage?.run);
  ea.x = 27; ea.z = -25; ea.tx = 27; ea.tz = -25;
  a.send({ t: 'dungeonSweep', id: 'goldmine', n: 1 });
  await until(() => a.sys.includes('sweepLocked:dungeon:goldmine'));
  a.send({ t: 'dungeon', id: 'goldmine' });
  await until(() => !!g.dungeon.runOf(ea));
  clearLayer(server, ea);
  await until(() => sa.keys?.goldmine?.won === true);
  a.send({ t: 'dungeonLeave' });
  await until(() => !g.dungeon.runOf(ea));
  const keys0 = sa.keys?.goldmine?.n ?? 0;
  a.send({ t: 'dungeonSweep', id: 'goldmine', n: 1 });
  await until(() => sa.sweeps.length === 2);
  await until(() => (sa.keys?.goldmine?.n ?? 0) === keys0 - 1);
  check(sa.sweeps[1].k === 'dungeon' && sa.sweeps[1].cur.gold === 600 && sa.keys?.goldmine?.n === keys0 - 1, `끝낸 적이 생기면(개인 상태 keys의 won) 소탕: 열쇠 ${keys0} → ${sa.keys?.goldmine?.n}, 골드 600`);
  // 선택권
  const shards0 = sa.heroes?.starseer?.[2] ?? -1;
  a.send({ t: 'gacha', a: 'select', item: 'herochoice', hero: 'starseer' });
  await until(() => a.sys.some((x) => x.startsWith('heroPicked:starseer')) && !!sa.heroes?.starseer && sa.heroes.starseer[2] !== shards0);
  check(!!sa.heroes?.starseer && ea.items.herochoice === 0 && a.sys.some((x) => x.startsWith('heroPicked:starseer')), `선택권으로 고른 영웅이 개인 상태에 온다 (${a.sys.find((x) => x.startsWith('heroPicked'))})`);
  // 틀린 것은 아무것도 바꾸지 않는다
  const before = JSON.stringify([ea.items, ea.gold, sa.sweeps.length]);
  a.send({ t: 'stage', a: 'sweep', id: '1-1', n: 99 }); a.send({ t: 'dungeonSweep', id: 'goldmine', n: 'x' as unknown as number }); a.send({ t: 'gacha', a: 'select', item: 'herochoice', hero: 'ironwall' });
  await settle(a, 2);
  check(JSON.stringify([ea.items, ea.gold, sa.sweeps.length]) === before, '상한을 넘는 횟수, 이상한 값, 목록에 없는 영웅은 받지 않는다');
  // 오프라인 진행: 나갔다가 서버 시계로 한 시간 뒤에
  ea.stage.auto = true;
  const power = g.squad.power(ea);
  await leave(server, a);
  T += 60 * 60000;
  const sb = fresh();
  const b = await join(server, 'Sweeper', 'collect-sweep-token-a-01', listen(sb));
  await until(() => !!sb.stage && sb.backs.length > 0 && sb.mail.some((m) => m.k === 'idle'));
  await settle(b, 1);
  const back = sb.backs[0], idle = sb.mail.find((m) => m.k === 'idle'), away = `${back?.from}:${back?.to}:${back?.n}`;
  check(sb.backs.length === 1 && sb.stage?.best === '1-4' && away === '1-3:1-5:2', `편성의 전투력 ${power}로 한 시간 동안 1-3, 1-4(권장 340, 385)를 깨고 1-5(권장 688)에서 멈춘다 (창 ${away}, 가장 멀리 ${sb.stage?.best})`);
  check(!b.sys.some((x) => x.startsWith('stageAway')), `같은 진행을 안내문 stageAway로 또 알리지 않는다 (창 하나로만: ${b.sys.filter((x) => x.startsWith('stage')).join(', ') || '안내문 없음'})`);
  check(!!idle && idle.a.join() === '60,1-3,1-5', `방치 우편의 제목 값에 진행이 적힌다 (${idle?.a.join()})`);
  b.ws.close();
} finally {
  await server.close();
}
