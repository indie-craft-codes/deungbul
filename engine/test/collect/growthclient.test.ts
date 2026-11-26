// 영웅의 성장 화면의 셈 (engine/client/hud/herogrowcalc.ts)을 브라우저 없이 본다: 영웅 상세의 탭과 값·누를 수 있는가, 장비 창의 차례와 칸마다의 고르기,
// 세트의 단, 강화 창(지금 → 다음, 값, 확률), 진형(앞줄·뒷줄과 줄 바꾸기), 시너지의 줄, 영웅 탭의 전투력이 상세·서버와 같은가. 그리고 문장이 두 언어에 다 있는가.
import fs from 'node:fs';
import path from 'node:path';
import { HERO_RULES, heroFull, heroGearRules, heroPower, type HeroGearPiece, type HeroRules } from '../../shared/defs';
import { heroRows } from '../../client/hud/collectcalc';
import { costParts, detailTabs, enhanceView, formation, gearRows, heroDetail, heroPowerOf, setViews, slotViews, synergyRows, toggleRow } from '../../client/hud/herogrowcalc';
import { check } from '../harness';

const HR: HeroRules = HERO_RULES, GR = heroGearRules()!;
const rich = { gold: 1e6, sparks: 1e6, items: { skillbook: 99, awakenstone: 99, gearstone: 999 } };
const poor = { gold: 0, sparks: 0, items: {} };

// ---------- 영웅 상세 ----------
{
  check(detailTabs(true).join() === 'level,star,awaken,skill,gear' && detailTabs(false).join() === 'level,star,awaken,skill', '상세의 탭: 레벨·별·각성·기술, 영웅 장비 모듈이 있으면 장비');
  const me = { ironwall: [5, 1, 4, 2, 0] as [number, number, number, number, number], stormblade: [30, HR.maxStars, 30, 1, 0] as [number, number, number, number, number] };
  const iw = heroDetail('ironwall', me, [], rich);
  check(iw.owned && iw.lv === 5 && iw.level.can && iw.level.cost[0].need === HR.levelCost(5, 0) && !iw.star.can && iw.star.cost[0].kind === 'shards' && iw.star.cost[0].need === HR.starCost(1),
    `레벨: 값과 누를 수 있는가, 별: 조각이 모자라 누를 수 없다 (${iw.star.cost[0].have}/${iw.star.cost[0].need})`);
  check(iw.awaken.on && iw.awaken.needStars && !iw.awaken.can && iw.awaken.next?.shards === HR.awaken!.steps[0].shards, '각성: 별이 최대가 아니면 누를 수 없고 까닭(needStars)을 안다');
  check(iw.skill.on && iw.skill.has === 'shieldbash' && iw.skill.lv === 2 && iw.skill.max === 2 && !iw.skill.can && iw.skill.pct === Math.round(HR.skill!.per * 100), `기술: 역할의 기술, 레벨 2/2(별 1의 상한), +${iw.skill.pct}%`);
  const sb = heroDetail('stormblade', me, [], rich);
  check(sb.awaken.can && sb.awaken.cost.map((c) => c.kind).join() === 'shards,cur,item' && sb.skill.can && sb.skill.cost.length === 2, '별이 최대이고 조각·재료가 있으면 각성과 기술을 누를 수 있다 (값: 조각·골드·각성석)');
  const sbPoor = heroDetail('stormblade', me, [], poor);
  check(!sbPoor.awaken.can && sbPoor.awaken.cost.filter((c) => !c.ok).map((c) => c.id).join() === 'gold,awakenstone' && !sbPoor.skill.can, '모자란 값의 칸은 ok가 아니다 (골드, 각성석)');
  check(costParts({ cur: 'sparks', n: 5, items: { gearstone: 2 } }, { gold: 0, sparks: 9, items: { gearstone: 1 } }).map((c) => `${c.id}:${c.ok}`).join() === 'sparks:true,gearstone:false', '값의 칸: 재화와 재료마다 가진 수와 충분한가');
  const gear: HeroGearPiece[] = [{ uid: 1, id: 'vgplate', lv: 2, hero: 'ironwall' }, { uid: 2, id: 'vgblade', lv: 0, hero: 'ironwall' }];
  const withGear = heroDetail('ironwall', me, gear, rich);
  check(withGear.full.hp === heroFull('ironwall', { lv: 5, stars: 1, skill: 2 }, gear).hp && withGear.full.hp > iw.full.hp && withGear.base.hp === iw.base.hp, '상세의 최종 값은 장비까지 (바탕은 레벨·별만)');
  // 영웅 탭의 전투력 = 상세 = 서버의 셈
  const rows = heroRows(me, 1e6, [], gear);
  check(rows.find((r) => r.id === 'ironwall')!.power === withGear.full.power && heroPowerOf('ironwall', me, gear) === withGear.full.power, `영웅 탭과 상세의 전투력이 같다 (${withGear.full.power})`);
  check(heroRows({ ironwall: [5, 1, 4] }, 0)[0].power === heroPower('ironwall', 5, 1), '성장이 없는 줄(셋)이면 영웅 탭의 전투력은 예전의 heroPower');
}

