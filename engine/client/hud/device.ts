// 기기 옮기기 (계정 없이): 메뉴의 '기기' 탭에서 일회용 코드를 받고, 다른 기기의 첫 화면(직업 고르기 창)이나 같은 탭에서 그 코드를 넣어 이어받는다.
// 서버 쪽은 engine/server/net/handoff.ts. 맞는 코드를 넣으면 서버가 새 토큰을 주고, 이 기기는 그것을 간직하고 다시 접속한다(net.ts의 adoptToken).
// 옛 기기는 연결이 끊기며(4001) 자기 토큰을 지운다 (main.ts의 lost).
// '기기' 탭은 게임이 탭 목록을 골라도(setMenuTabs) 늘 맨 뒤에 보인다 (MenuTab.always).
import type { MsgKey } from '../../shared/messages';
import { $ } from '../app';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { adoptToken, send } from '../net';
import { S } from '../state';
import { addMenuTab, renderMenu } from './menu';
import { showGate } from './me';
import { addNotices } from './notify';

/** 받은 코드와 그 코드가 끝나는 시각(performance.now 기준). 코드를 쓰거나 시간이 지나면 지운다 */
let code: { text: string; until: number } | null = null;
/** 코드를 넣은 결과로 온 안내문 (탭과 직업 고르기 창에 그대로 보여 준다) */
let result: { k: MsgKey; a: (string | number)[] } | null = null;
/** 이어받기 답을 기다리는 중 (단추를 두 번 누르지 않게) */
let waiting = false;

/** 코드를 읽기 좋게 4자씩 나눈다 */
const pretty = (c: string): string => c.replace(/(.{4})(?=.)/g, '$1-');
const RESULT_KEYS = new Set<MsgKey>(['handoffBad', 'handoffWait', 'handoffSelf', 'handoffGuest']);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const d = document.createElement(tag);
  d.className = cls;
  d.textContent = text;
  return d;
}
const resultText = (): string => (result ? L().msg[result.k]?.(result.a) ?? '' : '');

/** 코드를 넣는 칸과 단추 */
function claimField(): HTMLFormElement {
  const form = el('form', 'mfield'), input = el('input', ''), btn = el('button', '', t('deviceUse'));
  input.type = 'text'; input.maxLength = 12; input.placeholder = t('deviceUseHint'); input.setAttribute('aria-label', t('deviceUseHead'));
  input.autocapitalize = 'characters'; input.spellcheck = false;
  input.addEventListener('keydown', (e) => e.stopPropagation()); // 글을 치는 동안 단축키가 눌리지 않게
  btn.type = 'submit';
  form.append(input, btn);
  form.addEventListener('submit', (e) => { e.preventDefault(); use(input.value); });
  return form;
}

/** 코드를 보낸다 */
function use(raw: string): void {
  const c = raw.toUpperCase().replace(/[\s-]/g, '');
  if (!c || waiting) return;
  waiting = true;
  result = null;
  send({ t: 'handoff', a: 'use', code: c });
  setTimeout(() => { waiting = false; }, 1500);
}

function drawDevice(list: HTMLElement): void {
  const now = performance.now();
  if (code && code.until <= now) code = null;
  list.append(el('div', 'baghead', t('deviceMoveHead')), el('div', 'note', t('deviceMoveInfo')));
  if (code) {
    list.append(el('div', 'devcode', pretty(code.text)), el('div', 'note', L().fmt.deviceCode(Math.max(1, Math.ceil((code.until - now) / 60000)))));
  } else {
    const b = el('button', 'plain', t('deviceMake'));
    b.type = 'button';
    b.addEventListener('click', () => send({ t: 'handoff', a: 'make' }));
    list.append(b);
  }
  list.append(el('div', 'baghead', t('deviceUseHead')), el('div', 'note', t('deviceUseInfo')), claimField());
  const r = resultText();
  if (r) list.append(el('div', 'note bad', r));
}

/** 직업 고르기 창(새 캐릭터의 첫 화면)의 '코드로 이어받기' */
function initClaim(): void {
  const open = $('claimOpen'), form = $<HTMLFormElement>('claimForm'), input = $<HTMLInputElement>('claimInput'), msg = $('claimMsg');
  if (!open) return; // 직업 고르기 창이 없는 게임(classes 없음): 코드로 이어받기는 메뉴의 '기기' 탭에서
  open.addEventListener('click', () => { form.hidden = !form.hidden; if (!form.hidden) input.focus(); });
  input.addEventListener('keydown', (e) => e.stopPropagation());
  form.addEventListener('submit', (e) => { e.preventDefault(); use(input.value); });
  const paint = () => { const r = resultText(); msg.textContent = r; msg.hidden = !r || form.hidden; };
  // 직업이 없는 새 캐릭터에게만 보인다 (다시 고르려고 연 창에는 두지 않는다)
  onSlow(() => { const fresh = !!S.me && S.me.ready && S.me.cls === ''; open.hidden = !fresh; if (!fresh) form.hidden = true; paint(); });
  onLangChange(paint);
}

export function initDevice(): void {
  addMenuTab({ id: 'device', label: () => t('tabDevice'), draw: drawDevice, always: true, sig: () => [code?.text, result?.k, result?.a, code && Math.ceil((code.until - performance.now()) / 60000)] });
  initClaim();
  // 틀린 코드와 그 밖의 답은 흘러가는 알림으로도 보인다 (탭이나 창이 닫혀 있어도 알게)
  addNotices({ feed: ['muted', 'handoffGuest', 'handoffBad', 'handoffWait', 'handoffSelf'], banner: { adminNotice: '', adminGive: 'good', adminTake: 'bad' } });
  onMsg('handoff', (m) => {
    if ('token' in m) {
      if (adoptToken(m.token)) { code = null; result = null; showGate('gateHandoffDone', false); }
      return;
    }
    code = { text: m.code, until: performance.now() + m.ms };
    renderMenu();
  });
  onMsg('sys', (m) => {
    if (!RESULT_KEYS.has(m.k)) return;
    waiting = false;
    result = { k: m.k, a: m.a ?? [] };
    renderMenu();
  });
}
