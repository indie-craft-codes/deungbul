// 인증 접점의 서버 쪽: 접속(join) 메시지에서 저장 키를 정한다. 화면 쪽 짝은 engine/client/platform/auth.ts의 AuthProvider다.
// 지금은 손님뿐이다: 기기 토큰의 해시가 저장 키이고, 기기 옮기기(./handoff.ts)의 별칭과 물러난 토큰을 거친다 (예전 server.ts의 join과 같은 셈).
// 포털 토큰(JWT)·자체 계정·Steam 티켓은 나중에 같은 모양(ServerAuth)으로 꽂는다: startServer({ auth }). 증명을 검증해 '외부 신원 → 저장 키'로 바꾸는 일이 그 구현의 몫이다.
// 계정·로그인은 만들지 않는다 (docs/accounts.md, docs/platforms.md 3.2의 6).
import { hashToken, type Handoff } from './handoff';

export interface ServerAuth {
  readonly kind: string;
  /**
   * join 메시지에서 저장 키를 정한다. 문자열: 그 키의 캐릭터를 잇는다, null: 증표 없는 손님(저장하지 않는다),
   * undefined: 이 증표로는 들어올 수 없다 (다른 기기로 옮겨 간 토큰: 서버가 handedOff로 닫는다)
   */
  keyOf(m: Record<string, unknown>): string | null | undefined;
}

/** 손님: 토큰(16~64자의 영숫자·-)의 해시가 저장 키. 옮겨 간 토큰은 undefined, 별칭이 있으면 그 키 */
export function guestServerAuth(handoff: Handoff): ServerAuth {
  return {
    kind: 'guest',
    keyOf(m) {
      const token = typeof m.token === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(m.token) ? m.token : null;
      if (!token) return null;
      return handoff.keyFor(hashToken(token)) ?? undefined;
    },
  };
}
