// 굴림공이 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 안내문, 명령, 공유 상태. 타입 선언만 있다. 팀의 안내문·명령·상태는 틀의 teams 모듈의 것이다.
declare module '@engine/shared/ext' {
  /** 안내문: 종류 → 값. 문장은 화면의 언어 파일이 만든다 */
  interface MsgMap {
    /** 골: 넣은 팀, 넣은 사람(자책골이나 모르면 빈 문자열), 두 팀의 점수 */
    goal: [side: number, name: string, a: number, b: number];
    /** 판이 끝났다: 이긴 팀(-1이면 비김), 두 팀의 점수 */
    roundOver: [winner: number, a: number, b: number];
    /** 새 판 */
    roundStart: [round: number];
  }
  /** 화면 → 서버: 공 차기 (팀 고르기는 틀의 teams 모듈의 명령 'team') */
  interface ClientMsgs { kick: Record<never, never> }
  /** 모두가 보는 상태: 경기 */
  interface WorldState { pitch: PitchState }
}

/** 경기의 단계: 하는 중, 골 뒤에 멈춤, 판이 끝남 */
export type Phase = 'play' | 'goal' | 'over';
/** 공유 상태: 남은 시간(초), 단계, 판의 번호. 두 팀의 점수와 사람 수는 틀의 teams 모듈의 점수판(공유 상태 teams), 내 팀과 내 골은 그 모듈의 개인 상태 team */
export interface PitchState { left: number; phase: Phase; round: number }
