// 메뉴의 길드 탭: 초대 받기, 만들기, 기부, 공지, 길드원.
import { GUILD } from '../../../shared/defs';
import { L, t } from '../../i18n';
import { send } from '../../net';
import { S } from '../../state';
import { button, el, field, row, ui } from './parts';

export function drawGuild(): void {
  const loc = L(), me = S.me, g = S.guild, inv = S.guildInvite;
  if (!me) return;
  if (!g) {
    if (inv) {
      ui.list.append(row(loc.fmt.guildInviteFrom(inv.name, inv.from), '', [
        button(t('partyAccept'), () => send({ t: 'guild', a: 'accept' })),
        button(t('partyDecline'), () => send({ t: 'guild', a: 'decline' })),
      ]));
    }
    ui.list.append(el('note', loc.fmt.guildCreateInfo(GUILD.createLv, GUILD.createGold)));
    ui.list.append(field(t('guildNameHint'), GUILD.nameMax, t('guildCreate'), (name) => send({ t: 'guild', a: 'create', name })));
    return;
  }
  ui.list.append(el('baghead', loc.fmt.guildHead(g.name, g.lv, Math.round(g.lv * GUILD.expPerLevel * 100))));
  ui.list.append(row(g.max ? t('guildMaxLv') : loc.fmt.guildExp(g.exp, g.need), t('guildGiveInfo'),
    GUILD.gives.map((n) => button(loc.fmt.guildGive(n), () => send({ t: 'guild', a: 'give', n }), me.gold < n))));
  if (g.notice) ui.list.append(el('note', g.notice));
  if (g.leader) ui.list.append(field(t('guildNoticeHint'), GUILD.noticeMax, t('guildNoticeSet'), (text) => send({ t: 'guild', a: 'notice', text }), g.notice));
  ui.list.append(el('baghead', loc.fmt.guildMembers(g.members.length, GUILD.maxMembers)));
  for (const m of [...g.members].sort((a, b) => Number(b.on) - Number(a.on) || b.gave - a.gave)) {
    const buttons = g.leader && !m.me && m.pid ? [button(t('guildKick'), () => send({ t: 'guild', a: 'kick', pid: m.pid }))] : [];
    ui.list.append(row(`${m.on ? '● ' : '○ '}${m.name}${m.leader ? ` (${t('guildLeader')})` : ''}`, `${loc.fmt.level(m.lv, loc.classes[m.cls as keyof typeof loc.classes]?.name ?? '')} · ${loc.fmt.guildGave(m.gave)}`, buttons, m.me ? 'mine' : m.on ? '' : 'done'));
  }
  ui.list.append(el('note', t('guildChatHint')));
  ui.list.append(button(t('guildLeave'), () => send({ t: 'guild', a: 'leave' })));
}
