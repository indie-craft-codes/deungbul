// 스태미나 (선택 모듈 stamina, 묶음 D: docs/screens.md 2.8·9.2의 12, 쓰는 법은 docs/making-a-game.md 26절).
// 시간이 지나면 차오르는 행동력: 단계 출격·소탕이 깎고, 모자라면 거절한다. 오프라인 동안의 회복도 시각으로 셈한다(저장은 { n, at }).
// 규칙은 게임의 내용 STAMINA_RULES (enabled가 거짓이면 모듈을 골라도 아무것도 하지 않는다: 명령·저장·개인 상태가 없다).
// 서버는 engine/server/game/systems/stamina.ts, 화면은 engine/client/hud/stamina.ts. 셈(회복)은 이 파일의 staminaAt 하나를 서버·화면·시험이 함께 쓴다.
import { STAMINA_RULES } from '../content';

/** 스태미나의 규칙 */
export interface StaminaRules {
  /** 켬/끔. 거짓이면 모듈을 골라도 없는 것과 같다 */
  enabled: boolean;
  /** 이름의 문장 키 (게임의 언어 파일 ui: '계약의 숨결') */
  name: string;
  /** 시간으로 차오르는 상한 (수 또는 레벨마다) */
  max: number | ((lv: number) => number);
  /** 하나가 차오르는 간격(초) */
  everyS: number;
  /** 처음 온 사람의 양 (없으면 상한만큼) */
  start?: number;
  /** 물약·우편·레벨 업으로 상한을 넘겨 쌓을 수 있는 끝 (없으면 999). 넘는 몫은 overflow */
  hold?: number;
  /** hold를 넘는 몫: 'mail' 우편으로(받을 때 다시 hold까지), 'lose' 버림 (기본) */
  overflow?: 'mail' | 'lose';
  /** 레벨이 오르면 (새) 상한만큼 더한다 */
  levelFill?: boolean;
  /** 쓰는 곳과 양: 단계 출격 한 번(StageDef.cost가 있으면 그것), 소탕 한 번 */
  use: { stage?: number; sweep?: number };
  /** 돌려주는 몫(0~1): 진 단계(fail), 싸우다 포기·나가기(quit). 없으면 돌려주지 않는다 */
  refund?: { fail?: number; quit?: number };
  /** 물약: 가방의 이 아이템 하나를 쓰면 n만큼 (items 모듈). 없으면 물약이 없다 */
  potion?: { item: string; n: number };
}
export const STAMINA_RULE_VIEW: StaminaRules = STAMINA_RULES;
/** 지금 켜져 있는가 (규칙의 enabled: 시뮬레이션이 바꿔 볼 수 있게 함수로 읽는다) */
export const staminaOn = (): boolean => !!STAMINA_RULE_VIEW.enabled;
/** 그 레벨의 상한 */
export const staminaMax = (lv: number): number => { const m = STAMINA_RULE_VIEW.max; return Math.max(1, Math.floor(typeof m === 'function' ? m(lv) : m)); };
/** 쌓을 수 있는 끝 */
export const staminaHold = (lv: number): number => Math.max(staminaMax(lv), Math.floor(STAMINA_RULE_VIEW.hold ?? 999));
/** 단계 한 번의 값 (StageDef.cost가 있으면 그것) */
export const stageCost = (cost: number | undefined): number => Math.max(0, Math.floor(cost ?? STAMINA_RULE_VIEW.use.stage ?? 0));

/** 저장의 모양: 가진 양과 그 양이 된 때(ms). 상한 아래면 at부터 everyS마다 하나씩 찬다 */
export interface StaminaSave { n: number; at: number }
/**
 * 그 시각의 양 (회복을 셈한다: 상한까지만, 상한 이상이면 그대로). 돌려주는 at은 다음 회복을 셀 기준 (상한이면 now).
 * 깨진 값(음수, NaN, 미래의 at)은 0·now로 본다
 */
export function staminaAt(s: StaminaSave, now: number, max: number, everyS: number): StaminaSave {
  const n = Number.isFinite(s.n) && s.n > 0 ? Math.floor(s.n) : 0, at = Number.isFinite(s.at) && s.at <= now ? s.at : now;
  if (n >= max) return { n, at: now };
  const per = Math.max(1, everyS) * 1000, k = Math.floor((now - at) / per);
  return n + k >= max ? { n: max, at: now } : { n: n + k, at: at + k * per };
}
/** 개인 상태 'stamina': 지금 양, 상한, 다음 하나까지(초, 상한 이상이면 0), 가득까지(초) */
export interface StaminaMe { n: number; max: number; next: number; full: number }
