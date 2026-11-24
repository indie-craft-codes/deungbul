// 이 게임(등불지기)의 내용 통로: 틀의 통로(타입, 도우미, 계약이 요구하는 내용)에 이 게임에만 있는 내용을 더해 내보낸다.
// 이 게임의 파일(규칙 시스템, 화면, 도감, 시험)은 내용을 여기서 읽는다. 틀의 파일은 이 파일을 import하지 않는다 (틀의 통로는 engine/shared/defs.ts).
// 새 내용이 틀도 읽는 것이면 content/index.ts와 계약에, 이 게임에만 있는 것이면 content/에 파일을 만들고 여기에 한 줄 더한다.
export * from '@engine/shared/defs';
// 계약의 파일들에 함께 들어 있는 이 게임만의 이름 (SMITH, SMITHY, SHOP, restGain 등)
export * from './content';
// 이 게임에만 있는 내용
export * from './content/quests';
export * from './content/raid';
export * from './content/residents';
export * from './content/rift';
export * from './content/tower';
