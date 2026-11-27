// 키의 이름을 자판의 자리(KeyboardEvent.code)로 만든다: 자판 배열(QWERTY 밖)이나 한글 입력 상태에서도 W 자리는 'w'다 (ev.key는 'ㅈ'이나 'Process'가 된다).
// 이름의 모양은 지금 단축키 표(engine/client/keys.ts)가 쓰는 ev.key.toLowerCase()의 미국 자판 값과 같게 맞췄다: 2단계에서 단축키를 이것으로 바꿀 때 표를 고치지 않아도 되게.
// 브라우저 API를 부르지 않는 순수 함수다 (node의 시험이 그대로 부른다).
import type { KeyLike } from './types';

/** 글자·숫자가 아닌 자리 → 미국 자판에서 ev.key.toLowerCase()의 값 */
const NAMED: Readonly<Record<string, string>> = {
  Space: ' ', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/',
  NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadDecimal: '.', NumpadEnter: 'enter',
  ShiftLeft: 'shift', ShiftRight: 'shift', ControlLeft: 'control', ControlRight: 'control', AltLeft: 'alt', AltRight: 'alt', MetaLeft: 'meta', MetaRight: 'meta',
};

/** 키의 이름 (code가 없거나 모르는 자리면 key를 소문자로: 예전과 같다) */
export function keyNameOf(ev: KeyLike): string {
  const code = ev.code ?? '';
  let m: RegExpExecArray | null;
  if ((m = /^Key([A-Z])$/.exec(code))) return m[1].toLowerCase();
  if ((m = /^(?:Digit|Numpad)(\d)$/.exec(code))) return m[1];
  if (code in NAMED) return NAMED[code];
  // Escape, Enter, Tab, ArrowUp, F1 …: code와 key가 같은 이름이다
  if (/^(Escape|Enter|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|F\d{1,2}|CapsLock)$/.test(code)) return code.toLowerCase();
  return (ev.key ?? '').toLowerCase();
}
