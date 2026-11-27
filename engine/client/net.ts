// 서버 연결. 메시지를 주고받기만 하고, 내용 처리는 등록된 처리기가 맡는다.
// 서버의 주소는 플랫폼(platform().server(): 웹은 빌드의 VITE_SERVER_URL → 옆의 server.json → 같은 출처), 접속 증표는 인증 접점(auth(): 지금은 손님의 기기 토큰)이 준다.
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { randomName } from './i18n';
import { auth, platform } from './platform';

let ws: WebSocket | null = null;
let onMessage: (m: ServerMsg) => void = () => {};
let onOpening: () => void = () => {};
let onClosed: (code: number) => void = () => {};
/** 보내는 메시지를 지켜보는 것들 (튜토리얼의 '명령' 조건: hud/tutorial.ts) */
const watchers: ((m: ClientMsg) => void)[] = [];

export function initNet(h: { message: (m: ServerMsg) => void; opening: () => void; closed: (code: number) => void }): void {
  onMessage = h.message; onOpening = h.opening; onClosed = h.closed;
}

/** 내가 서버에 보내는 메시지를 지켜본다 (보낸 뒤에 불린다) */
export function onSend(fn: (m: ClientMsg) => void): void { watchers.push(fn); }

/** 지금 접속한(또는 접속할) 게임 서버의 http(s) 주소: 오류 묶음을 보내는 곳 (ws → http, wss → https) */
export async function httpBase(): Promise<string> {
  const to = await platform().server();
  return to.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
}

/**
 * 기기 옮기기로 받은 새 토큰을 간직하고 곧바로 다시 접속한다 (hud/device.ts). 지금 연결은 버린다: 닫힘을 '끊김'으로 다루지 않게 먼저 놓는다.
 * 저장소를 못 쓰는 브라우저면 false (이어받을 수 없다)
 */
export async function adoptToken(t: string): Promise<boolean> {
  if (!(await auth().adopt(t))) return false;
  const old = ws;
  ws = null;
  old?.close();
  connect();
  return true;
}
/** 이 브라우저의 토큰을 지운다: 캐릭터가 다른 기기로 옮겨 갔거나 지워져 이 토큰으로는 더 들어갈 수 없다. 다음 접속에 새 토큰이 생긴다 */
export function forgetToken(): void { void auth().forget(); }

export function send(m: ClientMsg): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(m));
    for (const fn of watchers) fn(m);
  }
}
/** 연결이 열려 있는가 */
export const online = (): boolean => !!ws && ws.readyState === WebSocket.OPEN;

/** 접속한다. 이름을 주지 않으면 현재 언어로 만든 무작위 이름을 제안한다 (저장된 이름이 있으면 서버가 그것을 쓴다). */
export function connect(name?: string): void {
  onOpening();
  void Promise.all([platform().server(), auth().token().catch(() => undefined)]).then(([to, token]) => open(to, token, name));
}

function open(to: string, token: string | undefined, name?: string): void {
  const sock = new WebSocket(to);
  ws = sock;
  sock.onopen = () => send({ t: 'join', name: name || randomName(), token });
  sock.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    let m: ServerMsg;
    try { m = JSON.parse(ev.data) as ServerMsg; } catch { return; }
    onMessage(m);
  };
  sock.onclose = (ev) => {
    if (ws !== sock) return;
    ws = null;
    onClosed(ev.code);
  };
}
