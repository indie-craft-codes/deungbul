// 영웅의 성장 (engine/shared/defs/herogrow.ts의 셈과 systems/roster.ts의 기술 레벨·각성, systems/herogear.ts, systems/squad.ts의 진형·시너지):
//   셈 (장비의 강화, 세트 2·4, 각성의 배율과 패시브, 기술 레벨의 배율, 시너지의 단, 진형 나누기, 전투력의 한 셈),
//   서버의 규칙 (값과 장부의 원인, 상한, 모자람의 알림, 끼기·바꾸기·옮기기·빼기, 강화의 성공과 실패, 분해, 떨어지기, 가득 참),
//   싸움 (장비·각성이 영웅의 체력·공격에, 기술 레벨이 기술 배율에, 앞줄이 먼저 맞고 덜 아프다, 뒷줄은 더 세다).
import { HERO_RULES, SQUAD_RULES, arrangeRows, awakenBonus, defaultPower, gearStats, growthOf, heroFull, heroGearRules, heroPower, heroStats, setBonuses, skillMul, squadView, sumBonus, synergyOf, synergyFor, type HeroGearPiece, type HeroRules, type HeroesMe, type SquadMe, type SquadRules } from '../../shared/defs';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { squadPowerOf } from '../../client/hud/herogrowcalc';
import { check } from '../harness';

const HR: HeroRules = HERO_RULES, SR: SquadRules = SQUAD_RULES, GR = heroGearRules()!;
const said = (g: Game, p: Ent, k: string) => g.notices.some((n) => n.id === p.id && n.k === k);
const run = (g: Game, s: number) => { for (let i = 0; i < s * 20; i++) g.tick(0.05); };
const quiet = () => new Game({ plugins: [] });
const me = <T>(g: Game, p: Ent, k: string) => g.personal.find((x) => x.name === k)!.state(p) as T;
/** 지갑과 가방에 넘긴 원인들 */
const whys = (g: Game) => { const out: string[] = []; g.wallet.seen.push((_p, _c, _d, why) => out.push(why)); g.bag.seen.push((_p, _c, _d, why) => out.push(why)); return out; };

