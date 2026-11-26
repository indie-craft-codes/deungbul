// 메뉴의 일일 탭: 일일 임무의 진행과 출석 연속 일수. 주간·월간 임무(DailyDef.period)가 있는 게임은 기간마다 묶고, 머리에 '초기화까지'를 적는다
// (다음 초기화 시각은 서버가 meta의 daily.next로 보낸다: 서버의 시계와 초기화 시각 RESET으로 셈한 것).
import { DAILY_IDS, PERIODS, dailyDef, dailyPeriod } from '../../../shared/defs';
import { L, t } from '../../i18n';
import { S } from '../../state';
import { el, rewardText, row, ui } from './parts';

const HEAD = { day: 'dailyDay', week: 'dailyWeek', month: 'dailyMonth' } as const;

export function drawDaily(): void {
  const loc = L(), d = S.meta.daily;
  ui.list.append(el('baghead', loc.fmt.streak(d.streak)));
  const groups = PERIODS.map((p, i) => ({ p, i, ids: DAILY_IDS.filter((id) => dailyPeriod(id) === p) })).filter((x) => x.ids.length);
  // 일일 임무뿐인 게임은 예전 그대로 (머리 없이)
  const heads = groups.some((x) => x.p !== 'day');
  for (const { p, i, ids } of groups) {
    if (heads) {
      const next = d.next?.[i];
      ui.list.append(el('baghead dhead', `${t(HEAD[p])}${next ? ` · ${loc.fmt.resetIn(next - Date.now())}` : ''}`));
    }
    for (const id of ids) {
      const def = dailyDef(id), done = d.got.includes(id);
      ui.list.append(row(loc.gear.dailies[id], rewardText(def.r), [el('num', done ? t('dailyDone') : loc.fmt.have(d.prog[id] ?? 0, def.n))], done ? 'done' : ''));
    }
  }
  ui.list.append(el('note', t('dailyNote')));
}
