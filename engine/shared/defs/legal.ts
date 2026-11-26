// 약관·개인정보 처리방침과 개인정보 권리(내보내기·삭제)의 모양 (내용 칸 LEGAL, PRIVACY). 서버와 화면이 함께 읽는다.
// LEGAL을 적지 않으면(기본 null) 화면에 약관 링크도, 첫 접속 고지도 없다 (지금과 같다).
// 적으면: 접속 화면과 설정 창에 두 문서의 링크가 생기고, 그 버전에 동의하지 않은 저장 키에는 들어온 뒤 고지·동의 창이 뜬다.
// 동의한 버전은 서버가 저장 키마다 적는다 (engine/server/net/web.ts). 버전을 올리면 모두에게 다시 묻는다.

/** 약관·처리방침 문서. 값은 주소(https://…, ./terms.html처럼 /나 ./로 시작) 또는 i18n 문장 키(그 언어의 문장을 창 안에 그대로 보인다) */
export interface LegalDef {
  /** 이용약관 */
  terms: string;
  /** 개인정보 처리방침 */
  privacy: string;
  /** 문서의 버전 (예: '2026-12-01'). 바꾸면 모두에게 다시 동의를 묻는다 */
  version: string;
}

/** 개인정보 권리의 규칙 */
export interface PrivacyRules {
  /** 삭제를 요청한 뒤 실제로 지우기까지의 유예(일). 그동안은 취소할 수 있다. 0이면 다음 정리 때 곧바로 */
  eraseDays: number;
}

/** 문서 값이 주소인가 (아니면 i18n 문장 키) */
export const isLegalUrl = (v: string): boolean => /^(https?:\/\/|\.{0,2}\/)/i.test(v);
