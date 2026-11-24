// 재화 흐름 지표(경제 장부)의 모양과 도우미. 무엇을 어떤 원인으로 적을지와 판단 기준(ECON_*)은 게임의 내용에 있다 (@game/shared/content).
// 장부의 틀은 engine/server/game/systems/ledger.ts, 보는 도구는 scripts/econ.ts(npm run econ)다.
import { ECON_CURS, ECON_MOVE_PREFIXES } from '@game/shared/content';

/** 장부가 적는 재화 (ECON_CURS) */
export type EconCur = (typeof ECON_CURS)[number];
/** 안내문으로 원인을 가리는 보상 하나: 원인의 이름과, 안내문의 몇 번째 값이 어느 재화인지 (ECON_NOTICES) */
export type EconNotice = { why: string } & Partial<Record<EconCur, number>>;
/** 그 원인이 생성도 소멸도 아닌 이동인가 (ECON_MOVE_PREFIXES) */
export const isEconMove = (why: string): boolean => ECON_MOVE_PREFIXES.some((p) => why.startsWith(p));
