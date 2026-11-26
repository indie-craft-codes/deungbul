// 징검돌 전술이 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 안내문, 명령, 개인 상태의 모양. 타입 선언만 있다.
// 판 열기·짝짓기·차례·기한·끊김·결과의 안내문과 명령은 틀의 판 모듈(rooms)의 것이다 (roomStart, roomTimeout …, 명령 room).
declare module '@engine/shared/ext' {
  /** 안내문: 종류 → 값. 문장은 화면의 언어 파일이 만든다 */
  interface MsgMap {
    /** 그 수는 둘 수 없다 */
    duelBad: [];
  }
  /** 화면 → 서버: 판 위의 수 (칸 이름에 t를 쓰지 않는다: 메시지의 종류 t와 겹쳐 그 명령의 타입이 never가 된다) */
  interface ClientMsgs {
    duel: { a: DuelAct; u?: number; to?: number; c?: number; r?: number };
  }
}

/** 판 위의 수: 걷기(u 말, c r 칸), 치기(u 말, to 맞을 말). 차례 넘기기·기권·다시 하기·대기실은 틀의 room 명령 */
export type DuelAct = 'move' | 'hit';

/** 판이 끝난 까닭 (틀의 'resign', 'left'에 더해): 다 쓰러뜨림, 차례 수를 다 씀(남은 체력) */
export type DuelWhy = 'ko' | 'rounds' | 'resign' | 'left';

/** 판 위의 말 한 줄: [id, 종류 번호, 편, c, r, 체력, 걸었음 1 + 쳤음 2] */
export type UnitRow = [id: number, type: number, side: number, c: number, r: number, hp: number, flags: number];

/** 개인 상태 duel: 내가 앉은 판의 말 (판에 앉지 않았거나 판이 차려지기 전이면 null). 차례·자리·남은 시간·결과는 틀의 개인 상태 room (myRoom) */
export interface DuelView {
  /** 판 id (틀의 room.id) */
  id: number;
  /** 대국판의 번호 (BOARDS) */
  board: number;
  units: UnitRow[];
}

/** 개인 상태 (me 메시지): 칸 이름 → 값. 서버의 server/duels.ts가 같은 이름으로 등록한다 */
export interface MeState {
  duel: DuelView | null;
  /** 전적: 이김, 짐, 비김 */
  rec: [number, number, number];
}
