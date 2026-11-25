// 아이템과 상점, 그리고 등불 맡기기(휴식 보너스). 이름과 설명은 언어 파일에 있다. 수치는 모두 잠정값이다.
// 모양(ItemDef)과 도우미(itemDef, nearShop 등)는 틀에 있다: engine/shared/defs/items.ts
import type { ItemDef, ItemId } from '@engine/shared/defs/items';
import { DUST_MAX, PRICES, REST } from './economy';
import type { ResidentId } from './residents';

// 경제 수치는 economy.ts에 모았다: 상점의 값(PRICES)은 아래 표가 거기서 읽고, 들 수 있는 한도(POTION_MAX, MAT_MAX)와 휴식 보너스(REST)는 거기에 있고 여기서 다시 내보낸다
export { DUST_MAX, MAT_MAX, POTION_MAX, REST } from './economy';

export const ITEMS = {
  sword1: { kind: 'weapon', price: 0, damage: 1, tier: 1 },
  sword2: { kind: 'weapon', price: PRICES.sword2, damage: 1.2, tier: 2 },
  sword3: { kind: 'weapon', price: PRICES.sword3, damage: 1.45, tier: 3, needs: 'bram' satisfies ResidentId },
  // 제작으로만 얻는다 (price 0은 상점에서 팔지 않는다는 뜻)
  sword4: { kind: 'weapon', price: 0, damage: 1.75, tier: 4 },
  // 잿불 고원(장비 레벨 7·8)의 무기. 예전에는 레벨 6 이상이 모두 잿불검이라 새 장비가 새롭지 않았다 (검토 7)
  // 불꽃검: 고원 몬스터가 떨어뜨리고 대장간에서도 만든다. 거상의 검: 잿불 거상만 떨어뜨린다
  sword5: { kind: 'weapon', price: 0, damage: 2.1, tier: 5 },
  sword6: { kind: 'weapon', price: 0, damage: 2.5, tier: 6 },
  // 갑옷: 한 벌만 입는다. 쇠 갑옷은 상점에서 사거나 대장간에서 만든다
  armor1: { kind: 'armor', price: PRICES.armor1, guard: 0.88, tier: 1 },
  armor2: { kind: 'armor', price: PRICES.armor2, guard: 0.76, tier: 2, needs: 'bram' satisfies ResidentId },
  // 잿불 갑옷: 고원 몬스터가 떨어뜨리고 대장간에서도 만든다
  armor3: { kind: 'armor', price: 0, guard: 0.66, tier: 3 },
  potion: { kind: 'potion', price: PRICES.potion, heal: 80 },
  tonic: { kind: 'potion', price: PRICES.tonic, heal: 160, needs: 'mira' satisfies ResidentId },
  // 제작 재료: 잿빛 숲의 몬스터가 떨어뜨린다
  hide: { kind: 'mat', price: 0 },
  iron: { kind: 'mat', price: 0 },
  ashcore: { kind: 'mat', price: 0 },
  // 잿불 조각: 잿불 고원의 파수꾼과 거상이 떨어뜨린다. 고원의 장비를 만드는 데 든다
  ember: { kind: 'mat', price: 0 },
  // 장비 가루: 장비를 분해하면 나온다 (economy.ts의 SALVAGE). 다른 재료처럼 거래소에 올릴 수 있고, 한도만 따로 크다
  dust: { kind: 'mat', price: 0, max: DUST_MAX },
  // 강화 보호 부적: +7 이상에서 강화에 실패해도 단계가 내려가지 않는다 (economy.ts의 ENHANCE.charm). 출석 7일째와 일일 임무로 받고, 거래소에 올릴 수 없다
  ward: { kind: 'token', price: 0, max: 99 },
} as const satisfies Record<string, ItemDef>;

/** 처음 들고 있는 무기 */
export const START_WEAPON: ItemId = 'sword1';
/** 상점에 놓이는 순서 */
export const SHOP_STOCK: readonly ItemId[] = ['potion', 'tonic', 'sword2', 'sword3', 'armor1', 'armor2'];
/** 상인이 서 있는 자리들. tower는 그 상인이 바라보는 등탑(TOWERS의 번호). 상인을 더하려면 여기에 한 줄 더한다 */
export const SHOPS: readonly { x: number; z: number; tower: number }[] = [
  { x: -5.5, z: 7, tower: 0 }, // 첫불 마을의 길 상인
  { x: 114.5, z: 7, tower: 1 }, // 잿빛 숲 등탑 곁의 상인: 숲 끝에서 물약이 떨어져도 마을까지 돌아가지 않게
  { x: 214.5, z: 7, tower: 2 }, // 잿불 고원 등탑 곁의 상인 (같은 까닭)
];
/** 첫불 마을의 상인 (퀘스트가 가리키는 곳) */
export const SHOP = SHOPS[0];
export const SHOP_REACH = 5;
/** 물약을 마신 뒤 다시 마실 수 있을 때까지(초) */
export const POTION_CD = 8;

/** 쉰 시간(ms)으로 새로 쌓이는 휴식 보너스를 구한다 (등불 맡기기: 수치는 economy.ts의 REST). */
export function restGain(awayMs: number): number {
  if (!(awayMs >= REST.minMin * 60000)) return 0;
  return Math.min(REST.cap, Math.floor((awayMs / 3600000) * REST.expPerHour));
}
