// 내용의 표가 약속을 지키는가: 배너(확률의 합, 천장, 10번 보장, 현금 없음), 단계(3장 × 10, 다섯째마다 우두머리, 갈수록 어렵다),
// 영웅(10~14명, 등급 셋, 역할 넷, 겉모습이 영웅마다 다르다), 열쇠 던전, 방치 보상이 깬 단계로 커지는 것, 언어 둘의 이름.
import { BANNERS, CHAPTERS, DUNGEONS, HERO_RARITIES, HERO_ROLES, HEROES, IDLE, MONSTERS, STAGES, bannerOdds, pityOdds, poolOdds, rarityOdds, waveCount } from '@engine/shared/defs';
import { check } from '@engine/testing';
import { koGame } from '../client/i18n/ko';
import { enGame } from '../client/i18n/en';
import { stageRec, stageScale } from '../shared/content';

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
  check(new Set(cloth).size === ids.length, '영웅마다 옷 색이 다르다 (화면이 옷 색으로 등급의 꾸밈을 고른다)');
  const looks = new Set(Object.values(HERO_ROLES).map((r) => `${r.hand}/${r.shot ?? ''}/${r.cloth}`));
  check(looks.size === Object.keys(HERO_ROLES).length, '역할마다 손 모양·날아가는 것·옷 색의 짝이 다르다');
  check(ids.every((id) => named(HEROES[id].name)) && Object.values(HERO_ROLES).every((r) => named(r.name)), '영웅과 역할의 이름이 한국어·영어로 있다');
}

// ---------- 배너 ----------
{
  const ids = Object.keys(BANNERS);
  check(ids.length === 2, `배너 둘: 늘 있는 것과 두 번째 (${ids.join(', ')})`);
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
  const pools = ids.map((id) => BANNERS[id].pool.map((s) => s.hero).sort().join());
  check(new Set(pools).size === ids.length, '두 번째 배너는 판(나오는 영웅)이 다르다');
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
