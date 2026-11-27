// 자동 사냥 설정 (묶음 E: engine/shared/auto.ts의 AutoPrefs·pickTarget, 서버 away.ts의 명령 autoPrefs·저장 칸 'autoprefs'·멈춤 조건). 시험용 내용 위에서
import { AUTO, AUTO_PREFS, pickTarget, tidyPrefs } from '../../shared/auto';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { check } from '../harness';

// 대상 고르기: 설정이 없으면 예전의 고르기(maxD보다 가까운 것 가운데 가장 가까운 것, 같으면 먼저 본 것)와 똑같고, 목표·약한 것·제외를 따른다
{
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const old = (list: { d: number }[], maxD: number) => { let nd = maxD, best: { d: number } | undefined; for (const m of list) if (m.d < nd) { nd = m.d; best = m; } return best; };
  let same = 0;
  for (let k = 0; k < 300; k++) {
    const list = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => ({ d: Math.round(rnd() * 50), type: rnd() < 0.5 ? 'a' : 'b', weak: Math.round(rnd() * 100) }));
    if (pickTarget(list, (m) => m, null, [], AUTO.seek) === old(list, AUTO.seek) && pickTarget(list, (m) => m, tidyPrefs(null), [], AUTO.seek) === old(list, AUTO.seek)) same++;
  }
  const L = [{ d: 3, type: 'a', weak: 50 }, { d: 9, type: 'b', weak: 10 }, { d: 30, type: 'c', weak: 90 }];
  const pick = (p: Partial<typeof AUTO_PREFS>, goals: string[] = []) => pickTarget(L, (m) => m, tidyPrefs(p), goals, AUTO.seek)?.type;
  check(same === 300 && pick({ target: 'goal' }, ['c']) === 'c' && pick({ target: 'goal' }, []) === 'a' && pick({ target: 'weak' }) === 'b' && pick({ skip: ['a'] }) === 'b' && pick({ target: 'goal', skip: ['c'] }, ['c']) === 'a'
    && tidyPrefs({ potionAt: 2, stopHpAt: 0.9, range: 'x' as never, skip: [1, 'a', 'a'] as never }).potionAt === 0.95 && tidyPrefs({ potionAt: 0.3, stopHpAt: 0.6 }).stopHpAt === 0.3,
    `대상 고르기: 설정이 없으면 예전과 같다(무작위 300벌 ${same}), 목표 대상·약한 것·제외를 따르고, 믿지 않는 값은 다듬는다`);
}

// 서버: 바꾸지 않은 사람은 저장·판단이 예전과 같고(prefsFor null, 저장 칸 없음), 바꾸면 답하고 저장·다시 읽기·기본값으로
{
  const t = { clock: new Date(2026, 0, 10, 9).getTime() };
  const g = new Game({ now: () => t.clock });
  const p = g.players.spawn('설정', false, null, 'ap-1');
  const untouched = g.away.prefsFor(p) === null && (g.players.export(p).ext as Record<string, unknown>).autoprefs === undefined;
  g.out = [];
  g.command(p, { t: 'autoPrefs', p: { target: 'weak', skip: ['moth'], potionAt: 0.5, stopBag: true } });
  const reply = g.out.find((o) => o.id === p.id && o.msg.t === 'autoPrefs')?.msg as { s: { target: string; skip: string[]; potionAt: number; stopBag: boolean }; goal: boolean } | undefined;
  const save = g.players.export(p);
  const q = g.players.spawn('설정2', false, structuredClone(save), 'ap-2');
  const back = g.away.prefsOf(q);
  g.command(q, { t: 'autoPrefs', reset: true });
  check(untouched && reply?.s.target === 'weak' && reply.s.skip.join() === 'moth' && reply.s.potionAt === 0.5 && reply.goal === false
    && back.target === 'weak' && back.stopBag && g.away.prefsFor(q) === null && (g.players.export(q).ext as Record<string, unknown>).autoprefs === undefined,
    '설정: 바꾸지 않은 사람은 판단·저장이 예전과 같고, 바꾸면 답하고 저장되어 다시 읽히며, 기본값으로 되돌리면 저장 칸이 빠진다');
}

// 서버의 자리 비움 사냥: '목표 대상'이면 더 가까운 몬스터보다 목표 몬스터를, '가방이 가득 차면 멈춤'이면 가방이 차는 순간 멈추고 알린다
{
  const t = { clock: new Date(2026, 0, 10, 9).getTime() };
  const g = new Game({ now: () => t.clock });
  const run = (s: number) => { for (let i = 0, n = Math.round(s * 20); i < n; i++) { g.tick(0.05); t.clock += 50; } };
  const p: Ent = g.players.spawn('사냥', false, null, 'ap-3');
  g.classes.apply(p, 'knight');
  while (p.lv < 5) g.players.grant(p, 400, 0);
  for (const e of [...g.ents.values()]) if (e.kind === 'm') g.remove(e.id); // 빈 들판에서
  const near = g.monsters.spawn('mite', p.x + 3, p.z), far = g.monsters.spawn('moth', p.x + 12, p.z);
  near.layer = far.layer = p.layer;
  g.away.goalOf = () => ['moth'];
  g.command(p, { t: 'autoPrefs', p: { target: 'goal' } });
  p.auto = true; g.away.start(p);
  run(0.5);
  const chose = p.targetId === far.id;
  g.away.stop(p);
  // 가방을 거의 채우고 장비 하나를 준다: 가득 차는 순간 멈춘다
  g.command(p, { t: 'autoPrefs', p: { stopBag: true } });
  p.auto = true;
  while (p.gear.length < g.bag.slots(p) - 1) g.bag.giveGear(p, { ...p.gear[0], uid: 0 }, '', true);
  g.notices = [];
  g.gear.give(p, { ...p.gear[0], uid: 0 });
  check(chose && g.bag.full(p) && !p.auto && g.notices.some((n) => n.id === p.id && n.k === 'autoBagFull'),
    `자리 비움 사냥: 목표 대상이면 가까운 것(3m)보다 목표 몬스터(12m)를 고르고 (${chose}), 가방이 가득 차면 멈추고 알린다`);
}
