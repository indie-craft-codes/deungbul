// 이 게임(등불지기)의 내용 가운데 틀이 읽는 것: 내용 계약(engine/shared/contract.ts)이 요구하는 이름들이 여기서 나온다.
// 틀은 이 파일을 별칭으로 읽는다(@game/shared/content): 다른 게임은 같은 이름을 같은 모양으로 내보내는 자기 파일을 두고 별칭이 가리키는 폴더를 바꾼다.
// 여기에는 틀에서 값을 가져오는 파일을 넣지 않는다 (타입만 가져온다): 틀의 도우미가 이 파일의 값을 읽으므로, 서로 값을 읽으면 초기화 순서가 꼬인다.
// 이 게임에만 있는 내용(등탑 tower.ts, 습격 raid.ts, 주민 residents.ts, 퀘스트 quests.ts)은 넣지 않는다: 이 게임의 파일이 ../defs로 읽는다.
export * from './combat';
export * from './craft';
export * from './dungeons';
export * from './economy';
export * from './growth';
export * from './items';
export * from './monsters';
export * from './party';
export * from './social';
export { MAP } from './map';
