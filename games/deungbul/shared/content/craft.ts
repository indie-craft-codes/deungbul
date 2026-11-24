// 제작: 잿빛 숲의 몬스터가 떨어뜨린 재료를 브람의 대장간에 가져가 무기를 만든다. 수치는 모두 잠정값이다.
// 틀의 것(타입과 도우미 함수)과 이 게임의 것(표와 수치)이 한 파일에 있어 [틀] / [이 게임] 구역 주석으로 갈라 둔다 (파일은 9단계에서 갈린다).
import type { ItemId } from './items';
import type { MonsterId } from './monsters';
import { RESIDENTS, type ResidentId } from './residents';

// ===== [틀] 제작의 모양 =====
/** 대장간 하나: 이 자리에 가까이 서야 제작할 수 있다. needs는 잠금 열쇠다 (ItemDef.needs와 같다: 틀은 g.rules.unlocked(열쇠)에 묻기만 한다) */
export interface ForgeDef { x: number; z: number; needs?: string }

export interface Recipe {
  /** 만들어지는 아이템 */
  id: ItemId;
  gold: number;
  /** 필요한 재료와 수 */
  mats: Partial<Record<ItemId, number>>;
}

// ===== [이 게임] 대장간, 제작법, 재료 =====
/** 대장간을 여는 주민. 이 주민이 마을로 돌아와야 제작할 수 있다 */
export const SMITH: ResidentId = 'bram';
/** 대장간들. 지금은 하나다: 대장장이가 서 있는 곳이고, 그가 돌아와야 열린다. 대장간을 더하려면 여기에 한 줄 더한다 */
export const FORGES: readonly ForgeDef[] = [
  { x: RESIDENTS[0].x, z: RESIDENTS[0].z, needs: SMITH },
];
/** 첫 대장간의 자리 (화면과 시험이 이 이름으로 읽는다) */
export const SMITHY: { x: number; z: number } = FORGES[0];
/** 대장간에 이만큼 다가가야 제작할 수 있다 */
export const SMITHY_REACH = 4;
export const RECIPES: readonly Recipe[] = [
  // 등불검은 상점에서 골드로 살 수도 있다. 재료를 모으면 훨씬 싸다
  { id: 'sword3', gold: 40, mats: { iron: 4, hide: 2 } },
  // 쇠 갑옷도 재료를 모으면 싸게 만든다
  { id: 'armor2', gold: 60, mats: { iron: 5, hide: 6 } },
  // 잿불검은 제작으로만 얻는다. 잿빛 핵은 필드 보스가 준다
  { id: 'sword4', gold: 100, mats: { iron: 8, hide: 5, ashcore: 1 } },
];

/** 몬스터가 떨어뜨리는 재료. 피해를 준 사람 각자가 따로 굴린다 */
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {
  boar: { id: 'hide', chance: 0.5 },
  goblin: { id: 'iron', chance: 0.4 },
  lost_soldier: { id: 'iron', chance: 0.7 },
  ash_troll: { id: 'ashcore', chance: 1 },
};