// ---------- 셈 ----------
{
  // 성장이 하나도 없으면 예전의 셈과 같다
  const same = ['ironwall', 'starseer', 'dawnpriest'].every((id) => [[1, 1], [7, 2], [30, 4], [70, 6]].every(([lv, st]) => {
    const f = heroFull(id, { lv, stars: st }), s = heroStats(id, lv, st);
    return f.atk === s.atk && f.hp === s.hp && f.power === heroPower(id, lv, st) && f.skill === 1 && f.awaken === 0 && f.dmg === 0 && f.guard === 0;
  }));
  check(same, '장비·각성·기술 레벨·시너지가 없으면 최종 값은 heroStats, 전투력은 heroPower와 같다 (성장을 켜지 않은 게임은 예전 그대로)');
  check(gearStats('vgplate', 0).hp === 120 && gearStats('vgplate', 4).hp === Math.round(120 * (1 + GR.enhance.per * 4)) && gearStats('arwand', 3).atk === Math.round(14 * 1.45),
    `장비의 강화: 바탕 × (1 + ${GR.enhance.per} × 강화) (선봉의 판금 +4 체력 ${gearStats('vgplate', 4).hp})`);
  const v2 = setBonuses([{ id: 'vgblade' }, { id: 'vgplate' }, { id: 'arwand' }]), v4 = setBonuses([{ id: 'vgblade' }, { id: 'vgplate' }, { id: 'vghelm' }, { id: 'vgcharm' }]);
  check(v2.find((s) => s.set === 'vanguard')?.on.length === 1 && v2.find((s) => s.set === 'arcane')?.on.length === 0 && v4[0].on.length === 2 && v4[0].on[1].bonus.guard === 0.15,
    '세트: 선봉 둘이면 2세트(체력 +15%), 넷이면 2·4세트가 함께(받는 피해 −15%), 비전 하나는 아직');
  // 장비를 낀 영웅의 최종 값: (바탕 × 각성 + 장비 + 덤의 수) × (1 + 비율)
  const worn = [{ id: 'vgblade', lv: 2 }, { id: 'vgplate', lv: 0 }];
  const base = heroStats('stormblade', 10, 4), g1 = gearStats('vgblade', 2), g2 = gearStats('vgplate', 0);
  const f = heroFull('stormblade', { lv: 10, stars: 4 }, worn);
  check(f.atk === Math.round(base.atk + g1.atk + g2.atk) && f.hp === Math.round((base.hp + g1.hp + g2.hp) * 1.15), `장비의 공격·체력이 더해지고 2세트가 체력에 곱해진다 (공격 ${f.atk}, 체력 ${f.hp})`);
  check(f.power === defaultPower({ atk: f.atk, hp: f.hp, dmg: 0, guard: 0, lv: 10, stars: 4, awaken: 0, skill: 1, rarity: 2, gear: 2 }) && f.power > heroPower('stormblade', 10, 4),
    `장비는 전투력에 든다 (${heroPower('stormblade', 10, 4)} → ${f.power})`);
  // 각성: 단계의 배율, 열린 패시브는 뒤에도 남는다
  const a1 = awakenBonus(1), a3 = awakenBonus(3);
  check(a1.mul === 1.15 && a1.passives.length === 1 && a3.mul === 1.5 && a3.passives.map((p) => p.name).join() === 'passiveSteel,passiveFury', '각성: 단계의 배율(1.15, …, 1.5)과 열린 패시브(1단계 강철 피부, 3단계 분노까지 함께)');
  const aw = heroFull('ironwall', { lv: 60, stars: 6, awaken: 3 }), plain = heroStats('ironwall', 60, 6);
  check(aw.atk === Math.round(plain.atk * 1.5) && aw.hp === Math.round(plain.hp * 1.5) && Math.abs(aw.guard - 0.1) < 1e-9 && Math.abs(aw.dmg - 0.15) < 1e-9 && aw.power > heroPower('ironwall', 60, 6) * 1.5,
    `각성 3: 공격·체력 ×1.5, 패시브의 받는 피해 −10%·주는 피해 +15%, 전투력에 든다 (${aw.power})`);
  check(Math.abs(skillMul(1) - 1) < 1e-12 && Math.abs(skillMul(4) - (1 + 3 * HR.skill!.per)) < 1e-12 && heroFull('ironwall', { lv: 5, stars: 2, skill: 3 }).power > heroFull('ironwall', { lv: 5, stars: 2 }).power,
    `기술 레벨: 레벨마다 기술 배율 +${HR.skill!.per * 100}%, 전투력에도 든다`);
  check(sumBonus([{ guard: 0.2 }, { guard: 0.2 }]).guard > 0.35 && sumBonus([{ guard: 0.2 }, { guard: 0.2 }]).guard < 0.37, '받는 피해의 덤은 곱으로 합친다 (0.2와 0.2 → 0.36)');
  // 시너지
  const s1 = synergyOf(['ironwall', 'cinderwitch']), s2 = synergyOf(['ironwall', 'swiftarrow', 'stormblade', 'dawnpriest']);
  check(s1.every((x) => x.tier === -1) && s2.find((x) => x.tag === 'grove')?.tier === 0 && s2.find((x) => x.tag === 'tide')?.tier === 0, '시너지: 같은 태그 하나면 꺼짐, 둘이면 1단');
  check(synergyFor('ironwall', s2).length === 2 && synergyFor('stormblade', s2).length === 1 && synergyFor('stormblade', s2)[0].guard === 0.1,
    '시너지의 덤: 숲은 숲의 영웅만, 물결(all)은 편성 모두에게');
  const s3 = synergyOf(['ironwall', 'swiftarrow', 'ironwall']);
  check(s3.find((x) => x.tag === 'grove')?.tier === 1, '셋이면 2단 (가장 높은 단 하나)');
  // 진형
  check(arrangeRows(['a', 'b', 'c', 'd'], []).join() === 'c,d' && arrangeRows(['a', 'b', 'c'], ['a', 'b', 'c']).join() === 'a,b' && arrangeRows(['a', 'b'], ['b']).join() === 'b',
    `진형: 앞줄(${SR.rows!.front})이 넘치면 뒤쪽 영웅이 뒷줄로, 뒷줄(${SR.rows!.back})이 넘치면 앞줄로`);
  // 편성의 전투력 = 영웅마다(시너지까지)의 합, 화면과 같은 셈
  const heroes = { ironwall: { lv: 5, stars: 2 }, swiftarrow: { lv: 3, stars: 1 } };
  const sv = squadView(['ironwall', 'swiftarrow'], ['swiftarrow'], heroes, []);
  check(sv.power === sv.heroes.ironwall.power + sv.heroes.swiftarrow.power && sv.heroes.ironwall.atk > heroStats('ironwall', 5, 2).atk && sv.heroes.swiftarrow.back && Math.abs(sv.heroes.swiftarrow.fight.dmg - 0.1) < 1e-9 && Math.abs(sv.heroes.ironwall.fight.guard - 0.25) < 1e-9,
    `편성의 전투력은 영웅마다(시너지 숲 2단: 공격 +10%)의 합, 줄의 덤(앞줄 받는 피해 −25%, 뒷줄 주는 피해 +10%)은 싸움에만 (${sv.power})`);
  check(sv.power === heroFull('ironwall', heroes.ironwall, [], [{ atkPct: 0.1 }]).power + heroFull('swiftarrow', heroes.swiftarrow, [], [{ atkPct: 0.1 }]).power, '줄의 덤은 전투력에 넣지 않는다');
}

