// 변신 (선택 모듈 morph)의 모양: 가진 캐릭터 정의(engine/shared/defs/chardef.ts)로 바뀌는 규칙과 줄 위의 모양.
// 서버는 engine/server/game/systems/morph.ts, 화면은 engine/client/hud/morph.ts. 규칙은 게임의 내용 MORPH_RULES (적지 않으면 아래의 기본값: 겉모습만 바뀌고 힘은 그대로).
import { MORPH_RULES } from '../content';
import type { CharDef } from './chardef';

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
  /** 정의마다의 보정 (없으면 겉모습만: 보정 0). 돌려준 값은 cap으로 자른다 */
  mods?: (def: CharDef) => MorphMods | null | undefined;
  /** 보정의 상한 (칸마다. 없는 칸은 자르지 않는다. guard는 0.9까지만 받는다) */
  cap?: MorphMods;
  /** 한 사람이 가질 수 있는 캐릭터의 수 */
  maxOwn: number;
}
export const MORPH_RULE_VIEW: MorphRules = MORPH_RULES;

/** 그 정의로 변신했을 때의 보정 (규칙의 mods를 cap으로 자르고, 수가 아닌 것·음수는 0) */
export function morphMods(def: CharDef): Required<MorphMods> {
  const r = MORPH_RULE_VIEW, raw = r.mods?.(def) ?? {}, out = { damage: 0, guard: 0, crit: 0, regen: 0 };
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
