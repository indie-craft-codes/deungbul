// 내용의 표가 약속을 지키는가: 배너(확률의 합, 천장, 10번 보장, 현금 없음, 월식 소환의 픽업·반반·천장 공유·기간, 선택권), 단계(3장 × 10, 다섯째마다 우두머리, 갈수록 어렵다),
// 영웅(10~14명, 등급 셋, 역할 넷, 겉모습이 영웅마다 다르다, 진영 셋), 영웅의 성장(장비·세트·기술·각성·시너지·진형과 그 재료의 출처), 소탕·오프라인 진행,
// 열쇠 던전(메뉴에서·자동 전투·소탕), 단계 밖의 칸(던전 뒤 단계로, 돌아왔을 때의 창, 감출 단추), 방치 보상이 깬 단계로 커지는 것, 언어 둘의 이름.
import { BANNERS, CHAPTERS, DUNGEONS, GACHA_RULE_VIEW, HERO_RARITIES, HERO_ROLES, HERO_RULE_VIEW, HEROES, HUD_VIEW, IDLE, IDLE_VIEW, ITEMS, MONSTERS, SQUAD_RULES, STAGE_RULE_VIEW, STAGES, bannerOdds, effectiveOdds, pityOdds, poolOdds, pullOdds, rarityOdds, waveCount } from '@engine/shared/defs';
import { check } from '@engine/testing';
import { koGame } from '../client/i18n/ko';
import { enGame } from '../client/i18n/en';
import { ATTEND, DAILIES, stageRec, stageScale } from '../shared/content';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const hpOfMonster = (type: string): number => (MONSTERS as Record<string, { hp: number }>)[type]?.hp ?? 0;
const named = (key: string) => !!(koGame.ui as Record<string, string>)[key] && !!(enGame.ui as Record<string, string>)[key];

// ---------- 영웅 ----------
{
  const ids = Object.keys(HEROES), rar = new Set(ids.map((id) => HEROES[id].rarity)), roles = new Set(ids.map((id) => HEROES[id].role));
  check(ids.length >= 10 && ids.length <= 14, `영웅은 10~14명 (${ids.length})`);
  check(rar.size === 3 && [...rar].every((r) => r >= 0 && r < HERO_RARITIES.length), `등급 셋이 모두 쓰인다 (${[...rar].join(',')})`);
  check(roles.size >= 3 && roles.size <= 4 && [...roles].every((r) => Object.hasOwn(HERO_ROLES, r)), `역할은 3~4가지이고 모두 HERO_ROLES에 있다 (${[...roles].join(',')})`);
  const cloth = ids.map((id) => HEROES[id].cloth ?? HERO_ROLES[HEROES[id].role].cloth);
  check(new Set(cloth).size === ids.length, '영웅마다 옷 색이 다르다 (겉모습으로 알아보게. 등급의 꾸밈은 화면이 setHeroModel의 등급으로 얹는다)');
  const tags = new Map<string, number>();
  for (const id of ids) tags.set(HEROES[id].tag ?? '', (tags.get(HEROES[id].tag ?? '') ?? 0) + 1);
  check(!tags.has('') && tags.size === 3 && [...tags.values()].every((n) => n === 4), `진영 셋, 넷씩 (${[...tags].map(([k, n]) => `${k} ${n}`).join(', ')})`);
  const looks = new Set(Object.values(HERO_ROLES).map((r) => `${r.hand}/${r.shot ?? ''}/${r.cloth}`));
  check(looks.size === Object.keys(HERO_ROLES).length, '역할마다 손 모양·날아가는 것·옷 색의 짝이 다르다');
  check(ids.every((id) => named(HEROES[id].name)) && Object.values(HERO_ROLES).every((r) => named(r.name)), '영웅과 역할의 이름이 한국어·영어로 있다');
}

