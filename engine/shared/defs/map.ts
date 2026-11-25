// 맵 정의의 모양과, 게임의 맵 정의(MAP)에서 꺼내 쓰는 것. 맵의 값은 게임의 내용에 있다 (@game/shared/content의 MAP).
// 틀(engine/shared/world.ts의 buildWorld, 길찾기, 이동, 봇)은 게임의 맵을 이 모양으로만 안다: 등탑이나 연못 같은 낱말은 모른다.
import { MAP } from '@game/shared/content';

/** 걸어 다닐 수 있는 네모난 지역 */
export interface Area { id: string; x0: number; x1: number; z0: number; z1: number }
/** 손으로 놓은 장애물 하나 (둥근 것). tag는 그것이 무엇인지 적어 두는 이름표이고 틀은 읽지 않는다 */
export interface MapObstacle { x: number; z: number; r: number; tag?: string }
export interface Scatter {
  kind: 'tree' | 'rock';
  count: number;
  /** 뿌리는 x 범위 */
  x0: number; x1: number;
  /** z 범위를 월드보다 이만큼 넓게(음수면 좁게) 잡는다 */
  pad: number;
  /** 크기: s0 + 난수 * s1 */
  s0: number; s1: number;
}
/** 게임이 내놓는 맵 정의 (engine/shared/contract.ts의 MAP) */
export interface MapDef {
  /**
   * 걸어 다닐 수 있는 지역들. 0번은 들판이고, 나머지는 던전처럼 따로 떨어진 곳이다.
   * 지역 사이는 걸어서 넘을 수 없고 문(던전 정의의 portal: engine/shared/defs/dungeons.ts의 DungeonDef. 자리는 아래 portals)으로만 오간다. 지역을 더하려면 여기에 네모를 더한다.
   */
  areas: readonly Area[];
  /** 가장자리에서 이만큼 안쪽까지만 갈 수 있다 */
  edge: number;
  /** 맵 배치의 난수 시드 */
  seed: number;
  /** 접속과 부활의 기본 자리 */
  spawn: { x: number; z: number };
  /** 손으로 놓은 장애물. 이 순서대로 월드의 장애물 목록 앞쪽에 들어간다 (순서가 바뀌면 충돌 판정의 순서가 달라진다) */
  obstacles: readonly MapObstacle[];
  /** 나무와 바위를 뿌리는 규칙. 순서대로 같은 난수열을 쓰므로, 순서를 바꾸면 맵 전체의 배치가 달라진다 */
  scatter: readonly Scatter[];
  /** 나무나 바위를 놓아도 되는 자리인가 */
  isFree: (x: number, z: number) => boolean;
  /** 던전으로 들어가는 문의 자리 (들판). 이 둘레에는 나무와 바위를 두지 않는다 */
  portals: Readonly<Record<string, { x: number; z: number }>>;
  /** 문 둘레에서 나무와 바위를 치우는 반경 */
  portalClear: number;
  /**
   * (선택) 다 뿌린 뒤에 나무와 바위를 치울 자리인가. 문 둘레를 치우는 것과 같은 때에 거른다.
   * 맵을 넓히며 새 길이나 터가 예전 나무 자리에 걸릴 때 쓴다: isFree로 거르면 난수를 쓰는 차례가 바뀌어 맵 전체의 배치가 달라지지만, 여기서 거르면 그 자리의 것만 빠진다
   */
  clearAfter?: (x: number, z: number) => boolean;
}

// ---------- 맵 정의에서 꺼내 쓰는 것 ----------
// MAP만 읽는다. 예전부터 쓰던 이름이라 그대로 내보낸다 (이동, 길찾기, 던전, 화면이 이 이름으로 읽는다).
export const AREAS = MAP.areas;
export const EDGE = MAP.edge;
/** 그 자리가 속한 지역의 번호. 어느 지역도 아니면 -1 */
export const areaAt = (x: number, z: number): number => AREAS.findIndex((a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1);
/** 모든 지역을 감싸는 범위: 길찾기 격자가 이만큼을 덮는다 */
export const GRID = {
  x0: Math.min(...AREAS.map((a) => a.x0)), x1: Math.max(...AREAS.map((a) => a.x1)),
  z0: Math.min(...AREAS.map((a) => a.z0)), z1: Math.max(...AREAS.map((a) => a.z1)),
};
export const PORTALS = MAP.portals;
export const PORTAL_CLEAR = MAP.portalClear;
export const SCATTER = MAP.scatter;
export const MAP_SEED = MAP.seed;
