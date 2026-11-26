// 이 게임(등불지기)의 월드 통로: 틀의 월드(엔진 상수, buildWorld, 맵 정의에서 꺼낸 것)에 이 게임의 맵(등탑, 연못, 빈터, 길, 구역)을 더해 내보낸다.
// 이 게임의 파일은 맵을 여기서 읽는다. 틀의 파일은 이 파일을 import하지 않는다 (틀은 engine/shared/world.ts에서 MAP과 그것에서 꺼낸 것만 읽는다).
export * from '@engine/shared/world';
// 맵 정의(MAP)는 틀의 월드가 내보낸다. 여기서는 이 게임만의 이름을
export { CLEARINGS, HOUSES, MAX_X, MAX_Z, MIN_X, MIN_Z, PILLARS, POND, TOWER, TOWERS, TOWN, ZONE_COUNT, ZONE_SPLIT, ZONE_SPLIT2, isFree, onPath, zoneOf, type TowerDef } from './content/map';
