// 틀의 공용 입구: 게임의 규칙·화면·시험이 틀의 공용 코드에서 읽는 것.
// 입구는 이것과 '@engine/server', '@engine/client', '@engine/client/i18n'(언어), '@engine/testing'(시험 도구)이다. 게임은 이 밖의 틀 파일을 깊게 읽지 않는다 (engine/test/boundary.test.ts가 검사한다).
// 내용 정의의 타입과 도우미는 내용 통로 '@engine/shared/defs', 맵은 '@engine/shared/world'에서 읽는다 (게임의 통로 defs.ts·world.ts가 다시 내보낸다).
// 게임의 내용 파일(shared/content/)만은 '@engine/shared/defs/*'에서 타입을, '@engine/shared/defaults'에서 기본값을 읽는다: 통로를 값으로 읽으면 초기화 순서가 꼬인다.
export type { ClientMsg, ServerMsg, WorldState } from './protocol';
export type { MsgArg, MsgKey } from './messages';
export { AUTO, AWAY, POTIONS, pickPotion, potionOrder } from './auto';
export { NavGrid, walk, type Walker } from './nav';
export { PROTOCOL } from './protocol';
export { ALL_MODULES, MODULE_TABLE, RPG_MODULES, checkModules, type ModuleId } from './modules';
// 판(rooms 모듈)의 모양 (서버·화면·시험이 함께 읽는다: 개인 상태 room, 공유 상태 rooms)
export type { RoomLobby, RoomPhase, RoomRow, RoomSeatView, RoomView } from './defs/rooms';
