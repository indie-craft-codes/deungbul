// 픽업·기간 한정 배너와 선택권 (engine/server/game/systems/gacha.ts, shared/defs/collect.ts의 pullOdds·effectiveOdds):
//   픽업의 몫(전설 3% 가운데 반), 확정이면 픽업만, 픽업이 없는 배너는 예전 확률 그대로,
//   정해진 난수로 많이 뽑아 영웅마다의 수가 실효 확률(천장·반반을 넣은 오랜 평균)의 허용 범위 안인가,
//   반반(지면 다음 전설은 픽업 확정, 픽업이 나오면 풀림), 천장 무리(배너가 바뀌어도 셈과 확정이 이어진다), 기간(서버 시계로 열고 닫는다), 선택권.
import { BANNERS, bannerOdds, effectiveOdds, pityKey, poolOdds, pullOdds, rarityOdds, seededRng, type GachaMe, type Odds } from '../../shared/defs';
import type { Ent } from '../../server/game/entity';
import { Game } from '../../server/game/game';
import { check } from '../harness';

const DAY = 86400000;
const FROM = BANNERS.starfall.start!;
const said = (g: Game, p: Ent, k: string) => g.notices.some((n) => n.id === p.id && n.k === k);
const sum = (xs: readonly Odds[]) => xs.reduce((s, x) => s + x.p, 0);
const pOf = (xs: readonly Odds[], h: string) => xs.find((x) => x.hero === h)?.p ?? 0;

// ---------- 확률표: 픽업의 몫, 확정 ----------
{
  const b = BANNERS.starfall, normal = pullOdds(b), sure = pullOdds(b, -1, true), pity = pullOdds(b, 2), pitySure = pullOdds(b, 2, true);
  check(Math.abs(sum(normal) - 1) < 1e-12 && Math.abs(sum(sure) - 1) < 1e-12 && Math.abs(sum(pity) - 1) < 1e-12 && Math.abs(sum(pitySure) - 1) < 1e-12, '확률표 넷(평소, 확정, 천장, 천장+확정)의 합이 저마다 1');
  check(Math.abs(pOf(normal, 'starseer') - 0.015) < 1e-12 && Math.abs(pOf(normal, 'stormblade') - 0.015) < 1e-12 && Math.abs(rarityOdds(normal)[2] - 0.03) < 1e-12,
    `픽업(별읽는이)은 전설 3%의 반 ${(pOf(normal, 'starseer') * 100).toFixed(2)}%, 전설의 확률은 그대로 3%`);
  check(Math.abs(pOf(sure, 'starseer') - 0.03) < 1e-12 && pOf(sure, 'stormblade') === 0 && Math.abs(pOf(pitySure, 'starseer') - 1) < 1e-12 && Math.abs(pOf(pity, 'starseer') - 0.5) < 1e-12,
    '확정이면 전설은 모두 픽업 (평소 3%, 천장에서 100%), 확정이 아니면 천장에서 반반');
  check(JSON.stringify(pullOdds(BANNERS.dawn)) === JSON.stringify(poolOdds(BANNERS.dawn.pool)) && JSON.stringify(pullOdds(BANNERS.dawn, 1)) === JSON.stringify(poolOdds(BANNERS.dawn.pool, 1)) && JSON.stringify(bannerOdds(BANNERS.dawn)) === JSON.stringify(pullOdds(BANNERS.dawn)),
    '픽업이 없는 배너(새벽의 부름)의 확률표는 예전(poolOdds)과 글자까지 같다');
  const one = { ...b, pickup: { hero: 'starseer', share: 0.7 }, fiftyFifty: false };
  check(Math.abs(pOf(pullOdds(one), 'starseer') - 0.021) < 1e-12 && Math.abs(pOf(pullOdds(one, -1, true), 'starseer') - 0.03) < 1e-12, 'share 0.7이면 전설 3%의 70% = 2.1%');
}

