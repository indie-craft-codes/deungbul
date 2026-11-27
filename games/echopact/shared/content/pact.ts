// 이 게임(메아리 계약)에만 있는 내용: 틀의 내용 계약에 없는 수치. 틀은 읽지 않고 이 게임의 서버·화면·시험만 읽는다.
import type { Reward } from '@engine/shared/defs/growth';

/** 울림 샘(뽑기의 자리, 들판 가운데의 장식 장애물)과 단계가 벌어지는 자리 */
export const WELL = { x: 0, z: -6, r: 1.6 };
export const ARENA = { x: 0, z: 34 };

/** 처음 온 사람이 받는 것: 골드 조금과 처음 메아리 하나(편성의 빈 자리에 저절로 든다). 뽑기 재화는 주지 않는다: 첫 뽑기는 단계·사냥으로 모은다 */
export const STARTER: Reward = { gold: 150, items: { tonic: 3 } };
export const STARTER_ECHO = 'brindle';

/**
 * 두 장르를 잇는 이 게임의 덤: 변신의 힘이 그 메아리를 수집형 쪽에서 키운 만큼 조금 커진다 (틀의 MORPH_RULES.mods는 정의만 보고 사람의 성장을 모른다).
 * 주는 피해 + (별 − 처음 별) × perStar + (레벨 − 1) × perLv, 상한 cap
 */
export const PACT_GROWTH = { perStar: 0.012, perLv: 0.001, cap: 0.06 };

/** 일일·주간 임무의 종류 가운데 이 게임이 세는 것 (틀은 kill만 센다) */
export const PACT_KINDS = { pull: 'pull', stage: 'stage', morph: 'morph' } as const;
