// 수집형·방치형 화면의 셈 (engine/client/hud/collectcalc.ts)을 브라우저 없이 본다: 영웅 탭의 줄, 공개 확률표, 편성 바꾸기, 단계 막대와 단계의 줄, 던전의 열쇠 줄,
// 픽업 배너의 확률표(뽑기와 같은 셈), 열린 배너, 천장 무리, 소탕 단추의 셈, 소탕·오프라인 진행·픽업의 문장.
// 그리고 메뉴 탭과 화면 모듈의 목록: 수집형의 탭은 그 모듈을 고른 게임에만 있고, 고르지 않은 게임의 화면 모듈 차례는 예전과 같다.
import fs from 'node:fs';
import path from 'node:path';
import { BANNERS, HERO_RULES, STAGES, bannerOdds, effectiveOdds, pctText, pullOdds, type StageMe } from '../../shared/defs';
import { bannerPity, heroRows, keyView, openBanners, rateTable, squadToggle, stageBar, stageRows, stageSegments, sweepView } from '../../client/hud/collectcalc';
import { check } from '../harness';

// ---------- 영웅 탭의 줄 ----------
{
  const rows = heroRows({ ironwall: [3, 1, 12], starseer: [1, 3, 0] }, 1000, ['starseer']);
  check(rows.length === 6 && rows[0].id === 'starseer' && rows[1].id === 'ironwall' && rows.slice(2).every((r) => !r.owned) && rows[2].rarity === 2,
    `가진 영웅이 먼저(등급이 높은 것부터), 그다음 없는 영웅 (${rows.map((r) => r.id).join(', ')})`);
  const iw = rows[1];
  check(iw.lv === 3 && iw.maxLv === HERO_RULES.maxLv(1) && iw.starNeed === HERO_RULES.starCost(1) && iw.canStar && iw.levelCost === HERO_RULES.levelCost(3, 0) && iw.canLevel && !iw.inSquad && rows[0].inSquad,
    `레벨·별의 상한과 값, 누를 수 있는가 (조각 12/${iw.starNeed}, 레벨 값 ${iw.levelCost})`);
  check(!heroRows({ ironwall: [3, 1, 0] }, 10)[0].canLevel, '골드가 모자라면 레벨 업 단추를 누를 수 없다');
  const maxed = heroRows({ ironwall: [HERO_RULES.maxLv(HERO_RULES.maxStars), HERO_RULES.maxStars, 0] }, 1e9)[0];
  check(maxed.levelCost === 0 && maxed.starNeed === 0 && !maxed.canLevel && !maxed.canStar, '최대 레벨·최대 별이면 값이 0이고 누를 수 없다');
}

// ---------- 편성 바꾸기 ----------
{
  check(squadToggle(['a', 'b'], 'a', 4).join() === 'b' && squadToggle(['a'], 'b', 4).join() === 'a,b' && squadToggle(['a', 'b'], 'c', 2).join() === 'a,b', '편성: 있으면 빼고, 없으면 넣고, 가득이면 그대로');
}

// ---------- 공개 확률표 ----------
{
  const tab = rateTable(BANNERS.dawn);
  const sum = (xs: { p: number }[]) => xs.reduce((s, x) => s + x.p, 0);
  check(Math.abs(sum(tab.rarity) - 1) < 1e-12 && Math.abs(sum(tab.heroes) - 1) < 1e-12 && Math.abs(sum(tab.pity) - 1) < 1e-12 && Math.abs(sum(tab.ten) - 1) < 1e-12,
    '확률표 넷(등급별, 영웅별, 천장, 10번 보장)의 합이 저마다 1');
  check(tab.rarity.map((x) => pctText(x.p)).join() === '3%,22%,75%' && tab.heroes[0].rarity === 2 && pctText(tab.heroes[0].p) === '1.5%', `등급별 확률(높은 등급부터)과 영웅별 확률 (${tab.rarity.map((x) => pctText(x.p)).join(' ')}, ${pctText(tab.heroes[0].p)})`);
  check(tab.pity.every((o) => o.rarity === 2) && tab.ten.every((o) => o.rarity >= 1) && pctText(tab.ten[0].p) === `${(15 / 250 * 100).toFixed(0)}%`,
    `천장의 표는 전설만, 10번 보장의 표는 희귀 이상만 (전설 하나 ${pctText(tab.ten[0].p)})`);
  check(JSON.stringify(tab.heroes.map((o) => [o.hero, o.p]).sort()) === JSON.stringify(bannerOdds(BANNERS.dawn).map((o) => [o.hero, o.p]).sort()), '화면의 영웅별 확률은 서버가 뽑는 셈(bannerOdds)과 같다');
  check(pctText(0.0075) === '0.75%' && pctText(1 / 3) === '33.3333%' && pctText(0.06) === '6%', '백분율: 소수 넷째 자리까지, 끝의 0은 지운다');
}

