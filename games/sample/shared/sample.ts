// 이 게임(모닥불 사냥터)이 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 모닥불의 안내문, 메시지, 공유 상태.
// 타입 선언만 있다. 아무도 import하지 않아도 tsconfig의 include에 들어 있어 서버·화면·시험이 모두 본다. 서버 쪽의 짝은 ../server/sample.ts.
declare module '@engine/shared/ext' {
  /** 안내문: 종류 → 값. 문장은 화면의 언어 파일(client/i18n)이 만든다 */
  interface MsgMap {
    fed: [n: number, heat: number];
    noLogs: [];
    bonfireFar: [];
    bonfireLit: [name: string];
  }
  /** 화면 → 서버: 모닥불에 장작을 n개 넣는다 */
  interface ClientMsgs { feed: { n: number } }
  /** 모두가 함께 보는 상태: 모닥불의 온기 */
  interface WorldState { bonfire: { heat: number } }
}

/** 개인 상태 (me 메시지): 칸의 이름 → 값. 서버의 server/bonfire.ts가 g.personal에 같은 이름으로 등록한다 */
export interface MeState {
  /** 지금까지 넣은 장작 */
  fed: number;
}
