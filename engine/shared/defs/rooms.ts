// 판(rooms 모듈)의 모양: 서버(engine/server/game/systems/rooms.ts)와 화면(engine/client/hud/rooms.ts)이 함께 읽는다.
// 판은 사람(과 컴퓨터) 몇이 따로 된 층(인스턴스)에서 차례대로 두는 한 판이다: 턴제 전술, 보드, 카드 게임의 방. 판의 규칙은 게임이 정한다.
// 이 파일은 아무것도 import하지 않는다.

/** 판의 단계: 사람을 기다림, 두는 중, 끝남 */
export type RoomPhase = 'wait' | 'play' | 'over';

/** 판의 한 자리 (화면에 보내는 모양) */
export interface RoomSeatView {
  /** 이름 (컴퓨터는 게임이 RoomDef.cpuName으로 준 이름, 없으면 빈 문자열: 화면이 언어 파일의 roomCpu로 적는다). 빈 자리도 빈 문자열이다 */
  name: string;
  /** 컴퓨터 1 */
  cpu: 0 | 1;
  /** 연결이 끊긴 채 기다리는 중 1, 판을 떠났다 2 */
  away: 0 | 1 | 2;
  /** 빈 자리 1 (기다리는 판) */
  empty: 0 | 1;
  /** 다시 하기를 눌렀다 1 */
  again: 0 | 1;
  /** 준비 완료 1 (방장이 있는 판: RoomDef.lead) */
  ready?: 0 | 1;
  /** 큐가 채운 봇 1 (컴퓨터 자리: 화면이 '봇'이라고 적는다. 묶음 8) */
  bot?: 0 | 1;
}

/** 판의 공개 설정 (방 코드를 쓰는 판: RoomDef.codes): public 목록에 보임, private 코드로만, friends 방장의 친구만, password 비밀번호 */
export type RoomPrivacy = 'public' | 'private' | 'friends' | 'password';

/** 진행 중인 투표 (RoomDef.voteS): 무엇(opt 규칙 바꾸기 k=v, again 다시 하기, kick 자리 seat 내보내기), 낸 사람의 이름, 찬성·반대 수, 통과에 드는 찬성 수, 남은 ms, 내 표(1 찬성 0 반대 -1 아직) */
export interface RoomVoteView {
  kind: 'opt' | 'again' | 'kick';
  k?: string;
  v?: string | number;
  seat?: number;
  by: string;
  yes: number;
  no: number;
  need: number;
  left: number;
  mine: -1 | 0 | 1;
}

/**
 * 개인 상태 room: 내가 앉은 판 (없으면 null). 차례가 바뀌거나 판이 바뀔 때 다시 온다 (시계가 흐르는 동안 매번 오지는 않는다).
 * left는 보낼 때의 남은 시간(ms): 화면은 받은 때 + left를 이번 차례의 기한으로 삼아 매끄럽게 초를 센다
 */
export interface RoomView {
  id: number;
  st: RoomPhase;
  /** 내 자리 번호 (0부터) */
  me: number;
  seats: RoomSeatView[];
  /** 두는 자리 (두는 중이 아니면 -1) */
  turn: number;
  /** 지금 몇째 바퀴인가 (1부터: 모든 자리가 한 번씩 두면 한 바퀴) */
  round: number;
  /** 바퀴의 상한 (0이면 없다) */
  rounds: number;
  /** 이번 차례의 남은 시간(ms, 보낸 때 기준). 기한이 없으면 0 */
  left: number;
  /** 한 차례의 길이(ms). 기한이 없으면 0 */
  turnMs: number;
  /** 끝났으면 이긴 자리 (비김 -2, 등수로 끝낸 판에서 1등이 여럿이어도 -2), 아니면 -1 */
  win: number;
  /** 끝난 까닭: 틀의 것('resign' 기권, 'left' 끊긴 채 돌아오지 않음)이나 게임이 finish에 준 것 */
  why: string;
  /** 차례 넘기기를 받는 판인가 (RoomDef.pass) */
  pass: 0 | 1;
  /** 앉은 동안 걸을 수 있는가 (RoomDef.walk) */
  walk: 0 | 1;
  /** 시작할 수 있는 가장 적은 자리 수 (기다리는 판: RoomDef.seats의 min. 자리 수가 정해진 판과 시작한 판은 seats.length) */
  min: number;
  /** 등수로 끝낸 판의 자리마다 등수 (1부터, 같으면 같은 등수). 이김/짐으로 끝냈거나 끝나지 않았으면 빈 배열 */
  ranks: number[];
  /** finish에 준 자리마다의 점수 (없으면 빈 배열) */
  scores: number[];
  // ---- 아래는 그 칸을 켠 판에만 온다 (묶음 7: 판의 공통화) ----
  /** 판의 이름 (게임에 RoomDef가 여럿일 때: RoomDef.id) */
  def?: string;
  /** 방 코드(6자)와 공개 설정 (RoomDef.codes). 관전자에게는 오지 않는다 */
  code?: string;
  privacy?: RoomPrivacy;
  /** 방장의 자리 (RoomDef.lead: 방장이 없으면 -1) */
  lead?: number;
  /** 방장이 고른 규칙 (RoomDef.options: 이름 → 값) */
  opts?: Record<string, string | number>;
  /** 진행 중인 투표 (없으면 null) */
  vote?: RoomVoteView | null;
  /** 관전 중이면 1 (me는 -1). queued: 다음 판에 들어가려고 기다린다. pub: 관전자가 보는 판 상태 (RoomDef.watchView: 관전 지연만큼 늦다) */
  watch?: 0 | 1;
  queued?: 0 | 1;
  pub?: unknown;
  /** 관전하는 사람 수 (RoomDef.watch) */
  watchers?: number;
  /** 관전 지연(초) */
  delayS?: number;
  /** 차례 없는 실시간 판이면 1 (RoomDef.realtimeS): turn은 -1, left·turnMs는 판 전체의 남은 시간과 길이 */
  rt?: 0 | 1;
  /** 결과 창에서 '같은 무리로 다음 판'을 할 수 있으면 1 */
  regroup?: 0 | 1;
  // ---- 경쟁 (묶음 8) ----
  /** 큐가 짝지은 랭크 판이면 1 (레이팅에 든다: 결과 창은 다시 하기 대신 '다시 큐') */
  rated?: 0 | 1;
  /** 끝난 판의 리플레이 id (RoomDef.replay: 없으면 0) */
  rp?: number;
}

