// 달무리 원정대가 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 안내문, 명령, 서버 → 화면 메시지. 타입 선언만 있다.
import type { Reward } from '@engine/shared/defs';

declare module '@engine/shared/ext' {
  interface MsgMap {
    /** 별정수를 조각으로 바꿨다: 영웅 id, 받은 조각, 남은 별정수 */
    essenceUsed: [hero: string, shards: number, left: number];
    /** 별정수가 모자란다: 필요, 가진 것 */
    essenceShort: [need: number, have: number];
    /** 가지지 않은 영웅에게는 쓸 수 없다 */
    essenceNoHero: [];
  }
  interface ClientMsgs {
    /** 열쇠 던전으로: 단계에서 나와 문 앞에서 들어간다 */
    keyrun: { id: string };
    /** 별정수로 그 영웅의 조각을 얻는다 */
    essence: { id: string };
  }
  interface ServerMsgs {
    /** 다시 접속했을 때 쌓인 방치 보상 (우편 id와 분, 보상): 화면이 창으로 보여 준다 */
    idleGain: { mail: number; min: number; r: Reward };
  }
}

export {};
