// 운영 기본기: 금칙어 가리기와 신고 기록.
// 금칙어 목록은 시작용의 짧은 목록이다. 운영하면서 늘리고, 규모가 커지면 외부 필터로 바꾼다.
// 제재(채팅 정지, 접속 차단)는 여기서 하지 않는다: 신고는 기록만 하고, 사람이 보고 판단한다.

const WORDS = [
  // 한국어
  '씨발', '시발', '씨팔', '시팔', 'ㅅㅂ', '병신', 'ㅂㅅ', '좆', '개새끼', '개새', '지랄', '니애미', '느금마', '창녀', '걸레년',
  // 영어
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore',
];
/** 글자 사이에 끼워 넣어 피하는 것(공백, 점, 별표 등)을 건너뛰며 찾는다 */
const GAP = '[\\s.\\-_*~!?,·]*';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(WORDS.map((w) => [...w].map(esc).join(GAP)).join('|'), 'giu');

/** 금칙어를 같은 길이의 별표로 가린다. */
export function mask(text: string): string {
  return text.replace(PATTERN, (m) => '*'.repeat([...m].length));
}

/** 금칙어가 없는가 (이름처럼 가려서 쓸 수 없는 것을 검사할 때) */
export function isClean(text: string): boolean {
  PATTERN.lastIndex = 0;
  return !PATTERN.test(text);
}

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
