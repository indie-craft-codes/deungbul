// 경제의 모양과 도우미: 재화의 정의, 재화 흐름 지표(경제 장부). 재화의 표(CURRENCIES)와 수치, 무엇을 어떤 원인으로 적을지와 판단 기준(ECON_*)은 게임의 내용에 있다 (@game/shared/content).
// 값을 셈하는 도우미는 그 수치의 모양 곁에 있다: 파는 값 sellPrice는 defs/growth.ts, 거래소 수수료 marketFee와 길드 레벨 guildLevel은 defs/social.ts.
// 장부의 틀은 engine/server/game/systems/ledger.ts, 보는 도구는 scripts/econ.ts(npm run econ)다.
import { ECON_CURS, ECON_MOVE_PREFIXES } from '@game/shared/content';

/**
 * 재화 하나의 정의 (CURRENCIES): 캐릭터가 수로 가지는 것. 게임의 내용이 재화의 id마다 하나씩 적는다.
 * 틀이 아는 재화의 칸은 엔티티의 gold(첫 번째 재화), sparks(두 번째 재화), exp(경험치)다. 표에 없는 재화는 한도 없이 다룬다
 */
export interface CurrencyDef {
  /** 언어 파일에서 이 재화의 이름이 있는 칸 (engine/client/i18n/names.ts의 ContentNames). 이름이 문장에 박혀 있어 칸이 없으면 비워 둔다 */
  label?: string;
  /** 사람 사이를 건너갈 수 있는가 (거래소의 값처럼). 아니면 번 사람에게 묶인 재화다 */
  tradable: boolean;
  /** 가질 수 있는 상한. 없으면 한도가 없다 */
  max?: number;
}

/** 장부가 적는 재화 (ECON_CURS) */
export type EconCur = (typeof ECON_CURS)[number];
/** 그 원인이 생성도 소멸도 아닌 이동인가 (ECON_MOVE_PREFIXES) */
export const isEconMove = (why: string): boolean => ECON_MOVE_PREFIXES.some((p) => why.startsWith(p));