// ---------- 배너 ----------
{
  const ids = Object.keys(BANNERS), always = ids.filter((id) => BANNERS[id].start === undefined);
  check(always.length === 2, `늘 있는 배너 둘 (${always.join(', ')})`);
  for (const id of ids) {
    const b = BANNERS[id], odds = bannerOdds(b), byR = rarityOdds(odds);
    check(near(odds.reduce((s, o) => s + o.p, 0), 1) && near(byR.reduce((s, p) => s + p, 0), 1), `${id}: 영웅별·등급별 확률의 합이 1`);
    check(b.pool.every((s) => Object.hasOwn(HEROES, s.hero) && s.w > 0) && new Set(b.pool.map((s) => s.hero)).size === b.pool.length, `${id}: 판의 영웅은 모두 있고 겹치지 않는다`);
    check(b.cur === 'sparks' && b.one > 0 && b.ten <= b.one * 10, `${id}: 값은 게임 안의 재화(월석)뿐, 10번은 1번 × 10 이하 (${b.one} / ${b.ten})`);
    const pity = b.pity;
    check(!!pity && pity.after >= 10 && pity.after <= 100 && byR[pity.rarity] > 0 && near(pityOdds(b).reduce((s, o) => s + o.p, 0), 1) && pityOdds(b).every((o) => o.rarity >= pity.rarity),
      `${id}: 천장 ${pity?.after}번째는 등급 ${pity?.rarity} 이상에서만, 그 확률의 합도 1`);
    const ten = poolOdds(b.pool, b.tenAtLeast ?? 0);
    check(b.tenAtLeast !== undefined && near(ten.reduce((s, o) => s + o.p, 0), 1) && b.tenAtLeast < (pity?.rarity ?? 9), `${id}: 10번의 열째 보장(등급 ${b.tenAtLeast} 이상)이 있고 천장보다 낮은 등급`);
    check(byR[2] > 0 && byR[2] <= 0.05 && byR[0] >= 0.6, `${id}: 전설 ${(byR[2] * 100).toFixed(2)}%, 일반 ${(byR[0] * 100).toFixed(2)}%`);
    check(named(b.name), `${id}: 배너 이름이 한국어·영어로 있다`);
  }
  const covered = new Set(Object.values(BANNERS).flatMap((b) => b.pool.map((s) => s.hero)));
  check(Object.keys(HEROES).every((h) => covered.has(h)), '모든 영웅이 어느 배너에서든 나온다');
  const pools = always.map((id) => BANNERS[id].pool.map((s) => s.hero).sort().join());
  check(new Set(pools).size === always.length, '두 번째 배너는 판(나오는 영웅)이 다르다');
  // 월식 소환: 기간 한정 픽업 셋이 3주씩 이어진다. 픽업은 전설 3% 가운데 반, 반반, 천장 60을 함께 센다
  const ecl = ids.filter((id) => BANNERS[id].pickup).map((id) => BANNERS[id]);
  check(ecl.length === 3 && ecl.every((b) => b.fiftyFifty && b.pityGroup === 'eclipse' && b.pity?.after === 60 && b.start !== undefined && b.end !== undefined && b.end - b.start === 21 * 86400000),
    `월식 소환 셋: 반반, 천장 공유(eclipse), 천장 60, 3주씩 (${ecl.map((b) => b.pickup?.hero).join(', ')})`);
  check(ecl.every((b, i) => i === 0 || b.start === ecl[i - 1].end) && new Set(ecl.map((b) => b.pickup?.hero)).size === 3 && ecl.every((b) => HEROES[b.pickup!.hero].rarity === 2), '셋은 빈틈 없이 이어지고 픽업은 서로 다른 전설');
  const b0 = ecl[0], odds = pullOdds(b0, 0, false), pick = odds.find((o) => o.hero === b0.pickup!.hero)?.p ?? 0, sure = pullOdds(b0, 2, true).filter((o) => o.p > 0);
  check(near(pick, 0.015) && near(rarityOdds(odds)[2], 0.03) && sure.length === 1 && sure[0].hero === b0.pickup!.hero, `픽업의 확률 ${(pick * 100).toFixed(2)}% (전설 3%의 반), 확정일 때의 전설은 픽업뿐`);
  const eff = effectiveOdds(b0).find((o) => o.hero === b0.pickup!.hero)?.p ?? 0;
  check(eff > pick && eff < 0.04, `실효 확률(천장·반반을 넣은 오랜 평균) ${(eff * 100).toFixed(2)}%: 평소보다 높다`);
  const sel = GACHA_RULE_VIEW.select?.herochoice ?? [];
  check(sel.length === 3 && sel.every((h) => HEROES[h].rarity === 2) && ITEMS.herochoice.kind === 'token', `전설 영웅 선택권: 전설 셋 가운데 하나 (${sel.join(', ')})`);
}

