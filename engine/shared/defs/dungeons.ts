// 던전의 모양과 도우미. 던전의 표는 게임의 내용에 있다 (@game/shared/content). 규칙은 engine/server/game/systems/dungeon.ts가 맡는다.
import { DUNGEONS } from '../content';
import type { Coin } from './collect';
import type { Reward } from './growth';
import type { MonsterId } from './monsters';

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
  /** 끝냈을 때 장비를 주는가 (기본 true). false면 reward만 준다 (골드 던전, 재료 던전) */
  gear?: boolean;
  /**
   * 입장 열쇠: 있으면 하루 횟수(perDay) 대신 열쇠 하나를 쓰고 들어간다 (DungeonKey). 없으면 예전처럼 하루 perDay번.
   * perDay만 적은 던전은 예전과 글자까지 같다: 열쇠의 저장 칸도 개인 상태도 생기지 않는다
   */
  key?: DungeonKey;
}

/**
 * 던전의 입장 열쇠: 날이 바뀌면 refill개가 더해지되 cap을 넘지 않는다 (cap 위로는 사서만 갖는다). 처음 온 사람은 min(refill, cap)개로 시작한다.
 * buy가 있으면 그 재화로 하나씩 산다 (하루 perDay번까지). 하루 3번인 던전(perDay 3)은 refill 3·cap 3의 열쇠와 같다 (쓰지 않은 것이 쌓이지 않는다)
 */
export interface DungeonKey { refill: number; cap: number; buy?: { cur: Coin; cost: number; perDay: number } }

export type DungeonId = keyof typeof DUNGEONS;
export const DUNGEON_IDS = Object.keys(DUNGEONS) as DungeonId[];
export const isDungeonId = (v: unknown): v is DungeonId => typeof v === 'string' && Object.hasOwn(DUNGEONS, v);
/**
 * 던전의 표를 id가 문자열인 표로 본 것. 던전이 없는 게임(DUNGEONS = {})에서는 DungeonId가 never가 되어 DUNGEONS[id]로는 아무것도 읽을 수 없으므로,
 * 틀의 코드는 표를 이것으로 읽는다 (없는 id를 넣으면 undefined다: isDungeonId로 먼저 거른다)
 */
export const DUNGEON_TABLE: Readonly<Record<string, DungeonDef>> = DUNGEONS;
export const dungeonDef = (id: string): DungeonDef => DUNGEON_TABLE[id];
/**
 * 끝냈을 때 받는 장비의 등급: 평소처럼 굴린 등급(rolled)이 그 던전의 가장 낮은 등급보다 낮으면 그 등급으로 올린다.
 * 서버의 engine/server/game/systems/dungeon.ts와 도감(등급별 확률)이 함께 쓴다
 */
export const clearRar = (def: Pick<DungeonDef, 'dropRar'>, rolled: number): number => Math.max(def.dropRar, rolled);
/** 하루 입장 횟수를 일일 진행(DailyState.prog)에 적는 이름 */
export const runKey = (id: string): string => `run_${id}`;
/** 열쇠를 쓰는 던전이 하나라도 있는가 (없으면 열쇠의 저장 칸·개인 상태·명령이 생기지 않는다) */
export const hasDungeonKeys = (): boolean => Object.values(DUNGEON_TABLE).some((d) => !!d.key);
