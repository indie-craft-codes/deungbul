// 반딧불 연못의 수치와 자리 (틀은 읽지 않는다: 이 게임의 서버·화면·시험만 읽는다). 아무것도 import하지 않는다.

/** 자리 i의 방향 각(라디안): 화면의 카메라 돌리기(setCameraYaw)와 같은 각이라 누구나 자기 자리를 화면 아래에서 본다 */
export const seatAngle = (i: number): number => (i * Math.PI) / 2;
/** (x, z)를 세로축으로 a만큼 돌린다 (three.js의 applyAxisAngle(UP, a)와 같은 셈: 카메라 돌리기와 같은 방향) */
export function turn(x: number, z: number, a: number): { x: number; z: number } {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export const POND = {
  /** 자리 수 (넷: 빈자리는 컴퓨터가 앉는다) */
  seats: 4,
  /** 한 사람이 받는 미끼 패 (= 던지기의 수) */
  hand: 8,
  /** 미끼 패: 1~10이 넷씩 (40장). 넷에게 여덟 장씩 나누고 여덟 장은 아무도 보지 않는다 */
  deckMax: 10,
  deckCopies: 4,
  /** 낚시 자리(나루) 셋의 자리: 연못 가운데의 한 줄 */
  spots: [{ x: -2.7, z: 0 }, { x: 0, z: 0 }, { x: 2.7, z: 0 }] as const,
  /** 새 물고기의 크기(점수)와 그 무게: 작은 것이 흔하다 */
  fishWeights: [[1, 4], [2, 5], [3, 4], [4, 3], [5, 2]] as const,
  /** 아무도 낚지 못한 물고기는 던지기마다 1씩 자란다 (이 크기까지) */
  fishMax: 8,
  /** 연못의 반지름(장애물), 자리의 반지름, 대기실의 자리(연못 남쪽) */
  radius: 4.8,
  seatR: 6.4,
  lobbyZ: 14,
  /** 미끼(찌)가 나루에서 던진 사람 쪽으로 떨어지는 거리 */
  baitOff: 1.05,
  /** 한 차례의 제한 시간(초), 끊긴 사람을 기다리는 초, 기다리다 컴퓨터가 앉는 초, 컴퓨터의 간격(ms), 펼친 뒤 쉬는 시간(ms) */
  turnS: 20,
  graceS: 60,
  cpuAfterS: 20,
  cpuStepMs: 900,
  revealPauseMs: 2600,
} as const;

/** 자리 i의 사람이 서는 곳과 바라보는 방향 (연못 쪽) */
export function seatSpot(i: number): { x: number; z: number; face: number } {
  const r = POND.seatR / Math.SQRT2, at = turn(r, r, seatAngle(i));
  return { x: at.x, z: at.z, face: Math.atan2(-at.x, -at.z) };
}

/** 자리 i가 나루 s에 던진 찌가 떨어지는 곳 */
export function baitSpot(s: number, i: number): { x: number; z: number } {
  const d = turn(POND.baitOff / Math.SQRT2, POND.baitOff / Math.SQRT2, seatAngle(i)), sp = POND.spots[s];
  return { x: sp.x + d.x, z: sp.z + d.z };
}