// ---------- 많이 뽑아 실효 확률과 견준다 (정해진 난수) ----------
{
  const g = new Game({ now: () => FROM + DAY, plugins: [] });
  const p = g.players.spawn('픽업', false, null, 'pk-1');
  g.stages.leave(p, false);
  g.gacha.rng = seededRng(20261126);
  g.wallet.add(p, 'sparks', 1e9, '');
  const eff = effectiveOdds(BANNERS.starfall);
  check(Math.abs(sum(eff) - 1) < 1e-9, `실효 확률의 합은 1 (${sum(eff)})`);
  const N = 120000, count = new Map<string, number>();
  for (let i = 0; i < N; i++) for (const x of g.gacha.draw(p, 'starfall', 1) ?? []) count.set(x.h, (count.get(x.h) ?? 0) + 1);
  // 천장과 반반으로 뽑기끼리 이어져 있어 이항 분포보다 퍼진다: 5시그마 × 1.5의 범위
  const off = eff.filter((o) => Math.abs((count.get(o.hero) ?? 0) - N * o.p) > 7.5 * Math.sqrt(N * o.p * (1 - o.p)));
  check(off.length === 0, `뽑기 ${N}번의 영웅마다의 수가 실효 확률의 범위 안 (${eff.map((o) => `${o.hero} ${count.get(o.hero) ?? 0}/${Math.round(N * o.p)}`).join(', ')})`);
  const pk = (count.get('starseer') ?? 0) / N, other = (count.get('stormblade') ?? 0) / N;
  check(pOf(eff, 'starseer') > 0.015 && pOf(eff, 'starseer') > pOf(eff, 'stormblade') && Math.abs(pk - pOf(eff, 'starseer')) / pOf(eff, 'starseer') < 0.08,
    `픽업의 실효 확률 ${(pOf(eff, 'starseer') * 100).toFixed(3)}% (평소 1.5%보다 높다: 천장과 반반), 실제 ${(pk * 100).toFixed(3)}%, 다른 전설 ${(other * 100).toFixed(3)}%`);
  // 전설 가운데 픽업의 비율: 반반이면 오래 뽑을 때 2/3 (1 / (2 − 0.5))
  check(Math.abs(pk / (pk + other) - 2 / 3) < 0.03, `전설 가운데 픽업의 비율 ${(pk / (pk + other)).toFixed(3)} ≈ 2/3 (반반)`);
  const dawnEff = effectiveOdds(BANNERS.dawn);
  check(dawnEff.every((o) => o.rarity < 2 || o.p > 0.015) && Math.abs(sum(dawnEff) - 1) < 1e-9, '픽업이 없어도 천장이 있으면 실효 확률은 평소(전설 하나 1.5%)보다 높다');
}

