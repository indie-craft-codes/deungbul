// 수집형·방치형 모듈의 저장: 다시 읽으면 같은가, 깨진 값을 걸러 내는가, 모듈을 끈 게임이 그 칸을 지우지 않는가(MODULE_SAVES), 버전 칸이 없는 옛 저장(v0)이 이전을 지나 그대로 읽히는가.
import { MODULE_SAVES } from '../../shared/modules';
import { HERO_RULES, seededRng } from '../../shared/defs';
import { Game } from '../../server/game/game';
import { check } from '../harness';

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
  check(!JSON.stringify(g.players.export(p)).includes('null'), '깨진 저장을 읽고 다시 적어도 null(NaN)이 없다');
}

// ---------- 모듈을 끈 게임은 그 칸을 지우지 않는다 ----------
{
  const g = quiet();
  const p = g.players.spawn('맡김', false, null, 'sv-3');
  g.roster.grant(p, 'starseer'); p.stage = { cur: '1-2', best: '1-1', auto: true };
  g.wallet.add(p, 'sparks', 1000, ''); g.gacha.draw(p, 'dawn', 1);
  const save = g.players.export(p);
  const lean = new Game({ plugins: [], modules: ['economy'] });
  const q = lean.players.spawn('맡김', false, structuredClone(save), 'sv-3');
  const kept = lean.players.export(q);
  check(['roster', 'gacha', 'squad', 'stages', 'keys'].every((k) => JSON.stringify(kept.ext?.[k]) === JSON.stringify(save.ext?.[k])) && !('heroes' in q),
    '영웅·뽑기·편성·단계·던전을 끈 게임이 읽고 다시 적어도 그 칸이 그대로 남는다 (엔티티에는 칸이 없다)');
  const back = quiet().players.spawn('맡김', false, kept, 'sv-3');
  check(!!back.heroes.starseer && back.stage.best === '1-1' && back.pulls.length === 1, '다시 켠 게임은 이어서 읽는다');
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
