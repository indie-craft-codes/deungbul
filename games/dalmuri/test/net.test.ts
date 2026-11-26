// 실제 서버와 웹소켓으로 (서버 시계는 2026-11-26 09:00 UTC에서 실제 시간만큼 흐른다: 월식 소환 '달방패'가 열린 때):
//   접속하면 처음 영웅 둘·소탕권과 1-1 → 영웅 레벨 업 → 1-1을 깸 → 1번·10번 뽑기 → 편성(앞줄·뒷줄) → 별정수 → 조각(틀의 교환 HERO_RULES.trade) →
//   영웅 장비 끼기·강화, 기술 레벨, 별 6과 각성 → 픽업 배너의 천장(60번째 전설, 반반에서 지면 다음 전설은 픽업 확정) →
//   메뉴에서 열쇠 던전(dungeonGo: 레벨이 모자라면 단계에 남는다, 들어가면 대장도 대신 싸워 깨고, 나오면 단계로) → 단계·던전 소탕 →
//   끊고 두 시간 뒤 다시 접속하면 돌아왔을 때의 창(idleBack) 하나만: 오프라인 진행은 창에 함께, 안내문 stageAway는 따로 오지 않는다 → 받기.
// 서버 쪽에서 손대는 것은 시험을 빨리 하려는 재화·재료·경험치·영웅 장비 주기(관리자의 give와 같은 길: 지갑·가방·장비 모듈)와 천장의 셈 놓기뿐이다.
import { seededRng, type GachaMe, type HeroesMe, type HeroGearMe, type IdleBack, type KeysMe, type PullGot, type SquadMe, type StageMe, type SweepGot } from '@engine/shared/defs';
import type { ServerMsg } from '@engine/shared';
import { MemoryStore, startServer } from '@engine/server';
import { check, connect, settle, until, type Peer } from '@engine/testing';
import { installDalmuri } from '../server/dalmuri';
import { STARTER_HEROES } from '../shared/content';

interface Seen { heroes?: HeroesMe; gacha?: GachaMe; squad?: SquadMe; stage?: StageMe; keys?: KeysMe; hgear?: HeroGearMe; pulls: PullGot[][]; clears: string[]; backs: IdleBack[]; dungeon: string[]; sweeps: SweepGot[] }
const fresh = (): Seen => ({ pulls: [], clears: [], backs: [], dungeon: [], sweeps: [] });
const listen = (s: Seen) => (m: ServerMsg) => {
  if (m.t === 'me') {
    if (m.k === 'heroes') s.heroes = m.s as HeroesMe;
    else if (m.k === 'gacha') s.gacha = m.s as GachaMe;
    else if (m.k === 'squad') s.squad = m.s as SquadMe;
    else if (m.k === 'keys') s.keys = m.s as KeysMe;
    else if (m.k === 'hgear') s.hgear = m.s as HeroGearMe;
    else if (m.k === 'stage') { s.stage = m.s as StageMe; if (s.stage.best && !s.clears.includes(s.stage.best)) s.clears.push(s.stage.best); }
  } else if (m.t === 'gacha') s.pulls.push(m.got);
  else if (m.t === 'idleBack') { const { t: _t, ...b } = m; s.backs.push(b); }
  else if (m.t === 'dungeon') s.dungeon.push(m.id);
  else if (m.t === 'sweep') s.sweeps.push(m.got);
};