/**
 * 대기실의 판 한 줄: [판 id, 연 사람의 이름, 앉은 사람 수, 자리 수, 단계 0 기다림 1 두는 중 2 끝남, 컴퓨터가 앉았으면 1,
 * 판의 이름의 번호(RoomLobby.defs의 자리), 자물쇠 0 없음 1 비밀번호 2 친구만, 관전하는 사람 수]. 비공개 판(private)은 목록에 없다
 */
export type RoomRow = [id: number, host: string, seated: number, size: number, st: 0 | 1 | 2, cpu: 0 | 1, def?: number, lock?: 0 | 1 | 2, watchers?: number];

/** 판의 이름 하나가 켠 것 (대기실의 단추): 이름, 자리 수 범위, 컴퓨터, 코드, 방장, 투표, 관전, 실시간, 전적, 규칙 옵션 (이름 → 고를 값들, 첫 값이 기본) */
export interface RoomDefView {
  id: string;
  min: number;
  max: number;
  cpu: 0 | 1;
  codes: 0 | 1;
  lead: 0 | 1;
  vote: 0 | 1;
  watch: 0 | 1;
  rt: 0 | 1;
  record: 0 | 1;
  opts: Record<string, readonly (string | number)[]>;
  /** 랭크 큐가 있는 판 (RoomDef.rated, ranked 모듈)이면 1, 리플레이를 남기면 1 (묶음 8) */
  rated?: 0 | 1;
  replay?: 0 | 1;
}

/** 전적 (명령 room a:'stats'의 답 roomStats): 이름, 모든 판과 판의 이름마다의 판 수·이김·짐·비김, 최근 판 (최근부터) */
export interface RoomTally { n: number; win: number; lose: number; draw: number }
export interface RoomStatsView {
  name: string;
  /** 내 전적이면 1 */
  me: 0 | 1;
  all: RoomTally;
  defs: Record<string, RoomTally>;
  /** 최근 판: 때(UTC ms), 판의 이름, 결과(0 이김 1 짐 2 비김), 등수(등수로 끝냈으면, 아니면 0), 자리 수, 까닭 */
  recent: { at: number; def: string; res: 0 | 1 | 2; rank: number; n: number; why: string; rp?: number }[];
}

/** 공유 상태 rooms: 대기실이 보는 판의 목록과 판의 규칙 몇 (화면의 단추) */
export interface RoomLobby {
  rows: RoomRow[];
  /** 컴퓨터와 둘 수 있는가 (RoomDef.cpu가 있다) */
  cpu: 0 | 1;
  /** 기다리다 컴퓨터로 채우는 초 (0이면 채우지 않는다) */
  cpuAfterS: number;
  /** 자리 수가 범위인 판: 기다리다 모인 만큼으로 시작하는 초 (RoomDef.startAfterS, 0이면 없다) */
  startAfterS: number;
  /** 판의 이름마다 켠 것 (첫째가 기본: 빠른 대국) */
  defs?: RoomDefView[];
}
