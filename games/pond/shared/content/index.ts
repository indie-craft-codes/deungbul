// 반딧불 연못 (Firefly Pond): 넷이 둘러앉아 미끼 패를 엎어 던져 연못의 물고기를 낚는 판 게임.
// 틀의 판 모듈(rooms) 하나만 고른다. 전투·직업·아이템·재화가 없다. 판의 규칙은 shared/rules.ts, 서버의 판은 server/pond.ts.
import type { MapDef } from '@engine/shared/defs/map';
import type { ModuleId } from '@engine/shared/modules';
import { POND } from './pond';

export const MODULES: readonly ModuleId[] = ['rooms'];
export const GUEST_NAME = 'Angler';
/** 채널은 하나 (판마다 틀이 따로 된 층을 연다) */
export const CHANNEL = { count: 1, soft: 40, hard: 60, switchCdS: 10, calmS: 5, tellS: 10, tellBusyS: 2 };
/** 집이 없다: H 키를 달지 않는다 */
export const HOME_KEY = false;
/** 연못 하나가 화면에 꽉 차게: 판에 앉으면 화면이 fitZoom으로 맞춘다 */
export const CAMERA = { dist: 30, zoom: 1, zoomMin: 0.6, zoomMax: 1.6, gate: 1.1 };

export { POND };

// ---------- 맵: 들판 하나, 가운데 연못 ----------
export const MAP: MapDef = {
  areas: [{ id: 'meadow', x0: -30, x1: 30, z0: -30, z1: 30 }],
  edge: 2,
  seed: 23,
  spawn: { x: 0, z: POND.lobbyZ },
  obstacles: [{ x: 0, z: 0, r: POND.radius, tag: 'pond' }],
  scatter: [
    { kind: 'tree', count: 46, x0: -40, x1: 40, pad: 10, s0: 0.7, s1: 0.6 },
    { kind: 'rock', count: 10, x0: -26, x1: 26, pad: -4, s0: 0.5, s1: 0.6 },
  ],
  // 연못 둘레와 대기실 자리는 비워 둔다
  isFree: (x, z) => Math.hypot(x, z) > 13 && Math.hypot(x, z - POND.lobbyZ) > 7,
  portals: {},
  portalClear: 0,
};
