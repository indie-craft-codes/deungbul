// 잊힌 주민. 서버 전체가 불씨를 모아 순서대로 한 명씩 되돌린다.
// 되돌아오면 마을에 자리를 잡고, 상점에 새 물건이 들어온다 (shared/content/items.ts의 needs).

export interface ResidentDef {
  id: string;
  /** 되돌리는 데 필요한 불씨 */
  need: number;
  /** 마을에서 서 있을 자리 */
  x: number; z: number;
}

export const RESIDENTS = [
  { id: 'bram', need: 30, x: -5.5, z: -1.5 }, // 대장장이: 상점에 등불검이 들어온다
  { id: 'mira', need: 60, x: 5.5, z: -1.5 }, // 약초꾼: 상점에 진한 물약이 들어온다
  { id: 'halmeom', need: 100, x: 2.6, z: -5.6 }, // 등탑지기: 오늘의 등탑지기 명단과 기여 단계 보상이 열린다
] as const satisfies readonly ResidentDef[];
export type ResidentId = (typeof RESIDENTS)[number]['id'];
