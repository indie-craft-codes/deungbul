// WebSocket 접속의 출처(Origin 머리말) 허용 목록 (docs/platforms.md 3.2-3).
// 기본은 검사하지 않는다(목록 없음: 예전과 같다). 목록을 주면 그 출처만 받는다: 남의 웹 페이지가 사용자의 브라우저를 빌려 붙는 것을 막는다.
// 보안의 본체는 출처가 아니라 토큰·인증이다. 출처가 없는 연결(앱의 네이티브 소켓, 부하 도구, 시험)은 allowNone으로 정한다(기본 받음).
// 목록의 한 줄: 'https://example.com'처럼 정확한 출처, 또는 포트 자리에 '*'('http://localhost:*': 개발 서버의 아무 포트).
// 앱의 출처 예(2단계에서 실제 머리말로 확인할 것): Capacitor iOS 'capacitor://localhost', Android 'https://localhost', Electron 사용자 정의 프로토콜 'app://<이름>'.

export interface OriginOptions {
  /** 받는 출처의 목록. 주지 않거나 비우면 검사하지 않는다 */
  list?: readonly string[];
  /** Origin 머리말이 없는 연결을 받는가 (기본 true) */
  allowNone?: boolean;
}

/** 그 출처가 목록의 한 줄과 맞는가 (대소문자는 가리지 않는다: 출처의 체계와 호스트는 대소문자를 가리지 않는다) */
export function originMatches(origin: string, rule: string): boolean {
  const o = origin.toLowerCase(), r = rule.toLowerCase().replace(/\/+$/, '');
  if (r.endsWith(':*')) {
    const base = r.slice(0, -2);
    return o === base || (o.startsWith(base + ':') && /^\d+$/.test(o.slice(base.length + 1)));
  }
  return o === r;
}

/** 그 연결을 받는가 (origin: 머리말의 값, 없으면 undefined) */
export function originAllowed(origin: string | undefined, opts: OriginOptions = {}): boolean {
  if (!opts.list?.length) return true;
  if (!origin) return opts.allowNone ?? true; // 'null'(샌드박스 iframe, file://)은 값이 있는 출처다: 목록에 'null'을 적어야 받는다
  return opts.list.some((r) => originMatches(origin, r));
}
