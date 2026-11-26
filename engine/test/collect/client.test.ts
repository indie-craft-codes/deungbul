// 수집형·방치형 화면의 셈 (engine/client/hud/collectcalc.ts)을 브라우저 없이 본다: 영웅 탭의 줄, 공개 확률표, 편성 바꾸기, 단계 막대와 단계의 줄, 던전의 열쇠 줄.
// 그리고 메뉴 탭과 화면 모듈의 목록: 수집형의 탭은 그 모듈을 고른 게임에만 있고, 고르지 않은 게임의 화면 모듈 차례는 예전과 같다.
import fs from 'node:fs';
import path from 'node:path';
import { BANNERS, HERO_RULES, STAGES, bannerOdds, pctText, type StageMe } from '../../shared/defs';
import { heroRows, keyView, rateTable, squadToggle, stageBar, stageRows, stageSegments } from '../../client/hud/collectcalc';
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
  const tail = order.slice(-4).join();
  check(tail === 'initRoster:roster,initGacha:gacha,initSquad:squad,initStages:stages' && order.indexOf('initRoster:roster') > order.indexOf('initAutoName'),
    `수집형의 화면 모듈은 목록의 맨 뒤에, 저마다 자기 모듈을 고른 게임에서만 (${tail})`);
  const hud = fs.readFileSync(path.join(import.meta.dirname, '../../client/hud/collect.ts'), 'utf8') + fs.readFileSync(path.join(import.meta.dirname, '../../client/hud/stagebar.ts'), 'utf8');
  check(['heroes', 'gacha', 'squad', 'stages'].every((id) => hud.includes(`addMenuTab({ id: '${id}'`)) && !/\b(pay|purchase|checkout|iap|billing)\b/i.test(hud), '탭 넷은 addMenuTab으로 붙고, 결제·구매의 낱말이 화면 코드에 없다');
}
