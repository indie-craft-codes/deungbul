// 굴림공만의 수치: 경기장의 크기, 공의 물리, 경기의 시간. 틀은 읽지 않는다 (서버의 server/pitch.ts와 화면이 읽는다).
export const PITCH = {
  /** 경기장의 반폭(x)과 반높이(z), m. 줄 밖으로 공이 나가지 않는다 (골문만 열려 있다) */
  halfW: 24, halfH: 14,
  /** 골문의 반폭(z), m */
  goalHalf: 4,
  /** 골문 안쪽 깊이: 공의 가운데가 골라인(x = ±halfW)을 넘으면 골이다 */
  netDepth: 1.5,
  /** 공의 반지름과 사람의 몸 반지름, m */
  ballR: 0.55, bodyR: 0.55,
  /** 걸어서 부딪힐 때 공이 받는 가장 작은 빠르기, m/s. 걸음의 빠르기에 이 배율을 곱한 것과 큰 쪽 */
  pushMin: 5, pushMul: 1.35,
  /** 차기: 공에서 이만큼 안이면 이 빠르기로 찬다. 다시 차기까지(초) */
  kickReach: 2.4, kickSpeed: 15, kickCdS: 0.8,
  /** 굴러가는 공이 1초에 잃는 빠르기의 비율(지수): v ← v·e^(−friction·dt) */
  friction: 0.5,
  /** 벽에 튈 때 남는 빠르기의 비율 */
  bounce: 0.75,
  /** 공의 가장 큰 빠르기, m/s */
  maxSpeed: 22,
  /** 한 판의 길이(초), 골 뒤에 멈추는 시간, 판이 끝나고 다음 판까지 */
  roundS: 150, goalPauseS: 3, endPauseS: 8,
} as const;

/** 팀: 0 노을(붉은 쪽, 오른쪽 골문 x = +halfW를 노린다), 1 물결(푸른 쪽, 왼쪽 골문을 노린다) */
export type Side = 0 | 1;
export const SIDES: readonly Side[] = [0, 1];
export const TEAM_COLOR: readonly [number, number] = [0xf06a3c, 0x3c8ef0];
/** 그 팀이 노리는 골문의 x */
export const goalX = (s: Side): number => (s === 0 ? PITCH.halfW : -PITCH.halfW);