// ---------- 단계 막대와 단계의 줄 ----------
{
  const out: StageMe = { cur: '1-3', best: '1-2', auto: true, run: null };
  const b0 = stageBar(out)!;
  check(b0.id === '1-3' && b0.state === 'out' && stageSegments(b0).every((s) => s.fill === 0), '단계 밖: 지금 단계의 id, 칸은 비었다');
  const fight: StageMe = { ...out, run: { id: '1-5', wave: 1, waves: 3, foes: 1, total: 4, left: 50, state: 'fight', boss: false } };
  const b1 = stageBar(fight)!, segs = stageSegments(b1);
  check(b1.wave === 2 && b1.waves === 3 && Math.abs(b1.progress - 0.75) < 1e-9 && segs.map((s) => s.fill).join() === '1,0.75,0' && segs[2].boss && !segs[0].boss,
    `싸우는 중: 물결 2/3, 이 물결 75%, 칸은 지난 것 가득·지금 것 진행·남은 것 비움, 마지막 칸은 우두머리 (${segs.map((s) => s.fill).join(',')})`);
  const clear = stageBar({ ...out, run: { id: '1-5', wave: 2, waves: 3, foes: 0, total: 1, left: 3, state: 'clear', boss: true } })!;
  check(stageSegments(clear).every((s) => s.fill === 1), '깼으면 칸이 모두 가득');
  const rows = stageRows(out);
  check(rows.length === STAGES.length && rows[0].cleared && rows[1].cleared && !rows[2].cleared && rows[2].open && rows[2].now && !rows[3].open && rows[4].boss,
    '단계의 줄: 깬 것(1-1, 1-2), 지금이자 다음(1-3), 잠긴 것(1-4부터), 우두머리(1-5)');
  check(stageRows(null)[0].open && !stageRows(null)[1].open, '아직 받지 않았으면 1-1만 열려 있다');
}

// ---------- 던전의 열쇠 줄 ----------
{
  const def = { key: { refill: 2, cap: 3, buy: { cur: 'sparks' as const, cost: 50, perDay: 2 } } };
  const k = keyView(def, 'mine', { mine: { n: 1, bought: 1 } })!;
  check(k.n === 1 && k.cap === 3 && k.refill === 2 && k.buy?.left === 1 && k.buy.cost === 50, '열쇠 줄: 가진 수, 상한, 채우는 수, 오늘 더 살 수 있는 수');
  check(keyView(def, 'mine', null)!.n === 2 && keyView({}, 'mine', null) === null, '아직 받지 않았으면 처음 수(min(refill, cap)), 열쇠가 없는 던전은 줄이 없다');
}

// ---------- 화면 모듈의 목록: 수집형은 맨 뒤에, 모듈마다 ----------
{
  const src = fs.readFileSync(path.join(import.meta.dirname, '../../client/modules.ts'), 'utf8');
  const order = [...src.matchAll(/\{ init: (\w+)(?:, mod: '(\w+)')? \}/g)].map((m) => `${m[1]}${m[2] ? ':' + m[2] : ''}`);
  // 웹 출시의 바탕(설정 창·약관·튜토리얼·손님 진행 보호: 어느 게임에나)은 그 뒤, 맨 끝에 (고르지 않은 게임의 init 차례가 예전과 같게)
  const WEB = ['initSettings', 'initLegal', 'initTutorial', 'initKeepSafe'];
  const tail = order.slice(-12, -4).join();
  check(order.slice(-4).join() === WEB.join(), `웹 출시의 바탕의 화면 모듈 넷은 목록의 맨 끝에 (${order.slice(-4).join()})`);
  check(tail === 'initRoster:roster,initGacha:gacha,initSquad:squad,initStages:stages,initHeroGear:herogear,initIdleBack:idle,initChars:chars,initMorph:morph' && order.indexOf('initRoster:roster') > order.indexOf('initAutoName'),
    `수집형의 화면 모듈(과 영웅 장비, 돌아왔을 때의 창, 캐릭터 정의·변신)은 목록의 맨 뒤에, 저마다 자기 모듈을 고른 게임에서만 (${tail})`);
  const hud = fs.readFileSync(path.join(import.meta.dirname, '../../client/hud/collect.ts'), 'utf8') + fs.readFileSync(path.join(import.meta.dirname, '../../client/hud/stagebar.ts'), 'utf8');
  check(['heroes', 'gacha', 'squad', 'stages'].every((id) => hud.includes(`addMenuTab({ id: '${id}'`)) && !/\b(pay|purchase|checkout|iap|billing)\b/i.test(hud), '탭 넷은 addMenuTab으로 붙고, 결제·구매의 낱말이 화면 코드에 없다');
}