const T0 = Date.UTC(2026, 10, 26, 9, 0, 0), started = Date.now();
let offset = 0;
const store = new MemoryStore();
const server = await startServer(0, { store, game: { plugins: [installDalmuri], now: () => T0 + (Date.now() - started) + offset } });
const g = server.game;
g.gacha.rng = seededRng(11);
g.herogear.rng = seededRng(12);
const TOKEN = 'dalmuri-net-token-0001';
try {
  const sa = fresh();
  const a: Peer = await connect(server.port, 'Ari', TOKEN, listen(sa));
  await until(() => !!sa.stage?.run && !!sa.heroes && !!sa.squad && !!sa.gacha && !!sa.hgear);
  check(Object.keys(sa.heroes ?? {}).sort().join() === [...STARTER_HEROES].sort().join() && sa.squad?.ids.length === 2 && sa.stage?.run?.id === '1-1' && sa.stage.auto,
    `접속하면 처음 영웅 둘이 편성되고 1-1로 들어간다, 자동 진행은 켜져 있다 (${Object.keys(sa.heroes ?? {}).join(',')}, ${sa.stage?.run?.id})`);
  const ea = g.ents.get(a.id)!;
  check(ea.sparks === 400 && ea.cls === 'captain' && ea.items.sweepticket === 3, `처음 월석 400, 소탕권 3, 직업 '원정대장' (${ea.sparks}, ${ea.items.sweepticket}, ${ea.cls})`);
  check(!!sa.gacha?.open && sa.gacha.open.halo === -1 && (sa.gacha.open.eclipseMoon ?? 0) > 0 && !('eclipseStar' in sa.gacha.open), `열린 배너: 늘 있는 둘과 월식 소환 '달방패'(남은 ${sa.gacha?.open?.eclipseMoon}분). 다음 월식은 아직`);

  // 영웅 레벨 업 (명령): 금화를 주고 둘을 레벨 12까지
  g.wallet.add(ea, 'gold', 40000, 'test');
  for (let i = 0; i < 11; i++) for (const id of STARTER_HEROES) a.send({ t: 'hero', a: 'level', id });
  await until(() => STARTER_HEROES.every((id) => (sa.heroes?.[id]?.[0] ?? 0) >= 12));
  check(STARTER_HEROES.every((id) => sa.heroes?.[id]?.[0] === 12), `영웅 레벨 업이 개인 상태로 돌아온다 (${STARTER_HEROES.map((id) => sa.heroes?.[id]?.[0]).join(', ')})`);

  // 1-1을 깬다 (영웅과 대장이 서버에서 싸운다)
  await until(() => sa.clears.includes('1-1'), 90_000);
  check(sa.clears.includes('1-1') && a.sys.some((x) => x.startsWith('stageClear:1-1')), `1-1을 깨고 자동 진행으로 다음 단계 (${sa.stage?.cur})`);
  check(ea.sparks >= 400 + 100 && (ea.items.starsteel ?? 0) >= 1, `처음 깬 보상의 월석, 깰 때마다 운철 (${ea.sparks}, 운철 ${ea.items.starsteel})`);

  // 뽑기 1번 (처음 월석으로), 10번 (월석을 더 주고)
  a.send({ t: 'gacha', id: 'halo', n: 1 });
  await until(() => sa.pulls.length === 1);
  check(sa.pulls[0]?.length === 1 && sa.gacha?.log.length === 1, `1번 뽑기의 결과와 기록 (${sa.pulls[0]?.[0]?.h})`);
  g.wallet.add(ea, 'sparks', 900, 'test');
  a.send({ t: 'gacha', id: 'froststar', n: 10 });
  await until(() => sa.pulls.length === 2 && (sa.gacha?.log.length ?? 0) === 11);
  check(sa.pulls[1]?.length === 10 && sa.pulls[1].some((x) => x.r >= 1), `두 번째 배너의 10번 뽑기: 열 명, 희귀 이상이 하나는 있다 (${sa.pulls[1]?.map((x) => x.h).join(', ')})`);

  // 픽업 배너의 천장: 59번 나오지 않은 셈에서 1번 → 60번째는 전설. 픽업(달방패)이 아니면 확정이 켜지고, 다음 전설(다시 천장)은 픽업
  {
    const KEY = 'group:eclipse';
    ea.pity[KEY] = 59; ea.unsaved = true;
    g.wallet.add(ea, 'sparks', 200, 'test');
    a.send({ t: 'gacha', id: 'eclipseMoon', n: 1 });
    await until(() => sa.pulls.length === 3);
    const first = sa.pulls[2][0], lost = first.h !== 'moonshield';
    check(first.r === 2 && (sa.gacha?.pity[KEY] ?? 0) === 0 && g.gacha.sureOf(ea, 'eclipseMoon') === lost,
      `월식 소환의 60번째는 전설 (${first.h}): ${lost ? '픽업이 아니라 다음 전설은 픽업 확정이 켜졌다' : '픽업이 나와 확정은 꺼진 채'}`);
    if (lost) {
      ea.pity[KEY] = 59;
      a.send({ t: 'gacha', id: 'eclipseStar', n: 1 }); // 아직 열리지 않은 배너: 값도 치르지 않는다
      await until(() => a.sys.includes('bannerClosed:eclipseStar'));
      a.send({ t: 'gacha', id: 'eclipseMoon', n: 1 });
      await until(() => sa.pulls.length === 4);
      check(sa.pulls[3][0].h === 'moonshield' && !g.gacha.sureOf(ea, 'eclipseMoon'), `확정이 켜진 뒤의 전설은 픽업 달방패 (${sa.pulls[3][0].h}), 확정은 꺼진다. 닫힌 배너는 bannerClosed`);
    } else check(!!sa.heroes?.moonshield, '픽업 영웅을 얻었다');
  }

  // 편성: 가장 센 넷, 그 가운데 둘은 뒷줄
  const owned = Object.keys(sa.heroes ?? {});
  const four = owned.sort((x, y) => g.roster.power(ea, y) - g.roster.power(ea, x)).slice(0, 4);
  a.send({ t: 'squad', ids: four, back: four.slice(2) });
  await until(() => sa.squad?.ids.join() === four.join() && (sa.squad.back?.length ?? 0) === 2);
  check(sa.squad?.ids.length === 4 && g.squad.heroes(ea).length === 4 && sa.squad.back?.join() === four.slice(2).join() && Array.isArray(sa.squad.syn),
    `편성을 넷으로, 뒷줄 둘 (${sa.squad?.ids.join(', ')} / 뒷줄 ${sa.squad?.back?.join(', ')}, 시너지 ${sa.squad?.syn?.map((x) => `${x.tag}${x.n}:${x.tier}`).join(' ')}, 전투력 ${sa.squad?.power})`);

  // 별정수 → 조각 (틀의 교환): 일반 영웅은 별정수 3으로 조각 5
  g.bag.putItem(ea, 'essence', 6, 'test');
  const target = STARTER_HEROES[0], shards0 = sa.heroes?.[target]?.[2] ?? 0;
  a.send({ t: 'hero', a: 'trade', id: target, item: 'essence' });
  await until(() => (sa.heroes?.[target]?.[2] ?? 0) > shards0);
  check((sa.heroes?.[target]?.[2] ?? 0) === shards0 + 5 && ea.items.essence === 3 && a.sys.some((x) => x.startsWith('heroTraded')), `별정수 3으로 일반 영웅의 조각 5 (${shards0} → ${sa.heroes?.[target]?.[2]})`);
  a.send({ t: 'hero', a: 'trade', id: 'nobody', item: 'essence' });
  a.send({ t: 'hero', a: 'trade', id: target, item: 'essence', n: 2 });
  await settle(a, 1);
  check(ea.items.essence === 3 && a.sys.some((x) => x.startsWith('itemShort')), '없는 영웅에게는 쓰지 않고, 모자라면(2번에 6개) 하나도 바꾸지 않는다');

  // 영웅 장비: 끼고 강화 (운철과 금화)
  {
    const hero = four[0], p0 = g.roster.power(ea, hero);
    const piece = g.herogear.give(ea, 'lunarblade')!;
    await until(() => !!sa.hgear?.items.some(([uid]) => uid === piece.uid));
    a.send({ t: 'hgear', a: 'equip', uid: piece.uid, hero });
    await until(() => !!sa.hgear?.items.some(([uid, , , h]) => uid === piece.uid && h === hero));
    const p1 = g.roster.power(ea, hero);
    check(p1 > p0, `영웅 장비 '달빛 검'을 끼면 전투력이 오른다 (${hero}: ${p0} → ${p1})`);
    g.bag.putItem(ea, 'starsteel', 10, 'test');
    a.send({ t: 'hgear', a: 'enhance', uid: piece.uid });
    await until(() => !!sa.hgear?.items.some(([uid, , lv]) => uid === piece.uid && lv === 1));
    check(g.roster.power(ea, hero) > p1 && a.sys.some((x) => x.startsWith('hgEnhance')), `강화 +1 (처음 셋은 늘 성공): 전투력 ${p1} → ${g.roster.power(ea, hero)}`);
  }

  // 기술 레벨 (별자리 서책)과 각성 (별 6에서 조각·금화·달 조각)
  {
    const id = STARTER_HEROES[0];
    g.bag.putItem(ea, 'starchart', 1, 'test');
    a.send({ t: 'hero', a: 'skill', id });
    await until(() => (sa.heroes?.[id]?.[3] ?? 1) === 2);
    check(sa.heroes?.[id]?.[3] === 2 && (ea.items.starchart ?? 0) === 0, `기술 레벨 1 → 2 (서책 하나와 금화)`);
    // 별 6까지: 별정수로 조각을 모아(한 번에 99묶음까지) 별 올리기 다섯 번
    g.bag.putItem(ea, 'essence', 150, 'test');
    a.send({ t: 'hero', a: 'trade', id, item: 'essence', n: 34 });
    for (let i = 0; i < 5; i++) a.send({ t: 'hero', a: 'star', id });
    await until(() => sa.heroes?.[id]?.[1] === 6);
    check(sa.heroes?.[id]?.[1] === 6, `별정수 → 조각 → 별 6 (조각 ${sa.heroes?.[id]?.[2]})`);
    a.send({ t: 'hero', a: 'awaken', id });
    await settle(a, 1);
    check((sa.heroes?.[id]?.[4] ?? 0) === 0 && a.sys.some((x) => x.startsWith('itemShort')), '달 조각이 없으면 각성하지 않는다');
    g.bag.putItem(ea, 'moonshard', 1, 'test');
    const p0 = g.roster.power(ea, id);
    a.send({ t: 'hero', a: 'awaken', id });
    await until(() => sa.heroes?.[id]?.[4] === 1);
    check(sa.heroes?.[id]?.[4] === 1 && g.roster.power(ea, id) > p0 && (ea.items.moonshard ?? 0) === 0 && a.sys.some((x) => x.startsWith('heroAwaken')), `각성 1단계 '달빛 장막': 전투력 ${p0} → ${g.roster.power(ea, id)}`);
  }

  // 메뉴에서 열쇠 던전: 레벨이 모자라면 단계에서 나오지 않는다
  a.send({ t: 'dungeonGo', id: 'starwell' });
  await settle(a, 1);
  check(g.stages.inStage(ea) && a.sys.some((x) => x.startsWith('dungeonLevel')), '대장 레벨이 모자라면 안내만 하고 단계에 남는다');
  g.players.grant(ea, 4000, 0);
  await until(() => a.lv >= 8);
  a.send({ t: 'dungeonGo', id: 'goldvein' });
  await until(() => !!g.dungeon.runOf(ea) && sa.keys?.goldvein?.n === 1);
  check(!!g.dungeon.runOf(ea) && !g.stages.inStage(ea) && sa.keys?.goldvein?.n === 1 && sa.dungeon.includes('goldvein'), `메뉴에서 열쇠 하나를 쓰고 황금 광맥으로 (열쇠 ${sa.keys?.goldvein?.n})`);
  await until(() => !!g.dungeon.runOf(ea)?.cleared, 120_000);
  check(!!g.dungeon.runOf(ea)?.cleared, '던전 안에서는 대장도 대신 싸워 금고 골렘을 쓰러뜨린다 (DungeonDef.auto)');
  await until(() => g.stages.inStage(ea) && !!sa.stage?.run, 30_000);
  check(g.stages.inStage(ea) && !!sa.stage?.run && !g.dungeon.runOf(ea), `던전에서 나오면 잠시 뒤 단계로 돌아간다 (STAGE_RULES.returnAfterDungeon: ${sa.stage?.run?.id})`);
  check(ea.mail.some((m) => m.k === 'dungeon') && !!sa.keys?.goldvein?.won, '던전의 보상은 우편으로, 끝낸 적이 생긴다 (소탕의 조건)');

  // 소탕: 깬 단계 1-1 ×2 (소탕권 둘), 황금 광맥 ×1 (열쇠 하나)
  {
    const t0 = ea.items.sweepticket ?? 0, gold0 = ea.gold;
    a.send({ t: 'stage', a: 'sweep', id: '1-1', n: 2 });
    await until(() => sa.sweeps.length === 1);
    check(sa.sweeps[0].k === 'stage' && sa.sweeps[0].n === 2 && (ea.items.sweepticket ?? 0) === t0 - 2 && sa.sweeps[0].cur.gold === 120 && ea.gold === gold0 + 120,
      `단계 소탕 ×2: 소탕권 ${t0} → ${ea.items.sweepticket}, 금화 +${sa.sweeps[0].cur.gold} (보통 보상 두 번)`);
    a.send({ t: 'stage', a: 'sweep', id: '3-1', n: 1 });
    await settle(a, 1);
    check(a.sys.some((x) => x.startsWith('sweepLocked')) && sa.sweeps.length === 1, '깨지 않은 단계는 소탕하지 않는다 (sweepLocked)');
    const k0 = sa.keys?.goldvein?.n ?? 0;
    a.send({ t: 'dungeonSweep', id: 'goldvein', n: 1 });
    await until(() => sa.sweeps.length === 2 && (sa.keys?.goldvein?.n ?? -1) === k0 - 1);
    check(sa.sweeps[1].k === 'dungeon' && sa.sweeps[1].cur.gold === 1200, `끝낸 열쇠 던전의 소탕: 열쇠 ${k0} → ${sa.keys?.goldvein?.n}, 금화 ${sa.sweeps[1].cur.gold}`);
  }

  // 끊고 두 시간 뒤 다시 접속: 돌아왔을 때의 창 하나 (오프라인 진행이 있으면 창에 함께), 안내문 stageAway는 오지 않는다
  ea.stage.auto = true;
  const best = ea.stage.best, power = g.squad.power(ea);
  a.ws.close();
  await until(() => !g.ents.has(a.id));
  offset += 2 * 3600_000;
  const sb = fresh();
  const b = await connect(server.port, 'Ari', TOKEN, listen(sb));
  await until(() => sb.backs.length > 0 && !!sb.stage?.run);
  await settle(b, 1);
  const pop = sb.backs[0];
  check(sb.backs.length === 1 && pop.min === 120 && (pop.r.gold ?? 0) > 0, `두 시간 뒤 다시 접속하면 돌아왔을 때의 창이 한 번 (${pop?.min}분, 금화 ${pop?.r.gold}, 월석 ${pop?.r.sparks})`);
  check(!!pop.to && pop.from !== pop.to && sb.stage?.best !== best, `편성의 전투력 ${power}로 비운 동안 단계가 나아가 창에 함께 적힌다 (${pop.from} → ${pop.to}, ${pop.n}단계, 가장 멀리 ${best} → ${sb.stage?.best})`);
  check(!b.sys.some((x) => x.startsWith('stageAway')), `같은 진행을 안내문 stageAway로 또 알리지 않는다 (${b.sys.filter((x) => x.startsWith('stage')).join(', ') || '안내문 없음'})`);
  const eb = g.ents.get(b.id)!, goldB = eb.gold;
  b.send({ t: 'mailClaim', id: pop.mail });
  await until(() => eb.gold > goldB);
  check(eb.gold === goldB + (pop.r.gold ?? 0) && !eb.mail.some((m) => m.id === pop.mail), `'받기'가 그 우편을 받는다 (금화 +${eb.gold - goldB})`);
  b.ws.close();
} finally {
  await server.close();
}
