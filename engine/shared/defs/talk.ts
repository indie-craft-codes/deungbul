// 사회와 안전의 모양 (docs/genre-features.md 5.3): 대화 채널(chat 모듈), 친구(friends 모듈), 정해진 문장(QUICK_CHAT), 연령과 제한 모드(AGE).
// 서버(engine/server/net/social.ts)와 화면(engine/client/hud/social.ts, hud/chat.ts)이 함께 읽는다. 수치는 게임의 내용에 있다 (적지 않으면 틀의 기본값).
// 차단·신고·금칙어는 어느 게임에나 있는 핵심이다: 내용 칸이 없다 (금칙어는 engine/shared/textfilter.ts의 addBannedWords).
import { AGE, QUICK_CHAT } from '../content';

/** 대화 채널의 줄 위 표시: 없으면 전체, g 길드, n 근처, p 파티, w 귓말 */
export type ChatCh = 'g' | 'n' | 'p' | 'w';
export const CHAT_CHS: readonly ChatCh[] = ['n', 'p', 'g', 'w'];
export const isChatCh = (v: unknown): v is ChatCh => typeof v === 'string' && (CHAT_CHS as readonly string[]).includes(v);

/** 대화 채널의 규칙 (chat 모듈) */
export interface ChatRules {
  /** 근처 채널이 닿는 거리(m, 같은 층 안) */
  nearM: number;
  /** 한 사람이 모든 채널을 합쳐 한꺼번에 보낼 수 있는 줄과, 그 뒤로 초당 회복되는 줄 (도배 막기) */
  burst: number; perS: number;
  /** 같은 말(편 모양이 같은 것)을 이만큼(초) 안에 되풀이하면 전하지 않는다 */
  sameS: number;
}
/** 친구의 규칙 (friends 모듈) */
export interface FriendRules {
  /** 친구의 상한 */
  max: number;
  /** 받아 둔 요청의 상한 (넘으면 새 요청을 받지 않는다) */
  pending: number;
  /** 요청을 보내는 간격(초) */
  askGapS: number;
}
/**
 * 연령 입력과 제한 모드 (선택 칸: 적지 않으면(null) 묻지 않는다 = 지금과 같다).
 * 적으면 처음 들어온 저장 키에 나이를 묻는다 (중립: 미리 고른 값이 없고, 어느 답이 무엇을 여는지 보이지 않는다). 한 번 답하면 바꿀 수 없다 (관리자만: age 명령).
 * limit 미만이면(그리고 답하기 전에도) 제한 모드: 자유 대화가 꺼지고(정해진 문장만), 귓말·친구 요청을 받지 않고, restrict의 명령을 쓸 수 없다
 */
export interface AgeRules {
  /** 이 나이(만) 미만이면 제한 모드 */
  limit: number;
  /** 묻는 모양: year 태어난 해를 고른다, band 나이 구간(limit 미만/이상)을 고른다 */
  ask: 'year' | 'band';
  /** 제한 모드에서 막는 명령 (게임이 정한다: 거래소 'market' 같은 것). 기본 빈 목록 */
  restrict: readonly string[];
}

/**
 * 서버와 화면이 읽는 연령·정해진 문장의 규칙 (내용의 AGE, QUICK_CHAT). 시험이 칸을 바꿔 제한 모드를 켜 본다 (CHAR_RULE_VIEW와 같은 방식)
 */
export const TALK_VIEW: { age: AgeRules | null; quick: readonly string[] } = { age: AGE, quick: QUICK_CHAT };
/** 정해진 문장의 키 (i18n의 ui 문장 키). 게임의 QUICK_CHAT이 비어 있으면 정해진 문장이 없다 */
export const quickChat = (): readonly string[] => TALK_VIEW.quick;
export const isQuick = (v: unknown): v is string => typeof v === 'string' && TALK_VIEW.quick.includes(v);
/** 틀이 문장을 갖춘 정해진 문장 여덟 (값은 engine/shared/defaults.ts: 게임의 내용 파일이 거기서 읽는다) */
export { BASIC_QUICK_CHAT } from '../defaults';
/** 연령을 묻는 게임인가 */
export const ageOn = (): boolean => TALK_VIEW.age !== null;

/** 친구 목록의 한 사람 (화면에 보내는 것). r은 상대를 가리키는 짧은 표(저장 키가 아니다) */
export interface FriendView {
  r: string; name: string;
  /** ok 친구, in 받은 요청, out 보낸 요청 */
  st: 'ok' | 'in' | 'out';
  /** 접속 중이면 엔티티 번호와 있는 곳(채널 번호, 던전 같은 따로 된 곳이면 inst) */
  id?: number; ch?: number; inst?: boolean;
  /** 마지막으로 저장된 시각(UTC ms). 접속 중이면 없다 */
  seen?: number;
  /** 친구가 된(요청한) 시각 */
  at: number;
}
/** 차단한 사람 하나: r 표, 차단할 때의 이름(지금 이름이 있으면 그것), 접속 중이면 엔티티 번호 */
export interface BlockView { r: string; name: string; id?: number }
/** 내 대화 상태: 제한 모드인가, 나이를 물어야 하는가, 귓말·친구 요청을 받는가 */
export interface TalkState { limited: boolean; ask: boolean; noWhisper: boolean; noFriend: boolean }
