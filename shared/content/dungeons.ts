// 던전: 문으로 들어가는 따로 떨어진 지역. 들어간 사람(과 그 파티)만의 인스턴스가 만들어진다.
// 규칙은 server/game/systems/dungeon.ts가 맡는다. 수치는 모두 잠정값이다.
// 틀의 것(타입과 도우미 함수)과 이 게임의 것(표와 수치)이 한 파일에 있어 [틀] / [이 게임] 구역 주석으로 갈라 둔다 (파일은 9단계에서 갈린다).
import type { Reward } from './growth';
import { PORTALS } from './map';
import type { MonsterId } from './monsters';

// ===== [틀] 던전의 모양 =====
export interface DungeonDef {
  /** 들판에 있는 문의 자리 */
  portal: { x: number; z: number };
  /** 안에 들어서는 자리 (쓰러지면 여기서 다시 일어난다) */
  entry: { x: number; z: number };
  /** 이 레벨부터 들어갈 수 있다 */
  minLv: number;
  /** 하루에 들어갈 수 있는 횟수 (자정에 새로 센다) */
  perDay: number;
  /** 제한 시간(초). 넘기면 실패하고 밖으로 나간다 */
  timeS: number;
  /** 우두머리를 잡은 뒤 밖으로 나가기까지의 시간(초) */
  exitS: number;
  /** 무리: 그 자리 둘레에 n마리 */
  packs: readonly { type: MonsterId; x: number; z: number; n: number }[];
  /** 우두머리: 잡으면 끝난다 */
  boss: { type: MonsterId; x: number; z: number };
  /** 끝냈을 때 각자 우편으로 받는 보상 */
  reward: Reward;
  /** 끝냈을 때 각자 받는 장비의 가장 낮은 등급과 장비 레벨 */
  dropRar: number; dropLv: number;
}

// ===== [이 게임] 던전 =====
export const DUNGEONS = {
  crypt: {
    portal: PORTALS.crypt,
    entry: { x: 266, z: 0 },
    minLv: 8,
    perDay: 3,
    timeS: 600,
    exitS: 30,
    packs: [
      { type: 'goblin', x: 283, z: 0, n: 4 },
      { type: 'lost_soldier', x: 296, z: -16, n: 3 },
      { type: 'lost_soldier', x: 296, z: 16, n: 3 },
      { type: 'goblin', x: 310, z: 0, n: 5 },
    ],
    boss: { type: 'crypt_lord', x: 328, z: 0 },
    reward: { gold: 300, exp: 600, sparks: 15 },
    dropRar: 2, dropLv: 5,
  },
} as const satisfies Record<string, DungeonDef>;
// ===== [틀] 던전 도우미 (PORTAL_REACH의 값은 [이 게임]의 것) =====
export type DungeonId = keyof typeof DUNGEONS;
export const DUNGEON_IDS = Object.keys(DUNGEONS) as DungeonId[];
export const isDungeonId = (v: unknown): v is DungeonId => typeof v === 'string' && Object.hasOwn(DUNGEONS, v);
export const dungeonDef = (id: DungeonId): DungeonDef => DUNGEONS[id];
/** 문에 이만큼 다가가야 들어갈 수 있다 */
export const PORTAL_REACH = 4;
/** 하루 입장 횟수를 일일 진행(DailyState.prog)에 적는 이름 */
export const runKey = (id: string): string => `run_${id}`;
