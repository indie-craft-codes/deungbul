// 영웅의 성장의 저장: 다시 읽으면 같은가(기술 레벨·각성, 영웅 장비와 낀 영웅, 뒷줄), 성장 전의 저장(줄이 셋인 roster, formation 없음)이 그대로 읽히고 글자까지 같게 다시 적히는가,
// 깨진 값을 걸러 내는가, 모듈을 끈 게임이 그 칸을 지우지 않는가(MODULE_SAVES), 버전 칸이 없는 옛 저장(v0)도 이전을 지나 읽히는가.
// 저장의 모양은 더하기만 했다: roster의 줄 끝에 [기술 레벨, 각성]을 (오른 영웅만), 새 칸 herogear와 formation. 그래서 이전(g.migrations)은 없다.
import { MODULE_SAVES } from '../../shared/modules';
import { HERO_RULES, heroGearRules, type HeroRules } from '../../shared/defs';
import { Game } from '../../server/game/game';
import { check } from '../harness';
import { keepsThroughLean, resavesClean } from './savebench';

const HR: HeroRules = HERO_RULES, GR = heroGearRules()!;
const quiet = () => new Game({ plugins: [] });
const NEW = ['roster', 'squad', 'formation', 'herogear'];
const part = (x: { ext?: Record<string, unknown> }) => JSON.stringify(NEW.map((k) => x.ext?.[k]));

// ---------- 다시 읽으면 같다 ----------
{
  const g = quiet();
  const p = g.players.spawn('성장저장', false, null, 'gs-1');
  g.stages.leave(p, false);
  for (const id of ['ironwall', 'swiftarrow', 'cinderwitch', 'stormblade']) g.roster.grant(p, id);
  p.heroes.ironwall.skill = 2; p.heroes.stormblade.stars = HR.maxStars; p.heroes.stormblade.skill = 5; p.heroes.stormblade.awaken = 2;
  for (const id of ['vgblade', 'vgplate', 'arwand', 'woodcharm', 'leathercap']) g.herogear.give(p, id);
  g.herogear.equip(p, 1, 'ironwall'); g.herogear.equip(p, 2, 'ironwall'); g.herogear.equip(p, 3, 'stormblade');
  p.hgear[0].lv = 4;
  g.squad.set(p, ['stormblade', 'ironwall', 'swiftarrow', 'cinderwitch'], ['ironwall', 'cinderwitch']);
  const save = g.players.export(p);
  const ext = save.ext ?? {};
  check(NEW.every((k) => k in ext) && NEW.every((k) => k in MODULE_SAVES.player) && MODULE_SAVES.player.herogear === 'herogear' && MODULE_SAVES.player.formation === 'squad',
    '캐릭터 저장의 ext에 roster, squad, formation, herogear가 있고 모듈의 저장 칸 표에 있다 (formation은 편성 모듈의 것)');
  const roster = ext.roster as Record<string, number[]>;
  check(roster.swiftarrow.length === 3 && JSON.stringify(roster.ironwall) === JSON.stringify([1, 1, 0, 2, 0]) && JSON.stringify(roster.stormblade) === JSON.stringify([1, HR.maxStars, 0, 5, 2]),
    `roster의 줄: 기술 레벨이나 각성이 오른 영웅만 [레벨, 별, 조각, 기술 레벨, 각성] (${JSON.stringify(roster)})`);
  check(JSON.stringify(ext.herogear) === JSON.stringify({ seq: 5, items: [[1, 'vgblade', 4, 'ironwall'], [2, 'vgplate', 0, 'ironwall'], [3, 'arwand', 0, 'stormblade'], [4, 'woodcharm', 0, ''], [5, 'leathercap', 0, '']] }) && JSON.stringify(ext.formation) === JSON.stringify({ back: ['ironwall', 'cinderwitch'] }),
    `herogear: { seq, items: [번호, id, 강화, 낀 영웅] }, formation: { back } (${JSON.stringify(ext.formation)})`);
  const h = quiet();
  const q = h.players.spawn('성장저장', false, structuredClone(save), 'gs-1');
  check(JSON.stringify(q.heroes) === JSON.stringify(p.heroes) && JSON.stringify(q.hgear) === JSON.stringify(p.hgear) && q.hgSeq === 5 && q.squadBack.join() === 'ironwall,cinderwitch' && q.squad.join() === p.squad.join(),
    '다시 읽은 캐릭터의 기술 레벨·각성, 영웅 장비(강화·낀 영웅), 뒷줄이 같다');
  check(part(h.players.export(q)) === part(save), '읽고 다시 적은 네 칸이 글자까지 같다');
  check(h.squad.power(q) === g.squad.power(p) && h.squad.power(q) > 0, `다시 읽은 편성의 전투력도 같다 (${h.squad.power(q)})`);
}

