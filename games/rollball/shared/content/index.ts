// 굴림공(Rollball)의 내용: 핵심 계약(MAP, MODULES)과 핵심의 수치 몇 개만. 전투·직업·아이템·재화가 없다.
// 이 게임만의 수치(경기장, 공의 물리, 경기 시간)는 ./pitch.ts에 있다: 틀은 읽지 않는다.
import type { MapDef } from '@engine/shared/defs/map';
import type { ModuleId } from '@engine/shared/modules';
import { PITCH } from './pitch';

/** 쓸 모듈: 없다 (핵심만) */
export const MODULES: readonly ModuleId[] = [];
export const GUEST_NAME = 'Roller';
/** 경기장 전체(48m)가 한 화면의 시야에 들어오게 넓히고, 공이 부드럽게 보이게 틱마다 보낸다 */
export const NET = { tickMs: 50, snapEvery: 1, aoi: 60, aoiLeave: 64 };
/** 경기장은 하나: 채널(층)을 나누지 않는다 */
export const CHANNEL = { count: 1, soft: 30, hard: 50, switchCdS: 10, calmS: 5, tellS: 10, tellBusyS: 2 };

const { halfW: W, halfH: H, goalHalf: G } = PITCH;
/** 경기장 하나: 걸을 수 있는 땅은 줄(W, H)까지. 골대 기둥 넷은 둥근 장애물. 둘레에는 나무 */
export const MAP: MapDef = {
  areas: [{ id: 'pitch', x0: -W - 2, x1: W + 2, z0: -H - 2, z1: H + 2 }],
  edge: 2,
  seed: 21,
  spawn: { x: 0, z: -H + 1 },
  obstacles: [
    { x: -W, z: -G - 0.3, r: 0.3, tag: 'post' }, { x: -W, z: G + 0.3, r: 0.3, tag: 'post' },
    { x: W, z: -G - 0.3, r: 0.3, tag: 'post' }, { x: W, z: G + 0.3, r: 0.3, tag: 'post' },
  ],
  scatter: [{ kind: 'tree', count: 46, x0: -W - 22, x1: W + 22, pad: 14, s0: 0.8, s1: 0.6 }],
  // 경기장과 그 둘레 4m에는 나무를 두지 않는다
  isFree: (x, z) => Math.abs(x) > W + 6 || Math.abs(z) > H + 6,
  portals: {},
  portalClear: 0,
};