// ---------- 반반: 지면 다음 전설은 픽업 확정 ----------
{
  const g = new Game({ now: () => FROM + DAY, plugins: [] });
  const p = g.players.spawn('반반', false, null, 'pk-2');
  g.stages.leave(p, false);
  g.wallet.add(p, 'sparks', 1e7, '');
  g.gacha.rng = () => 0; // 언제나 첫 칸: 천장이 아니면 일반(철벽), 천장에서는 전설의 첫 칸(폭풍검: 픽업이 아니다)
  for (let i = 0; i < 59; i++) g.gacha.draw(p, 'starfall', 1);
  check(g.gacha.pityOf(p, 'starfall') === 59 && !g.gacha.sureOf(p, 'starfall'), '59번 동안 전설이 없다');
  const lost = g.gacha.draw(p, 'starfall', 1)![0];
  check(lost.h === 'stormblade' && lost.pity && g.gacha.sureOf(p, 'starfall') && g.gacha.pityOf(p, 'starfall') === 0, `60번째(천장)는 전설: 픽업이 아닌 ${lost.h} → 확정이 켜진다`);
  for (let i = 0; i < 59; i++) g.gacha.draw(p, 'starfall', 1);
  const won = g.gacha.draw(p, 'starfall', 1)![0];
  check(won.h === 'starseer' && !g.gacha.sureOf(p, 'starfall'), `다음 천장은 픽업 확정 (${won.h}), 확정은 풀린다`);
  // 천장이 아닌 전설도 확정을 따른다: 평소 표에서 폭풍검의 칸(누적 0.97~0.985)에 떨어지는 난수
  g.gacha.rng = () => 0.975;
  const natural = g.gacha.draw(p, 'starfall', 1)![0];
  check(natural.r === 2 && !natural.pity && natural.h === 'stormblade' && g.gacha.sureOf(p, 'starfall'), `천장이 아닌 전설도 픽업이 아니면(${natural.h}) 확정이 켜진다`);
  const next = g.gacha.draw(p, 'starfall', 1)![0];
  check(next.h === 'starseer' && !next.pity && !g.gacha.sureOf(p, 'starfall'), `확정이면 같은 난수로도 전설은 픽업 (${next.h}: 확정의 표에서 폭풍검은 0%)`);
  const me = g.personal.find((x) => x.name === 'gacha')!.state(p) as GachaMe;
  check(!!me.sure && typeof me.pity[pityKey('starfall')] === 'number' && pityKey('starfall') === 'group:limited', `개인 상태에 천장 무리의 셈(${pityKey('starfall')})과 확정(sure)이 있다`);
}

// ---------- 천장 무리: 배너가 바뀌어도 셈과 확정이 이어진다, 기간 ----------
{
  let T = FROM - DAY;
  const g = new Game({ now: () => T, plugins: [] });
  const p = g.players.spawn('기간', false, null, 'pk-3');
  g.stages.leave(p, false);
  g.wallet.add(p, 'sparks', 1e7, '');
  const open = () => (g.personal.find((x) => x.name === 'gacha')!.state(p) as GachaMe).open ?? {};
  check(g.gacha.draw(p, 'starfall', 1) === null && said(g, p, 'bannerClosed') && p.sparks === 1e7 && !('starfall' in open()) && open().dawn === -1, '열리기 전의 배너는 뽑지 못하고(값도 치르지 않는다) 열린 배너에 없다. 상시 배너는 -1');
  T = FROM;
  g.gacha.rng = () => 0;
  for (let i = 0; i < 30; i++) g.gacha.draw(p, 'starfall', 1);
  check(open().starfall === 14 * 24 * 60 && !('stormcall' in open()), `열린 때: 남은 분 ${open().starfall} (14일), 다음 배너는 아직`);
  for (let i = 0; i < 10; i++) g.gacha.draw(p, 'dawn', 1);
  check(g.gacha.pityOf(p, 'starfall') === 30 && g.gacha.pityOf(p, 'dawn') === 10, '상시 배너의 천장은 따로 센다');
  T = FROM + 14 * DAY - 1;
  check(open().starfall === 1, '닫히기 1ms 전: 남은 1분');
  T = FROM + 14 * DAY;
  g.notices = [];
  check(g.gacha.draw(p, 'starfall', 1) === null && said(g, p, 'bannerClosed') && !('starfall' in open()) && 'stormcall' in open(), '끝나는 때에 닫히고, 다음 한정 배너가 열린다');
  check(g.gacha.pityOf(p, 'stormcall') === 30, `천장 무리(limited): 새 배너가 앞 배너의 셈 30을 이어받는다 (${g.gacha.pityOf(p, 'stormcall')})`);
  for (let i = 0; i < 29; i++) g.gacha.draw(p, 'stormcall', 1);
  const hit = g.gacha.draw(p, 'stormcall', 1)![0];
  check(hit.pity && hit.h === 'stormblade' && !g.gacha.sureOf(p, 'stormcall'), `이어받은 셈으로 60번째가 천장 (${hit.h}: 이 배너의 픽업이라 확정은 켜지지 않는다)`);
  // 확정도 이어진다: 앞 배너에서 지고 다음 배너로
  const q = g.players.spawn('이어짐', false, null, 'pk-4');
  g.stages.leave(q, false);
  g.wallet.add(q, 'sparks', 1e7, '');
  T = FROM;
  for (let i = 0; i < 60; i++) g.gacha.draw(q, 'starfall', 1); // 60번째: 폭풍검(별똥별의 픽업이 아니다) → 확정
  check(g.gacha.sureOf(q, 'starfall'), '별똥별에서 반반을 졌다');
  T = FROM + 15 * DAY;
  check(g.gacha.sureOf(q, 'stormcall'), '천장 무리의 다음 배너(폭풍)로 확정이 이어진다');
  g.gacha.rng = () => 0.985;
  const carried = g.gacha.draw(q, 'stormcall', 1)![0];
  check(carried.h === 'stormblade', `확정이면 지금 배너의 픽업 (${carried.h})`);
  T = FROM + 28 * DAY;
  check(g.gacha.draw(q, 'stormcall', 1) === null && Object.keys(open()).join() === 'dawn', '모든 한정 배너가 끝나면 상시 배너만');
}

