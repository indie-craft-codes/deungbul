// 메뉴의 우편 탭: 받을 우편과 모두 받기.
import { L, t } from '../../i18n';
import { send } from '../../net';
import { S } from '../../state';
import { itemIcon } from '../icons';
import { goodsText } from './gear';
import { DAILY_IDS } from '../../../shared/defs';
import { hasModule } from '../../mods';
import { button, emptyState, optsEl, rewardText, row, ui } from './parts';

/** 우편 탭이 일일 탭으로 데려가는 길 (menu.ts가 건다: 이 파일은 menu.ts를 읽지 않는다) */
let toDaily: (() => void) | null = null;
export function setMailToDaily(fn: () => void): void { toDaily = fn; }

/** 우편 탭의 머리에 붙이는 것 (쿠폰 입력 칸: hud/live.ts의 coupon 모듈) */
export const mailTop: ((list: HTMLElement) => void)[] = [];

export function drawMail(): void {
  const loc = L(), mail = S.meta.mail;
  for (const f of mailTop) f(ui.list);
  if (!mail.length) { const go = toDaily; ui.list.append(emptyState('mail', t('mailEmpty'), go && hasModule('daily') && DAILY_IDS.length ? { label: t('emptyToDaily'), onClick: go } : undefined)); return; }
  ui.list.append(button(t('claimAll'), () => send({ t: 'mailClaim', id: 0 })));
  for (const m of [...mail].reverse()) {
    const r = row(loc.fmt.mailTitle(m.k, m.a), optsEl([rewardText(m.r), goodsText(m.r), m.x ? loc.fmt.mailLeft(m.x - Date.now()) : '']), [button(t('claim'), () => send({ t: 'mailClaim', id: m.id }))]);
    const pic = itemIcon('ui:mail');
    if (pic) r.querySelector('.iname')?.prepend(pic);
    ui.list.append(r);
  }
}
