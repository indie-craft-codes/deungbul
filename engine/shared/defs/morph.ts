// 변신 (선택 모듈 morph)의 모양: 가진 캐릭터 정의(engine/shared/defs/chardef.ts)로 바뀌는 규칙과 줄 위의 모양.
// 서버는 engine/server/game/systems/morph.ts, 화면은 engine/client/hud/morph.ts. 규칙은 게임의 내용 MORPH_RULES (적지 않으면 아래의 기본값: 겉모습만 바뀌고 힘은 그대로).
import { MORPH_RULES } from '../content';
import type { CharDef } from './chardef';
import { heroDef, isHeroId, rarityDef, type OwnedHero } from './collect';
import { classOf, maxHpFor } from './combat';
import { heroFull } from './herogrow';

/**
 * 변신한 동안의 보정 (서버의 g.mods로 건다): damage 주는 피해 +비율(0.1이면 +10%), guard 받는 피해 −비율, crit 치명타 확률 +, regen 자연 회복 +비율.
 * 전투(combat)를 고르지 않은 게임에서는 아무 일도 하지 않는다
 */
export interface MorphMods { damage?: number; guard?: number; crit?: number; regen?: number }
export const MORPH_MOD_KEYS = ['damage', 'guard', 'crit', 'regen'] as const;

/** 변신의 규칙 (내용의 MORPH_RULES) */
export interface MorphRules {
  /** 한 번 변신이 이어지는 시간(초). 0이면 스스로 풀 때까지 */
  durationS: number;
  /** 변신이 끝난 뒤(풀었거나 시간이 다 됐다) 다시 변신할 수 있을 때까지(초) */
  cooldownS: number;
  /** 맞은 지 이 초가 지나지 않았으면 변신할 수 없다 (전투 중 금지). 0이면 언제나 */
  noFightS: number;
  /**
   * 정의마다의 보정 (없으면 겉모습만: 보정 0). 돌려준 값은 cap으로 자른다.
   * 둘째 인자 grow: 그 사람이 그 캐릭터를 키운 만큼 (fromRoster인 게임에서 영웅으로 가졌으면 { lv, stars }, 아니면 undefined)
   */
  mods?: (def: CharDef, grow?: MorphGrowth) => MorphMods | null | undefined;
  /**
   * 능력치 대체 방식 (선택: 적으면 이 방식이다). 변신한 동안 사람의 **기본** 최대 체력과 기본 공격(직업의 기본 공격 한 번의 가운데 값)을
   * 카드(그 캐릭터의 지금 능력치)에서 셈한 값으로 바꾼다. 장비·버프·강화의 보정은 그 위에 그대로 곱하고 더한다. 기술의 피해도 같은 비율로 커진다.
   * 셈은 이것 한 곳이다: 서버의 싸움과 화면(카드의 '변신 시 능력치', 변신 탭)이 같은 함수(morphStats)를 쓴다. 적지 않으면 보정(mods) 방식이다
   */
  stats?: (card: MorphCard) => MorphStats;
  /**
   * 변신의 소유를 영웅의 소유에서 읽는다 (roster를 함께 고른 게임): 가진 변신 = 가진 영웅 ∩ 캐릭터 정의. 따로 저장하지 않고 맞추지 않아도 된다.
   * 그러면 grant는 영웅을 주고(g.roster.grant), take는 하지 않는다(영웅을 거두는 길은 틀에 없다). maxOwn은 쓰지 않는다
   */
  fromRoster?: boolean;
  /** 보정의 상한 (칸마다. 없는 칸은 자르지 않는다. guard는 0.9까지만 받는다) */
  cap?: MorphMods;
  /** 한 사람이 가질 수 있는 캐릭터의 수 */
  maxOwn: number;
}
export const MORPH_RULE_VIEW: MorphRules = MORPH_RULES;