// ---------- 영웅의 성장: 장비·세트·기술·각성·시너지·진형, 재료가 어디서 오는가 ----------
{
  const hr = HERO_RULE_VIEW, gear = hr.gear!;
  check(!!gear && gear.slots.length === 3 && Object.values(gear.items).every((x) => gear.slots.some((s) => s.id === x.slot) && (!x.set || Object.hasOwn(gear.sets ?? {}, x.set)) && named(x.name)),
    `영웅 장비: 칸 셋, 장비 ${Object.keys(gear.items).length}점의 칸·세트·이름이 모두 있다`);
  check(Object.entries(gear.sets ?? {}).every(([id, set]) => Object.values(gear.items).filter((x) => x.set === id).length >= Math.max(...set.tiers.map((t) => t.n)) && named(set.name)), '세트마다 가장 높은 단을 켤 만큼의 장비가 있다');
  const drops = [...Object.values(gear.drops?.stage ?? {}), ...Object.values(gear.drops?.dungeon ?? {})].flatMap((d) => d.pool.map((x) => x.id));
  check(drops.every((id) => Object.hasOwn(gear.items, id)) && Object.keys(gear.items).every((id) => drops.includes(id)), '떨어지는 표의 장비는 모두 있고, 모든 장비가 어딘가에서 떨어진다');
  check(STAGES.filter((s) => s.def.boss).every((s) => gear.drops?.stage?.[s.id]?.chance === 1), '우두머리 단계는 장비 하나 확정');
  const steps = hr.awaken?.steps ?? [];
  check(!!hr.skill && steps.length === 3 && steps.every((x, i) => i === 0 || (x.shards > steps[i - 1].shards && x.mul > steps[i - 1].mul)) && steps.filter((x) => x.passive).every((x) => named(x.passive!.name)),
    `기술 레벨과 각성 셋 (조각 ${steps.map((x) => x.shards).join('·')}, 배율 ${steps.map((x) => x.mul).join('·')})`);
  // 재료의 출처: 단계(운철), 우두머리 처음(달 조각), 별의 샘(별정수·서책·달 조각), 임무(서책·소탕권), 출석(소탕권·선택권), 방치(별정수)
  const sources: unknown[] = [
    ...STAGES.flatMap((s) => [s.def.reward, s.def.first ?? {}]), ...Object.values(DUNGEONS).map((d) => d.reward),
    ...Object.values(DAILIES).map((d) => d.r), ...ATTEND, IDLE.reward(600, 10, { stage: 20 }),
  ];
  const from = (item: string) => sources.some((r) => ((r as { items?: Record<string, number> }).items?.[item] ?? 0) > 0);
  const mats = ['essence', 'starchart', 'moonshard', 'starsteel', 'sweepticket', 'herochoice'];
  check(mats.every(from), `성장 재료와 소탕권·선택권은 모두 어딘가에서 생긴다 (${mats.filter((m) => !from(m)).join(', ') || '빠진 것 없음'})`);
  check(Object.keys(hr.trade ?? {}).join() === 'essence' && hr.trade!.essence.cost(0) === 3 && hr.trade!.essence.cost(2) === 15, '별정수 → 조각: 일반 3 · 희귀 6 · 전설 15');
  const sq = SQUAD_RULES;
  check(!!sq.rows && sq.rows.front + sq.rows.back === sq.size && Object.keys(sq.synergy ?? {}).sort().join() === 'moon,star,sun' && Object.values(sq.synergy ?? {}).every((x) => named(x.name)),
    '진형(앞줄 둘·뒷줄 둘)과 진영 셋의 시너지, 이름이 있다');
}

// ---------- 소탕·오프라인 진행·단계 밖 ----------
{
  const st = STAGE_RULE_VIEW;
  check(!!st.sweep && 'item' in (st.sweep.cost ?? {}) && st.sweep.max === 10 && !!st.offline && st.offline.perStageS >= 600 && st.returnAfterDungeon === 3, `단계 소탕(소탕권 하나, 열 번까지), 오프라인 진행(${st.offline?.perStageS}초에 한 단계), 던전 뒤 ${st.returnAfterDungeon}초에 단계로`);
  const ds = Object.values(DUNGEONS) as { fromMenu?: boolean; auto?: boolean; sweep?: { max?: number } }[];
  check(ds.every((d) => d.fromMenu && d.auto && (d.sweep?.max ?? 0) >= 1), '열쇠 던전은 모두 메뉴에서 들어가고, 안에서 대장도 대신 싸우며, 끝낸 뒤 소탕할 수 있다');
  check(IDLE_VIEW.popup === true && HUD_VIEW.hide?.join() === 'bag,attackNearest', '돌아왔을 때의 창을 쓰고, 가방·가까운 대상 공격 단추를 감춘다');
}

