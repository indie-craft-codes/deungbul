// 사람을 눌렀을 때(또는 대화 줄의 이름을 눌렀을 때) 뜨는 창(차단, 신고: 핵심 / 귓말: chat / 친구 요청: friends / 파티 초대: party / 길드 초대: guild), 받은 초대, 파티원 목록(party).
// 차단은 서버에 저장된다 (../social.ts): 차단한 사람의 대화·귓말·요청·초대는 서버가 보내지 않는다.
import type { PartyMember } from '../../shared/protocol';
import { $ } from '../app';
import { L, onLangChange, t } from '../i18n';
import { send } from '../net';
import { isBlocked, onSocialChange, toggleBlock } from '../social';
import { hasModule } from '../mods';
import { startWhisper } from './chat';
import { S } from '../state';
import { onMsg } from '../bus';
import { toUi } from '../uiscale';

const ui = {
  box: $('party'), list: $('partyList'),
  card: $('pcard'), cardName: $('pcardName'),
  invite: $('invite'), inviteText: $('inviteText'),
};
let cardId = 0;
let cardName = '';
/** 대화 줄에서 연 카드면 그 줄의 번호 (신고하면 그 줄의 앞뒤가 함께 적힌다) */
let cardLine: number | undefined;
let reportArmed = false;
let inviteTimer = 0;
let inviteFrom = '';

/** 사람 카드: 핵심 (차단, 신고). 파티·길드 초대 단추는 그 모듈을 고른 게임에만 있다 */
export function initCard(): void {
  $('pcardInvite')?.addEventListener('click', () => { if (cardId) send({ t: 'party', a: 'invite', id: cardId }); hideCard(); });
  $('pcardGuild')?.addEventListener('click', () => { if (cardId) send({ t: 'guild', a: 'invite', id: cardId }); hideCard(); });
  $('pcardReport').addEventListener('click', () => {
    // 잘못 누르지 않게, 처음 누르면 확인 문구로 바뀌고 한 번 더 눌러야 접수된다
    if (!reportArmed) { reportArmed = true; $('pcardReport').textContent = t('reportConfirm'); return; }
    if (cardLine !== undefined) send({ t: 'report', n: cardLine });
    else if (cardId) send({ t: 'report', id: cardId });
    hideCard();
  });
  // 차단과 풀기: 서버가 결과를 알린다 (blockedOn, blockedOff)
  $('pcardBlock').addEventListener('click', () => {
    if (cardName) toggleBlock(cardId, cardName, cardLine);
    hideCard();
  });
  // 귓말 (chat 모듈), 친구 요청 (friends 모듈): 차단 단추 앞에
  const block = $('pcardBlock');
  const more = (id: string, key: string, on: () => void): void => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'plain'; b.id = id; b.setAttribute('data-i18n', key); b.textContent = t(key as 'report');
    b.addEventListener('click', () => { on(); hideCard(); });
    block.before(b);
  };
  if (hasModule('chat')) more('pcardWhisper', 'whisper', () => { if (cardName) startWhisper(cardName); });
  if (hasModule('friends')) more('pcardFriend', 'friendAsk', () => { if (cardId && S.others.has(cardId)) send({ t: 'friend', a: 'ask', id: cardId }); else if (cardName) send({ t: 'friend', a: 'ask', name: cardName }); });
  onSocialChange(() => { if (!ui.card.hidden) $('pcardBlock').textContent = L().ui[isBlocked(cardId, cardName) ? 'unblock' : 'block']; });
}

/** 파티: 파티원 목록과 받은 초대 (party) */
export function initParty(): void {
  $('partyLeave').addEventListener('click', () => send({ t: 'party', a: 'leave' }));
  onMsg('party', (m) => setParty(m.m));
  onMsg('pinv', (m) => showInvite(m.name, m.s));
  $('inviteYes').addEventListener('click', () => { send({ t: 'party', a: 'accept' }); closeInvite(); });
  $('inviteNo').addEventListener('click', () => { send({ t: 'party', a: 'decline' }); closeInvite(); });
  onLangChange(renderParty);
}