// ---------- 기술 레벨 ----------
{
  const g = quiet(), why = whys(g);
  const p = g.players.spawn('기술', false, null, 'hg-1');
  g.stages.leave(p, false);
  g.roster.grant(p, 'cinderwitch');
  g.notices = [];
  g.command(p, { t: 'hero', a: 'skill', id: 'cinderwitch' });
  check(p.heroes.cinderwitch.skill === undefined && said(g, p, 'costShort'), '골드가 모자라면 기술 레벨이 오르지 않는다');
  g.wallet.add(p, 'gold', 100000, '');
  g.notices = [];
  g.command(p, { t: 'hero', a: 'skill', id: 'cinderwitch' });
  check(p.heroes.cinderwitch.skill === undefined && said(g, p, 'itemShort') && g.notices.find((n) => n.k === 'itemShort')?.a[0] === 'skillbook', '기술서가 모자라면 오르지 않고 무엇이 모자란지 알린다 (아무것도 치르지 않는다)');
  g.bag.putItem(p, 'skillbook', 20, '');
  const gold0 = p.gold, cost = HR.skill!.cost(1, 1);
  why.length = 0;
  g.command(p, { t: 'hero', a: 'skill', id: 'cinderwitch' });
  check(p.heroes.cinderwitch.skill === 2 && p.gold === gold0 - cost.n! && g.bag.count(p, 'skillbook') === 19 && said(g, p, 'heroSkillUp') && why.every((w) => w === 'cmd:hero:skill') && why.length === 2,
    `기술 레벨 1 → 2: 골드 ${cost.n}과 기술서 1을 치른다 (장부의 원인 cmd:hero:skill)`);
  const max = 1 + 2; // 별 2, 각성 0
  while (g.roster.skillUp(p, 'cinderwitch'));
  check(p.heroes.cinderwitch.skill === max && said(g, p, 'heroSkillMax'), `별 2의 기술 레벨 상한은 ${max} (별·각성을 올려야 더 오른다)`);
  const e = g.squad.heroes(p).find((x) => x.type === 'cinderwitch')!;
  const scale = g.combat.allies.get('hero')!.skillScale!(e), atk = Number(e.data.atk);
  check(Math.abs(scale - Math.max(0.1, atk / 10) * skillMul(max) * (1 + 0)) < 1e-9 || Math.abs(scale - Math.max(0.1, atk / 10) * skillMul(max) * Number(e.data.dm ?? 1)) < 1e-9,
    `싸우는 영웅의 기술 배율(skillScale)에 기술 레벨이 곱해진다 (×${skillMul(max).toFixed(2)})`);
  const save = g.players.export(p);
  check(JSON.stringify((save.ext?.roster as Record<string, number[]>).cinderwitch) === JSON.stringify([1, 2, 0, max, 0]), `저장: 기술 레벨이 오른 영웅은 [레벨, 별, 조각, 기술 레벨, 각성] (${JSON.stringify((save.ext?.roster as Record<string, number[]>).cinderwitch)})`);
  check(JSON.stringify(me<HeroesMe>(g, p, 'heroes').cinderwitch) === JSON.stringify([1, 2, 0, max, 0]), '개인 상태 heroes도 [.., 기술 레벨, 각성]');
}

