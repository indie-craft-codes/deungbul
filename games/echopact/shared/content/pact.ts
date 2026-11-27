// 이 게임(메아리 계약)에만 있는 내용: 틀의 내용 계약에 없는 수치. 틀은 읽지 않고 이 게임의 서버·화면·시험만 읽는다.
import type { Reward } from '@engine/shared/defs/growth';
import type { MorphCard, MorphStats } from '@engine/shared/defs/morph';
import type { AwaySafety } from '@engine/shared';

/** 울림 샘(뽑기의 자리, 들판 가운데의 장식 장애물) */
export const WELL = { x: 0, z: -6, r: 1.6 };
/**
 * 계약의 탑(게임 A: 단계)의 자리: 들판(울림골)과 떨어진 지역 'spire'의 가운데. 걸어서는 갈 수 없고 '게임 바꾸기'로만 온다.
 * 사람마다의 층이라 다른 사람은 보이지 않는다
 */
export const SPIRE = { x0: 130, x1: 170, z0: -20, z1: 20 };
export const ARENA = { x: 150, z: 0 };

/** 처음 온 사람이 받는 것: 골드 조금과 처음 메아리 하나(편성의 빈 자리에 저절로 든다). 뽑기 재화는 주지 않는다: 첫 뽑기는 단계·사냥으로 모은다 */
export const STARTER: Reward = { gold: 150, items: { tonic: 3 } };
export const STARTER_ECHO = 'brindle';

/** 두 게임의 이름 (모드 id): A 계약의 탑(단계·뽑기·편성), B 울림골(들판의 MMORPG) */
export const MODE = { tower: 'tower', vale: 'vale' } as const;

/**
 * 카드 → 변신 능력치 (MORPH_RULES.stats: 틀의 능력치 대체 방식). 카드는 탑에서 키운 그 메아리의 지금 능력치(영웅 탭의 공격·체력: 레벨·별까지)다.
 *   변신 시 공격(기본 공격 한 번) = atkBase + 카드 공격 × atkK
 *   변신 시 체력 = hpBase + 카드 체력 × hpK + 사람의 레벨 덤(레벨 − 1) × hpPerLv (들판의 레벨도 변신 뒤에 남게: 틀의 HP_PER_LEVEL과 같은 15)
 * 계약자의 기본(파수꾼 1레벨): 공격 13.5, 체력 220. 등급 사이의 차가 들판을 망치지 않게 카드의 공격을 반으로 눌렀다 (docs/proof-echopact.md '변신의 수치')
 */
export const MORPH_CONV = { atkBase: 8, atkK: 0.5, hpBase: 120, hpK: 0.6, hpPerLv: 15 };
export function cardToMorph(c: MorphCard): MorphStats {
  return { atk: MORPH_CONV.atkBase + c.atk * MORPH_CONV.atkK, hp: MORPH_CONV.hpBase + c.hp * MORPH_CONV.hpK + MORPH_CONV.hpPerLv * Math.max(0, c.who.lv - 1) };
}

/**
 * 보이지 않을 때(탑에 가 있는 동안 들판의 몸, 접속을 끊은 뒤의 자리 비움 사냥)의 자동 사냥 안전장치 기본값 (틀의 g.away.safety).
 * 체력 45% 아래면 물약, 25% 아래면 멈추고 샘 앞으로 물러난다, 물약이 떨어지면 멈춘다, 쓰러지면 끝. 설정 창에서 사람마다 바꾼다
 */
export const SAFETY: AwaySafety = { potionAt: 0.45, retreatAt: 0.25, stopNoPotion: true, stopOnDeath: true };

/** 일일·주간 임무의 종류 가운데 이 게임이 세는 것 (틀은 kill만 센다) */
export const PACT_KINDS = { pull: 'pull', stage: 'stage', morph: 'morph' } as const;
