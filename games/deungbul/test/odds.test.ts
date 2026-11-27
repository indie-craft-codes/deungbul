// 등불지기의 강화 확률이 확률표의 단일 원본(engine/shared/defs/odds.ts)에서 나오는가: 값은 예전의 ENHANCE와 글자까지 같고(경제를 바꾸지 않는다),
// 큰 수로 굴린 비율이 표와 맞고, odds 모듈을 켜면(이 시험에서만: 등불지기의 MODULES에는 없다) 공개 페이지에 단계별 확률(+0 ~ +9)과 보호 부적이 나온다.
// 등불지기에 공개 페이지·추첨 기록을 켤지는 사용자가 정한다 (docs/genre-features.md 5.4 '사용자 결정').
import { ENHANCE, MODULES, enhanceStep, enhanceTable, rollStep, seededRng } from '../shared/defs';
import { oddsFile, oddsHtml } from '@engine/server';
import { check } from '@engine/testing';
import { newGame } from './game';

check(!MODULES.includes('odds' as never), '등불지기는 odds 모듈을 고르지 않았다 (공개 페이지·추첨 기록은 사용자 결정 뒤): 굴림만 표에서 한다');
const t = enhanceTable();
const same = t.steps.every((s, n) => s.key === `+${n}` && s.outcomes[0].id === 'up' && s.outcomes[0].p === ENHANCE.rate(n));
const downs = t.steps.filter((s) => s.outcomes.some((o) => o.id === 'down')).map((s) => s.key);
check(t.steps.length === 10 && same && downs.join() === '+7,+8,+9' && t.guard === ENHANCE.charm && t.steps[0].outcomes.length === 1,
  `강화의 표: +0 ~ +9의 성공 확률이 ENHANCE.rate와 같고, 실패하면 내려가는 단계는 +7 ~ +9, 보호 부적 ${t.guard}, +0은 늘 성공 (${t.steps.map((s) => `${s.key} ${Math.round(s.outcomes[0].p * 100)}%`).join(' ')})`);
{
  const rng = seededRng(4242), N = 100_000;
  let worst = 0;
  for (const plus of [3, 7, 9]) {
    const step = enhanceStep(plus);
    let up = 0;
    for (let i = 0; i < N; i++) if (rollStep(step, rng())!.id === 'up') up++;
    const p = ENHANCE.rate(plus), sd = Math.sqrt((p * (1 - p)) / N);
    worst = Math.max(worst, Math.abs(up / N - p) / sd);
  }
  check(worst < 5, `+3·+7·+9에서 ${N.toLocaleString()}번씩 굴린 성공 비율이 표와 맞다 (가장 벗어난 것 ${worst.toFixed(2)}σ)`);
}
{
  const g = newGame({ raid: { hours: [] }, modules: [...MODULES, 'odds'] });
  g.odds.refresh();
  const f = oddsFile(g), enh = f.tables.find((x) => x.id === 'enhance');
  check(!!enh && enh.version === 1 && JSON.stringify(enh.steps) === JSON.stringify(t.steps) && enh.guard === 'ward' && f.names.ko.oddsEnhanceName === '장비 강화' && oddsHtml().includes('+{n}에서 강화할 때'),
    'odds 모듈을 켜면 공개 JSON에 등불지기의 강화 단계별 확률(+0 ~ +9, 하락 포함)과 보호 부적이 그대로 나온다');
}
