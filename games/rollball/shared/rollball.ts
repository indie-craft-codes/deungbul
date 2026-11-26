// 굴림공이 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 안내문, 명령, 공유 상태. 타입 선언만 있다.
declare module '@engine/shared/ext' {
  /** 안내문: 종류 → 값. 문장은 화면의 언어 파일이 만든다 */
  interface MsgMap {
    /** 골: 넣은 팀, 넣은 사람(자책골이나 모르면 빈 문자열), 두 팀의 점수 */
    goal: [side: number, name: string, a: number, b: number];
    /** 판이 끝났다: 이긴 팀(-1이면 비김), 두 팀의 점수 */
    roundOver: [winner: number, a: number, b: number];
    /** 새 판 */
    roundStart: [round: number];
    /** 그 팀은 사람이 더 많아 들어갈 수 없다 */
    teamFull: [side: number];
    /** 그 팀에 들어갔다 */
    teamJoined: [side: number];
  }
  /** 화면 → 서버: 팀 고르기, 공 차기 */
  interface ClientMsgs { team: { side: number }; kick: Record<never, never> }
  /** 모두가 보는 상태: 경기 */
  interface WorldState { pitch: PitchState }
}

/** 경기의 단계: 하는 중, 골 뒤에 멈춤, 판이 끝남 */
export type Phase = 'play' | 'goal' | 'over';
/** 공유 상태: 두 팀의 점수, 남은 시간(초), 단계, 판의 번호, 사람마다의 팀 (엔티티 id → 0/1) */
export interface PitchState { a: number; b: number; left: number; phase: Phase; round: number; teams: Record<number, number> }
/** 개인 상태 (me 메시지): 칸의 이름 → 값 */
export interface MeState {
  /** 내 팀 (-1이면 아직 고르지 않았다) */
  side: number;
  /** 이번 접속에서 내가 넣은 골 */
  goals: number;
}