// ---------- 각성 ----------
{
  const g = quiet(), why = whys(g);
  const p = g.players.spawn('각성', false, null, 'hg-2');
  g.stages.leave(p, false);
  g.roster.grant(p, 'ironwall');
  g.wallet.add(p, 'gold', 1e6, ''); g.bag.putItem(p, 'awakenstone', 20, '');
  g.notices = [];
  g.command(p, { t: 'hero', a: 'awaken', id: 'ironwall' });
  check(!p.heroes.ironwall.awaken && said(g, p, 'heroAwakenStars'), `별이 ${HR.maxStars}가 아니면 각성할 수 없다`);
  p.heroes.ironwall.stars = HR.maxStars; p.heroes.ironwall.lv = 40; p.heroes.ironwall.shards = 10;
  g.fire('heroChanged', p, 'ironwall');
  g.notices = [];
  g.command(p, { t: 'hero', a: 'awaken', id: 'ironwall' });
  check(!p.heroes.ironwall.awaken && said(g, p, 'heroShards'), '조각이 모자라면 각성하지 않는다');
  p.heroes.ironwall.shards = 25;
  const e = g.squad.heroes(p).find((x) => x.type === 'ironwall')!, hp0 = e.maxHp, gold0 = p.gold;
  why.length = 0;
  g.command(p, { t: 'hero', a: 'awaken', id: 'ironwall' });
  const step = HR.awaken!.steps[0];
  check(p.heroes.ironwall.awaken === 1 && p.heroes.ironwall.shards === 5 && p.gold === gold0 - step.cost!.n! && g.bag.count(p, 'awakenstone') === 19 && said(g, p, 'heroAwaken') && why.every((w) => w === 'cmd:hero:awaken'),
    `각성 1: 조각 ${step.shards}, 골드 ${step.cost!.n}, 각성석 1 (장부의 원인 cmd:hero:awaken)`);
  check(e.maxHp > hp0 && Number(e.data.gd) < 1, `싸우는 영웅의 체력이 각성 배율만큼 (${hp0} → ${e.maxHp}), 패시브 '강철 피부'로 받는 피해가 준다 (×${Number(e.data.gd).toFixed(3)})`);
  check(g.roster.power(p, 'ironwall') === heroFull('ironwall', p.heroes.ironwall).power, '영웅의 전투력은 heroFull의 한 셈');
  p.heroes.ironwall.awaken = HR.awaken!.steps.length;
  g.notices = [];
  check(!g.roster.awakenUp(p, 'ironwall') && said(g, p, 'heroAwakenMax'), '마지막 단계 뒤에는 더 각성하지 않는다');
}

