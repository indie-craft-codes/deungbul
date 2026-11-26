// 실제 서버와 웹소켓으로: 접속하면 처음 영웅 둘과 1-1 → 영웅 레벨 업(명령) → 1-1을 깸 → 1번·10번 뽑기 → 편성 바꾸기 →
// 별정수 → 조각 → 열쇠 던전(단계에서 나와 들어가고, 대장이 대신 싸워 깨고, 나오면 단계로) → 끊고 두 시간 뒤 다시 접속하면 방치 보상의 메시지와 받기.
// 서버 쪽에서 손대는 것은 시험을 빨리 하려는 재화·경험치 주기뿐이다 (관리자의 give와 같은 길: 지갑·가방).
import type { GachaMe, HeroesMe, KeysMe, PullGot, Reward, SquadMe, StageMe } from '@engine/shared/defs';
import type { ServerMsg } from '@engine/shared';
import { MemoryStore, startServer } from '@engine/server';
import { check, connect, settle, until, type Peer } from '@engine/testing';
import { installDalmuri } from '../server/dalmuri';
import { STARTER_HEROES } from '../shared/content';

interface Seen { heroes?: HeroesMe; gacha?: GachaMe; squad?: SquadMe; stage?: StageMe; keys?: KeysMe; pulls: PullGot[][]; clears: string[]; idle: { mail: number; min: number; r: Reward }[]; dungeon: string[] }
const fresh = (): Seen => ({ pulls: [], clears: [], idle: [], dungeon: [] });
const listen = (s: Seen) => (m: ServerMsg) => {
  if (m.t === 'me') {
    if (m.k === 'heroes') s.heroes = m.s as HeroesMe;
    else if (m.k === 'gacha') s.gacha = m.s as GachaMe;
    else if (m.k === 'squad') s.squad = m.s as SquadMe;
    else if (m.k === 'keys') s.keys = m.s as KeysMe;
    else if (m.k === 'stage') { s.stage = m.s as StageMe; if (s.stage.best && !s.clears.includes(s.stage.best)) s.clears.push(s.stage.best); }
  } else if (m.t === 'gacha') s.pulls.push(m.got);
  else if (m.t === 'idleGain') s.idle.push({ mail: m.mail, min: m.min, r: m.r });
  else if (m.t === 'dungeon') s.dungeon.push(m.id);
};

