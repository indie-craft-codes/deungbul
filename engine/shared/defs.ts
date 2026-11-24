// 게임 내용 정의를 한곳에서 내보낸다. 새 내용은 shared/content/에 파일을 더하고 여기에 한 줄 추가한다.
export * from '@game/shared/content/combat';
export * from '@game/shared/content/craft';
export * from '@game/shared/content/dungeons';
export * from '@game/shared/content/economy';
export * from '@game/shared/content/growth';
export * from '@game/shared/content/items';
export * from '@game/shared/content/monsters';
export * from '@game/shared/content/party';
export * from '@game/shared/content/quests';
export * from '@game/shared/content/raid';
export * from '@game/shared/content/residents';
export * from '@game/shared/content/social';
export * from '@game/shared/content/tower';
// 맵 정의는 shared/world.ts가 통째로 다시 내보낸다. 여기서는 내용 계약(shared/contract.ts)이 요구하는 MAP만 내보낸다
export { MAP } from '@game/shared/content/map';
