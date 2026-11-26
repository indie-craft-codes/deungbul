// 가방 창의 그림 칸을 정하는 셈: 어떤 아이템이 어떤 차례로 칸에 놓이고, 칸 귀퉁이에 무엇을 적는가. 화면 요소를 읽지 않는다 (시험: engine/test/fx/client.test.ts).
// 그리기는 hud/bag.ts.
import { ITEMS, itemDef, type ItemId } from '../../shared/defs';

/** 칸에 놓이는 아이템의 종류와 그 머리 이름(이름표): 이 차례로 늘어선다. 장비(무기·갑옷·장신구)는 메뉴의 장비 탭에서 다룬다 */
export const BAG_KINDS = [['potion', 'bagPotions'], ['mat', 'bagMats'], ['token', 'bagCharms']] as const;

/** 칸 귀퉁이의 든 수: 만 개부터는 '12k'처럼 줄인다 */
export const cellCount = (n: number): string => (n >= 10000 ? `${Math.floor(n / 1000)}k` : String(n));

export interface BagCell {
  id: ItemId;
  /** 든 수 */
  n: number;
  /** 칸 귀퉁이에 적는 글. 없으면(0개) null: 칸이 흐리게 보인다 */
  count: string | null;
}
/** 가방의 칸들: 물약 → 재료 → 특별한 물건(보호석 등), 같은 종류 안에서는 내용의 차례. 없는 것도 칸이 있다(흐리게: 무엇을 모을 수 있는지 보인다) */
export function bagCells(have: Readonly<Partial<Record<string, number>>>, ids: readonly ItemId[] = Object.keys(ITEMS) as ItemId[]): BagCell[] {
  return BAG_KINDS.flatMap(([k]) => ids.filter((id) => itemDef(id).kind === k)).map((id) => {
    const n = have[id] ?? 0;
    return { id, n, count: n > 0 ? cellCount(n) : null };
  });
}
