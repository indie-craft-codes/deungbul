// 사회와 안전의 화면 (데이터는 ../social.ts, 서버는 engine/server/net/social.ts):
//   설정 창의 '대화' 칸: 대화 보이기(끄면 대화창과 말풍선이 사라진다: 포털 요건), 귓말 받기(chat 모듈), 친구 요청 받기(friends 모듈), 차단한 사람과 풀기, 제한 모드 안내
//   연령 창 (내용의 AGE를 적은 게임만): 처음 들어온 저장 키에 태어난 해(또는 나이 구간)를 묻는다. 미리 골라 둔 값이 없고, 어느 답이 무엇을 여는지 보이지 않는다. 한 번 답하면 바꿀 수 없다
//   친구 탭 (friends 모듈): 이름으로 요청, 받은 요청(수락·거절), 보낸 요청(취소), 친구(접속 여부·있는 곳·마지막 접속, 귓말·파티 초대·끊기·차단)
import { AGE } from '../../shared/defs';
import type { FriendView } from '../../shared/defs';
import { NAME_MAX } from '../../shared/world';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, applyDom, onLangChange, t } from '../i18n';
import { hasModule } from '../mods';
import { send } from '../net';
import { blockList, friendList, listenSocial, onSocialChange, talkState, unblock } from '../social';
import { S } from '../state';
import { setChatHidden, startWhisper } from './chat';
import { addMenuTab, closeMenu, renderMenu } from './menu';
import { button, el, emptyState, field, row, whyOf } from './menu/parts';
import { addSetting, settingValue } from './settings';

/** 기기에 둔 받기 설정을 서버에 알린다 (들어올 때마다: 서버의 것은 이 기기의 것을 따른다) */
function pushPrefs(): void {
  if (!hasModule('chat') && !hasModule('friends')) return;
  send({ t: 'talk', a: 'prefs', ...(hasModule('chat') ? { noWhisper: settingValue('whisperIn') === false } : {}), ...(hasModule('friends') ? { noFriend: settingValue('friendIn') === false } : {}) });
}

// ---------- 설정 창의 칸 (hud/settings.ts가 그린다) ----------
/** 차단한 사람과 제한 모드 안내 */
export function socialRows(list: HTMLElement): void {
  const blocks = blockList();
  list.append(el('baghead', t('blockHead')));
  if (talkState().limited) list.append(el('note', t('talkLimitedNote')));
  if (!blocks.length) { list.append(emptyState('⦸', t('blockNone'))); return; }
  for (const b of blocks) list.append(row(b.name, '', [button(t('unblock'), () => unblock(b.r))]));
}
/** 설정 창을 다시 그릴지 가르는 값 */
export const socialSig = (): unknown => [blockList(), talkState()];

// ---------- 연령 창 ----------
let ageY = 0, ageBand: '' | 'u' | 'o' = '';
function drawAge(): void {
  if (!AGE) return;
  const pick = $('agePick'), ok = $<HTMLButtonElement>('ageOk');
  pick.textContent = '';
  $('ageText').textContent = t(AGE.ask === 'year' ? 'ageAskYear' : 'ageAskBand');
  if (AGE.ask === 'year') {
    const s = document.createElement('select');
    s.id = 'ageYear';
    s.setAttribute('aria-label', t('ageYear'));
    s.add(new Option(t('agePick'), '', true, ageY === 0));
    s.options[0].disabled = true;
    const now = new Date().getFullYear();
    for (let y = now; y >= now - 100; y--) s.add(new Option(String(y), String(y), false, y === ageY));
    s.addEventListener('change', () => { ageY = Number(s.value) || 0; ok.disabled = !ageY; whyOf(ok, ok.disabled ? t('ageAskYear') : ''); });
    pick.append(s);
    ok.disabled = !ageY;
    whyOf(ok, ok.disabled ? t('ageAskYear') : ''); // 흐린 까닭 (U2: 예제의 '확인'이 왜 회색인지 말이 없었다)
  } else {
    // 두 답을 같은 모양으로 나란히 (어느 쪽도 미리 골라 두지 않는다)
    for (const b of ['u', 'o'] as const) {
      const x = document.createElement('button');
      x.type = 'button'; x.className = 'plain' + (ageBand === b ? ' on' : '');
      x.textContent = b === 'u' ? L().fmt.ageUnder(AGE.limit) : L().fmt.ageOver(AGE.limit);
      x.addEventListener('click', () => { ageBand = b; drawAge(); });
      pick.append(x);
    }
    ok.disabled = !ageBand;
    whyOf(ok, ok.disabled ? t('ageAskBand') : '');
  }
}
function showAge(): void {
  if (!AGE) return; // 연령을 묻지 않는 게임에는 창이 없다
  const box = $('age');
  const want = !!AGE && talkState().ask && !!S.me;
  if (want && box.hidden) drawAge();
  box.hidden = !want;
}

