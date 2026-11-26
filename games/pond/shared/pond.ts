// 반딧불 연못의 공용 선언: 안내문, 명령, 개인 상태의 모양. 이 파일은 tsconfig의 include로 컴파일에 들어간다.

declare module '@engine/shared/ext' {
  interface MsgMap {
    /** 그 패가 손에 없다, 나루가 이상하다 */
    pondBad: [];
  }
  interface ClientMsgs {
    /** 손패의 수 value를 나루 spot(0~2)에 엎어 던진다 */
    cast: { value: number; spot: number };
  }
}

/**
 * 개인 상태 pond: 내가 앉은 판의 연못 (판이 없으면 null). 남의 손패와 엎은 미끼의 수는 담지 않는다:
 * 남의 것은 던진 나루(spots)만, 펼친 뒤의 수는 last에만 있다
 */
export interface PondView {
  /** 몇째 던지기 (1부터), 모두 몇 번 */
  cast: number;
  casts: number;
  /** 이번 던지기의 선 낚시꾼 자리, 다음에 던질 자리 (-1 없음) */
  leader: number;
  next: number;
  /** 나루마다 물고기의 크기 */
  fish: number[];
  /** 자리마다 점수와 낚은 수 */
  scores: number[];
  caught: number[];
  /** 자리마다 이번 던지기에 던진 나루 (-1 아직) */
  thrown: number[];
  /** 내 손패 (나만 본다) */
  hand: number[];
  /** 이번 던지기에 내가 엎은 미끼 (없으면 null): 나만 본다 */
  mine: { spot: number; value: number } | null;
  /** 자리마다 남은 패의 수 */
  left: number[];
  /** 지난번 펼친 결과 (번호가 바뀌면 화면이 알린다) */
  last: { n: number; spots: { baits: [number, number][]; win: number; fish: number; tangled: number[] }[] } | null;
  /** 끝났으면 자리마다 등수 (1부터, 판에서 빠진 자리는 0) */
  rank: number[];
}

/** 캐릭터 저장의 전적 */
export interface PondRecord { games: number; wins: number; best: number }