// ---------- 단계 ----------
{
  check(CHAPTERS.length === 3 && CHAPTERS.every((c) => c.stages.length === 10) && STAGES.length === 30, `장 셋 × 단계 열 (${STAGES.length})`);
  check(STAGES.every((s) => !!s.def.boss === ((s.n + 1) % 5 === 0)), `다섯째마다 우두머리 (${STAGES.filter((s) => s.def.boss).map((s) => s.id).join(' ')})`);
  check(STAGES.every((s) => (!s.def.boss || hpOfMonster(s.def.boss.type) > 0) && s.def.waves.flat().every((w) => hpOfMonster(w.type) > 0)), '단계의 몬스터는 모두 MONSTERS에 있다');
  const hpOf = (i: number) => { const d = STAGES[i].def; return d.scale * (d.waves.flat().reduce((s, w) => s + hpOfMonster(w.type) * w.n, 0) + (d.boss ? hpOfMonster(d.boss.type) : 0)); };
  let up = true, recUp = true, hpUp = true, note = '';
  for (let i = 1; i < STAGES.length; i++) {
    const a = STAGES[i - 1].def, b = STAGES[i].def;
    if (!(b.scale > a.scale)) { up = false; note += ` scale@${STAGES[i].id}`; }
    if (!(b.rec > a.rec)) { recUp = false; note += ` rec@${STAGES[i].id}`; }
    // 적의 체력의 합: 우두머리 단계 다음은 줄 수 있으니 같은 갈래(우두머리 단계끼리, 졸개 단계끼리)에서 견준다
    const prev = STAGES.slice(0, i).reverse().find((s) => !!s.def.boss === !!b.boss);
    if (prev && !(hpOf(i) > hpOf(prev.i))) { hpUp = false; note += ` hp@${STAGES[i].id}`; }
  }
  check(up, `단계의 세기(scale)는 단계마다 오른다 (${stageScale(0)} → ${stageScale(29)})${note}`);
  check(recUp, `권장 전투력은 단계마다 오른다 (${stageRec(0, false)} → ${stageRec(29, true)})${note}`);
  check(hpUp, `적의 체력의 합은 같은 갈래에서 단계마다 오른다 (1-1 ${Math.round(hpOf(0))} → 3-9 ${Math.round(hpOf(28))})${note}`);
  check(STAGES.every((s) => (s.def.first?.sparks ?? 0) > 0 && (s.def.reward.gold ?? 0) > 0), '모든 단계: 처음 깨면 월석, 깰 때마다 금화');
  check(STAGES.every((s, i) => i === 0 || (s.def.reward.gold ?? 0) > (STAGES[i - 1].def.reward.gold ?? 0)), '깰 때마다의 금화도 단계마다 오른다');
  check(STAGES.every((s) => waveCount(s.def) >= 3 && waveCount(s.def) <= 5), '단계마다 물결 3~5 (우두머리 포함)');
  check(CHAPTERS.every((c) => named(c.name)), '장의 이름이 한국어·영어로 있다');
}

// ---------- 열쇠 던전과 방치 보상 ----------
{
  const ds = Object.values(DUNGEONS) as { key?: { refill: number; cap: number; buy?: { cur: string; perDay: number } }; reward: { gold?: number; items?: Record<string, number> }; gear?: boolean }[];
  check(ds.length >= 2 && ds.every((d) => !!d.key && d.key.refill > 0 && d.key.cap >= d.key.refill && d.key.buy?.cur === 'sparks' && d.key.buy.perDay > 0 && d.gear === false), '열쇠 던전 둘 이상: 날마다 채움, 상한, 월석으로 하루 몇 번 사기, 장비는 주지 않는다');
  check(ds.some((d) => (d.reward.gold ?? 0) >= 1000) && ds.some((d) => (d.reward.items?.essence ?? 0) > 0), '하나는 금화, 하나는 영웅을 키우는 재료(별정수)');
  const idle = (stage: number) => IDLE.reward(120, 10, { stage });
  check((idle(10).gold ?? 0) > (idle(1).gold ?? 0) && (idle(20).sparks ?? 0) > (idle(5).sparks ?? 0), `방치 보상은 깬 단계로 커진다 (2시간: 1단계 금화 ${idle(1).gold}, 10단계 ${idle(10).gold}, 20단계 월석 ${idle(20).sparks})`);
}
