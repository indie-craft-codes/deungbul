// 징검돌 전술이 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 안내문, 명령, 공유 상태와 개인 상태의 모양. 타입 선언만 있다.
declare module '@engine/shared/ext' {
  /** 안내문: 종류 → 값. 문장은 화면의 언어 파일이 만든다 */
  interface MsgMap {
    /** 판을 열고 상대를 기다린다 */
    duelWait: [];
    /** 판이 시작됐다: 상대의 이름, 내가 먼저 두는가(1) */
    duelStart: [foe: string, first: number];
    /** 빈 대국판이 없다 */
    duelNoBoard: [];
    /** 이미 판에 앉아 있다 */
    duelBusy: [];
    /** 들어갈 수 없는 판 (이미 찼거나 없어졌다) */
    duelGone: [];
    /** 내 차례가 아니다 */
    duelNotTurn: [];
    /** 그 수는 둘 수 없다 */
    duelBad: [];
    /** 시간이 다 되어 차례가 넘어갔다: 그 사람의 이름 */
    duelTimeout: [name: string];
    /** 상대의 연결이 끊겼다: 이름, 기다리는 초 */
    duelFoeLeft: [name: string, wait: number];
    /** 끊겼던 상대가 돌아왔다 */
    duelFoeBack: [name: string];
    /** 끊겼던 내가 판으로 돌아왔다 */
    duelBack: [];
    /** 판이 끝났다: 0 이김, 1 짐, 2 비김, 까닭 */
    duelResult: [res: number, why: string];
    /** 다시 하기: 상대를 기다린다 */
    duelAgainWait: [];
    /** 상대가 판을 떠나 다시 할 수 없다 */
    duelFoeGone: [name: string];
  }
  /** 화면 → 서버: 대국의 모든 명령 (칸 이름에 t를 쓰지 않는다: 메시지의 종류 t와 겹쳐 그 명령의 타입이 never가 된다) */
  interface ClientMsgs {
    duel: { a: DuelAct; id?: number; u?: number; to?: number; c?: number; r?: number };
  }
  /** 모두가 보는 상태: 대기실의 판 목록 */
  interface WorldState { tables: TableRow[] }
}

/** 명령의 종류: 빠른 대국, 판 만들기, 컴퓨터와 두기, 들어가기, 나가기(대기실로), 걷기, 치기, 차례 넘기기, 기권, 다시 하기 */
export type DuelAct = 'quick' | 'host' | 'cpu' | 'join' | 'lobby' | 'move' | 'hit' | 'end' | 'resign' | 'again';

/** 판의 단계: 상대를 기다림, 두는 중, 끝남 */
export type DuelPhase = 'wait' | 'play' | 'over';
/** 판이 끝난 까닭: 다 쓰러뜨림, 차례 수를 다 씀(남은 체력), 기권, 끊긴 채 돌아오지 않음 */
export type DuelWhy = 'ko' | 'rounds' | 'resign' | 'left';

/** 대기실의 판 한 줄: [판 id, 왼쪽 이름, 오른쪽 이름(비었으면 ''), 단계 0 기다림 1 두는 중 2 끝남, 컴퓨터 상대 1] */
export type TableRow = [id: number, a: string, b: string, st: number, cpu: number];

/** 판 위의 말 한 줄: [id, 종류 번호, 편, c, r, 체력, 걸었음 1 + 쳤음 2] */
export type UnitRow = [id: number, type: number, side: number, c: number, r: number, hp: number, flags: number];

/** 개인 상태 duel: 내가 앉은 판 (없으면 null) */
export interface DuelView {
  id: number;
  /** 대국판의 번호 (BOARDS) */
  board: number;
  /** 나의 편 (0 왼쪽, 1 오른쪽) */
  me: 0 | 1;
  st: DuelPhase;
  /** 두는 편 */
  turn: 0 | 1;
  /** 지금 차례의 번호 (1부터) */
  round: number;
  /** 이번 차례의 남은 초 */
  left: number;
  names: [string, string];
  /** 컴퓨터인가 */
  cpu: [number, number];
  /** 연결이 끊긴 채인가 */
  away: [number, number];
  units: UnitRow[];
  /** 마지막으로 친 것: [번호, 친 말, 맞은 말, 피해, 쓰러뜨림 1]. 번호가 바뀌면 화면이 연출한다 */
  fx: [n: number, a: number, t: number, d: number, k: number];
  /** 끝났으면 이긴 편 (2 비김), 아니면 -1 */
  win: number;
  why: DuelWhy | '';
  /** 다시 하기를 누른 편 */
  again: [number, number];
}

/** 개인 상태 (me 메시지): 칸 이름 → 값. 서버의 server/duels.ts가 같은 이름으로 등록한다 */
export interface MeState {
  duel: DuelView | null;
  /** 전적: 이김, 짐, 비김 */
  rec: [number, number, number];
}
