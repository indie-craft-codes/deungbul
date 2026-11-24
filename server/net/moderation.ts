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
// 건너뛰는 글자는 점·별표처럼 낱말 안에 끼워 넣는 것만이다. 공백, 물음표, 쉼표, 하이픈, 숫자까지 건너뛰면
// '시 발표', '혹시?발견', '즉시-발송', '택시2발' 같은 정상 문장이 가려진다
const GAP = '[.*_~^]*';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERN = new RegExp(WORDS.map((w) => [...w].map(esc).join(GAP)).join('|'), 'giu');

/**
 * 글자를 한 가지 모양으로 다듬는다: 전각 글자와 꾸밈 글자를 보통 글자로(NFKC), 눈에 보이지 않는 글자(폭 없는 공백, 방향 뒤집기,
 * 한글 채움 문자)는 지운다. 이런 글자로 금칙어를 피하거나 남의 이름을 흉내 내지 못하게 한다.
 */
export function tidy(text: string): string {
  // 낱글자 자모(ㅋ, ㅠ, ㅅㅂ)는 그대로 둔다: NFKC는 이것을 조합용 자모로 바꿔서 화면에서 깨져 보이고 금칙어 목록과도 어긋난다
  return [...text].map((ch) => (/[\u3130-\u318f]/.test(ch) ? ch : ch.normalize('NFKC'))).join('').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u206f\ufeff\u00ad\u115f\u1160\u3164\uffa0]/g, '');
}

/** 금칙어를 같은 길이의 별표로 가린다. */
export function mask(text: string): string {
  return tidy(text).replace(PATTERN, (m) => '*'.repeat([...m].length));
}

/** 금칙어가 없는가 (이름처럼 가려서 쓸 수 없는 것을 검사할 때) */
export function isClean(text: string): boolean {
  PATTERN.lastIndex = 0;
  return !PATTERN.test(tidy(text));
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
