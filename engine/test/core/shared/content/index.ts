// 틀의 '핵심만' 시험용 내용("공 마당"): 선택 모듈을 하나도 고르지 않는다. 전투·직업·아이템·장비·재화·몬스터가 없다.
// 핵심 계약(MAP, MODULES)과 핵심의 수치 몇 개만 적는다: 나머지 이름은 틀의 기본값이 채운다 (engine/shared/content.ts).
// 이 내용 위에서 틀만의 타입 검사(engine/test/core/tsconfig.json)와 서버 시험(engine/test/core/*.test.ts)이 돈다.
// 게임의 엔티티 종류(공)는 내용이 아니라 시험의 규칙 플러그인이 등록한다 (core.test.ts의 balls).
// 별칭 @game이 이 폴더를 가리키는 것은 engine/test/core/tsconfig.json뿐이다. 뿌리의 tsconfig.json은 이 폴더를 빼고 검사한다.
import type { MapDef } from '@engine/shared/defs/map';
import type { ModuleId } from '@engine/shared/modules';

/** 쓸 모듈: 없다 (핵심만) */
export const MODULES: readonly ModuleId[] = [];
export const GUEST_NAME = 'Picker';
/** 시야를 기본(32m)과 다르게: 틀이 시야를 박아 두지 않고 내용에서 읽는지 시험이 본다 */
export const NET = { tickMs: 50, snapEvery: 2, aoi: 20, aoiLeave: 24 };
/** 채널은 하나 */
export const CHANNEL = { count: 1, soft: 30, hard: 50, switchCdS: 10, calmS: 5, tellS: 10, tellBusyS: 2 };

// ---------- 맵: 마당 하나와 우물 하나 ----------
export const MAP: MapDef = {
  areas: [{ id: 'yard', x0: -40, x1: 40, z0: -40, z1: 40 }],
  edge: 2,
  seed: 5,
  spawn: { x: 0, z: 0 },
  obstacles: [{ x: 10, z: 0, r: 2, tag: 'well' }],
  scatter: [{ kind: 'rock', count: 6, x0: -36, x1: 36, pad: -4, s0: 0.6, s1: 0.5 }],
  isFree: (x, z) => Math.hypot(x, z) > 12,
  portals: {},
  portalClear: 0,
};

// ---------- 이 '게임'만의 것 (틀은 읽지 않는다: 시험만 읽는다) ----------
/** 공을 놓는 자리 */
export const BALL_SPOTS: readonly { x: number; z: number }[] = [{ x: 4, z: 3 }, { x: -6, z: 5 }, { x: 30, z: 30 }];