// ---------- 영웅 장비: 끼기, 바꾸기, 옮기기, 빼기, 강화, 분해, 가득 참 ----------
{
  const g = quiet(), why = whys(g);
  const p = g.players.spawn('장비', false, null, 'hg-3');
  g.stages.leave(p, false);
  g.roster.grant(p, 'ironwall'); g.roster.grant(p, 'swiftarrow');
  const a = g.herogear.give(p, 'vgplate')!, b = g.herogear.give(p, 'leathercoat')!, c = g.herogear.give(p, 'vgblade')!;
  check(!!a && a.uid === 1 && b.uid === 2 && p.hgear.length === 3 && said(g, p, 'hgDrop'), '장비를 받으면 번호가 붙고 강화 0, 끼지 않은 채로');
  const e = g.squad.heroes(p).find((x) => x.type === 'ironwall')!, hp0 = e.maxHp, pw0 = g.roster.power(p, 'ironwall');
  g.command(p, { t: 'hgear', a: 'equip', uid: a.uid, hero: 'ironwall' });
  check(a.hero === 'ironwall' && e.maxHp === heroFull('ironwall', p.heroes.ironwall, [a]).hp && e.maxHp > hp0 && g.roster.power(p, 'ironwall') > pw0, `낀 장비의 체력이 싸우는 영웅에 든다 (${hp0} → ${e.maxHp}), 전투력도 (${pw0} → ${g.roster.power(p, 'ironwall')})`);
  g.command(p, { t: 'hgear', a: 'equip', uid: b.uid, hero: 'ironwall' });
  check(b.hero === 'ironwall' && a.hero === '', '같은 칸에 끼면 낀 것과 바꾼다 (전의 것은 빠진다)');
  g.command(p, { t: 'hgear', a: 'equip', uid: b.uid, hero: 'swiftarrow' });
  check(b.hero === 'swiftarrow' && !p.hgear.some((x) => x.hero === 'ironwall'), '다른 영웅이 낀 것을 끼면 그 영웅에게서 옮겨 온다');
  g.command(p, { t: 'hgear', a: 'equip', uid: a.uid, hero: 'ironwall' }); g.command(p, { t: 'hgear', a: 'equip', uid: c.uid, hero: 'ironwall' });
  check(g.squad.view(p).heroes.ironwall.hp === heroFull('ironwall', p.heroes.ironwall, [a, c], [{ atkPct: 0.1 }]).hp, '선봉 둘: 2세트의 체력 +15%가 든다 (편성의 시너지와 함께)');
  g.command(p, { t: 'hgear', a: 'equip', uid: a.uid, hero: 'starseer' }); g.command(p, { t: 'hgear', a: 'equip', uid: 999, hero: 'ironwall' }); g.command(p, { t: 'hgear', a: 'equip', uid: 'x', hero: 'ironwall' });
  check(a.hero === 'ironwall', '가지지 않은 영웅, 없는 장비, 이상한 번호는 받지 않는다');
  // 강화: 값(골드와 강화석), 확률, 상한
  g.notices = [];
  g.command(p, { t: 'hgear', a: 'enhance', uid: a.uid });
  check(a.lv === 0 && said(g, p, 'costShort'), '골드가 모자라면 강화하지 않는다');
  g.wallet.add(p, 'gold', 1e6, ''); g.bag.putItem(p, 'gearstone', 200, '');
  why.length = 0;
  const gold0 = p.gold, stone0 = g.bag.count(p, 'gearstone'), cost = GR.enhance.cost(0, 1);
  const hpBefore = e.maxHp;
  g.command(p, { t: 'hgear', a: 'enhance', uid: a.uid });
  check(a.lv === 1 && p.gold === gold0 - cost.n! && g.bag.count(p, 'gearstone') === stone0 - 1 && e.maxHp > hpBefore && why.every((w) => w === 'cmd:hgear:enhance') && g.notices.some((n) => n.k === 'hgEnhance' && n.a[2] === 1),
    `강화 +1: 골드 ${cost.n}과 강화석 1 (원인 cmd:hgear:enhance), 낀 영웅의 체력이 따라 오른다`);
  a.lv = 3;
  g.herogear.rng = () => 0.99; // 실패
  const g1 = p.gold;
  g.notices = [];
  g.command(p, { t: 'hgear', a: 'enhance', uid: a.uid });
  check(a.lv === 3 && p.gold < g1 && g.notices.some((n) => n.k === 'hgEnhance' && n.a[2] === 0), `확률(+3에서 ${GR.enhance.chance!(3, 1) * 100}%)에 지면 값은 들고 강화는 그대로`);
  g.herogear.rng = () => 0;
  a.lv = GR.enhance.max(1);
  g.notices = [];
  check(!g.herogear.enhance(p, a.uid) && said(g, p, 'hgEnhanceMax'), `상한(희귀 +${GR.enhance.max(1)})에서는 더 강화하지 않는다`);
  // 분해: 끼지 않은 것만
  const st = g.bag.count(p, 'gearstone');
  why.length = 0;
  g.command(p, { t: 'hgear', a: 'salvage', uids: [a.uid] });
  check(p.hgear.some((x) => x.uid === a.uid), '낀 장비는 분해하지 않는다');
  const d = g.herogear.give(p, 'arwand')!;
  d.lv = 4;
  g.command(p, { t: 'hgear', a: 'salvage', uids: [d.uid] });
  const back = GR.salvage!(1, 4).items!.gearstone;
  check(!p.hgear.includes(d) && g.bag.count(p, 'gearstone') === st + back && why.every((w) => w === 'cmd:hgear:salvage') && said(g, p, 'hgSalvaged'), `분해하면 강화석 ${back}이 돌아온다 (원인 cmd:hgear:salvage)`);
  // 가득 참
  while (p.hgear.length < GR.bag) g.herogear.give(p, 'woodcharm');
  g.notices = [];
  check(g.herogear.give(p, 'woodcharm') === null && p.hgear.length === GR.bag && said(g, p, 'hgFull'), `영웅 장비는 ${GR.bag}점까지: 가득 차면 받지 못하고 알린다`);
  const hm = me<{ items: unknown[]; cap: number }>(g, p, 'hgear');
  check(hm.items.length === GR.bag && hm.cap === GR.bag, '개인 상태 hgear: 가진 장비와 가질 수 있는 수');
}

