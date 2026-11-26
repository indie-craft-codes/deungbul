// 수집형·방치형 모듈의 서버 규칙 (engine/server/game/systems/roster.ts, gacha.ts, squad.ts, stages.ts, dungeon.ts의 열쇠, idle.ts의 깬 단계):
//   영웅 얻기·조각·레벨 업(지갑)·별 올리기, 뽑기의 확률(정해진 난수로 많이 뽑아 공개 확률과 견준다)·천장·10번 보장·값·기록·같은 씨앗이면 같은 결과,
//   편성(검사, 자동으로 채우기, 영웅이 몬스터를 잡고 보상은 주인에게, 쓰러졌다 일어나기, 층 따라가기), 단계(깸·다음 단계·실패·잠김·우두머리),
//   열쇠(채우기·상한·사기·하루 한도·들어가기), 방치 보상이 깬 단계로 커지는 것.
import { BANNERS, CHAPTERS, GACHA_RULES, HERO_RULES, SQUAD_RULES, STAGES, bannerOdds, heroStats, pityOdds, rarityOdds, seededRng, waveCount, type Odds } from '../../shared/defs';
import { COLLECT_MODULES, RPG_MODULES, checkModules } from '../../shared/modules';
import { dist, type Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { isField } from '../../server/game/layers';
import { check } from '../harness';
import { heath } from './server/heath';

const said = (g: Game, p: Ent, k: string) => g.notices.some((n) => n.id === p.id && n.k === k);
const run = (g: Game, s: number) => { for (let i = 0; i < s * 20; i++) g.tick(0.05); };
/** 접속하면 바로 단계로 들어가지 않는 게임 (규칙만 볼 때) */
const quiet = (now?: () => number) => new Game({ now, plugins: [] });

// ---------- 모듈의 표 ----------
{
  check(COLLECT_MODULES.every((m) => !RPG_MODULES.includes(m)), 'RPG_MODULES(등불지기가 쓰는 목록)에는 수집형의 넷이 없다');
  let err = '';
  try { checkModules(['economy', 'roster', 'squad']); } catch (e) { err = (e as Error).message; }
  check(err.includes('squad → combat'), `편성은 전투 없이 고를 수 없다 (${err.slice(0, 60)}…)`);
  err = '';
  try { checkModules(['gacha', 'economy']); } catch (e) { err = (e as Error).message; }
  check(err.includes('gacha → roster'), '뽑기는 영웅 모듈 없이 고를 수 없다');
}

// ---------- 영웅: 얻기, 조각, 레벨 업, 별 ----------
{
  const g = quiet();
  const p = g.players.spawn('영웅', false, null, 'r-1');
  const got = g.roster.grant(p, 'cinderwitch');
  check(!!got && !got.dup && p.heroes.cinderwitch.lv === 1 && p.heroes.cinderwitch.stars === 2 && said(g, p, 'heroNew'), '처음 얻은 영웅은 1레벨, 그 등급의 처음 별(희귀 2), 새 영웅 알림');
  const dup = g.roster.grant(p, 'cinderwitch');
  check(!!dup && dup.dup && dup.shards === 10 && p.heroes.cinderwitch.shards === 10, '이미 가진 영웅은 그 등급의 조각(희귀 10)이 된다');
  check(g.roster.grant(p, 'nobody') === null && !('nobody' in p.heroes), '없는 영웅은 주지 않는다');
  g.command(p, { t: 'hero', a: 'level', id: 'cinderwitch' });
  check(p.heroes.cinderwitch.lv === 1 && said(g, p, 'costShort'), '골드가 모자라면 레벨이 오르지 않고 까닭을 알린다');
  g.wallet.add(p, 'gold', 100000, '');
  const before = p.gold, cost = HERO_RULES.levelCost(1, 1);
  g.command(p, { t: 'hero', a: 'level', id: 'cinderwitch' });
  check(p.heroes.cinderwitch.lv === 2 && p.gold === before - cost, `레벨 업은 지갑에서 값(${cost})을 치른다`);
  while (p.heroes.cinderwitch.lv < HERO_RULES.maxLv(2)) g.roster.levelUp(p, 'cinderwitch');
  g.notices = [];
  check(!g.roster.levelUp(p, 'cinderwitch') && said(g, p, 'heroMaxLv'), `별 2의 레벨 상한(${HERO_RULES.maxLv(2)})에서는 더 오르지 않는다`);
  g.notices = [];
  check(!g.roster.starUp(p, 'cinderwitch') && said(g, p, 'heroShards'), `조각이 모자라면 별이 오르지 않는다 (가진 10, 필요 ${HERO_RULES.starCost(2)})`);
  g.roster.grant(p, 'cinderwitch');
  const s0 = heroStats('cinderwitch', p.heroes.cinderwitch.lv, 2);
  check(g.roster.starUp(p, 'cinderwitch') && p.heroes.cinderwitch.stars === 3 && p.heroes.cinderwitch.shards === 0, '조각 20으로 별 2 → 3');
  const s1 = heroStats('cinderwitch', p.heroes.cinderwitch.lv, 3);
  check(s1.atk > s0.atk && s1.hp > s0.hp && Math.abs(s1.atk / s0.atk - (1 + HERO_RULES.starMul) / 1) < 0.05, `별이 오르면 공격·체력이 starMul만큼 (${s0.atk} → ${s1.atk})`);
  check(g.roster.levelUp(p, 'cinderwitch'), '별이 오르면 레벨 상한도 오른다');
  const save = g.players.export(p);
  check(JSON.stringify(save.ext?.roster) === JSON.stringify({ cinderwitch: [p.heroes.cinderwitch.lv, 3, 0] }), `저장은 ext.roster의 [레벨, 별, 조각] (${JSON.stringify(save.ext?.roster)})`);
}

// ---------- 뽑기: 확률 (정해진 난수로 많이 뽑아 공개 확률과 견준다) ----------
{
  const b = BANNERS.dawn, pity = b.pity, ten = b.tenAtLeast;
  const odds = bannerOdds(b), byR = rarityOdds(odds);
  check(Math.abs(odds.reduce((s, o) => s + o.p, 0) - 1) < 1e-12 && Math.abs(byR[0] - 0.75) < 1e-12 && Math.abs(byR[1] - 0.22) < 1e-12 && Math.abs(byR[2] - 0.03) < 1e-12,
    `공개 확률의 합은 1, 등급별 일반 75%·희귀 22%·전설 3% (${byR.map((x) => (x * 100).toFixed(2)).join(' / ')})`);
  const po = pityOdds(b);
  check(po.length === 2 && po.every((o) => o.rarity === 2 && Math.abs(o.p - 0.5) < 1e-12), '천장의 확률표: 전설 둘이 반씩 (전설끼리의 비율은 평소와 같다)');
  // 천장과 10번 보장을 끄고 단일 뽑기만 (평소의 확률을 본다)
  Object.assign(b, { pity: undefined, tenAtLeast: undefined });
  const g = quiet(), p = g.players.spawn('뽑기', false, null, 'g-1');
  g.gacha.rng = seededRng(12345);
  g.wallet.add(p, 'sparks', 1e9, '');
  const N = 30000, count = new Map<string, number>();
  for (let i = 0; i < N; i++) for (const x of g.gacha.draw(p, 'dawn', 1) ?? []) count.set(x.h, (count.get(x.h) ?? 0) + 1);
  // 4시그마 안: 영웅마다
  const off = odds.filter((o: Odds) => { const sd = Math.sqrt(N * o.p * (1 - o.p)); return Math.abs((count.get(o.hero) ?? 0) - N * o.p) > 4 * sd; });
  check(off.length === 0, `뽑기 ${N}번의 영웅마다의 수가 공개 확률의 4시그마 안이다 (${odds.map((o) => `${o.hero} ${count.get(o.hero) ?? 0}/${Math.round(N * o.p)}`).join(', ')})`);
  const legends = (count.get('stormblade') ?? 0) + (count.get('starseer') ?? 0);
  check(Math.abs(legends / N - 0.03) < 0.006, `전설의 비율 ${(legends / N * 100).toFixed(2)}% ≈ 3%`);
  Object.assign(b, { pity, tenAtLeast: ten });
}

// ---------- 뽑기: 천장, 10번 보장, 값, 기록, 같은 씨앗 ----------
{
  const g = quiet(), p = g.players.spawn('천장', false, null, 'g-2');
  g.gacha.rng = () => 0; // 언제나 첫 칸(일반 영웅)이 나오는 난수: 천장이 아니면 전설이 나오지 않는다
  g.wallet.add(p, 'sparks', 100000, '');
  const singles: string[] = [];
  for (let i = 0; i < 49; i++) singles.push(...(g.gacha.draw(p, 'dawn', 1) ?? []).map((x) => x.h));
  check(singles.every((h) => h === 'ironwall') && g.gacha.pityOf(p, 'dawn') === 49, `49번째까지 전설이 없으면 셈이 49 (${g.gacha.pityOf(p, 'dawn')})`);
  const fifty = g.gacha.draw(p, 'dawn', 1)![0];
  check(fifty.r === 2 && fifty.pity && g.gacha.pityOf(p, 'dawn') === 0, `50번째 뽑기는 전설에서만 (${fifty.h}), 셈은 0으로`);
  const tenRes = g.gacha.draw(p, 'dawn', 10)!;
  check(tenRes.length === 10 && tenRes.slice(0, 9).every((x) => x.r === 0) && tenRes[9].r >= 1 && tenRes[9].pity, `10번 뽑기: 앞의 아홉이 일반이면 열째는 희귀 이상 (${tenRes[9].h})`);
  check(p.sparks === 100000 - 50 * 100 - 900, `값: 1번 100 × 50, 10번 900 (남은 보석 ${p.sparks})`);
  check(p.pulls.length === GACHA_RULES.history && p.pulls[0].h === tenRes[9].h && p.pulls[0].pity, `기록은 최근 ${GACHA_RULES.history}개, 새 것이 앞`);
  g.wallet.take(p, 'sparks', p.sparks, '');
  g.notices = [];
  const n0 = Object.keys(p.heroes).length;
  check(g.gacha.draw(p, 'dawn', 10) === null && said(g, p, 'costShort') && Object.keys(p.heroes).length === n0, '보석이 모자라면 뽑지 않고 아무것도 바뀌지 않는다');
  g.command(p, { t: 'gacha', id: 'dawn', n: 3 }); g.command(p, { t: 'gacha', id: 'nope', n: 1 });
  check(g.out.filter((o) => o.msg.t === 'gacha').length === 51, '1·10이 아닌 횟수와 없는 배너는 받지 않는다');
  // 같은 씨앗이면 같은 결과
  const same = () => { const h = quiet(), q = h.players.spawn('씨앗', false, null, 'g-3'); h.gacha.rng = seededRng(7); h.wallet.add(q, 'sparks', 1e6, ''); return [1, 2, 3].flatMap(() => h.gacha.draw(q, 'dawn', 10)!.map((x) => x.h)).join(); };
  check(same() === same(), '같은 씨앗의 난수면 뽑기의 결과가 같다 (서버의 난수를 바꿔 끼울 수 있다)');
}

// ---------- 편성: 검사, 자동 채우기, 영웅이 몬스터를 잡는다 ----------
{
  const g = quiet();
  const p = g.players.spawn('편성', false, null, 's-1');
  g.stages.leave(p, false);
  check(p.squad.length === 0 && g.squad.heroes(p).length === 0, '영웅이 없으면 편성도 싸우는 영웅도 없다');
  for (const id of ['ironwall', 'swiftarrow', 'cinderwitch', 'dawnpriest', 'stormblade']) g.roster.grant(p, id);
  check(p.squad.join() === 'ironwall,swiftarrow,cinderwitch,dawnpriest' && g.squad.heroes(p).length === SQUAD_RULES.size, `처음 얻은 영웅은 빈 자리에 저절로 (넷까지: ${p.squad.join(', ')})`);
  check(g.squad.heroes(p).every((e) => e.kind === 'hero' && e.layer === p.layer && dist(e, p) < 8 && e.maxHp === heroStats(e.type, 1, p.heroes[e.type].stars).hp), '싸우는 영웅은 주인 곁에, 체력은 영웅의 레벨과 별로');
  check(!g.squad.set(p, ['ironwall', 'ironwall']) && !g.squad.set(p, ['starseer']) && !g.squad.set(p, ['ironwall', 'swiftarrow', 'cinderwitch', 'dawnpriest', 'stormblade']) && !g.squad.set(p, ['ironwall', 7]),
    '겹치는 영웅, 없는 영웅, 넘치는 수, 이상한 값은 받지 않는다');
  g.command(p, { t: 'squad', ids: ['stormblade', 'ironwall'] });
  check(p.squad.join() === 'stormblade,ironwall' && g.squad.heroes(p).map((e) => e.type).join() === 'stormblade,ironwall', '편성을 바꾸면 빠진 영웅은 사라지고 새 영웅이 선다');
  check(g.squad.power(p) === g.roster.power(p, 'stormblade') + g.roster.power(p, 'ironwall'), '편성의 전투력은 영웅의 전투력의 합');
  // 몬스터 하나를 곁에 놓으면 영웅이 노려 잡고, 보상은 주인에게 간다 (주인은 가만히 있다)
  const m = g.monsters.spawn('slime', p.x + 5, p.z + 2);
  m.layer = p.layer;
  const gold0 = p.gold;
  let killedBy: Ent[] = [];
  g.on('monsterKilled', (dead, hitters) => { if (dead === m) killedBy = hitters; });
  for (let i = 0; i < 400 && !m.dead; i++) g.tick(0.05);
  check(m.dead && killedBy.includes(p) && p.gold > gold0 && p.targetId === 0, `영웅이 몬스터를 잡고(${m.dead}), 처치 보상은 주인에게 (골드 ${gold0} → ${p.gold})`);
  // 몬스터는 자기를 때린 영웅을 노리고, 영웅의 체력이 0이 되면 쓰러졌다가 다시 일어난다
  const h = g.squad.heroes(p)[1];
  const ogre = g.monsters.spawn('ogre', h.x + 2, h.z);
  ogre.layer = p.layer; ogre.targetId = h.id;
  g.combat.damage(ogre, h, h.hp + 5, false);
  check(h.dead && h.hp === 0 && !p.dead && p.hp === p.maxHp && ogre.targetId === 0, '영웅이 쓰러지면 쉬게 되고(주인은 쓰러지지 않는다) 몬스터는 그 영웅을 놓는다');
  g.remove(ogre.id);
  run(g, SQUAD_RULES.reviveS + 0.5);
  check(!h.dead && h.hp === h.maxHp && dist(h, p) < 8, `쓰러진 영웅은 ${SQUAD_RULES.reviveS}초 뒤 주인 곁에서 일어난다`);
  // 주인이 층을 옮기면 따라온다
  p.layer = 3;
  run(g, 0.2);
  check(g.squad.heroes(p).every((e) => e.layer === 3), '주인이 층(채널, 인스턴스)을 옮기면 영웅도 따라 옮긴다');
  g.players.leave(p.id);
  check(![...g.ents.values()].some((e) => e.kind === 'hero'), '주인이 나가면 영웅도 사라진다');
}

// ---------- 단계: 들어가기, 깸, 다음 단계, 실패, 잠김 ----------
{
  check(STAGES.length === 10 && STAGES[0].id === '1-1' && STAGES[4].id === '1-5' && STAGES[5].id === '2-1' && !!STAGES[4].def.boss && !STAGES[3].def.boss && waveCount(STAGES[4].def) === 3,
    `단계의 목록: 장 둘 × 다섯, id는 '장-단계', 다섯째는 우두머리 (${STAGES.map((s) => s.id).join(' ')})`);
  check(CHAPTERS.length === 2, '장 둘');
  const g = new Game({ plugins: [heath] });
  const p = g.players.spawn('단계', false, null, 'st-1');
  check(g.stages.inStage(p) && !isField(p.layer) && p.stage.cur === '1-1' && g.squad.heroes(p).length === 2, '접속하면(enterOnJoin) 1-1로 들어간다: 처음 영웅 둘과 함께 자기 층에서');
  const sparks0 = p.sparks;
  let cleared = '';
  g.on('stageCleared', (_q, id, first) => { if (first && !cleared) cleared = id; });
  for (let i = 0; i < 90 * 20 && !cleared; i++) g.tick(0.05);
  check(cleared === '1-1' && p.stage.best === '1-1' && p.stage.cur === '1-2' && p.sparks >= sparks0 + 30 + 100, `물결을 다 잡으면 깬다: 보상(보석 +${p.sparks - sparks0}), 가장 멀리 깬 단계 1-1, 자동 진행으로 지금 단계 1-2`);
  run(g, 3.5);
  const me = g.personal.find((x) => x.name === 'stage')!.state(p) as { run: { id: string; state: string } | null };
  check(me.run?.id === '1-2' && me.run.state !== 'clear', `잠시 뒤 다음 단계 1-2가 시작된다 (${me.run?.id} ${me.run?.state})`);
  // 실패: 쓰러지면 깬 단계로 돌아가 자동 진행을 끈다
  const killer = g.monsters.spawn('ogre', p.x, p.z);
  killer.layer = p.layer;
  g.combat.damage(killer, p, p.hp + 10, false);
  g.remove(killer.id);
  check(p.stage.cur === '1-1' && !p.stage.auto && said(g, p, 'stageFail') && g.stages.inStage(p), `쓰러지면 실패: 깬 단계(${p.stage.cur})로, 자동 진행 끔`);
  run(g, 4.5);
  const me2 = g.personal.find((x) => x.name === 'stage')!.state(p) as { run: { id: string; state: string } | null };
  check(me2.run?.id === '1-1' && me2.run.state === 'fight', '잠시 뒤 깬 단계를 다시 (파밍)');
  // 잠긴 단계는 고를 수 없다. 깬 단계의 다음은 고를 수 있다
  g.notices = [];
  g.command(p, { t: 'stage', a: 'go', id: '1-4' });
  check(said(g, p, 'stageLocked') && p.stage.cur === '1-1', '깬 단계의 다음보다 먼 단계는 고를 수 없다');
  g.command(p, { t: 'stage', a: 'go', id: '1-2' });
  g.command(p, { t: 'stage', a: 'auto', on: true });
  check(p.stage.cur === '1-2' && p.stage.auto, '깬 단계의 다음(1-2)은 고를 수 있고 자동 진행을 다시 켠다');
  // 시간이 다 되면 실패
  const r = (g.stages as unknown as { runs: Map<number, { left: number }> }).runs.get(p.id)!;
  r.left = 0.01;
  run(g, 0.1);
  check(said(g, p, 'stageFail') && g.notices.some((n) => n.k === 'stageFail' && n.a[1] === 1) && !p.stage.auto, '제한 시간이 다 되면 실패(까닭 1)');
  // 나오면 들어오기 전의 자리와 들판으로
  g.command(p, { t: 'stage', a: 'leave' });
  check(!g.stages.inStage(p) && isField(p.layer) && ![...g.ents.values()].some((e) => e.kind === 'm' && !isField(e.layer)), '나오면 들판으로, 단계의 몬스터는 사라진다');
  const save = g.players.export(p);
  check(JSON.stringify(save.ext?.stages) === JSON.stringify({ cur: '1-1', best: '1-1', auto: false }), `저장 (실패해 깬 단계로 돌아갔다) (${JSON.stringify(save.ext?.stages)})`);
}

// ---------- 우두머리 단계: 물결 뒤에 우두머리 ----------
{
  const g = quiet();
  const p = g.players.spawn('우두머리', false, null, 'st-2');
  for (const id of ['stormblade', 'starseer', 'cinderwitch', 'dawnpriest']) g.roster.grant(p, id);
  for (const id of p.squad) { p.heroes[id].lv = 30; p.heroes[id].stars = 5; }
  for (const id of p.squad) g.fire('heroChanged', p, id);
  p.stage.best = '1-4';
  g.command(p, { t: 'stage', a: 'go', id: '1-5' });
  let sawBoss = false, cleared = false;
  g.on('stageCleared', (_q, id) => { if (id === '1-5') cleared = true; });
  for (let i = 0; i < 90 * 20 && !cleared; i++) {
    g.tick(0.05);
    if ([...g.ents.values()].some((e) => e.kind === 'm' && e.type === 'ogre' && e.layer === p.layer)) sawBoss = true;
  }
  check(sawBoss && cleared && p.stage.best === '1-5' && p.stage.cur === '2-1', `1-5: 물결 둘 뒤에 우두머리(오우거)가 나오고, 잡으면 다음 장 2-1로 (${p.stage.cur})`);
  const boss = STAGES[4].def;
  check(boss.scale > 1, `단계가 깊을수록 몬스터가 세다 (scale ${boss.scale})`);
}

// ---------- 방치 보상: 깬 단계로 커진다 ----------
{
  let T = Date.UTC(2026, 10, 20, 3, 0, 0);
  const now = () => T;
  const make = (best: string) => {
    const g = new Game({ now, plugins: [] });
    const p = g.players.spawn('방치', false, { name: '방치', seen: T - 60 * 60000, ext: { stages: { cur: best, best, auto: true } } }, 'idle-' + best);
    return p.mail.find((m) => m.k === 'idle');
  };
  const none = make(''), five = make('1-5');
  check(!!none && !!five && (five.r.gold ?? 0) > (none.r.gold ?? 0) && none.r.gold === 60 * 4 && five.r.gold === 60 * (4 + 5 * 3) && (five.r.sparks ?? 0) === 30,
    `60분 비우면 방치 보상이 깬 단계로 커진다 (깬 단계 0: 골드 ${none?.r.gold}, 5: 골드 ${five?.r.gold}·보석 ${five?.r.sparks})`);
  T += 1;
}

// ---------- 던전 열쇠: 채우기, 상한, 사기, 하루 한도, 들어가기 ----------
{
  let T = new Date(2026, 10, 20, 10, 0, 0).getTime();
  const g = new Game({ now: () => T, plugins: [] });
  const p = g.players.spawn('열쇠', false, null, 'k-1');
  g.stages.leave(p, false);
  check(g.dungeon.keyCount(p, 'goldmine') === 2, '처음 온 사람은 min(refill, cap) = 2개');
  const portal = { x: 26, z: -26 };
  const enter = () => { p.x = portal.x + 1; p.z = portal.z + 1; g.command(p, { t: 'dungeon', id: 'goldmine' }); const inside = !!g.dungeon.runOf(p); if (inside) g.dungeon.leave(p, false); return inside; };
  check(enter() && g.dungeon.keyCount(p, 'goldmine') === 1 && enter() && g.dungeon.keyCount(p, 'goldmine') === 0, '들어갈 때마다 열쇠 하나');
  g.notices = [];
  check(!enter() && said(g, p, 'dungeonNoKeys'), '열쇠가 없으면 들어가지 못한다');
  check(p.daily.prog['run_goldmine'] === undefined, '열쇠 던전은 하루 횟수(일일 진행의 run_)를 쓰지 않는다');
  g.notices = [];
  g.command(p, { t: 'dungeonKey', id: 'goldmine' });
  check(said(g, p, 'costShort') && g.dungeon.keyCount(p, 'goldmine') === 0, '보석이 모자라면 사지 못한다');
  g.wallet.add(p, 'sparks', 1000, '');
  g.command(p, { t: 'dungeonKey', id: 'goldmine' }); g.command(p, { t: 'dungeonKey', id: 'goldmine' });
  g.notices = [];
  g.command(p, { t: 'dungeonKey', id: 'goldmine' });
  check(g.dungeon.keyCount(p, 'goldmine') === 2 && p.sparks === 900 && said(g, p, 'dungeonKeyLimit'), `하루 두 번까지 산다 (보석 50씩: 남은 ${p.sparks})`);
  // 다음 날: 2개 더해 상한(2)까지. 산 것으로 상한 위면 그대로
  g.dungeon.giveKeys(p, 'goldmine', 3);
  check(g.dungeon.keyCount(p, 'goldmine') === 5, '보상으로 준 열쇠는 상한을 넘어도 된다');
  T += 24 * 3600000;
  check(g.dungeon.keyCount(p, 'goldmine') === 5, '상한(2) 위에 있으면 날이 바뀌어도 그대로');
  for (let i = 0; i < 5; i++) enter();
  check(g.dungeon.keyCount(p, 'goldmine') === 0, '다섯 번 들어가 0');
  T += 3 * 24 * 3600000;
  check(g.dungeon.keyCount(p, 'goldmine') === 2, '사흘이 지나도 상한(2)까지만 채워진다');
  g.command(p, { t: 'dungeonKey', id: 'goldmine' });
  check(g.dungeon.keyCount(p, 'goldmine') === 3, '날이 바뀌면 살 수 있는 수도 새로');
  const save = g.players.export(p);
  const keys = (save.ext?.keys as Record<string, [number, number, string]>)?.goldmine;
  check(!!keys && keys[0] === 3 && keys[1] === 1 && typeof keys[2] === 'string', `열쇠의 저장: ext.keys의 [가진 수, 오늘 산 수, 날] (${JSON.stringify(keys)})`);
  const h = new Game({ now: () => T, plugins: [] });
  const q = h.players.spawn('열쇠', false, structuredClone(save), 'k-1');
  check(h.dungeon.keyCount(q, 'goldmine') === 3, '다시 읽으면 같은 열쇠');
}

// ---------- 던전 열쇠: 금광을 끝내면 장비 없이 보상만 ----------
{
  const g = quiet();
  const p = g.players.spawn('금광', false, null, 'k-2');
  g.stages.leave(p, false);
  p.x = 27; p.z = -25;
  g.command(p, { t: 'dungeon', id: 'goldmine' });
  check(!!g.dungeon.runOf(p), '금광에 들어간다');
  const gear0 = p.gear.length;
  for (const e of [...g.ents.values()]) if (e.kind === 'm' && e.layer === p.layer) g.combat.damage(p, e, e.hp + 1, false);
  check(p.mail.some((m) => m.k === 'dungeon' && m.r.gold === 600) && p.gear.length === gear0, '끝내면 보상 우편(골드 600)이 오고, gear: false라 장비는 주지 않는다');
}

// ---------- 고르지 않으면 없다 ----------
{
  const g = new Game({ plugins: [], modules: ['economy', 'growth', 'classes', 'combat'] });
  const p = g.players.spawn('없음', false, null, 'n-1');
  check(!('heroes' in p) && !('pulls' in p) && !('squad' in p) && !('stage' in p) && !g.commands.has('hero') && !g.commands.has('gacha') && !g.commands.has('squad') && !g.commands.has('stage') && !g.kinds.has('hero'),
    '고르지 않은 게임의 사람에는 영웅·뽑기·편성·단계의 칸도, 명령도, 영웅 종류도 없다');
  check(!g.personal.some((x) => ['heroes', 'gacha', 'squad', 'stage', 'keys'].includes(x.name)) && !g.saves.some((s) => ['roster', 'gacha', 'squad', 'stages', 'keys'].includes(s.name)), '개인 상태와 저장 칸도 없다');
}
