// 서버 연결. 메시지를 주고받기만 하고, 내용 처리는 등록된 처리기가 맡는다.
import type { ClientMsg, ServerMsg } from '../../shared/protocol';
import { randomName } from './i18n';

let ws: WebSocket | null = null;
let onMessage: (m: ServerMsg) => void = () => {};
let onOpening: () => void = () => {};
let onClosed: () => void = () => {};

export function initNet(h: { message: (m: ServerMsg) => void; opening: () => void; closed: () => void }): void {
  onMessage = h.message; onOpening = h.opening; onClosed = h.closed;
}

function url(): string {
  // 화면만 따로 올린 경우(GitHub Pages 같은 정적 호스팅): 빌드할 때 VITE_SERVER_URL로 게임 서버 주소를 정해 준다
  const fixed = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fixed) return fixed;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // 개발 중에는 Vite(5173)와 게임 서버(3001)가 따로 돈다. 빌드본은 서버가 같은 포트에서 함께 서비스한다.
  return import.meta.env.DEV ? `${proto}://${location.hostname}:3001` : `${proto}://${location.host}`;
}

/** 무작위 비밀 값. randomUUID는 https나 localhost에서만 있어서(와이파이 주소로 들어오면 없다) 직접 만든다. */
function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** 이 브라우저의 캐릭터를 가리키는 비밀 값. 계정이 생기기 전까지 이것으로 이어받는다. */
function token(): string | undefined {
  try {
    let t = localStorage.getItem('token');
    if (!t) { t = newToken(); localStorage.setItem('token', t); }
    return t;
  } catch { return undefined; } // 저장소를 못 쓰면 손님으로 들어간다 (저장되지 않음)
}

export function send(m: ClientMsg): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

/** 접속한다. 이름을 주지 않으면 현재 언어로 만든 무작위 이름을 제안한다 (저장된 이름이 있으면 서버가 그것을 쓴다). */
export function connect(name?: string): void {
  onOpening();
  const sock = new WebSocket(url());
  ws = sock;
  sock.onopen = () => send({ t: 'join', name: name || randomName(), token: token() });
  sock.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return;
    let m: ServerMsg;
    try { m = JSON.parse(ev.data) as ServerMsg; } catch { return; }
    onMessage(m);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    onClosed();
  };
}