// ---------- 같은 씨앗이면 같은 결과 ----------
{
  const same = () => { const g = new Game({ now: () => FROM + DAY, plugins: [] }), p = g.players.spawn('씨앗', false, null, 'pk-5'); g.gacha.rng = seededRng(77); g.wallet.add(p, 'sparks', 1e7, ''); return [1, 2, 3, 4, 5].flatMap(() => g.gacha.draw(p, 'starfall', 10)!.map((x) => x.h)).join() + g.gacha.sureOf(p, 'starfall'); };
  check(same() === same(), '같은 씨앗의 난수면 픽업 배너의 결과와 확정이 같다');
}

// ---------- 선택권 ----------
{
  const g = new Game({ plugins: [] });
  const p = g.players.spawn('선택', false, null, 'pk-6');
  g.stages.leave(p, false);
  g.notices = [];
  g.command(p, { t: 'gacha', a: 'select', item: 'herochoice', hero: 'starseer' });
  check(said(g, p, 'itemShort') && !p.heroes.starseer, '선택권이 없으면 고르지 못한다 (itemShort)');
  g.bag.putItem(p, 'herochoice', 2, '');
  g.command(p, { t: 'gacha', a: 'select', item: 'herochoice', hero: 'ironwall' });
  g.command(p, { t: 'gacha', a: 'select', item: 'sweepticket', hero: 'starseer' });
  g.command(p, { t: 'gacha', a: 'select', item: 'herochoice', hero: 7 });
  check(p.items.herochoice === 2 && !p.heroes.ironwall && !p.heroes.starseer, '목록에 없는 영웅, 선택권이 아닌 아이템, 이상한 값은 받지 않는다');
  g.command(p, { t: 'gacha', a: 'select', item: 'herochoice', hero: 'starseer' });
  check(p.items.herochoice === 1 && p.heroes.starseer?.lv === 1 && said(g, p, 'heroPicked') && said(g, p, 'heroNew'), '선택권 하나로 고른 영웅(별읽는이)을 얻는다');
  g.notices = [];
  g.command(p, { t: 'gacha', a: 'select', item: 'herochoice', hero: 'starseer' });
  const n = g.notices.find((x) => x.k === 'heroPicked');
  check(p.items.herochoice === 0 && p.heroes.starseer.shards === 25 && n?.a.join() === 'starseer,1,25', `가진 영웅을 고르면 조각 (전설 25) (${n?.a.join()})`);
  const rows = g.ledger.rows().filter((r) => r.cur === 'item:herochoice' && r.dir === '-');
  check(rows.length === 1 && rows[0].why === 'cmd:gacha:select' && rows[0].amount === 2, '장부: 선택권은 cmd:gacha:select로 나간다');
}
