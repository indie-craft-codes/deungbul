// 수집형·방치형 모듈의 저장: 다시 읽으면 같은가, 깨진 값을 걸러 내는가, 모듈을 끈 게임이 그 칸을 지우지 않는가(MODULE_SAVES), 버전 칸이 없는 옛 저장(v0)이 이전을 지나 그대로 읽히는가.
import { MODULE_SAVES } from '../../shared/modules';
import { HERO_RULES, seededRng } from '../../shared/defs';
import { Game } from '../../server/game/game';
import { check } from '../harness';
import { keepsThroughLean, resavesClean } from './savebench';

const quiet = () => new Game({ plugins: [] });

// ---------- 다시 읽으면 같다 ----------
{
  const g = quiet();
  g.gacha.rng = seededRng(99);
  const p = g.players.spawn('저장', false, null, 'sv-1');
  g.wallet.add(p, 'sparks', 5000, ''); g.wallet.add(p, 'gold', 50000, '');
  g.gacha.draw(p, 'dawn', 10); g.gacha.draw(p, 'dawn', 10);
  for (const id of Object.keys(p.heroes)) g.roster.levelUp(p, id);
  g.squad.set(p, Object.keys(p.heroes).slice(0, 3));
  p.stage = { cur: '1-3', best: '1-2', auto: false };
  g.dungeon.keyCount(p, 'goldmine');
  const save = g.players.export(p);
  const ext = save.ext ?? {};
  check(['roster', 'gacha', 'squad', 'stages', 'keys'].every((k) => k in ext) && ['roster', 'gacha', 'squad', 'stages', 'keys'].every((k) => k in MODULE_SAVES.player),
    `캐릭터 저장의 ext에 roster, gacha, squad, stages, keys가 있고 모듈의 저장 칸 표(MODULE_SAVES)에 있다`);
  const h = quiet();
  const q = h.players.spawn('저장', false, structuredClone(save), 'sv-1');
  check(JSON.stringify(q.heroes) === JSON.stringify(p.heroes) && JSON.stringify(q.pity) === JSON.stringify(p.pity) && q.pulls.length === p.pulls.length && q.pulls[0].h === p.pulls[0].h
    && q.squad.join() === p.squad.join() && JSON.stringify(q.stage) === JSON.stringify({ cur: '1-3', best: '1-2', auto: false }),
    '다시 읽은 캐릭터의 영웅, 천장의 셈, 뽑기 기록, 편성, 단계가 같다');
  const again = h.players.export(q);
  const mine = (x: typeof save) => JSON.stringify(['roster', 'gacha', 'squad', 'stages', 'keys'].map((k) => x.ext?.[k]));
  check(mine(again) === mine(save) && again.gold === save.gold && again.sparks === save.sparks, `읽고 다시 적은 저장의 다섯 칸이 글자까지 같다 (${mine(save).length}글자)`);
}

// ---------- 깨진 값 ----------
{
  const g = quiet();
  const bad = {
    name: '깨짐', v: 1,
    ext: {
      roster: { ironwall: [999999, 99, -5], ghost: [1, 1, 1], swiftarrow: 'x', cinderwitch: [NaN, 'a', 3] },
      gacha: { pity: { dawn: 9999, nope: 3 }, log: [[1, 'dawn', 'ironwall', 0], [2, 'dawn', 'ghost', 0], 'junk'] },
      squad: ['ironwall', 'ironwall', 'ghost', 5],
      stages: { cur: '9-9', best: 42, auto: 'yes' },
      keys: { goldmine: [-3, 1e9, 7], nope: [1, 1, ''] },
    },
  };
  const p = g.players.spawn('깨짐', false, structuredClone(bad) as never, 'sv-2');
  check(p.heroes.ironwall.stars === HERO_RULES.maxStars && p.heroes.ironwall.lv === HERO_RULES.maxLv(HERO_RULES.maxStars) && p.heroes.ironwall.shards === 0 && !('ghost' in p.heroes) && !('swiftarrow' in p.heroes) && p.heroes.cinderwitch.lv === 1,
    `영웅: 범위 밖의 값은 잘리고, 없는 영웅과 깨진 줄은 버린다 (${JSON.stringify(p.heroes)})`);
  check(p.pity.dawn === 49 && !('nope' in p.pity) && p.pulls.length === 1, `뽑기: 천장의 셈은 after-1까지, 없는 배너·영웅의 기록은 버린다 (${JSON.stringify(p.pity)}, 기록 ${p.pulls.length})`);
  check(p.squad.join() === 'ironwall' || p.squad.length <= 1, `편성: 겹침과 없는 영웅은 버린다 (${p.squad.join()})`);
  check(p.stage.cur === '1-1' && p.stage.best === '' && p.stage.auto === true, `단계: 없는 단계는 처음으로 (${JSON.stringify(p.stage)})`);
  check(g.dungeon.keyCount(p, 'goldmine') >= 0 && g.dungeon.keyCount(p, 'goldmine') <= 9999, '열쇠: 음수와 큰 수는 범위 안으로');
  resavesClean(g, p);
}

