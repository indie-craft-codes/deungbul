// 문의와 제재 이의의 화면 (support 모듈: 고르지 않은 게임에는 없다). 서버 쪽은 engine/server/net/support.ts.
//   설정 창의 '문의' 칸: 걸린 말 막기(사유·기간)와 이의 신청, '문의하기', 내 문의(상태·운영자의 답)
//   문의 창: 종류(질문·오류 신고, 말 막기가 걸려 있으면 제재 이의), 내용(글자 수), 보내기
//   접속이 막혔을 때: 접속 화면에 사유·기간과 '이의 신청'. 차단된 사람은 게임에 들어올 수 없으므로 이의는 따로 된 연결 하나로 보낸다 (접속 메시지에 이의를 싣는다. 서버가 받아 두고 닫는다)
import type { SanctionView, ServerMsg, TicketView } from '../../shared/protocol';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, applyDom, onLangChange, t, type UiKey } from '../i18n';
import { send } from '../net';
import { auth, platform } from '../platform';
import { renderMenu } from './menu';
import { button, el, emptyState, row } from './menu/parts';

const TEXT_MAX = 500;
let tickets: TicketView[] = [];
let mute: SanctionView | null = null, muteAppealed = false;
/** 접속을 막은 차단 (접속 화면에 보인다) */
let ban: { s: SanctionView; appealed: boolean; answer?: string } | null = null;
/** 문의 창이 이의 창으로 열렸는가: 'mute' 말 막기에 대한 것, 'ban' 차단에 대한 것(따로 된 연결로 보낸다), null 보통 문의 */
let appealFor: 'mute' | 'ban' | null = null;
let sending = false;

const KIND_KEY: Record<TicketView['kind'], UiKey> = { ask: 'supportAsk', bug: 'supportBug', appeal: 'supportAppeal' };
const STATE_KEY: Record<TicketView['state'], UiKey> = { open: 'supportStOpen', answered: 'supportStAnswered', closed: 'supportStClosed' };

/** 제재 한 줄: 종류 · 기간 · 사유 */
function sanctionLines(s: SanctionView): HTMLElement[] {
  return [
    el('note', `${t('sanctionSpan')}: ${L().fmt.sanctionUntil(s.until)}`),
    el('note', `${t('sanctionWhy')}: ${s.why || t('sanctionNoWhy')}`),
  ];
}

// ---------- 설정 창의 칸 (hud/settings.ts가 그린다) ----------
export function supportRows(list: HTMLElement): void {
  list.append(el('baghead', t('supportHead')), el('note', t('supportNote')));
  if (mute) {
    const what = el('what');
    what.append(el('iname', `${t('sanctionHead')}: ${t('sanctionMute')}`), ...sanctionLines(mute));
    const b = button(t(muteAppealed ? 'appealDone' : 'appealBtn'), () => openBox('mute'), muteAppealed);
    const r = el('mrow'), acts = el('acts');
    acts.append(b);
    r.append(what, acts);
    list.append(r);
  }
  list.append(row(t('supportNew'), '', [button(t('supportNew'), () => openBox(null))]));
  list.append(el('baghead', t('supportMine')));
  if (!tickets.length) { list.append(emptyState('chat', t('supportNone'))); return; }
  for (const x of tickets) {
    const what = el('what');
    what.append(el('iname', `${L().fmt.supportTicket(x.id, t(KIND_KEY[x.kind]), x.at)} · ${t(STATE_KEY[x.state])}`), el('note', x.text.length > 120 ? x.text.slice(0, 119) + '…' : x.text));
    if (x.answer) { const a = el('note supportAnswer', `${t('supportAnswer')}: ${x.answer}`); what.append(a); }
    const r = el('mrow');
    r.append(what);
    list.append(r);
  }
}
/** 설정 창을 다시 그릴지 가르는 값 */
export const supportSig = (): unknown => [tickets, mute, muteAppealed];

// ---------- 문의 창 ----------
function openBox(appeal: 'mute' | 'ban' | null): void {
  appealFor = appeal;
  const box = $('supportBox'), kind = $<HTMLSelectElement>('supportKind'), text = $<HTMLTextAreaElement>('supportText');
  kind.textContent = '';
  const kinds: TicketView['kind'][] = appeal ? ['appeal'] : ['ask', 'bug'];
  for (const k of kinds) kind.add(new Option(t(KIND_KEY[k]), k));
  kind.disabled = !!appeal;
  $('supportBoxTitle').textContent = t(appeal ? 'appealBtn' : 'supportNew');
  text.placeholder = t(appeal ? 'appealHint' : 'supportHint');
  const info = $('supportSanction');
  info.textContent = '';
  const s = appeal === 'mute' ? mute : appeal === 'ban' ? ban?.s ?? null : null;
  if (s) info.append(el('iname', `${t('sanctionHead')}: ${t(s.kind === 'ban' ? 'sanctionBan' : 'sanctionMute')}`), ...sanctionLines(s));
  info.hidden = !s;
  $('supportResult').textContent = '';
  sending = false;
  count();
  box.hidden = false;
  text.focus();
}
function count(): void {
  const n = [...$<HTMLTextAreaElement>('supportText').value].length;
  $('supportCount').textContent = L().fmt.supportCount(n, TEXT_MAX);
  // 차단의 이의는 한 번 받으면 다시 보내지 않는다 (서버도 막는다)
  $<HTMLButtonElement>('supportSend').disabled = sending || n < 1 || (appealFor === 'ban' && !!ban?.appealed);
}
function closeBox(): void { $('supportBox').hidden = true; $<HTMLTextAreaElement>('supportText').value = ''; appealFor = null; }

