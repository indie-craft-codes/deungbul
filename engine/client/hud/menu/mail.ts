// 메뉴의 우편 탭: 받을 우편과 모두 받기.
import { L, t } from '../../i18n';
import { send } from '../../net';
import { S } from '../../state';
import { itemIcon } from '../icons';
import { goodsText } from './gear';
import { button, el, optsEl, rewardText, row, ui } from './parts';

export function drawMail(): void {
  const loc = L(), mail = S.meta.mail;
  if (!mail.length) { ui.list.append(el('note', t('mailEmpty'))); return; }
  ui.list.append(button(t('claimAll'), () => send({ t: 'mailClaim', id: 0 })));
  for (const m of [...mail].reverse()) {
    const r = row(loc.fmt.mailTitle(m.k, m.a), optsEl([rewardText(m.r), goodsText(m.r)]), [button(t('claim'), () => send({ t: 'mailClaim', id: m.id }))]);
    const pic = itemIcon('ui:mail');
    if (pic) r.querySelector('.iname')?.prepend(pic);
    ui.list.append(r);
  }
}
