// 인증 접점: 접속할 때 서버에 낼 증표를 누가 주는가. 지금은 손님(이 기기의 무작위 토큰)뿐이다.
// 포털 토큰(CrazyGames·Poki의 JWT)이나 자체 계정·Steam·Apple은 나중에 같은 모양(AuthProvider)으로 꽂는다: setAuth(그 구현).
// 서버 쪽 짝은 engine/server/net/auth.ts의 ServerAuth다 (손님: 토큰의 해시가 저장 키). 계정·로그인은 만들지 않는다 (docs/accounts.md).
// 손님의 토큰은 플랫폼의 비밀 저장(storage.secret)의 'token' 칸에 둔다: 웹에서는 예전과 같은 localStorage의 'token'이라 기존 사용자가 그대로 이어진다.
import { platform } from './index';

export interface AuthProvider {
  /** 'guest' 또는 나중의 'portal' · 'steam' … (join 메시지의 auth 칸) */
  readonly kind: string;
  /** 접속할 때 서버에 낼 증표. 없으면 undefined (저장되지 않는 손님으로 들어간다) */
  token(): Promise<string | undefined>;
  /** 기기 옮기기로 받은 새 증표를 간직한다. 못 하면 false */
  adopt(token: string): Promise<boolean>;
  /** 이 기기의 증표를 버린다 (다른 기기로 옮겨 갔거나 데이터를 지웠다) */
  forget(): Promise<void>;
  /** 진행이 이 기기의 저장에만 묶여 있는가 (손님: true → 저장이 지워지면 잃는다. 손님 진행 보호 안내가 본다) */
  deviceBound(): boolean;
}

/** 무작위 비밀 값. randomUUID는 https나 localhost에서만 있어서(와이파이 주소로 들어오면 없다) 직접 만든다. */
function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** 손님: 처음이면 토큰을 만들어 간직하고, 다음부터 그것으로 이어받는다 */
export function guestAuth(key = 'token'): AuthProvider {
  return {
    kind: 'guest',
    async token() {
      const s = platform().storage.secret;
      let t = await s.get(key);
      if (!t) { t = newToken(); if (!(await s.set(key, t))) return undefined; } // 저장소를 못 쓰면 손님으로 들어간다 (저장되지 않음)
      return t;
    },
    adopt: (t) => platform().storage.secret.set(key, t),
    forget: () => platform().storage.secret.remove(key),
    deviceBound: () => !platform().has('storage.durable'),
  };
}

let current: AuthProvider | null = null;
/** 지금의 인증 (기본: 손님) */
export function auth(): AuthProvider { return (current ??= guestAuth()); }
/** 인증을 갈아 끼운다 (게임의 진입점이 startClient보다 먼저) */
export function setAuth(a: AuthProvider): void { current = a; }