// ---------- 떨어지기: 단계를 깨면, 던전을 끝내면 ----------
{
  const g = quiet();
  const p = g.players.spawn('떨어짐', false, null, 'hg-4');
  g.stages.leave(p, false);
  g.herogear.rng = () => 0; // 늘 떨어지고 표의 첫 칸
  g.fire('stageCleared', p, '1-2', false);
  check(p.hgear.length === 1 && p.hgear[0].id === 'bronzeblade', "단계를 깨면 그 단계의 표(없으면 '*')대로 떨어진다");
  g.fire('stageCleared', p, '1-5', true);
  check(p.hgear.length === 3 && p.hgear.slice(1).every((x) => x.id === 'vgblade'), '우두머리 단계(1-5)는 자기 표: 둘, 희귀 이상에서');
  g.herogear.rng = () => 0.99;
  g.fire('stageCleared', p, '1-1', false);
  check(p.hgear.length === 3, '확률(chance)에 지면 떨어지지 않는다');
  g.herogear.rng = () => 0;
  g.fire('dungeonCleared', 'goldmine', [p]);
  check(p.hgear.length === 4, '던전(금광)을 끝내면 그 표대로');
  // 단계를 실제로 깨면 떨어진다
  const h = new Game({ plugins: [] });
  const q = h.players.spawn('실제', false, null, 'hg-5');
  for (const id of ['stormblade', 'starseer']) h.roster.grant(q, id);
  h.herogear.rng = () => 0;
  h.command(q, { t: 'stage', a: 'start' });
  let cleared = false;
  h.on('stageCleared', () => { cleared = true; });
  for (let i = 0; i < 90 * 20 && !cleared; i++) h.tick(0.05);
  check(cleared && q.hgear.length === 1 && h.notices.some((n) => n.id === q.id && n.k === 'hgDrop'), `실제로 1-1을 깨면 영웅 장비가 떨어진다 (${q.hgear.map((x) => x.id).join()})`);
}