// ---------- 성장 전의 저장 ----------
{
  // 영웅 모듈이 생긴 때의 모양 그대로: 줄이 셋인 roster, formation·herogear 없음
  const old = { name: '예전', v: 1, gold: 500, ext: { roster: { ironwall: [12, 2, 7], dawnpriest: [3, 2, 0] }, squad: ['dawnpriest', 'ironwall'], stages: { cur: '1-3', best: '1-2', auto: true } } };
  const g = quiet();
  const p = g.players.spawn('예전', false, structuredClone(old) as never, 'gs-2');
  check(p.heroes.ironwall.lv === 12 && p.heroes.ironwall.skill === undefined && p.heroes.ironwall.awaken === undefined && p.hgear.length === 0 && p.squad.join() === 'dawnpriest,ironwall' && p.squadBack.length === 0,
    '성장 전의 저장: 기술 레벨 1·각성 0, 영웅 장비 없음, 둘이면 모두 앞줄');
  const out = g.players.export(p);
  check(JSON.stringify(out.ext?.roster) === JSON.stringify(old.ext.roster) && JSON.stringify(out.ext?.squad) === JSON.stringify(old.ext.squad) && !JSON.stringify(out).includes('formation') && !JSON.stringify(out).includes('herogear'),
    `읽고 다시 적어도 roster와 squad가 글자까지 같고, 쓰지 않은 새 칸(formation, herogear)은 생기지 않는다`);
  const v0 = { name: '옛날', lv: 2, gold: 9, ext: { roster: { starseer: [5, 3, 1, 2, 0] }, herogear: { seq: 1, items: [[1, 'dawnedge', 2, 'starseer']] } } };
  const q = quiet().players.spawn('옛날', false, structuredClone(v0) as never, 'gs-3');
  check(q.heroes.starseer.skill === 2 && q.hgear[0]?.hero === 'starseer' && q.hgear[0].lv === 2, '버전 칸이 없는 저장(v0)도 틀의 이전을 지나 성장까지 읽힌다');
}

// ---------- 깨진 값 ----------
{
  const bad = {
    name: '깨짐', v: 1,
    ext: {
      roster: { ironwall: [5, 2, 0, 999, 99], cinderwitch: [5, 2, 0, 'x', -3], swiftarrow: [3, 1, 0] },
      squad: ['ironwall', 'cinderwitch', 'swiftarrow'],
      formation: { back: ['ghost', 'ironwall', 'starseer', 'cinderwitch', 'swiftarrow', 7] },
      herogear: { seq: 'x', items: [[1, 'vgblade', 999, 'ironwall'], [1, 'vgplate', 2, 'ironwall'], [3, 'arwand', 1, 'ironwall'], [4, 'nope', 0, ''], [5, 'woodcharm', 0, 'starseer'], 'junk', [-2, 'leathercap', -1, 5]] },
    },
  };
  const g = quiet();
  const p = g.players.spawn('깨짐', false, structuredClone(bad) as never, 'gs-4');
  const iw = p.heroes.ironwall;
  check(iw.awaken === HR.awaken!.steps.length && iw.skill! <= 1 + 2 + iw.awaken! * 2 && p.heroes.cinderwitch.skill === undefined && p.heroes.cinderwitch.awaken === undefined,
    `기술 레벨·각성: 범위 밖은 상한으로, 깨진 값은 처음 값으로 (철벽 ${JSON.stringify(iw)})`);
  check(p.squadBack.length <= HR.maxStars && p.squadBack.every((id) => p.squad.includes(id)) && p.squadBack.length === 2, `뒷줄: 편성에 없는 영웅과 이상한 값은 버리고, 넘치면 앞줄로 (${p.squadBack.join()})`);
  const ids = p.hgear.map((x) => x.id).join(), uids = new Set(p.hgear.map((x) => x.uid));
  check(ids === 'vgblade,vgplate,arwand,woodcharm,leathercap' && uids.size === p.hgear.length && p.hgear.every((x) => x.uid >= 1) && p.hgSeq >= Math.max(...p.hgear.map((x) => x.uid)),
    `영웅 장비: 없는 장비와 깨진 줄은 버리고, 겹치거나 이상한 번호는 새 번호 (${[...uids].join(',')})`);
  check(p.hgear[0].lv === GR.enhance.max(1) && p.hgear[4].lv === 0 && p.hgear[2].hero === '' && p.hgear[3].hero === '' && p.hgear[0].hero === 'ironwall' && p.hgear[1].hero === 'ironwall',
    '강화는 상한까지, 한 칸에 둘째로 낀 것(비전 지팡이)과 가지지 않은 영웅(별읽는이)이 낀 것은 뺀다');
  resavesClean(g, p);
}

// ---------- 모듈을 끈 게임은 그 칸을 지우지 않는다 ----------
{
  const g = quiet();
  const p = g.players.spawn('맡김', false, null, 'gs-5');
  g.stages.leave(p, false);
  for (const id of ['ironwall', 'swiftarrow', 'dawnpriest']) g.roster.grant(p, id);
  p.heroes.ironwall.skill = 2;
  g.herogear.give(p, 'vgplate'); g.herogear.equip(p, 1, 'ironwall');
  g.squad.set(p, p.squad, ['dawnpriest']);
  const save = g.players.export(p);
  keepsThroughLean({
    save, name: '맡김', pid: 'gs-5', modules: ['economy', 'items'], keys: NEW, gone: ['hgear', 'squadBack'], what: '영웅·편성·영웅 장비',
    resumed: (back) => back.hgear[0]?.hero === 'ironwall' && back.heroes.ironwall.skill === 2 && back.squadBack.join() === 'dawnpriest',
  });
  const noGear = new Game({ plugins: [], modules: ['economy', 'growth', 'classes', 'combat', 'items', 'roster', 'squad'] });
  const r = noGear.players.spawn('맡김', false, structuredClone(save), 'gs-5');
  check(!('hgear' in r) && JSON.stringify(noGear.players.export(r).ext?.herogear) === JSON.stringify(save.ext?.herogear) && !noGear.commands.has('hgear') && !noGear.personal.some((x) => x.name === 'hgear'),
    'herogear만 끈 게임: 엔티티에 장비 칸·명령·개인 상태가 없고, 저장의 칸은 남는다');
}