/** 다른 사람을 눌렀다: 그 자리에 이름과 초대 단추를 띄운다. line은 대화 줄에서 열었을 때 그 줄의 번호 */
export function showCard(id: number, name: string, sx: number, sy: number, line?: number): void {
  cardId = id; cardName = name; cardLine = line;
  ui.cardName.textContent = name;
  reportArmed = false;
  $('pcardReport').textContent = L().ui.report;
  $('pcardBlock').textContent = L().ui[isBlocked(id, name) ? 'unblock' : 'block'];
  // 이미 같은 파티면 초대할 필요가 없다
  const inv = $('pcardInvite'), gi = $('pcardGuild');
  if (inv) inv.hidden = S.party.some((m) => m.id === id);
  // 내가 길드장이고 상대가 아직 길드가 없을 때만 길드 초대를 보인다
  if (gi) gi.hidden = !S.guild?.leader || S.gtags.has(id);
  ui.card.hidden = false;
  // 화면 밖으로 나가지 않게 한다
  // 카드는 배율(--ui-scale)을 건 HUD 안에 있다: 화면 px(sx, sy, innerWidth)를 그 좌표로 (../uiscale.ts)
  const w = ui.card.offsetWidth, h = ui.card.offsetHeight, x = toUi(sx), y = toUi(sy);
  ui.card.style.left = `${Math.max(8, Math.min(toUi(window.innerWidth) - w - 8, x - w / 2))}px`;
  ui.card.style.top = `${Math.max(8, Math.min(toUi(window.innerHeight) - h - 8, y - h - 34))}px`;
}
export function hideCard(): void { cardId = 0; cardName = ''; cardLine = undefined; ui.card.hidden = true; }

function closeInvite(): void { ui.invite.hidden = true; clearTimeout(inviteTimer); inviteFrom = ''; }

/** 초대를 받았다: 수락과 거절 단추를 띄우고, 유효 시간이 지나면 저절로 닫는다. */
export function showInvite(name: string, seconds: number): void {
  inviteFrom = name;
  ui.inviteText.textContent = L().fmt.partyInvite(name);
  ui.invite.hidden = false;
  clearTimeout(inviteTimer);
  inviteTimer = window.setTimeout(closeInvite, seconds * 1000);
}

/** 파티원 목록이 왔다 (빈 목록이면 파티가 없다). */
export function setParty(members: PartyMember[]): void {
  if (!ui.box) return; // 파티가 없는 게임
  const before = new Set(S.party.map((m) => m.id));
  S.party = members;
  // 파티원의 이름표를 다른 색으로 보여 준다
  const now = new Set(members.map((m) => m.id));
  for (const id of new Set([...before, ...now])) S.others.get(id)?.tag.el.classList.toggle('ally', now.has(id));
  renderParty();
}

/** 파티원 목록을 다시 그린다 (언어가 바뀌었을 때도). */
export function renderParty(): void {
  const loc = L(), me = S.me;
  if (inviteFrom) ui.inviteText.textContent = loc.fmt.partyInvite(inviteFrom);
  const others = S.party.filter((m) => m.id !== me?.id);
  const myCh = S.party.find((m) => m.id === me?.id)?.ch;
  ui.box.hidden = others.length === 0;
  // 좁은 화면에서 이 목록 아래에 놓이는 것들이 그만큼 내려가게 높이를 알린다
  ui.list.textContent = '';
  for (const m of others) {
    const row = document.createElement('div');
    row.className = 'prow';
    const head = document.createElement('div');
    head.className = 'row';
    const name = document.createElement('span');
    name.className = 'pname';
    name.textContent = m.name;
    const lv = document.createElement('span');
    lv.className = 'num';
    lv.textContent = loc.fmt.level(m.lv, m.cls in loc.classes ? loc.classes[m.cls as keyof typeof loc.classes].name : '');
    // 다른 채널에 있는 파티원은 곁에 있어도 보이지 않는다: 어느 채널인지 적어 준다
    if (m.ch && myCh && m.ch !== myCh) lv.textContent += ' · ' + loc.fmt.channelShort(m.ch);
    head.append(name, lv);
    const bar = document.createElement('div');
    bar.className = 'bar hp';
    const fill = document.createElement('i');
    fill.style.transform = `scaleX(${m.maxHp > 0 ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 0})`;
    bar.appendChild(fill);
    row.append(head, bar);
    ui.list.appendChild(row);
  }
}
