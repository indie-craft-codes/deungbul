// 아이템의 모양과 도우미. 아이템과 상점의 표는 게임의 내용에 있다 (@game/shared/content).
import { ITEMS, MAT_MAX, POTION_MAX, SHOPS, SHOP_REACH } from '@game/shared/content';

export interface ItemDef {
  /** mat: 제작 재료 (제작법의 모양은 engine/shared/defs/craft.ts의 Recipe, 표는 게임의 내용에 있다) */
  kind: 'weapon' | 'armor' | 'potion' | 'mat';
  price: number;
  /** 무기: 공격 피해에 곱하는 값 */
  damage?: number;
  /** 갑옷: 받는 피해에 곱하는 값 */
  guard?: number;
  /** 무기와 갑옷: 등급. 높은 것만 살 수 있다 */
  tier?: number;
  /** 물약: 회복량 */
  heal?: number;
  /** 이 아이템만의 한도. 없으면 종류의 한도를 따른다 (재료 MAT_MAX, 물약 POTION_MAX) */
  max?: number;
  /**
   * 잠금 열쇠: 이 조건이 풀려야 상점에 들어온다. 틀은 열쇠의 뜻을 모르고 g.rules.unlocked(열쇠)에 묻기만 한다.
   * 이 게임에서는 돌아와야 하는 주민의 id다 (아래 ITEMS에서 satisfies ResidentId로 오타를 잡는다)
   */
  needs?: string;
}

export type ItemId = keyof typeof ITEMS;
export const isItemId = (v: unknown): v is ItemId => typeof v === 'string' && Object.hasOwn(ITEMS, v);
export const itemDef = (id: ItemId): ItemDef => ITEMS[id];
/** 그 아이템을 들 수 있는 한도: 재료와 물약은 종류마다의 한도(아이템에 제 한도 max가 적혀 있으면 그것), 낱개 장비로 다루는 무기와 갑옷은 0이다 (서버의 가방 통로 systems/bag.ts와 저장 읽기, 화면이 함께 쓴다) */
export const itemCap = (id: ItemId): number => { const def = itemDef(id); return def.kind === 'mat' ? def.max ?? MAT_MAX : def.kind === 'potion' ? def.max ?? POTION_MAX : 0; };
/** 이 자리에서 닿는 상인이 있는가 */
export const nearShop = (at: { x: number; z: number }): boolean => SHOPS.some((s) => Math.hypot(at.x - s.x, at.z - s.z) <= SHOP_REACH);
