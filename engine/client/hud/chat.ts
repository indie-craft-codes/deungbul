// 대화창: 다른 사람의 말과 서버 안내문을 보여 주고, 내 말을 보낸다.
// 핵심: 전체 대화, 길드 대화('/g 내용', guild 모듈), 정해진 문장(내용의 QUICK_CHAT이 있을 때 '문장' 단추), 제한 모드(자유 대화 칸이 잠긴다), 대화 끄기(설정).
// chat 모듈을 고른 게임: 채널 탭(전체·근처·파티·길드·귓말)이 생기고 탭이 곧 보내는 곳이다. 귓말은 '/w 이름 내용', 답은 '/r 내용', '/p' 파티, '/n' 근처, '/a' 전체.
// 줄의 이름을 누르면 사람 카드(귓말·친구·차단·신고)가 뜬다: 그 줄을 신고하면 서버가 앞뒤 줄을 함께 적는다.
import type { ServerMsg } from '../../shared/protocol';
import { QUICK_CHAT, modeDef } from '../../shared/defs';
import { $ } from '../app';
import { tagOf } from '../entities';
import { L, onLangChange, t, type UiKey } from '../i18n';
import { uiText } from '../i18n/names';
import { hasModule } from '../mods';
import { send } from '../net';
import { onSocialChange, talkState } from '../social';
import { S } from '../state';
import { showCard } from './party';
import { speak } from './tags';
import { feed } from './notify';

const logEl = $('log');
const input = $<HTMLInputElement>('chatInput');
/** 보이는 줄 수 (예전과 같다) */
const SHOW = 9;
/** 기억하는 줄 수 (탭을 바꿔 볼 수 있게) */
const KEEP = 80;

/** 줄의 채널: '' 전체, g 길드, n 근처, p 파티, w 귓말, s 안내문 */
type Tab = '' | 'g' | 'n' | 'p' | 'w';
const rows: { ch: Tab | 's'; el: HTMLDivElement }[] = [];
let tab: Tab = '';
/** 귓말의 답을 보낼 사람 (마지막으로 귓말을 주고받은 사람) */
let replyTo = '';
const chatMod = (): boolean => hasModule('chat');

function render(): void {
  logEl.textContent = '';
  const vis = rows.filter((r) => !tab || r.ch === tab || (r.ch === 's' && !chatMod()));
  for (const r of vis.slice(-SHOW)) logEl.appendChild(r.el);
}
function line(el: HTMLDivElement, ch: Tab | 's' = 's'): void {
  rows.push({ ch, el });
  if (rows.length > KEEP) rows.shift();
  if (chatMod() && ch !== 's' && ch !== tab && tab) tabsEl?.querySelector(`[data-ch="${ch}"]`)?.classList.add('new');
  render();
}

/** 누군가의 말 (예전의 모양: 이름과 글) */
export function logChat(who: string, text: string, guild = false): void {
  const d = document.createElement('div');
  if (guild) d.className = 'gchat';
  const w = document.createElement('span');
  w.className = 'who';
  w.textContent = who + ': ';
  d.append(w, document.createTextNode(text));
  line(d, guild ? 'g' : '');
}

/** 안내문 (이미 현재 언어로 된 문장) */
export function logText(text: string): void {
  const d = document.createElement('div');
  d.className = 'sys';
  d.textContent = text;
  line(d, 's');
}

/** 정해진 문장의 글 (받는 화면의 언어로) */
export const quickText = (q: string): string => { const v = (L().ui as Readonly<Record<string, string>>)[q]; return typeof v === 'string' ? v : q; };
const TAG: Record<Exclude<Tab, ''>, UiKey> = { g: 'guildChatTag', n: 'chatTagNear', p: 'chatTagParty', w: 'chatTagWhisper' };

/** 서버의 대화 한 줄 (engine/client/main.ts가 넘긴다) */
export function onChat(m: Extract<ServerMsg, { t: 'chat' }>): void {
  const ch: Tab = m.ch ?? '';
  const text = m.q ? quickText(m.q) : m.text;
  const d = document.createElement('div');
  d.className = [ch === 'g' ? 'gchat' : ch ? 'c' + ch : '', m.q ? 'qc' : ''].filter(Boolean).join(' ');
  const w = document.createElement('span');
  w.className = 'who';
  const mine = S.me?.id === m.id;
  if (ch === 'w' && m.to) { w.textContent = `${L().fmt.chatToTag(m.to)} `; replyTo = m.to; }
  else {
    if (ch === 'w' && !mine) replyTo = m.name;
    // 말한 사람이 있는 모드 (modes 모듈): 작은 표시
    const md = m.md ? modeDef(m.md) : undefined;
    w.textContent = `${ch ? t(TAG[ch]) + ' ' : ''}${md ? L().fmt.chatMode(uiText.get(md.name)) + ' ' : ''}${m.name}: `;
    if (md) w.dataset.mode = md.id;
    // 이름을 누르면 사람 카드 (귓말·친구·차단·신고: 이 줄을 신고하면 앞뒤 줄이 함께 적힌다)
    if (!mine) { w.classList.add('pick'); w.addEventListener('click', (ev) => { const r = (ev.target as HTMLElement).getBoundingClientRect(); showCard(m.id, m.name, r.left + r.width / 2, r.top, m.n); }); }
  }
  d.append(w, document.createTextNode(text));
  line(d, ch);
  if (hidden || (ch && ch !== 'n' && ch !== 'p')) return; // 길드 대화와 귓말은 말풍선으로 띄우지 않는다
  const tag = tagOf(m.id);
  if (tag) speak(tag, text);
}

