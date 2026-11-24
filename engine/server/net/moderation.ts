// 운영 기본기: 신고 기록. 금칙어 가리기와 글 다듬기는 ../text.ts에 있다 (게임 규칙도 쓰므로 통신 계층 밖에 둔다).
// 제재(채팅 정지, 접속 차단)는 여기서 하지 않는다: 신고는 기록만 하고, 사람이 보고 판단한다.

// 예전에 여기 있던 것을 이 경로로 가져다 쓰는 코드가 있어 그대로 다시 내보낸다
export { isClean, mask, tidy } from '../text';

/** 신고 한 건. 운영자가 나중에 읽는다 */
export interface Report {
  at: number;
  /** 신고한 사람: 이름과 저장 키(손님이면 null) */
  by: string; byKey: string | null;
  /** 신고당한 사람 */
  target: string; targetKey: string | null;
  /** 신고당한 사람이 최근에 한 말 (가리기 전의 원문) */
  lines: string[];
}

/** 같은 사람을 다시 신고할 수 있을 때까지(ms) */
export const REPORT_GAP_MS = 10 * 60000;
/** 신고에 붙이는 최근 대화의 수 */
export const REPORT_LINES = 8;
