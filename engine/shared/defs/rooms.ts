// 판(rooms 모듈)의 모양: 서버(engine/server/game/systems/rooms.ts)와 화면(engine/client/hud/rooms.ts)이 함께 읽는다.
// 판은 사람(과 컴퓨터) 몇이 따로 된 층(인스턴스)에서 차례대로 두는 한 판이다: 턴제 전술, 보드, 카드 게임의 방. 판의 규칙은 게임이 정한다.
// 이 파일은 아무것도 import하지 않는다.

/** 판의 단계: 사람을 기다림, 두는 중, 끝남 */
export type RoomPhase = 'wait' | 'play' | 'over';

/** 판의 한 자리 (화면에 보내는 모양) */
export interface RoomSeatView {
  /** 이름 (컴퓨터는 빈 문자열: 화면이 언어 파일의 roomCpu로 적는다). 빈 자리도 빈 문자열이다 */
  name: string;
  /** 컴퓨터 1 */
  cpu: 0 | 1;
  /** 연결이 끊긴 채 기다리는 중 1, 판을 떠났다 2 */
  away: 0 | 1 | 2;
  /** 빈 자리 1 (기다리는 판) */
  empty: 0 | 1;
  /** 다시 하기를 눌렀다 1 */
  again: 0 | 1;
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
  /** 끝났으면 이긴 자리 (비김 -2), 아니면 -1 */
  win: number;
  /** 끝난 까닭: 틀의 것('resign' 기권, 'left' 끊긴 채 돌아오지 않음)이나 게임이 finish에 준 것 */
  why: string;
  /** 차례 넘기기를 받는 판인가 (RoomDef.pass) */
  pass: 0 | 1;
  /** 앉은 동안 걸을 수 있는가 (RoomDef.walk) */
  walk: 0 | 1;
}

/** 대기실의 판 한 줄: [판 id, 연 사람의 이름, 앉은 사람 수, 자리 수, 단계 0 기다림 1 두는 중 2 끝남, 컴퓨터가 앉았으면 1] */
export type RoomRow = [id: number, host: string, seated: number, size: number, st: 0 | 1 | 2, cpu: 0 | 1];

/** 공유 상태 rooms: 대기실이 보는 판의 목록과 판의 규칙 몇 (화면의 단추) */
export interface RoomLobby {
  rows: RoomRow[];
  /** 컴퓨터와 둘 수 있는가 (RoomDef.cpu가 있다) */
  cpu: 0 | 1;
  /** 기다리다 컴퓨터로 채우는 초 (0이면 채우지 않는다) */
  cpuAfterS: number;
}
