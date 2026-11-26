// 메뉴의 일일 탭: 일일 임무의 진행과 출석 연속 일수.
import { DAILY_IDS, dailyDef } from '../../../shared/defs';
import { L, t } from '../../i18n';
import { S } from '../../state';
import { el, rewardText, row, ui } from './parts';

export function drawDaily(): void {
  const loc = L(), d = S.meta.daily;
  ui.list.append(el('baghead', loc.fmt.streak(d.streak)));
  for (const id of DAILY_IDS) {
    const def = dailyDef(id), done = d.got.includes(id);
    ui.list.append(row(loc.gear.dailies[id], rewardText(def.r), [el('num', done ? t('dailyDone') : loc.fmt.have(d.prog[id] ?? 0, def.n))], done ? 'done' : ''));
  }
  ui.list.append(el('note', t('dailyNote')));
}