let offset = 0;
const store = new MemoryStore();
const server = await startServer(0, { store, game: { plugins: [installDalmuri], now: () => Date.now() + offset } });
const g = server.game;
const TOKEN = 'dalmuri-net-token-0001';
try {
  const sa = fresh();
  const a: Peer = await connect(server.port, 'Ari', TOKEN, listen(sa));
  await until(() => !!sa.stage?.run && !!sa.heroes && !!sa.squad && !!sa.gacha);
  check(Object.keys(sa.heroes ?? {}).sort().join() === [...STARTER_HEROES].sort().join() && sa.squad?.ids.length === 2 && sa.stage?.run?.id === '1-1' && sa.stage.auto,
    `접속하면 처음 영웅 둘이 편성되고 1-1로 들어간다, 자동 진행은 켜져 있다 (${Object.keys(sa.heroes ?? {}).join(',')}, ${sa.stage?.run?.id})`);
  const ea = g.ents.get(a.id)!;
  check(ea.sparks === 400 && ea.cls === 'captain', `처음 월석 400과 직업 '원정대장' (${ea.sparks}, ${ea.cls})`);

  // 영웅 레벨 업 (명령): 금화를 주고 둘을 레벨 12까지
  g.wallet.add(ea, 'gold', 40000, 'test');
  for (let i = 0; i < 11; i++) for (const id of STARTER_HEROES) a.send({ t: 'hero', a: 'level', id });
  await until(() => STARTER_HEROES.every((id) => (sa.heroes?.[id]?.[0] ?? 0) >= 12));
  check(STARTER_HEROES.every((id) => sa.heroes?.[id]?.[0] === 12), `영웅 레벨 업이 개인 상태로 돌아온다 (${STARTER_HEROES.map((id) => sa.heroes?.[id]?.[0]).join(', ')})`);

  // 1-1을 깬다 (영웅과 대장이 서버에서 싸운다)
  await until(() => sa.clears.includes('1-1'), 90_000);
  check(sa.clears.includes('1-1') && a.sys.some((x) => x.startsWith('stageClear:1-1')), `1-1을 깨고 자동 진행으로 다음 단계 (${sa.stage?.cur})`);
  check(ea.sparks >= 400 + 100, `처음 깬 보상의 월석 (${ea.sparks})`);

  // 뽑기 1번 (처음 월석으로), 10번 (월석을 더 주고)
  a.send({ t: 'gacha', id: 'halo', n: 1 });
  await until(() => sa.pulls.length === 1);
  check(sa.pulls[0]?.length === 1 && sa.gacha?.log.length === 1, `1번 뽑기의 결과와 기록 (${sa.pulls[0]?.[0]?.h})`);
  g.wallet.add(ea, 'sparks', 900, 'test');
  a.send({ t: 'gacha', id: 'froststar', n: 10 });
  await until(() => sa.pulls.length === 2 && (sa.gacha?.log.length ?? 0) === 11);
  check(sa.pulls[1]?.length === 10 && sa.pulls[1].some((x) => x.r >= 1), `두 번째 배너의 10번 뽑기: 열 명, 희귀 이상이 하나는 있다 (${sa.pulls[1]?.map((x) => x.h).join(', ')})`);
  check((sa.gacha?.pity.froststar ?? -1) >= 0 && (sa.gacha?.pity.halo ?? -1) >= 0, '천장의 셈은 배너마다 따로');

  // 편성: 가장 센 넷
  const owned = Object.keys(sa.heroes ?? {});
  const four = owned.sort((x, y) => g.roster.power(ea, y) - g.roster.power(ea, x)).slice(0, 4);
  a.send({ t: 'squad', ids: four });
  await until(() => sa.squad?.ids.join() === four.join());
  check(sa.squad?.ids.length === Math.min(4, owned.length) && g.squad.heroes(ea).length === sa.squad.ids.length, `편성을 넷으로 (${sa.squad?.ids.join(', ')}, 전투력 ${sa.squad?.power})`);

  // 별정수 → 조각
  g.bag.putItem(ea, 'essence', 6, 'test');
  const target = STARTER_HEROES[0], shards0 = sa.heroes?.[target]?.[2] ?? 0;
  a.send({ t: 'essence', id: target });
  await until(() => (sa.heroes?.[target]?.[2] ?? 0) > shards0);
  check((sa.heroes?.[target]?.[2] ?? 0) === shards0 + 5 && ea.items.essence === 3 && a.sys.some((x) => x.startsWith('essenceUsed')), `별정수 3으로 일반 영웅의 조각 5 (${shards0} → ${sa.heroes?.[target]?.[2]})`);
  a.send({ t: 'essence', id: 'starfall' in (sa.heroes ?? {}) ? 'nobody' : 'starfall' });
  await settle(a, 1);
  check(ea.items.essence === 3, '가지지 않은 영웅·없는 영웅에게는 쓰지 않는다');

  // 열쇠 던전: 레벨이 모자라면 단계에서 나오지 않는다
  a.send({ t: 'keyrun', id: 'starwell' });
  await settle(a, 1);
  check(g.stages.inStage(ea) && a.sys.some((x) => x.startsWith('dungeonLevel')), '대장 레벨이 모자라면 안내만 하고 단계에 남는다');
  g.players.grant(ea, 4000, 0);
  await until(() => a.lv >= 8);
  a.send({ t: 'keyrun', id: 'goldvein' });
  await until(() => !!g.dungeon.runOf(ea) && sa.keys?.goldvein?.n === 1);
  check(!!g.dungeon.runOf(ea) && !g.stages.inStage(ea) && sa.keys?.goldvein?.n === 1, `열쇠 하나를 쓰고 황금 광맥으로 (열쇠 ${sa.keys?.goldvein?.n})`);
  const gold0 = ea.gold;
  await until(() => !!g.dungeon.runOf(ea)?.cleared, 120_000);
  check(!!g.dungeon.runOf(ea)?.cleared, '던전 안에서는 대장도 대신 싸워 금고 골렘을 쓰러뜨린다');
  await until(() => g.stages.inStage(ea) && !!sa.stage?.run, 30_000);
  check(g.stages.inStage(ea) && !!sa.stage?.run, `던전에서 나오면 잠시 뒤 단계로 돌아간다 (${sa.stage?.run?.id})`);
  check(ea.mail.some((m) => m.k === 'dungeon'), `던전의 보상은 우편으로 (금화 ${gold0} → 받기 전)`);

  // 끊고 두 시간 뒤 다시 접속: 방치 보상의 메시지와 받기
  const best = sa.stage?.best ?? '';
  a.ws.close();
  await until(() => !g.ents.has(a.id));
  offset += 2 * 3600_000;
  const sb = fresh();
  const b = await connect(server.port, 'Ari', TOKEN, listen(sb));
  await until(() => sb.idle.length > 0 && !!sb.stage?.run);
  const pop = sb.idle[0];
  check(!!pop && pop.min === 120 && (pop.r.gold ?? 0) > 0 && sb.stage?.best === best, `두 시간 뒤 다시 접속하면 방치 보상의 창 (${pop?.min}분, 금화 ${pop?.r.gold}, 월석 ${pop?.r.sparks})`);
  const eb = g.ents.get(b.id)!, goldB = eb.gold;
  b.send({ t: 'mailClaim', id: pop.mail });
  await until(() => eb.gold > goldB);
  check(eb.gold === goldB + (pop.r.gold ?? 0) && !eb.mail.some((m) => m.id === pop.mail), `'받기'가 그 우편을 받는다 (금화 +${eb.gold - goldB})`);
  b.ws.close();
} finally {
  await server.close();
}
