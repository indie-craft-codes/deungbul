// 이 게임(등불지기)이 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 등탑, 습격, 등탑지기, 퀘스트의 안내문·메시지·공유 상태.
// 타입 선언만 있다. 선언 병합은 아무도 import하지 않아도 tsconfig의 include(shared)에 들어 있어 서버·클라이언트·시험이 모두 본다.
// 아래의 MeState처럼 이름 붙은 타입은 이 게임의 파일(규칙 시스템, games/deungbul/client/)만 가져다 쓴다.
// 틀의 파일(engine/shared/protocol.ts, messages.ts 등과 틀의 서버 파일)은 이 파일을 import하지 않는다 (engine/test/framework.test.ts가 검사한다).
// 서버 쪽의 짝(시스템 칸, 사건)은 games/deungbul/server/deungbul.ts에 있다.
import type { MsgKey } from '@engine/shared/messages';
import type { EconNoticeKey } from './content/economy';
import type { RaidPhase } from './content/raid';

declare module '@engine/shared/ext' {
  /** 값의 이름은 a에 들어가는 순서다. id류(등탑, 주민)는 클라이언트가 이름으로 바꾼다 */
  interface MsgMap {
    offerFar: [];
    noSparks: [];
    towerFull: [];
    noResident: [];
    offered: [n: number, contrib: number, to: 'tower' | 'resident'];
    stageChanged: [stage: number, tower: string];
    /** 꺼져 있던 등탑이 켜졌다 */
    towerLit: [tower: string];
    residentBack: [resident: string];
    raidSoon: [leftS: number];
    raidStart: [foes: number];
    raidWon: [glow: number];
    raidLost: [glow: number];
    raidReward: [sparks: number, exp: number];
    /** 단계를 마침 */
    questStep: [exp: number, sparks: number];
    /** 장을 마침 */
    questDone: [chapter: string];
    /** 기여 단계가 올랐다 */
    tierUp: [tier: number, gold: number];
    /** 습격의 적이 내 채널에는 없고 그 채널에 있다 */
    raidElsewhere: [channel: number];
    /** 그 채널을 지키는 사람이 없어, 남은 적이 등탑을 치고 사라졌다 */
    raidAbandoned: [channel: number];
  }

  interface ClientMsgs {
    /** 등탑 가까이에서 불씨를 바친다: 등탑 밝기에, 또는 다음 주민을 되돌리는 데 */
    offer: { to: 'tower' | 'resident'; n: number };
  }

  interface WorldState {
    /** glow: 첫불 마을 등탑의 밝기. glows: 등탑별 밝기 (구역 번호 순) */
    tower: { glow: number; glows: number[]; residents: number[] };
    /** 오늘 등탑을 지킨 사람들 (등탑지기 할멈이 돌아온 뒤에만 채워진다) */
    keepers: { name: string; n: number }[];
    raid: {
      phase: RaidPhase;
      /** idle: 다음 습격까지, soon: 시작까지, active: 끝까지 남은 초 */
      left: number;
      /** 살아 있는 적의 수 (active일 때) */
      foes: number;
      towerHp: number; towerMaxHp: number;
    };
  }
}

/** 이 게임의 개인 상태 (me 메시지): 칸의 이름(k) → 값(s). 서버에서는 그 칸을 맡은 시스템이 g.personal에 같은 이름으로 등록한다 */
export interface MeState {
  /** 메인 퀘스트 진행: c번째 장의 s번째 단계, 진행 수치 n. 장을 다 마쳤으면 c가 장의 수와 같다 (games/deungbul/server/systems/quests.ts) */
  quest: { c: number; s: number; n: number };
  /** 지금까지 바친 불씨 (games/deungbul/server/systems/tower.ts) */
  contrib: number;
  /** 받은 기여 단계 보상의 수 (games/deungbul/server/systems/keepers.ts) */
  tier: number;
  /** 남은 휴식 보너스 (games/deungbul/server/systems/rest.ts) */
  rested: number;
}

/** 장부가 안내문으로 원인을 가리는 보상(games/deungbul/shared/content/economy.ts의 ECON_NOTICES)은 모두 실제 안내문의 종류여야 한다: 오타가 있으면 여기서 컴파일되지 않는다 */
export type EconNoticesAreMsgs = [EconNoticeKey] extends [MsgKey] ? true : { 안내문이_아닌_키: Exclude<EconNoticeKey, MsgKey> };
true satisfies EconNoticesAreMsgs;