// ---------- 진형: 자리, 앞줄이 먼저 맞고 덜 아프다, 뒷줄은 더 세다 ----------
{
  const g = quiet();
  const p = g.players.spawn('진형', false, null, 'hg-6');
  g.stages.leave(p, false);
  for (const id of ['stormblade', 'ironwall', 'swiftarrow', 'starseer']) g.roster.grant(p, id);
  check(p.squad.join() === 'stormblade,ironwall,swiftarrow,starseer' && p.squadBack.join() === 'swiftarrow,starseer', `저절로 채우면 앞줄 둘, 넘친 것은 뒷줄로 (뒷줄 ${p.squadBack.join()})`);
  p.face = 0; // 앞 = +z
  run(g, 3);
  const hs = g.squad.heroes(p), front = hs.filter((e) => !p.squadBack.includes(e.type)), back = hs.filter((e) => p.squadBack.includes(e.type));
  check(front.every((e) => e.z > p.z + 0.5) && back.every((e) => e.z < p.z - 0.5), `앞줄은 주인 앞에, 뒷줄은 뒤에 선다 (앞 ${front.map((e) => (e.z - p.z).toFixed(1)).join('/')}, 뒤 ${back.map((e) => (e.z - p.z).toFixed(1)).join('/')})`);
  check(front.every((e) => Number(e.data.gd) === 0.75) && back.every((e) => Math.abs(Number(e.data.dm) - 1.1) < 1e-9 && e.data.gd === undefined), '앞줄은 받는 피해 ×0.75, 뒷줄은 주는 피해 ×1.1');
  // 받는 피해
  const f0 = front[0], hp0 = f0.hp, m0 = g.monsters.spawn('wolf', f0.x, f0.z + 1);
  m0.layer = p.layer;
  g.combat.damage(m0, f0, 40, false);
  check(hp0 - f0.hp === 30, `앞줄 영웅은 40의 피해를 30만 받는다 (${hp0 - f0.hp})`);
  g.remove(m0.id);
  // 줄 바꾸기 (명령): 뒷줄이 가득이면 넘친 것이 앞으로
  g.command(p, { t: 'squad', ids: p.squad, back: ['stormblade', 'swiftarrow'] });
  check(p.squadBack.join() === 'stormblade,swiftarrow' && me<SquadMe>(g, p, 'squad').back?.join() === 'stormblade,swiftarrow', '편성 명령의 back으로 줄을 바꾼다 (개인 상태 squad의 back)');
  g.command(p, { t: 'squad', ids: p.squad, back: ['stormblade', 'swiftarrow', 'starseer'] });
  check(p.squadBack.length === 2, '한 줄의 자리를 넘으면 넘친 영웅은 다른 줄로');
  g.command(p, { t: 'squad', ids: p.squad, back: ['ironwall', 'starseer'] });
  // 도발: 주인과 뒷줄을 노리는 몬스터가 앞줄로 돌아선다
  run(g, 3);
  const mobs = [0, 1, 2].map((k) => { const m = g.monsters.spawn('golem', p.x - 2 + k * 2, p.z + 5); m.layer = p.layer; m.swarm = true; m.targetId = k === 0 ? p.id : g.squad.heroes(p).find((e) => e.type === 'starseer')!.id; return m; });
  run(g, 0.6);
  const fronts = new Set(g.squad.heroes(p).filter((e) => !p.squadBack.includes(e.type)).map((e) => e.id));
  check(mobs.every((m) => !m.dead && fronts.has(m.targetId)), `주인이나 뒷줄을 노리던 몬스터가 앞줄 영웅에게 돌아선다 (대상 ${mobs.map((m) => g.ents.get(m.targetId)?.type || m.targetId).join(', ')})`);
  for (const m of mobs) g.remove(m.id);
}

