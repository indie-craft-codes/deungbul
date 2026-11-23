// 대화창: 다른 사람의 말과 서버 안내문을 보여 주고, 내 말을 보낸다.
import { $ } from '../app';
import { send } from '../net';

const logEl = $('log');
const input = $<HTMLInputElement>('chatInput');

function line(el: HTMLDivElement): void {
  logEl.appendChild(el);
  while (logEl.children.length > 9) logEl.firstChild?.remove();
}

/** 누군가의 말 */
export function logChat(who: string, text: string): void {
  const d = document.createElement('div');
  const w = document.createElement('span');
  w.className = 'who';
  w.textContent = who + ': ';
  d.append(w, document.createTextNode(text));
  line(d);
}

/** 안내문 (이미 현재 언어로 된 문장) */
export function logText(text: string): void {
  const d = document.createElement('div');
  d.className = 'sys';
  d.textContent = text;
  line(d);
}

export const focusChat = (): void => input.focus();
export const blurChat = (): void => input.blur();

export function initChat(): void {
  $('chatForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (text) send({ t: 'chat', text });
    input.value = '';
    input.blur();
  });
  // 터치 화면에서는 입력칸을 접어 두고, 단추를 누르면 연다
  const box = $('chat');
  $('chatBtn').addEventListener('click', () => { box.classList.add('typing'); input.focus(); });
  input.addEventListener('blur', () => box.classList.remove('typing'));
}