// ---------- 모듈을 끈 게임은 그 칸을 지우지 않는다 ----------
{
  const g = quiet();
  const p = g.players.spawn('맡김', false, null, 'sv-3');
  g.roster.grant(p, 'starseer'); p.stage = { cur: '1-2', best: '1-1', auto: true };
  g.wallet.add(p, 'sparks', 1000, ''); g.gacha.draw(p, 'dawn', 1);
  keepsThroughLean({
    save: g.players.export(p), name: '맡김', pid: 'sv-3', modules: ['economy'], keys: ['roster', 'gacha', 'squad', 'stages', 'keys'], gone: ['heroes'], what: '영웅·뽑기·편성·단계·던전',
    resumed: (back) => !!back.heroes.starseer && back.stage.best === '1-1' && back.pulls.length === 1,
  });
}

// ---------- 버전 칸이 없는 옛 저장(v0)도 이전을 지나 읽힌다 ----------
{
  const g = quiet();
  const v0 = { name: '옛날', lv: 3, exp: 10, gold: 77, sparks: 5, ext: { roster: { dawnpriest: [4, 2, 6] }, stages: { cur: '1-2', best: '1-1', auto: true } } };
  const p = g.players.spawn('옛날', false, structuredClone(v0) as never, 'sv-4');
  const out = g.players.export(p);
  check(p.heroes.dawnpriest.lv === 4 && p.heroes.dawnpriest.shards === 6 && p.stage.cur === '1-2' && p.gold === 77 && typeof out.v === 'number' && out.v >= 1,
    `버전 칸이 없는 저장도 틀의 이전(PLAYER_UP)을 지나 읽히고, 쓸 때는 지금 버전(v ${out.v})을 적는다`);
}

