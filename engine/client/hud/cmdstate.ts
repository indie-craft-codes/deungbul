// 명령의 상태 (U2 피드백·상태: docs/ux-review.md 3.5, 쓰는 법은 docs/making-a-game.md 25절).
// 단추를 눌러 서버에 보낸 명령(사기·강화·뽑기·받기·보내기 …)마다 그 단추에 '보냄 → 됨 / 안 됨'을 보인다. 틀의 명령 길(net.ts의 send) 한 곳에서 하므로
// 탭·창의 코드는 아무것도 하지 않아도 된다: 누름(click) 안에서 send가 불리면 그 단추가 이 명령의 단추다.
//   보냄   단추가 흐려지고 0.15초 뒤 작은 돌림이 돈다. 그동안 그 단추(와 다시 그려진 같은 단추)는 다시 눌리지 않고, 같은 명령은 두 번 가지 않는다
//   됨     서버가 이 명령을 처리한 뒤의 첫 전송을 받았다: 잠깐 초록 테두리
//   안 됨  서버가 '안 됨'의 안내문(hud/notify.ts의 FAIL: 모자람·멂·잠김·한도)을 보냈다: 단추가 흔들리고 그 아래 붉은 한 줄(3초). 흘러가는 알림으로는 띄우지 않는다 (한 곳에만)
//          연결이 없어 보내지 못했거나 5초 안에 답이 없으면 그것을 같은 줄로
// 서버는 명령마다 답을 하지 않는다: 명령 바로 뒤에 표지(ping, c는 음수)를 보내 그 답(pong)을 받으면 서버가 명령을 받은 것이고, 그 뒤 두 번째 스냅샷까지 온 안내문이 이 명령의 결과다
// (서버는 명령을 받는 즉시 처리하고 안내문은 다음 전송에 모아 보낸다: engine/server/net/server.ts). 서버·프로토콜은 바뀌지 않는다.
import type { ClientMsg } from '../../shared/protocol';
import type { MsgKey } from '../../shared/messages';
import { onMsg } from '../bus';
import { gateSend, onSend, onSendFail, send } from '../net';
import { t } from '../i18n';
import { uiSound } from '../sound';
import { setNoticeClaim } from './notify';

/** 상태를 보이지 않는 명령: 이동·싸움(자기 표시가 있다), 표지, 대화, 켜고 끄기(누르는 즉시 바뀐다). 게임은 quietCommands로 더한다 */
const QUIET = new Set<string>(['join', 'move', 'stop', 'attack', 'skill', 'ping', 'vis', 'chat', 'gchat', 'auto', 'use', 'rank', 'pong']);
/** 게임의 명령 가운데 상태를 보이지 않을 것 (자기 연출이 있는 것) */
export function quietCommands(...types: string[]): void { for (const x of types) QUIET.add(x); }

interface Pend {
  /** 표지 번호 (ping의 -n) */
  n: number;
  btn: HTMLButtonElement;
  /** 다시 그려져 바뀐 단추를 찾는 데 쓴다: 단추의 글(까닭 줄 빼고)과 id가 있는 가장 가까운 조상 */
  label: string;
  scope: HTMLElement | null;
  /** 같은 명령 (두 번 보내지 않게) */
  sig: string;
  at: number;
  acked: boolean;
  snaps: number;
  timer: number;
  spin: HTMLElement;
}
const pend: Pend[] = [];
let seq = 0;
/** 지금 처리 중인 누름의 단추 (누름이 끝나면 비운다) */
let pressed: HTMLButtonElement | null = null;

const WAIT_MS = 5000;
const labelOf = (b: HTMLButtonElement): string => [...b.childNodes].filter((x) => !(x instanceof HTMLElement && (x.classList.contains('why') || x.classList.contains('cmdSpin')))).map((x) => x.textContent ?? '').join('').trim();
const scopeOf = (b: HTMLElement): HTMLElement | null => b.parentElement?.closest<HTMLElement>('[id]') ?? null;
const shown = (b: HTMLElement): boolean => b.isConnected && b.offsetParent !== null;

/** 다시 그려진 같은 단추 (메뉴는 상태가 바뀌면 단추를 새로 만든다) */
function refind(p: { btn: HTMLButtonElement; label: string; scope: HTMLElement | null }): HTMLButtonElement | null {
  if (p.btn.isConnected) return p.btn;
  if (!p.scope?.isConnected) return null;
  for (const b of p.scope.querySelectorAll('button')) if (labelOf(b) === p.label) { p.btn = b; return b; }
  return null;
}

function busy(b: HTMLButtonElement, spin: HTMLElement, on: boolean): void {
  b.classList.toggle('is-busy', on);
  if (on) { b.setAttribute('aria-busy', 'true'); if (spin.parentElement !== b) b.append(spin); }
  else { b.removeAttribute('aria-busy'); spin.remove(); }
}

