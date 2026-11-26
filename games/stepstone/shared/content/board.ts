// 징검돌 전술(Stepstone Tactics)만의 수치: 판, 말, 차례, 대국판의 자리. 틀은 읽지 않는다 (서버·화면·시험만 읽는다).
// 판은 7×7 칸. 칸 (c, r): c는 왼쪽(0, 먼저 두는 쪽의 진영) → 오른쪽(6), r은 화면의 위(0) → 아래(6).
// 쿼터뷰 카메라의 각도가 고정이라(틀) 판을 월드에서 45° 돌려 놓는다: 두 사람 모두 '내 진영은 왼쪽 또는 오른쪽'으로 같은 모양을 본다.

/** 판: 크기, 한 칸의 너비(m), 바위 칸(못 지나가고 못 선다), 등불돌 칸(차례를 마칠 때 그 위의 말이 체력 1을 되찾는다) */
export const BOARD = {
  size: 7,
  tile: 2.6,
  rocks: [[3, 1], [3, 5]] as readonly (readonly [number, number])[],
  lamp: [3, 3] as const,
  /** 두는 사람이 서는 자리: 판 밖 몇 칸 (c = -seat, size - 1 + seat) */
  seat: 1.6,
};

/** 말의 종류 (차례가 곧 줄 위의 번호) */
export const UNIT_TYPES = ['shield', 'sling', 'runner'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export interface UnitDef {
  /** 체력 */
  hp: number;
  /** 한 차례에 걷는 칸 수 (상하좌우, 바위·말을 지나지 못한다) */
  move: number;
  /** 한 번 치는 피해 */
  atk: number;
  /** 칠 수 있는 거리(칸, 맨해튼 거리)의 아래와 위 */
  min: number; max: number;
  /** 2칸 이상 떨어진 곳에서 맞으면 덜 받는 피해 */
  guardFar?: number;
}

/** 방패돌: 단단하고 멀리서 날아온 돌을 1 덜 받는다. 투석돌: 2~3칸 떨어진 적만 친다. 날쌘돌: 세 칸을 걷는다 */
export const UNITS: Readonly<Record<UnitType, UnitDef>> = {
  shield: { hp: 10, move: 2, atk: 3, min: 1, max: 1, guardFar: 1 },
  sling: { hp: 6, move: 2, atk: 2, min: 2, max: 3 },
  runner: { hp: 7, move: 3, atk: 2, min: 1, max: 1 },
};

/** 왼쪽(0) 진영의 처음 자리. 오른쪽(1)은 판의 가운데를 두고 점대칭 (6 - c, 6 - r) */
export const START: readonly { type: UnitType; c: number; r: number }[] = [
  { type: 'shield', c: 1, r: 3 },
  { type: 'sling', c: 0, r: 2 },
  { type: 'runner', c: 0, r: 4 },
];

/** 차례: 한 차례의 제한 시간, 판의 차례 수 상한(두 사람이 한 번씩 두면 한 차례), 끊긴 사람을 기다리는 시간, 컴퓨터가 한 수를 두는 간격, 등불돌의 회복 */
export const TURN = {
  turnS: 30,
  rounds: 12,
  graceS: 60,
  cpuStepMs: 700,
  /** 판을 열고 이만큼(초) 아무도 오지 않으면 컴퓨터가 앉는다 (혼자면 컴퓨터) */
  cpuAfterS: 30,
  lampHeal: 1,
  /** 쓰러진 말이 판에서 사라지기까지 (무너지는 모습을 보인다) */
  removeMs: 900,
  /** 첫 바퀴 보정: 첫 바퀴에 나중 두는 편이 치는 피해를 이만큼 덜한다 (그래도 1). 먼저 다가간 편이 먼저 맞는 불리함을 덜어 준다 */
  openerSoften: 1,
};

/**
 * 대국판의 자리(판의 가운데). 대기실은 원점. 판은 틀의 판 모듈이 판마다 따로 된 층(인스턴스)에 열므로 대국판은 하나면 된다:
 * 모든 판이 같은 자리에서 열리고 서로 보이지 않는다 (예전에는 여섯 자리로 나눠 동시에 6판까지였다)
 */
export const BOARDS: readonly { x: number; z: number }[] = [{ x: -40, z: 0 }];
/** 대기실: 판에 앉지 않은 사람이 서는 곳 */
export const LOBBY = { x: 0, z: 0, r: 6 };

/** 두 진영의 색 (왼쪽 청록, 오른쪽 주홍) */
export const SIDE_COLOR = [0x3fa7a0, 0xe0703a] as const;