// ---------- 픽업 배너·소탕·오프라인 진행의 저장 (칸을 더하기만 했다: 이전 없이 옛 저장이 그대로 읽히고, 옛 서버가 새 저장을 읽어도 모르는 칸은 무시한다) ----------
{
  const FROM = Date.UTC(2026, 10, 21);
  const g = new Game({ now: () => FROM, plugins: [] });
  const p = g.players.spawn('픽업 저장', false, null, 'sv-5');
  g.stages.leave(p, false);
  g.wallet.add(p, 'sparks', 1e6, '');
  g.gacha.rng = () => 0;
  for (let i = 0; i < 60; i++) g.gacha.draw(p, 'starfall', 1); // 60번째에 반반을 진다 → 확정
  for (let i = 0; i < 7; i++) g.gacha.draw(p, 'starfall', 1);
  for (let i = 0; i < 3; i++) g.gacha.draw(p, 'dawn', 1);
  g.bag.putItem(p, 'sweepticket', 4, ''); g.bag.putItem(p, 'herochoice', 1, '');
  const save = g.players.export(p);
  const ga = save.ext?.gacha as { pity: Record<string, number>; sure?: Record<string, number> };
  check(ga.pity['group:limited'] === 7 && ga.pity.dawn === 3 && !('starfall' in ga.pity) && ga.sure?.['group:limited'] === 1, `뽑기의 저장: 천장 무리는 'group:limited'에, 확정은 sure에 (${JSON.stringify(ga.pity)}, ${JSON.stringify(ga.sure)})`);
  const h = new Game({ now: () => FROM, plugins: [] });
  const q = h.players.spawn('픽업 저장', false, structuredClone(save), 'sv-5');
  check(h.gacha.pityOf(q, 'stormcall') === 7 && h.gacha.sureOf(q, 'stormcall') && h.gacha.pityOf(q, 'dawn') === 3 && q.items.sweepticket === 4 && q.items.herochoice === 1, '다시 읽으면 천장 무리의 셈과 확정, 소탕권과 선택권이 같다');
  check(JSON.stringify(h.players.export(q).ext?.gacha) === JSON.stringify(save.ext?.gacha), '읽고 다시 적은 뽑기의 칸이 글자까지 같다');
  // 확정이 없으면 예전 모양 그대로 (sure 칸이 없다)
  const r = g.players.spawn('예전 모양', false, null, 'sv-6');
  g.stages.leave(r, false);
  g.wallet.add(r, 'sparks', 1000, ''); g.gacha.draw(r, 'dawn', 1);
  check(!('sure' in (g.players.export(r).ext?.gacha as object)), '확정이 없는 사람의 뽑기 저장에는 sure 칸이 없다 (예전과 같은 모양)');
}

// ---------- 옛 저장: 무리에 들기 전의 셈(배너 id), 깨진 확정, 끝낸 적 ----------
{
  const g = new Game({ now: () => Date.UTC(2026, 10, 21), plugins: [] });
  const old = { name: '옛 픽업', v: 1, ext: { gacha: { pity: { starfall: 12, dawn: 4 }, log: [] }, keys: { goldmine: [1, 0, '2026-11-21'] } } };
  const p = g.players.spawn('옛 픽업', false, structuredClone(old) as never, 'sv-7');
  check(g.gacha.pityOf(p, 'starfall') === 12 && g.gacha.pityOf(p, 'stormcall') === 12 && !('starfall' in p.pity) && g.gacha.pityOf(p, 'dawn') === 4, '배너 id에 적힌 예전 셈(starfall 12)은 그 배너의 천장 무리로 옮겨 읽는다');
  check(!g.dungeon.won(p, 'goldmine') && JSON.stringify((g.players.export(p).ext?.keys as Record<string, unknown>).goldmine) === '[1,0,"2026-11-21"]', '끝낸 적이 없는 열쇠의 저장은 예전처럼 셋 (넷째 칸이 없다)');
  const both = { name: '둘 다', v: 1, ext: { gacha: { pity: { starfall: 12, 'group:limited': 30 }, log: [] } } };
  const q = g.players.spawn('둘 다', false, structuredClone(both) as never, 'sv-8');
  check(g.gacha.pityOf(q, 'starfall') === 30, '무리의 셈이 이미 있으면 그것을 쓴다');
  const bad = { name: '깨진 픽업', v: 1, ext: { gacha: { pity: { 'group:limited': 9999, 'group:nope': 3 }, log: [], sure: { 'group:limited': 'x', 'group:nope': 1, dawn: 1 } }, keys: { goldmine: [1, 0, '', 'x'] } } };
  const r = g.players.spawn('깨진 픽업', false, structuredClone(bad) as never, 'sv-9');
  check(g.gacha.pityOf(r, 'starfall') === 59 && !('group:nope' in r.pity) && !g.gacha.sureOf(r, 'starfall') && !('sure' in (g.players.export(r).ext?.gacha as object)) && !g.dungeon.won(r, 'goldmine'),
    `깨진 값: 셈은 after-1까지, 없는 무리와 1이 아닌 확정, 반반이 없는 배너(dawn)의 확정, 1이 아닌 끝낸 적은 버린다 (${JSON.stringify(r.pity)})`);
}