// ---------- 픽업 배너의 공개 확률표: 서버가 뽑는 셈(pullOdds)과 같다 ----------
{
  const b = BANNERS.starfall, tab = rateTable(b);
  const sum = (xs: { p: number }[]) => xs.reduce((s, x) => s + x.p, 0);
  check([tab.rarity, tab.heroes, tab.pity, tab.ten, tab.sure, tab.effective].every((xs) => Math.abs(sum(xs) - 1) < 1e-9), '픽업 배너의 표 여섯(등급별, 영웅별, 천장, 10번 보장, 확정, 실효)의 합이 저마다 1');
  const same = (xs: { hero: string; p: number }[], ys: { hero: string; p: number }[]) => JSON.stringify(xs.map((o) => [o.hero, o.p]).sort()) === JSON.stringify(ys.map((o) => [o.hero, o.p]).sort());
  check(same(tab.heroes, pullOdds(b)) && same(tab.pity, pullOdds(b, 2)) && same(tab.ten, pullOdds(b, 1)) && same(tab.sure, pullOdds(b, -1, true)) && same(tab.effective, effectiveOdds(b)),
    '화면의 표는 모두 서버가 뽑는 셈(pullOdds, 실효는 effectiveOdds)과 글자까지 같다');
  const pk = tab.pickup!;
  check(pk.hero === 'starseer' && pk.rarity === 2 && Math.abs(pk.share - 0.5) < 1e-12 && pctText(pk.p) === '1.5%' && pctText(pk.sureP) === '3%' && pk.effective > pk.p && pk.effective < pk.sureP,
    `픽업의 줄: 몫 ${pctText(pk.share)}, 평소 ${pctText(pk.p)}, 확정 ${pctText(pk.sureP)}, 실효 ${pctText(pk.effective)}`);
  check(rateTable(BANNERS.dawn).pickup === null && rateTable(BANNERS.dawn).sure.length === 0, '픽업이 없는 배너는 픽업의 줄과 확정의 표가 없다');
  // 화면과 서버가 같은 함수를 부른다 (소스에서): 서버의 뽑기와 화면의 셈 모두 pullOdds
  const srv = fs.readFileSync(path.join(import.meta.dirname, '../../server/game/systems/gacha.ts'), 'utf8'), calc = fs.readFileSync(path.join(import.meta.dirname, '../../client/hud/collectcalc.ts'), 'utf8');
  check(/pickOdds\(odds\.length \? odds : pullOdds\(/.test(srv) && /const odds = pullOdds\(b, floor, sure\)/.test(srv) && /const odds = pullOdds\(b\)/.test(calc) && !/poolOdds\(/.test(calc), '서버의 뽑기와 화면의 확률표가 같은 함수(pullOdds)를 쓴다 (화면은 poolOdds를 따로 부르지 않는다)');
}

// ---------- 열린 배너와 천장 무리 ----------
{
  check(openBanners(null).join() === 'dawn' && openBanners({ open: { dawn: -1, starfall: 30 } }).join() === 'dawn,starfall' && openBanners({ open: { stormcall: 5 } }).join() === 'stormcall' && openBanners({ open: {} }).length === 0,
    '열린 배너: 받기 전에는 기간이 없는 배너만, 받으면 서버가 열렸다고 한 것만 (BANNERS의 차례)');
  const st = bannerPity('stormcall', { pity: { 'group:limited': 12, dawn: 3 }, sure: { 'group:limited': 1 } });
  check(st.count === 12 && st.sure && st.mates.join() === 'starfall' && bannerPity('dawn', { pity: { dawn: 3 } }).count === 3 && bannerPity('dawn', null).mates.length === 0, '천장 무리의 셈과 확정은 무리의 열쇠로 읽고, 함께 쓰는 배너를 안다');
}

// ---------- 소탕 단추의 셈과 단계의 줄 ----------
{
  const rule = { cost: { item: 'sweepticket', n: 1 }, max: 10 };
  const v = sweepView(rule, 3)!;
  check(v.what === 'sweepticket' && v.need === 1 && v.can === 3 && v.counts.join() === '1,3', `소탕권 3개면 세 번까지: 단추 ×1, ×3 (${v.counts.join()})`);
  check(sweepView(rule, 0)!.can === 0 && sweepView(rule, 0)!.counts.join() === '1,10' && sweepView(rule, 50)!.counts.join() === '1,10', '없으면 할 수 없고(단추는 ×1·×10이 잠긴다), 많아도 한 번의 상한(10)까지');
  check(sweepView({ max: 5 }, 0, 2)!.can === 2 && sweepView({ max: 5 }, 0, 0)!.can === 0 && sweepView({ cost: { cur: 'sparks', n: 30 }, max: 5 }, 100, 9)!.can === 3 && sweepView(undefined, 9) === null,
    '열쇠 던전: 열쇠의 수로도 막힌다, 재화의 값도 된다, 소탕이 없으면 null');
  check(sweepView({ cost: { item: 'x', n: 1 }, max: 1 }, 5)!.counts.join() === '1', '한 번에 하나뿐이면 단추도 하나');
  const rows = stageRows({ cur: '2-5', best: '2-5', auto: true, run: null });
  check(rows[0].sweep && rows[8].sweep && !rows[9].sweep && !stageRows({ cur: '1-2', best: '1-1', auto: true, run: null })[1].sweep, '깬 단계만 소탕 단추, sweep: false인 단계(2-5)는 깼어도 없다');
}

// ---------- 문장: 남은 기간, 방치 우편의 진행, 안내문 ----------
{
  const { koBase } = await import('../../client/i18n/ko');
  const { enBase } = await import('../../client/i18n/en');
  const { withIdNames } = await import('../../client/i18n/names');
  const ko = koBase(withIdNames({})), en = enBase(withIdNames({}));
  check(ko.fmt.gachaLeft(-1) === '상시' && ko.fmt.gachaLeft(45) === '남은 시간 45분' && ko.fmt.gachaLeft(3 * 1440 + 125) === '남은 시간 3일 2시간 5분' && en.fmt.gachaLeft(3 * 1440 + 125) === '3d 2h 5m left',
    `남은 기간: ${ko.fmt.gachaLeft(3 * 1440 + 125)} / ${en.fmt.gachaLeft(3 * 1440 + 125)}`);
  check(ko.fmt.mailTitle('idle', [60]) === '쉬는 동안 모인 것 (60분)' && en.fmt.mailTitle('idle', [60]) === 'Gathered while you were away (60 min)', '진행이 없는 방치 우편의 제목은 예전과 글자까지 같다');
  check(ko.fmt.mailTitle('idle', [60, '1-4', '2-3']) === '쉬는 동안 모인 것 (60분) · 1-4 → 2-3까지 진행' && en.fmt.mailTitle('idle', [60, '1-4', '2-3']) === 'Gathered while you were away (60 min) · advanced 1-4 → 2-3', `진행이 있으면 제목에 '1-4 → 2-3' (${ko.fmt.mailTitle('idle', [60, '1-4', '2-3'])})`);
  check(ko.msg.stageAway(['1-4', '2-3', 4]) === '자리를 비운 동안 1-4 → 2-3까지 진행 (4단계 깸)' && en.msg.stageAway(['1-4', '2-3', 4]) === 'While you were away: 1-4 → 2-3 (4 stages cleared)', `돌아왔을 때의 알림: ${ko.msg.stageAway(['1-4', '2-3', 4])}`);
  check(ko.msg.swept(['stage', '1-2', 3]) === '1-2 소탕 ×3 완료' && ko.fmt.sweepTimes(10) === '소탕 ×10' && en.fmt.sweepTimes(10) === 'Sweep ×10', '소탕의 문장');
}