// ---------- 장비 창 ----------
{
  const all: HeroGearPiece[] = [
    { uid: 1, id: 'woodcharm', lv: 0, hero: '' }, { uid: 2, id: 'vgplate', lv: 3, hero: 'ironwall' }, { uid: 3, id: 'dawnedge', lv: 0, hero: '' },
    { uid: 4, id: 'bronzeblade', lv: 5, hero: 'swiftarrow' }, { uid: 5, id: 'vgblade', lv: 1, hero: '' }, { uid: 6, id: 'leathercoat', lv: 0, hero: '' },
  ];
  const rows = gearRows(all);
  check(rows.map((r) => r.uid).join() === '3,5,4,2,6,1', `장비 창의 차례: 칸(무기, 갑옷, 투구, 장신구), 그 안에서 등급·전투력이 높은 것부터 (${rows.map((r) => r.uid).join()})`);
  const slots = slotViews('ironwall', all);
  check(slots.length === GR.slots.length && slots[1].worn?.uid === 2 && slots[0].worn === null && slots[0].pick.map((r) => r.uid).join() === '3,5,4', '영웅의 장비 탭: 칸마다 낀 것과 고를 것(다른 영웅이 낀 것도, 전투력이 큰 것부터)');
  const sets = setViews('ironwall', [...all, { uid: 7, id: 'vghelm', lv: 0, hero: 'ironwall' }]);
  check(sets.length === 1 && sets[0].n === 2 && sets[0].tiers.map((x) => x.on).join() === 'true,false', '세트: 선봉 둘 → 2세트 켜짐, 4세트 꺼짐');
  const ev = enhanceView(all[1], rich), max = enhanceView({ uid: 9, id: 'woodcharm', lv: GR.enhance.max(0), hero: '' }, rich), broke = enhanceView(all[1], poor);
  check(!ev.max && ev.next.hp > ev.now.hp && ev.cost.length === 2 && ev.chance === GR.enhance.chance!(3, 1) && ev.can && max.max && !max.can && max.cost.length === 0 && !broke.can,
    `강화 창: 지금 → 다음(체력 ${ev.now.hp} → ${ev.next.hp}), 값 둘, 확률 ${ev.chance * 100}%, 상한이면 누를 수 없다`);
}

// ---------- 진형과 시너지 ----------
{
  const f = formation(['a', 'b', 'c'], ['c'])!;
  check(f.front.join() === 'a,b' && f.back.join() === 'c' && f.frontMax === 2 && f.backMax === 2, '진형: 앞줄과 뒷줄, 줄마다의 자리 수');
  check(toggleRow(['a', 'b', 'c'], ['c'], 'a').join() === 'a,c' && toggleRow(['a', 'b', 'c', 'd'], ['c', 'd'], 'a').join() === 'c,d' && toggleRow(['a', 'b'], ['b'], 'b').join() === '',
    '줄 바꾸기: 앞 → 뒤, 뒷줄이 가득이면 그대로, 뒤 → 앞');
  const syn = synergyRows([{ tag: 'grove', n: 2, tier: 0 }, { tag: 'ember', n: 1, tier: -1 }], ['ironwall', 'swiftarrow', 'cinderwitch', 'dawnpriest']);
  check(syn[0].tag === 'grove' && syn[0].tiers[0].on && !syn[0].tiers[1].on && syn.some((s) => s.tag === 'tide' && s.n === 0) && syn.length === 3, '시너지의 줄: 켜진 것이 먼저, 가진 영웅의 태그면 편성에 없어도 보인다 (0명)');
}

// ---------- 문장: 두 언어에 다 있다 ----------
{
  const dir = path.join(import.meta.dirname, '../../client/i18n');
  const ko = fs.readFileSync(path.join(dir, 'ko.ts'), 'utf8'), en = fs.readFileSync(path.join(dir, 'en.ts'), 'utf8');
  const keys = ['heroDetail', 'htAwaken', 'htSkill', 'htGear', 'tabHGear', 'rowFront', 'rowBack', 'synHead', 'heroAwakenStep', 'heroSkillLv', 'hgChance', 'heroSkillUp', 'heroAwaken', 'itemShort', 'hgDrop', 'hgEnhance', 'hgSalvaged'];
  check(keys.every((k) => ko.includes(`${k}:`) && en.includes(`${k}:`)), '성장 화면의 문장과 안내문이 한국어·영어에 다 있다');
  const hud = fs.readFileSync(path.join(import.meta.dirname, '../../client/hud/herogrow.ts'), 'utf8');
  check(!/['"`][가-힣]/.test(hud.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')) && !/\b(pay|purchase|checkout|iap|billing)\b/i.test(hud), '성장 화면의 코드에 한국어 글이 박혀 있지 않고(문장은 모두 i18n), 결제의 낱말이 없다');
}
