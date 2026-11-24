// 아이템과 상점, 그리고 등불 맡기기(휴식 보너스). 이름과 설명은 언어 파일에 있다. 수치는 모두 잠정값이다.
// 모양(ItemDef)과 도우미(itemDef, nearShop 등)는 틀에 있다: engine/shared/defs/items.ts
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import type { ResidentId } from './residents';

export const ITEMS = {
  sword1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  sword2: { kind: 'weapon', price: 60, damage: 1.2, tier: 2 },
  sword3: { kind: 'weapon', price: 180, damage: 1.45, tier: 3, needs: 'bram' satisfies ResidentId },
  // 제작으로만 얻는다 (price 0은 상점에서 팔지 않는다는 뜻)
  sword4: { kind: 'weapon', price: 0, damage: 1.75, tier: 4 },
  // 갑옷: 한 벌만 입는다. 쇠 갑옷은 상점에서 사거나 대장간에서 만든다
  armor1: { kind: 'armor', price: 80, guard: 0.88, tier: 1 },
  armor2: { kind: 'armor', price: 240, guard: 0.76, tier: 2, needs: 'bram' satisfies ResidentId },
  potion: { kind: 'potion', price: 15, heal: 80 },
  tonic: { kind: 'potion', price: 35, heal: 160, needs: 'mira' satisfies ResidentId },
  // 제작 재료: 잿빛 숲의 몬스터가 떨어뜨린다
  hide: { kind: 'mat', price: 0 },
  iron: { kind: 'mat', price: 0 },
  ashcore: { kind: 'mat', price: 0 },
} as const satisfies Record<string, ItemDef>;

/** 처음 들고 있는 무기 */
export const START_WEAPON: ItemId = 'sword1';
/** 상점에 놓이는 순서 */
export const SHOP_STOCK: readonly ItemId[] = ['potion', 'tonic', 'sword2', 'sword3', 'armor1', 'armor2'];
/** 상인이 서 있는 자리들. tower는 그 상인이 바라보는 등탑(TOWERS의 번호). 상인을 더하려면 여기에 한 줄 더한다 */
export const SHOPS: readonly { x: number; z: number; tower: number }[] = [
  { x: -5.5, z: 7, tower: 0 }, // 첫불 마을의 길 상인
  { x: 114.5, z: 7, tower: 1 }, // 잿빛 숲 등탑 곁의 상인: 숲 끝에서 물약이 떨어져도 마을까지 돌아가지 않게
];
/** 첫불 마을의 상인 (퀘스트가 가리키는 곳) */
export const SHOP = SHOPS[0];
export const SHOP_REACH = 5;
/** 물약은 종류마다 이만큼까지 들 수 있다 */
export const POTION_MAX = 10;
/** 재료는 종류마다 이만큼까지 들 수 있다 */
export const MAT_MAX = 99;
/** 물약을 마신 뒤 다시 마실 수 있을 때까지(초) */
export const POTION_CD = 8;

/**
 * 등불 맡기기: 접속을 끊으면 등불이 등탑에 걸리고, 쉬는 동안 휴식 보너스가 쌓인다.
 * 다음에 몬스터를 잡을 때 쌓인 만큼 경험치를 더 받는다 (한 마리당 그 몬스터의 경험치만큼, 즉 2배).
 */
export const REST = {
  /** 이보다 짧게 쉬면 쌓이지 않는다(분) */
  minMin: 10,
  /** 시간당 쌓이는 보너스 경험치 */
  expPerHour: 40,
  /** 쌓이는 한도 (8시간분) */
  cap: 320,
};
/** 쉰 시간(ms)으로 새로 쌓이는 휴식 보너스를 구한다. */
export function restGain(awayMs: number): number {
  if (!(awayMs >= REST.minMin * 60000)) return 0;
  return Math.min(REST.cap, Math.floor((awayMs / 3600000) * REST.expPerHour));
}
