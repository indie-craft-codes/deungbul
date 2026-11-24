// 제작의 모양. 대장간과 제작법의 표는 게임의 내용에 있다 (@game/shared/content).
import type { ItemId } from './items';

/** 대장간 하나: 이 자리에 가까이 서야 제작할 수 있다. needs는 잠금 열쇠다 (ItemDef.needs와 같다: 틀은 g.rules.unlocked(열쇠)에 묻기만 한다) */
export interface ForgeDef { x: number; z: number; needs?: string }

export interface Recipe {
  /** 만들어지는 아이템 */
  id: ItemId;
  gold: number;
  /** 필요한 재료와 수 */
  mats: Partial<Record<ItemId, number>>;
}