/** 그 사람이 그 캐릭터를 키운 만큼 (영웅으로 가졌을 때) */
export interface MorphGrowth { lv: number; stars: number }
/**
 * 카드: 그 캐릭터의 지금 능력치. 영웅으로 가졌으면 영웅 탭의 카드와 같은 셈(heroFull: 레벨·별·각성·장비까지)의 공격·체력, 아니면 정의의 능력치.
 * who는 변신하는 사람 (레벨: 사람의 성장을 변신에 섞고 싶은 게임이 쓴다)
 */
export interface MorphCard { def: CharDef; atk: number; hp: number; lv: number; stars: number; who: { lv: number } }
/** 능력치 대체 방식의 결과: 변신한 동안의 기본 최대 체력과 기본 공격 한 번의 크기 */
export interface MorphStats { hp: number; atk: number }

/** 능력치 대체 방식인가 (MORPH_RULES.stats를 적었다) */
export const morphUsesStats = (): boolean => typeof MORPH_RULE_VIEW.stats === 'function';

/**
 * 그 캐릭터의 카드 (owned: 영웅으로 가진 것. 없으면 정의의 능력치로 1레벨·처음 별). worn은 그 영웅이 낀 장비 (영웅 장비를 쓰는 게임).
 * 영웅의 표에 없는 정의(roster가 없는 게임)는 정의의 atk·hp 그대로다
 */
export function morphCard(def: CharDef, owned: OwnedHero | undefined, who: { lv: number }, worn: Parameters<typeof heroFull>[2] = []): MorphCard {
  if (isHeroId(def.id)) {
    const h: OwnedHero = owned ?? { lv: 1, stars: heroStarsOf(def.id), shards: 0 }, f = heroFull(def.id, h, owned ? worn : []);
    return { def, atk: f.atk, hp: f.hp, lv: h.lv, stars: h.stars, who };
  }
  return { def, atk: Math.max(1, def.stats.atk ?? 1), hp: Math.max(1, def.stats.hp ?? 1), lv: 1, stars: 0, who };
}
/** 그 영웅이 처음 얻을 때의 별 (가지지 않은 카드를 보일 때) */
const heroStarsOf = (id: string): number => rarityDef(heroDef(id)?.rarity ?? 0).stars;

/** 능력치 대체 방식의 값 (방식이 아니면 null). 수가 아니거나 1보다 작으면 1 */
export function morphStats(card: MorphCard): MorphStats | null {
  const f = MORPH_RULE_VIEW.stats;
  if (!f) return null;
  const s = f(card), n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.round(v)) : 1);
  return { hp: n(s?.hp), atk: n(s?.atk) };
}
/** 직업의 기본 공격 한 번의 가운데 값 (능력치 대체 방식이 기본 공격을 이 값에서 카드의 공격으로 바꾼다: 비율 = 카드 공격 ÷ 이 값) */
export const classBaseAtk = (cls: string): number => { const b = classOf(cls).basic; return Math.max(1, (b[0] + b[1]) / 2); };
/** 직업과 레벨의 기본 최대 체력 (장비의 덤을 빼고: players.refresh의 앞부분과 같은 셈) */
export const classBaseHp = (cls: string, lv: number): number => maxHpFor(cls, lv);

/** 그 정의로 변신했을 때의 보정 (규칙의 mods를 cap으로 자르고, 수가 아닌 것·음수는 0). grow는 그 사람이 키운 만큼 (mods의 둘째 인자) */
export function morphMods(def: CharDef, grow?: MorphGrowth): Required<MorphMods> {
  const r = MORPH_RULE_VIEW, raw = r.mods?.(def, grow) ?? {}, out = { damage: 0, guard: 0, crit: 0, regen: 0 };
  for (const k of MORPH_MOD_KEYS) {
    const v = raw[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    const cap = r.cap?.[k];
    out[k] = Math.min(v, cap !== undefined ? Math.max(0, cap) : Infinity, k === 'guard' ? 0.9 : Infinity);
  }
  return out;
}

/** 개인 상태 'morph': 가진 캐릭터 id, 지금 변신한 것(없으면 ''), 남은 시간(초, 시간 제한이 없으면 -1), 다시 변신까지(초) */
export interface MorphMe { own: string[]; on: string; left: number; cd: number }