/** 단추 아래의 결과 한 줄과 잠깐의 테두리 (됨: 초록, 안 됨: 붉은 흔들림) */
function mark(p: { btn: HTMLButtonElement; label: string; scope: HTMLElement | null }, ok: boolean, why = ''): boolean {
  const b = refind(p);
  if (!b || !shown(b)) return false;
  b.classList.remove('is-ok', 'is-fail');
  void b.offsetWidth; // 연출을 처음부터
  b.classList.add(ok ? 'is-ok' : 'is-fail');
  b.querySelector(':scope > .cmdWhy')?.remove();
  if (why) {
    const s = document.createElement('small');
    s.className = 'why cmdWhy'; s.textContent = why; s.setAttribute('role', 'status');
    b.append(s);
  }
  const keep = { ...p };
  window.setTimeout(() => {
    const now = refind(keep);
    now?.classList.remove('is-ok', 'is-fail');
    now?.querySelector(':scope > .cmdWhy')?.remove();
  }, why ? 3200 : 700);
  return true;
}

function finish(p: Pend, ok: boolean, why = ''): boolean {
  const i = pend.indexOf(p);
  if (i < 0) return false;
  pend.splice(i, 1);
  clearTimeout(p.timer);
  const b = refind(p);
  if (b) busy(b, p.spin, false);
  const showed = mark(p, ok, why);
  if (!ok) uiSound('ui.fail');
  return showed;
}

/** 다시 그려진 단추에 '보냄'을 옮겨 단다 (매 프레임, 기다리는 동안만) */
let looping = false;
function follow(): void {
  if (!pend.length) { looping = false; return; }
  for (const p of pend) { const b = refind(p); if (b && !b.classList.contains('is-busy')) busy(b, p.spin, true); }
  requestAnimationFrame(follow);
}

function start(b: HTMLButtonElement, m: ClientMsg): void {
  const n = ++seq;
  const spin = document.createElement('i');
  spin.className = 'cmdSpin'; spin.setAttribute('aria-hidden', 'true');
  const p: Pend = { n, btn: b, label: labelOf(b), scope: scopeOf(b), sig: JSON.stringify(m), at: performance.now(), acked: false, snaps: 0, timer: 0, spin };
  p.timer = window.setTimeout(() => finish(p, false, t('cmdSlow')), WAIT_MS);
  pend.push(p);
  busy(b, spin, true);
  if (!looping) { looping = true; requestAnimationFrame(follow); }
  send({ t: 'ping', c: -n }); // 표지: 이 답이 오면 서버가 명령을 받았다
}

/** 틀이 시작할 때 한 번 */
export function initCmdState(): void {
  // 누름을 먼저 본다 (단추의 처리보다 앞: capture). 기다리는 단추는 다시 눌리지 않는다
  document.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest?.('button');
    if (b?.classList.contains('is-busy')) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    pressed = b ?? null;
    window.setTimeout(() => { if (pressed === b) pressed = null; }, 0);
  }, { capture: true });
  // 같은 명령이 아직 기다리는 중이면 다시 보내지 않는다 (다시 그려진 단추를 빨리 두 번 눌렀을 때)
  gateSend((m) => !(pressed && !QUIET.has(m.t) && pend.some((p) => p.sig === JSON.stringify(m))));
  onSend((m) => { if (pressed && !QUIET.has(m.t) && pressed.isConnected) start(pressed, m); });
  onSendFail((m) => { if (pressed && !QUIET.has(m.t)) mark({ btn: pressed, label: labelOf(pressed), scope: scopeOf(pressed) }, false, t('cmdOffline')); });
  onMsg('pong', (m) => { if (m.c < 0) { const p = pend.find((x) => x.n === -m.c); if (p) p.acked = true; } });
  // 표지의 답 뒤 두 번째 스냅샷: 그 사이의 안내문까지 다 왔다 (실패가 없었으면 됨)
  onMsg('snap', () => { for (const p of [...pend]) if (p.acked && ++p.snaps >= 2) finish(p, true); });
  // '안 됨'의 안내문: 답을 받은 가장 오래된 명령의 것 (없으면 가장 오래된 것). 단추가 보이면 그 아래에 띄우고 흘러가는 알림은 띄우지 않는다
  setNoticeClaim((_k: MsgKey, text: string) => {
    const p = pend.find((x) => x.acked) ?? pend[0];
    return p ? finish(p, false, text) : false;
  });
  // 연결이 끊기면 기다리던 것은 모두 '보내지 못함'
  onMsg('welcome', () => { for (const p of [...pend]) finish(p, false, t('cmdOffline')); });
}

/** 기다리는 명령이 있는가 (시험·게임의 화면이 묻는다) */
export const cmdWaiting = (): number => pend.length;
