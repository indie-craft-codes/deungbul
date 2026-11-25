// 이 게임(별가루 광산)이 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 채굴기·각인의 안내문과 명령.
// 타입 선언만 있다. 아무도 import하지 않아도 tsconfig의 include에 들어 있어 서버·화면·시험이 모두 본다. 서버 쪽의 짝은 ../server/starmine.ts.
declare module '@engine/shared/ext' {
  /** 안내문: 종류 → 값. 문장은 화면의 언어 파일(client/i18n)이 만든다 */
  interface MsgMap {
    drillUp: [lv: number];
    drillPoor: [cost: number];
    drillMax: [];
    drillTook: [n: number];
    drillEmpty: [];
    drillAway: [n: number, minutes: number];
    engraveUp: [lv: number];
    engravePoor: [cost: number];
    engraveMax: [];
  }
  /** 화면 → 서버: 채굴기를 짓거나 올린다, 저장고의 별가루를 거둔다, 각인을 올린다 */
  interface ClientMsgs {
    drillUp: object;
    drillTake: object;
    engrave: object;
  }
}

/** 개인 상태 (me 메시지): 칸의 이름 → 값. 서버의 server/drill.ts가 g.personal에 같은 이름으로 등록한다 */
export interface MeState {
  drill: {
    /** 채굴기 레벨 (0이면 아직 없다) */
    lv: number;
    /** 저장고에 쌓인 별가루 (거둘 수 있는 양) */
    stash: number;
    /** 1분 생산량과 저장고 크기 */
    rate: number;
    cap: number;
    /** 각인 레벨 */
    engrave: number;
  };
}