// ---------- 친구 탭 ----------
/** 끊기를 한 번 누른 친구 (한 번 더 누르면 끊는다) */
let armed = '';
function since(ms: number): string { return L().fmt.friendSeen(Math.max(0, Date.now() - ms)); }
function friendRow(f: FriendView): HTMLElement {
  const go = (a: 'accept' | 'decline' | 'cancel' | 'del' | 'invite') => send({ t: 'friend', a, r: f.r });
  if (f.st === 'in') return row(f.name, t('friendIn'), [button(t('friendAccept'), () => go('accept')), button(t('friendDecline'), () => go('decline')), button(t('block'), () => send({ t: 'block', a: 'add', r: f.r }))]);
  if (f.st === 'out') return row(f.name, t('friendOut'), [button(t('friendCancel'), () => go('cancel'))]);
  const on = f.id !== undefined;
  const note = on ? `${t('friendOn')} · ${f.inst ? t('friendInst') : L().fmt.channelShort(f.ch ?? 1)}` : f.seen ? since(f.seen) : t('friendOff');
  const btns: HTMLElement[] = [];
  if (on && hasModule('chat')) btns.push(button(t('whisper'), () => { startWhisper(f.name); closeMenu(); }));
  if (on && hasModule('party') && !S.party.some((m) => m.id === f.id)) btns.push(button(t('partyInvite'), () => go('invite')));
  const sure = armed === f.r;
  const del = button(t(sure ? 'friendDelSure' : 'friendDel'), () => { if (sure) { armed = ''; go('del'); } else { armed = f.r; renderMenu(); setTimeout(() => { if (armed === f.r) { armed = ''; renderMenu(); } }, 4000); } });
  if (sure) del.classList.add('bad');
  btns.push(del);
  const r = row(f.name, note, btns, on ? 'fon' : 'foff');
  return r;
}
function drawFriends(list: HTMLElement): void {
  const all = friendList();
  list.append(field(t('friendAddHint'), NAME_MAX, t('friendAdd'), (name) => send({ t: 'friend', a: 'ask', name })));
  if (talkState().noFriend || talkState().limited) list.append(el('note', t('friendInOff')));
  const ins = all.filter((f) => f.st === 'in'), outs = all.filter((f) => f.st === 'out'), oks = all.filter((f) => f.st === 'ok');
  if (ins.length) { list.append(el('baghead', t('friendsIn'))); for (const f of ins) list.append(friendRow(f)); }
  list.append(el('baghead', L().fmt.friendsHead(oks.length)));
  if (!oks.length) list.append(emptyState('☺', t('friendsEmpty')));
  // 접속한 친구가 위로, 그다음 마지막 접속이 가까운 차례
  for (const f of [...oks].sort((a, b) => Number(b.id !== undefined) - Number(a.id !== undefined) || (b.seen ?? 0) - (a.seen ?? 0))) list.append(friendRow(f));
  if (outs.length) { list.append(el('baghead', t('friendsOut'))); for (const f of outs) list.append(friendRow(f)); }
}

export function initSocial(): void {
  listenSocial();
  // 설정 창의 '대화' 칸 (값은 이 기기에): 대화 보이기는 어느 게임에나, 받기 설정은 그 모듈을 고른 게임에만
  const group = () => t('setTalk');
  addSetting({ id: 'chatShow', group, label: () => t('setChatShow'), note: () => t('setChatShowNote'), kind: 'toggle', value: true, on: (v) => setChatHidden(!v) });
  if (hasModule('chat')) addSetting({ id: 'whisperIn', group, label: () => t('setWhisperIn'), kind: 'toggle', value: true, on: () => pushPrefs() });
  if (hasModule('friends')) addSetting({ id: 'friendIn', group, label: () => t('setFriendIn'), kind: 'toggle', value: true, on: () => pushPrefs() });
  onMsg('welcome', () => { ageY = 0; ageBand = ''; pushPrefs(); });
  onSocialChange(() => { showAge(); renderMenu(); });
  // 친구 탭
  if (hasModule('friends')) addMenuTab({ id: 'friends', label: () => t('tabFriends'), draw: drawFriends, open: () => send({ t: 'friend', a: 'list' }), dot: () => friendList().some((f) => f.st === 'in'), sig: () => [friendList(), talkState(), armed, S.party.length], always: true }, 'device');
  if (!AGE) return;
  // 연령 창 (body의 맨 뒤: 다른 창 위에)
  document.body.insertAdjacentHTML('beforeend', `
  <div id="age" class="modal" hidden><div class="card">
    <h2 data-i18n="ageHead"></h2><p id="ageText"></p><div id="agePick" class="mchips"></div>
    <p class="note" data-i18n="ageNote"></p>
    <div class="btns"><button type="button" id="ageOk" data-i18n="ageOk" disabled></button></div>
  </div></div>`);
  applyDom();
  $('ageOk').addEventListener('click', () => {
    if (AGE?.ask === 'year' && ageY) send({ t: 'talk', a: 'age', y: ageY });
    else if (AGE?.ask === 'band' && ageBand) send({ t: 'talk', a: 'age', band: ageBand });
  });
  onLangChange(() => { if (!$('age').hidden) drawAge(); });
  // 창이 떠 있는 동안에는 단축키·이동 키가 게임에 가지 않는다
  window.addEventListener('keydown', (e) => { if (!$('age').hidden && !(e.target instanceof HTMLSelectElement)) e.stopImmediatePropagation(); }, { capture: true });
}
