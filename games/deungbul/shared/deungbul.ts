// 이 게임(등불지기)이 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 등탑, 습격, 등탑지기, 퀘스트의 안내문·메시지·공유 상태.
// 타입 선언만 있다. 선언 병합은 아무도 import하지 않아도 tsconfig의 include(shared)에 들어 있어 서버·클라이언트·시험이 모두 본다.
// 아래의 MeState처럼 이름 붙은 타입은 이 게임의 파일(규칙 시스템, games/deungbul/client/)만 가져다 쓴다.
// 틀의 파일(engine/shared/protocol.ts, messages.ts 등과 틀의 서버 파일)은 이 파일을 import하지 않는다 (engine/test/framework.test.ts가 검사한다).
// 서버 쪽의 짝(시스템 칸, 사건)은 games/deungbul/server/deungbul.ts에 있다.
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
    // ---------- 안개 균열 (games/deungbul/server/systems/rift.ts) ----------
    /** 균열의 문에서 멀다 */
    riftFar: [];
    riftLevel: [minLv: number];
    /** 오늘 들어갈 수 있는 횟수(던전과 함께 쓴다)를 다 썼다 */
    riftNoRuns: [];
    riftEnter: [];
    /** 파티원이 균열에 들어갔다 */
    riftMate: [name: string];
    /** 쓰러졌지만 제자리에서 다시 일어났다: 피해를 받지 않는 시간(초) */
    riftRevive: [safeS: number];
    /** 우두머리가 나타났다 */
    riftBoss: [monster: string];
    /** 내 판이 끝났다: 버틴 시간(초), 처치 수, 완주했으면 1 */
    riftResult: [timeS: number, kills: number, done: number];
    /** 스스로 나왔다 */
    riftLeft: [];
  }

  interface MailKinds {
    /** 안개 균열의 보상 우편. 제목의 값: [버틴 시간(초), 완주했으면 1, 처음 완주 덤이 붙었으면 1] */
    rift: true;
  }

  interface ServerMsgs {
    /**
     * 내가 들어가 있는 균열의 상태. on이 거짓이면 밖이다. left 남은 시간(초), kills 판의 처치 수, wave 물결 번호(1부터), foes 살아 있는 적,
     * ups 내가 고른 강화의 단계, downs 내가 쓰러진 횟수, n 판 안의 사람 수, over 내 판이 끝났다(결과를 보는 중)
     */
    rift: { on: boolean; left: number; kills: number; wave: number; foes: number; ups: Record<string, number>; downs: number; n: number; over: boolean };
    /** 강화를 고를 차례다: 고를 것들(강화 id)과 남은 시간(초). opts가 비어 있으면 고르기가 끝났다 */
    riftPick: { opts: string[]; s: number };
    /** 내 판의 결과. 우편으로 간 보상도 함께 알린다 (gear: 장비가 붙었는가, bonus: 처음 완주 덤) */
    riftEnd: { timeS: number; kills: number; done: boolean; ups: Record<string, number>; best: RiftBest; reward: { gold: number; exp: number; sparks: number; gear: boolean; bonus: number }; newBest: boolean };
    /** 판 안의 연출: 누군가의 안개 고리가 퍼졌다 (반경 r) */
    riftFx: { k: 'ring'; id: number; r: number };
  }

  interface ClientMsgs {
    /** 등탑 가까이에서 불씨를 바친다: 등탑 밝기에, 또는 다음 주민을 되돌리는 데 */
    offer: { to: 'tower' | 'resident'; n: number };
    /** 안개 균열: enter 문 가까이에서 들어간다, leave 나온다, pick 강화를 고른다 (n: 보여 준 것 가운데 몇째인가, 0부터) */
    rift: { a: 'enter' | 'leave' | 'pick'; n?: number };
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
  /** 안개 균열의 내 기록 (games/deungbul/server/systems/rift.ts) */
  rift: RiftBest;
}

/** 안개 균열의 기록: 가장 오래 버틴 시간(초)과 그때의 처치 수, 오늘의 것(오늘 한 적이 없으면 0), 완주한 횟수 */
export interface RiftBest { s: number; k: number; dayS: number; dayK: number; clears: number }