/** 차단된 사람의 이의: 따로 된 연결 하나를 열어 접속 메시지에 싣는다. 서버가 받아 두고(또는 까닭을 알리고) 닫는다 */
async function appealBan(text: string): Promise<void> {
  const res = $('supportResult');
  res.textContent = t('appealWait');
  const [to, token] = await Promise.all([platform().server(), auth().token().catch(() => undefined)]);
  const ws = new WebSocket(to);
  let done = false;
  const finish = (ok: boolean, msg: string) => {
    if (done) return;
    done = true; sending = false;
    res.textContent = msg;
    if (ok && ban) { ban.appealed = true; renderBan(); setTimeout(closeBox, 1500); }
    count();
    try { ws.close(); } catch { /* 이미 닫힘 */ }
  };
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', token, appeal: text }));
  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    let m: ServerMsg;
    try { m = JSON.parse(ev.data) as ServerMsg; } catch { return; }
    if (m.t === 'support' && m.a === 'sent') finish(true, t('appealDone'));
    else if (m.t === 'sys' && String(m.k).startsWith('support')) { const fn = (L().msg as Record<string, (a: (string | number)[]) => string>)[m.k]; finish(false, fn ? fn(m.a ?? []) : String(m.k)); }
    else if (m.t === 'welcome') finish(false, L().msg.supportNoSanction()); // 그새 차단이 풀렸다 (드물다)
  };
  ws.onclose = () => finish(false, res.textContent === t('appealWait') ? t('gateBanned') : res.textContent ?? '');
}

function submit(): void {
  const text = $<HTMLTextAreaElement>('supportText').value.trim();
  if (!text || sending) return;
  sending = true; count();
  if (appealFor === 'ban') { void appealBan(text); return; }
  send({ t: 'support', a: 'new', kind: appealFor ? 'appeal' : ($<HTMLSelectElement>('supportKind').value as TicketView['kind']), text });
}

// ---------- 접속 화면: 차단의 사유·기간·이의 ----------
function renderBan(): void {
  const box = $('gateSanction');
  box.textContent = '';
  box.hidden = !ban;
  if (!ban) return;
  box.append(el('iname', `${t('sanctionHead')}: ${t('sanctionBan')}`), ...sanctionLines(ban.s));
  if (ban.answer) box.append(el('note supportAnswer', `${t('supportAnswer')}: ${ban.answer}`));
  const b = button(t(ban.appealed ? 'appealDone' : 'appealBtn'), () => openBox('ban'), ban.appealed);
  b.id = 'gateAppeal';
  box.append(b);
}

export function initSupport(): void {
  document.body.insertAdjacentHTML('beforeend', `
  <div id="supportBox" class="modal" hidden role="dialog" aria-labelledby="supportBoxTitle"><div class="card">
    <h2 id="supportBoxTitle"></h2>
    <div id="supportSanction" class="supportSanction" hidden></div>
    <label class="supportField"><span data-i18n="supportKind"></span><select id="supportKind"></select></label>
    <label class="supportField"><span data-i18n="supportText"></span><textarea id="supportText" maxlength="${TEXT_MAX}" rows="6"></textarea></label>
    <div class="note" id="supportCount"></div>
    <p class="note" id="supportResult" aria-live="polite"></p>
    <div class="btns"><button type="button" id="supportSend" data-i18n="supportSend"></button><button type="button" class="plain" id="supportClose" data-i18n="close"></button></div>
  </div></div>`);
  const gate = document.createElement('div');
  gate.id = 'gateSanction'; gate.className = 'gateSanction'; gate.hidden = true;
  $('gateMsg').after(gate);
  applyDom();
  $('supportText').addEventListener('input', count);
  $('supportSend').addEventListener('click', submit);
  $('supportClose').addEventListener('click', closeBox);
  // 창이 떠 있는 동안 글자 칸의 키가 게임의 단축키로 가지 않게
  $('supportBox').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') closeBox(); });
  onMsg('support', (m) => {
    if (m.a === 'list') { tickets = m.list; mute = m.sanction; muteAppealed = !!m.appealed; renderMenu(); return; }
    // 받았다: 창을 닫는다 (안내문 supportSent가 따로 온다)
    sending = false;
    if (appealFor !== 'ban') { $('supportResult').textContent = ''; closeBox(); }
  });
  onMsg('sanction', (m) => { ban = { s: m.s, appealed: m.appealed, ...(m.answer ? { answer: m.answer } : {}) }; renderBan(); });
  // 보내지 못한 까닭(너무 짧음, 너무 잦음 …)은 창 안에도 보인다
  onMsg('sys', (m) => { if (!$('supportBox').hidden && String(m.k).startsWith('support') && m.k !== 'supportSent' && m.k !== 'supportAnswered') { sending = false; const fn = (L().msg as Record<string, (a: (string | number)[]) => string>)[m.k]; $('supportResult').textContent = fn ? fn(m.a ?? []) : ''; count(); } });
  onMsg('welcome', () => { ban = null; renderBan(); tickets = []; mute = null; send({ t: 'support', a: 'list' }); });
  onLangChange(() => { renderBan(); if (!$('supportBox').hidden) { const keep = $<HTMLTextAreaElement>('supportText').value; openBox(appealFor); $<HTMLTextAreaElement>('supportText').value = keep; count(); } });
}
