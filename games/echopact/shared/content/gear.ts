// 울림골(들판)의 장비 내용: 떨어지는 무기·갑옷의 바탕, 분해(울림 가루)의 양, 가루를 쓰는 강화의 값, 드롭 확률 공개 표의 이름. 몬스터마다의 드롭 확률은 index.ts의 MONSTERS(gearChance).
// 장치(드롭·분해·자동 분해·강화·드롭의 확률표)는 모두 틀의 것이다(engine/server/game/systems/gear.ts, salvage.ts, engine/shared/defs/odds.ts의 gearDropTables). 여기는 수치와 이름만. index.ts가 다시 내보낸다.
// 수치와 까닭은 docs/proof-echopact.md '장비 드롭과 분해'. 카드 경제(울림 조각·뽑기)로 바꾸는 길은 없다: 가루는 울림골 장비의 강화에만 쓴다.
import type { ItemDef } from '@engine/shared/defs/items';
import type { LangText } from '@engine/shared/defs/live';
import { ENHANCE as BASE_ENHANCE, RARITIES } from '@engine/shared/defaults';

/**
 * 떨어지기만 하는 무기·갑옷의 바탕과 울림 가루. 바탕의 수치는 상점의 같은 등급보다 낮다(울림골 검 1.1 < 울림강 검 1.25, 돌뿔 갑옷 0.85 > 사슬 갑옷 0.8):
 * 떨어진 장비는 옵션과 +10까지의 강화로 앞서고, 상점의 장비는 바로 사서 끼는 값어치가 남는다. 값 0은 상점에 없다는 뜻 (SHOP_STOCK에 넣지 않는다)
 */
export const GEAR_ITEMS = {
  valeblade: { kind: 'weapon', price: 0, damage: 1.1, tier: 1 },
  hornblade: { kind: 'weapon', price: 0, damage: 1.2, tier: 2 },
  valecoat: { kind: 'armor', price: 0, guard: 0.92, tier: 1 },
  hornmail: { kind: 'armor', price: 0, guard: 0.85, tier: 2 },
  // 분해하면 나오는 가루: 강화(+5부터)에만 쓴다. 한 장비를 +10까지 올리는 데 수백이 들 수 있어 한도를 넉넉히
  echodust: { kind: 'mat', price: 0, max: 999 },
} as const satisfies Record<string, ItemDef>;

/** 장비 레벨(GEAR.levelOf: 이끼둥이 1, 가시멧돼지 2, 돌뿔소 5)이 4 이상이면 돌뿔의 바탕 */
export const weaponFor = (lv: number): keyof typeof GEAR_ITEMS => (lv >= 4 ? 'hornblade' : 'valeblade');
export const armorFor = (lv: number): keyof typeof GEAR_ITEMS => (lv >= 4 ? 'hornmail' : 'valecoat');

/** 강화: 틀의 기본(+10까지, 성공 100%에서 단계마다 −10%p·바닥 20%, 골드 30 × (단계+1) × (등급+1), 실패해도 내려가지 않음·파괴 없음)에 울림 가루를 더한다 */
export const ENHANCE = {
  ...BASE_ENHANCE,
  /** +5부터 한 번에 (단계−3) × (등급+1)개. 상점의 장비(보급형)는 +5까지만이라 가루가 들지 않는다 (전과 같다) */
  dust: (plus: number, rar: number): number => (plus >= 5 ? (plus - 3) * (rar + 1) : 0),
};

/** 분해: 등급(평범한·쓸 만한·희귀한·빛나는)별 울림 가루 + 강화 단계마다 1. 낀 것·잠근 것·상점의 장비는 안 된다(틀). 자동 분해는 희귀한까지 고를 수 있다 */
export const SALVAGE = { item: 'echodust', dust: [1, 3, 8, 20] as readonly number[], perPlus: 1, maxBatch: 30, autoMaxRar: 2, tellS: 10 };

// ---------- 확률 공개의 이름: 틀이 만드는 몬스터마다 '처치 한 번의 장비' 표(ODDS.drops)의 표·결과 이름 (공개 페이지와 확률 탭) ----------
const RAR_NAMES: readonly LangText[] = [{ ko: '평범한 장비', en: 'Common gear' }, { ko: '쓸 만한 장비', en: 'Uncommon gear' }, { ko: '희귀한 장비', en: 'Rare gear' }, { ko: '빛나는 장비', en: 'Epic gear' }];
const MONSTER_NAMES: Readonly<Record<string, LangText>> = { mossling: { ko: '이끼둥이', en: 'Mossling' }, thornboar: { ko: '가시멧돼지', en: 'Thorn Boar' }, stonehorn: { ko: '돌뿔소', en: 'Stonehorn' } };
/** 표와 결과의 이름 (ODDS.names에 더한다). 결과 id는 틀의 것: 'gear:none', 'gear:<등급 id>' */
export const DROP_NAMES: Readonly<Record<string, LangText>> = {
  ...Object.fromEntries(Object.entries(MONSTER_NAMES).map(([m, n]) => [`drop:${m}`, { ko: `${n.ko} 처치 한 번의 장비`, en: `Gear per ${n.en} kill` }])),
  'gear:none': { ko: '없음', en: 'Nothing' },
  ...Object.fromEntries(RAR_NAMES.map((n, i) => [`gear:${RARITIES[i].id}`, n])),
};
