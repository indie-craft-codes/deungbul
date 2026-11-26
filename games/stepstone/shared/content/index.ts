// 징검돌 전술의 내용: 핵심 계약(MAP, MODULES)과 핵심의 수치 몇 개. 전투·직업·아이템·재화·팀 모듈을 쓰지 않는다:
// 말과 차례는 이 게임이 만든 것이다 (./board.ts의 수치, ../rules.ts의 규칙, server/duels.ts).
import type { MapDef } from '@engine/shared/defs/map';
import type { ModuleId } from '@engine/shared/modules';
import { BOARD, BOARDS, LOBBY } from './board';

/** 쓸 모듈: 없다 (핵심만) */
export const MODULES: readonly ModuleId[] = [];
export const GUEST_NAME = 'Stoneward';
/** 대국판은 한 층에만 있다: 채널을 나누지 않는다 */
export const CHANNEL = { count: 1, soft: 40, hard: 60, switchCdS: 10, calmS: 5, tellS: 10, tellBusyS: 2 };
/** H(집으로)는 쓰지 않는다: 대기실과 판 사이는 서버가 옮긴다 */
export const HOME_KEY = false;
/** 카메라: 판(대각선 약 26m)이 폰 세로에서도 다 들게 멀리까지. 비추는 곳은 화면이 정한다 (client/duel.ts의 setCameraAim) */
export const CAMERA = { dist: 46, zoom: 1, zoomMin: 0.6, zoomMax: 2.6, gate: 1.05 };

const HALF = 100;
/** 판의 둘레(판의 대각선 반 + 앉는 자리)와 대기실에는 나무·바위를 두지 않는다 */
const CLEAR = (BOARD.size / 2 + BOARD.seat + 2) * BOARD.tile * Math.SQRT2;

/** 넓은 풀밭 하나: 가운데에 대기실, 둘레에 대국판 여섯 */
export const MAP: MapDef = {
  areas: [{ id: 'garden', x0: -HALF, x1: HALF, z0: -HALF, z1: HALF }],
  edge: 2,
  seed: 31,
  spawn: { x: LOBBY.x, z: LOBBY.z + 3 },
  obstacles: [],
  scatter: [
    { kind: 'tree', count: 90, x0: -HALF - 10, x1: HALF + 10, pad: 10, s0: 0.8, s1: 0.7 },
    { kind: 'rock', count: 26, x0: -HALF + 6, x1: HALF - 6, pad: -6, s0: 0.5, s1: 0.8 },
  ],
  isFree: (x, z) => Math.hypot(x - LOBBY.x, z - LOBBY.z) > 18 && BOARDS.every((b) => Math.hypot(x - b.x, z - b.z) > CLEAR),
  portals: {},
  portalClear: 0,
};
