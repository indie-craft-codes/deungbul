// 내용의 이름표: 틀의 문장이 문장 안에 넣는 내용의 이름들. 게임의 언어 파일이 채워 틀의 문장 묶음(koBase, enBase)에 넘긴다.
// 이름이 빠지면 컴파일되지 않는다: 칸의 열쇠가 내용 정의의 id 타입이다 (몬스터를 더하고 이름을 안 적으면 오류).
import { BUILD_STAT_IDS, CLASS_IDS, DAILY_IDS, DUNGEON_IDS, GEAR_SLOTS, ITEMS, MONSTERS, RARITIES, SKILL_DEFS, handOf } from '../../shared/defs';
import type { BuildStat, ClassId, DailyId, DungeonId, GearSlot, ItemId, MonsterId, SkillId } from '../../shared/defs';
import type { MsgArg } from '../../shared/messages';

/** 아이템 하나의 이름. 손 모양의 id를 칸 이름으로 쓴다 (sword는 name이다) */
export interface ItemNames { name: string; info?: string; bow?: string; staff?: string; [hand: string]: string | undefined }

export interface ContentNames {
  monsters: Record<MonsterId, string>;
  /**
   * bow, staff (그리고 게임이 등록한 손 모양의 id): 그 손의 직업에게 보이는 이름 (같은 등급의 활, 지팡이 …). 칸이 없으면 name.
   * info: 수치가 아닌 설명 (수치로 된 효과는 정의의 값으로 만든다: ko.ts의 itemInfo)
   */
  items: Record<ItemId, ItemNames>;
  classes: Record<ClassId, { name: string; info: string }>;
  skills: Record<SkillId, { name: string; info: string }>;
  dungeons: Record<DungeonId, { name: string; info: string }>;
  dailies: Record<DailyId, string>;
  /** 장비 칸의 이름 (GEAR_SLOTS) */
  gearSlots: Record<GearSlot, string>;
  /** 장비 등급의 이름 (RARITIES의 id). 보급형·제작은 틀의 낱말이라 틀의 언어 파일에 있다 */
  rarities: Record<string, string>;
  /** 찍을 수 있는 능력치의 이름 (BUILD_STATS). 주는 것의 문장은 능력치가 드는 효과(mod)로 틀이 만든다 */
  buildStats: Record<BuildStat, string>;
  /** 쓰러진 뒤 다시 일어나는 곳의 이름 (안내문 'died'의 값). 없는 id는 id가 그대로 보인다 */
  places: Record<string, string>;
  /** 첫 번째 재화(gold 칸)의 이름. name: 값 앞에 붙이는 이름('골드 100', 'Gold 100'), unit: 수 뒤에 붙이는 낱말('100골드', '100 gold'). 적지 않으면 골드 */
  currency1?: { name: string; unit: string };
  /** 두 번째 재화의 이름. name: 값 앞에 붙이는 이름, one: 수를 셀 때의 낱말 (영어의 단수형). 그 재화를 쓰지 않는 게임(몬스터 정의에 sparks가 없다)은 적지 않는다: 틀의 문장에서 그 몫이 빠진다 */
  currency2?: { name: string; one: string };
  /** 처음 접속할 때 붙이는 무작위 이름의 재료 */
  nameA: string[];
  nameB: string[];
}

/** 아이템의 이름을 내는 함수. 무기는 직업에 따라 이름이 다르다 (검 / 활 / 지팡이). 모르는 id는 그대로 돌려준다 */
export const itemNameOf = (items: ContentNames['items']) => (id: MsgArg, cls?: MsgArg): string => {
  const it = items[id as ItemId];
  if (!it) return String(id);
  const hand = handOf(cls);
  return (hand !== 'sword' && hand !== 'name' && hand !== 'info' && it[hand]) || it.name;
};

/**
 * 던전의 이름표를 문자열 id로 읽는다. 없는 id는 id가 그대로 이름이 된다.
 * 던전이 없는 게임에서는 DungeonId가 never라서 이름표(dungeons[id])를 바로 읽으면 컴파일되지 않는다: 틀의 문장과 화면은 이것으로 읽는다
 */
export const dungeonLabel = (n: Pick<ContentNames, 'dungeons'>, id: MsgArg): { name: string; info: string } =>
  (n.dungeons as Record<string, { name: string; info: string } | undefined>)[String(id)] ?? { name: String(id), info: '' };

const byId = <K extends string, V>(ids: readonly K[], make: (id: K) => V): Record<K, V> => Object.fromEntries(ids.map((id) => [id, make(id)])) as Record<K, V>;
const keysOf = <T extends object>(o: T) => Object.keys(o) as (keyof T & string)[];
/**
 * 이름표가 없을 때의 이름표: id가 그대로 이름이 된다. 게임이 언어 묶음을 등록하지 않았을 때(틀만 띄웠을 때) 틀의 화면이 서게 하는 기본값이다.
 * 실제 게임에서는 화면에 나오지 않는다 (게임이 setLocales로 자기 묶음을 등록한다). 함수인 까닭: 쓰지 않는 쪽(도감)의 번들에 딸려 가지 않게
 */
export const idNames = (): ContentNames => ({
  monsters: byId(keysOf(MONSTERS), (id) => id),
  items: byId(keysOf(ITEMS), (id) => ({ name: id })),
  classes: byId(CLASS_IDS, (id) => ({ name: id, info: '' })),
  skills: byId(keysOf(SKILL_DEFS), (id) => ({ name: id, info: '' })),
  dungeons: byId(DUNGEON_IDS, (id) => ({ name: id, info: '' })),
  dailies: byId(DAILY_IDS, (id) => id),
  gearSlots: byId(GEAR_SLOTS, (id) => id),
  rarities: Object.fromEntries(RARITIES.map((r) => [r.id, r.id])),
  buildStats: byId(BUILD_STAT_IDS, (id) => id),
  places: {},
  nameA: ['Player'],
  nameB: [''],
});
