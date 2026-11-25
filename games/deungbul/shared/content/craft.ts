// 제작: 잿빛 숲의 몬스터가 떨어뜨린 재료를 브람의 대장간에 가져가 무기를 만든다. 수치는 모두 잠정값이다.
// 모양(ForgeDef, Recipe)은 틀에 있다: engine/shared/defs/craft.ts
import type { ForgeDef } from '@engine/shared/defs/craft';
import type { ItemId } from '@engine/shared/defs/items';
import type { MonsterId } from '@engine/shared/defs/monsters';
import { RESIDENTS, type ResidentId } from './residents';

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
// 제작에 드는 골드와 재료(RECIPES)는 economy.ts에 있다
export { RECIPES } from './economy';

/** 몬스터가 떨어뜨리는 재료. 피해를 준 사람 각자가 따로 굴린다 */
export const DROPS: Partial<Record<MonsterId, { id: ItemId; chance: number }>> = {
  boar: { id: 'hide', chance: 0.5 },
  goblin: { id: 'iron', chance: 0.4 },
  lost_soldier: { id: 'iron', chance: 0.7 },
  ash_troll: { id: 'ashcore', chance: 1 },
  // 잿불 고원: 여우는 가죽, 약탈자는 쇳조각, 파수꾼과 거상은 잿불 조각 (검토 7: 고원 몬스터는 재료를 떨어뜨리지 않았다)
  cinder_fox: { id: 'hide', chance: 0.4 },
  highland_raider: { id: 'iron', chance: 0.5 },
  ember_warden: { id: 'ember', chance: 0.5 },
  ember_colossus: { id: 'ember', chance: 1 },
};