// ---------- 단계의 싸움: 앞줄이 먼저 맞는다 ----------
{
  const g = new Game({ plugins: [] });
  const p = g.players.spawn('맞기', false, null, 'hg-7');
  for (const id of ['stormblade', 'ironwall', 'swiftarrow', 'starseer']) g.roster.grant(p, id);
  for (const id of p.squad) { p.heroes[id].lv = 25; p.heroes[id].stars = 4; g.fire('heroChanged', p, id); }
  const hit = new Map<string, number>();
  g.command(p, { t: 'stage', a: 'go', id: '1-1' });
  for (let i = 0; i < 40 * 20; i++) {
    g.tick(0.05);
    for (const ev of g.events) {
      if (ev[0] !== 'h') continue;
      const src = g.ents.get(ev[1] as number), dst = g.ents.get(ev[2] as number);
      if (!src || src.kind !== 'm' || !dst) continue;
      const who = dst.kind === 'p' ? 'owner' : p.squadBack.includes(dst.type) ? 'back' : 'front';
      hit.set(who, (hit.get(who) ?? 0) + 1);
    }
    g.events = [];
  }
  const fr = hit.get('front') ?? 0, rest = (hit.get('back') ?? 0) + (hit.get('owner') ?? 0);
  check(fr > 0 && fr > rest * 2, `단계 안의 싸움에서 몬스터는 앞줄을 먼저 친다 (앞줄 ${fr}번, 뒷줄과 주인 ${rest}번)`);
}

// ---------- 화면과 서버의 전투력이 같다 ----------
{
  const g = quiet();
  const p = g.players.spawn('같음', false, null, 'hg-8');
  g.stages.leave(p, false);
  for (const id of ['ironwall', 'swiftarrow', 'dawnpriest', 'stormblade']) g.roster.grant(p, id);
  p.heroes.ironwall.skill = 2; p.heroes.stormblade.stars = 6; p.heroes.stormblade.awaken = 2; p.heroes.swiftarrow.lv = 9;
  for (const x of ['vgblade', 'vgplate', 'arwand', 'archarm']) g.herogear.give(p, x);
  g.herogear.equip(p, 1, 'ironwall'); g.herogear.equip(p, 2, 'ironwall'); g.herogear.equip(p, 3, 'stormblade'); g.herogear.equip(p, 4, 'swiftarrow');
  p.hgear[0].lv = 3;
  g.squad.set(p, p.squad, ['swiftarrow', 'dawnpriest']);
  const sq = me<SquadMe>(g, p, 'squad'), hm = me<HeroesMe>(g, p, 'heroes'), gm = me<{ items: [number, string, number, string][] }>(g, p, 'hgear');
  const pieces: HeroGearPiece[] = gm.items.map(([uid, id, lv, hero]) => ({ uid, id, lv, hero }));
  const client = squadPowerOf(hm, sq.ids, sq.back ?? [], pieces);
  check(sq.power === g.squad.power(p) && client === sq.power && sq.power === squadView(p.squad, p.squadBack, Object.fromEntries(Object.entries(hm).map(([id, t]) => [id, growthOf(t)])), pieces).power,
    `편성 전투력: 서버(g.squad.power), 개인 상태(squad.power), 화면의 셈(squadPowerOf)이 같다 (${sq.power})`);
  check(!!sq.syn?.some((s) => s.tag === 'grove' && s.tier === 0) && !!sq.syn?.some((s) => s.tag === 'tide' && s.tier === 0), '개인 상태 squad의 syn: 켜진 시너지 (숲 2, 물결 2)');
  check(sq.power > ['ironwall', 'swiftarrow', 'dawnpriest', 'stormblade'].reduce((s, id) => s + heroPower(id, p.heroes[id].lv, p.heroes[id].stars), 0), '편성 전투력은 레벨·별만의 합보다 크다 (장비·각성·기술 레벨·시너지가 든다)');
}