// ---------- 대화 끄기 (설정: hud/social.ts) ----------
let hidden = false;
/** 대화창과 말풍선을 끈다 (포털의 '대화 끄기' 요건). 서버는 그대로 보내고, 화면이 보이지 않게만 한다 */
export function setChatHidden(on: boolean): void { hidden = on; document.body.classList.toggle('chatOff', on); }

export const focusChat = (): void => { if (!hidden) input.focus(); };
/** 그 사람에게 귓말을 쓴다 (사람 카드, 친구 목록): 귓말 탭으로 바꾸고 입력 칸을 연다 */
export function startWhisper(name: string): void {
  if (!chatMod()) return;
  replyTo = name; tab = 'w';
  drawTabs(); render(); place();
  $('chat').classList.add('typing');
  focusChat();
}
export const blurChat = (): void => input.blur();

/** 지금 탭으로 보낸다 (말 또는 정해진 문장) */
function sendTo(ch: Tab, text: string, q = '', to = replyTo): void {
  if (ch === 'g' && !q) { send({ t: 'gchat', text }); return; }
  if (ch === 'w') {
    if (!to) { feed(t('chatWhisperHow')); return; }
    send({ t: 'chat', text, ch: 'w', to, ...(q ? { q } : {}) });
    return;
  }
  send({ t: 'chat', text, ...(ch && ch !== 'g' ? { ch } : {}), ...(q ? { q } : {}) });
}

function submit(raw: string): void {
  const text = raw.trim();
  if (!text || talkState().limited) return;
  let m: RegExpExecArray | null;
  // '/g 내용'은 길드에만 보낸다 (chat 모듈이 없어도)
  if ((m = /^\/g\s+([\s\S]+)/i.exec(text))) { send({ t: 'gchat', text: m[1] }); return; }
  if (chatMod()) {
    if ((m = /^\/(?:w|귓|whisper)\s+(\S+)\s+([\s\S]+)/i.exec(text))) { replyTo = m[1]; sendTo('w', m[2], '', m[1]); return; }
    if ((m = /^\/r\s+([\s\S]+)/i.exec(text))) { sendTo('w', m[1]); return; }
    if ((m = /^\/p\s+([\s\S]+)/i.exec(text))) { sendTo('p', m[1]); return; }
    if ((m = /^\/n\s+([\s\S]+)/i.exec(text))) { sendTo('n', m[1]); return; }
    if ((m = /^\/a\s+([\s\S]+)/i.exec(text))) { sendTo('', m[1]); return; }
    sendTo(tab, text);
    return;
  }
  send({ t: 'chat', text });
}

/** 탭 줄 (chat 모듈) */
let tabsEl: HTMLDivElement | null = null;
function drawTabs(): void {
  if (!tabsEl) return;
  tabsEl.textContent = '';
  const list: [Tab, UiKey][] = [['', 'chatTabAll'], ['n', 'chatTabNear'], ...(hasModule('party') ? [['p', 'chatTabParty']] as [Tab, UiKey][] : []), ...(hasModule('guild') ? [['g', 'chatTabGuild']] as [Tab, UiKey][] : []), ['w', 'chatTabWhisper']];
  for (const [ch, key] of list) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'plain' + (ch === tab ? ' on' : ''); b.dataset.ch = ch; b.textContent = t(key);
    b.addEventListener('click', () => { tab = ch; drawTabs(); render(); place(); });
    tabsEl.append(b);
  }
}
/** 입력 칸의 안내 (제한 모드, 귓말 상대) */
function place(): void {
  const lim = talkState().limited;
  input.disabled = lim;
  input.placeholder = lim ? t('chatLimited') : tab === 'w' && replyTo ? L().fmt.chatTo(replyTo) : t('chatPlaceholder');
}

/** 정해진 문장의 목록 (QUICK_CHAT이 있는 게임) */
let qcList: HTMLDivElement | null = null;
function drawQuick(): void {
  if (!qcList) return;
  qcList.textContent = '';
  for (const q of QUICK_CHAT) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'plain'; b.textContent = quickText(q);
    b.addEventListener('click', () => { sendTo(tab, '', q); qcList!.hidden = true; input.blur(); });
    qcList.append(b);
  }
}

export function initChat(): void {
  const box = $('chat'), form = $('chatForm');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submit(input.value);
    input.value = '';
    input.blur();
  });
  // 터치 화면에서는 입력칸을 접어 두고, 단추를 누르면 연다
  $('chatBtn').addEventListener('click', () => { box.classList.add('typing'); input.focus(); });
  input.addEventListener('blur', () => { if (!qcList || qcList.hidden) box.classList.remove('typing'); });
  // 채널 탭 (chat 모듈)
  if (chatMod()) {
    tabsEl = document.createElement('div');
    tabsEl.id = 'chatTabs';
    box.insertBefore(tabsEl, logEl);
    tabsEl.addEventListener('click', (ev) => (ev.target as HTMLElement).classList.remove('new'));
    drawTabs();
  }
  // 정해진 문장 (QUICK_CHAT)
  if (QUICK_CHAT.length) {
    form.classList.add('ext');
    const btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'qcBtn'; btn.className = 'plain';
    btn.setAttribute('data-i18n', 'qcOpen'); btn.textContent = t('qcOpen');
    form.append(btn);
    qcList = document.createElement('div');
    qcList.id = 'qcList'; qcList.className = 'panel'; qcList.hidden = true;
    box.append(qcList);
    btn.addEventListener('mousedown', (ev) => ev.preventDefault()); // 누르는 동안 입력 칸이 닫히지 않게
    btn.addEventListener('click', () => { qcList!.hidden = !qcList!.hidden; if (!qcList!.hidden) { box.classList.add('typing'); drawQuick(); } else box.classList.remove('typing'); });
  }
  onSocialChange(place);
  onLangChange(() => { drawTabs(); drawQuick(); place(); render(); });
  place();
}
