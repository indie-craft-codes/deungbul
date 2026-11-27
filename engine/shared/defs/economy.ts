// 경제의 모양과 도우미: 재화의 정의, 재화 흐름 지표(경제 장부). 재화의 표(CURRENCIES)와 수치, 무엇을 어떤 원인으로 적을지와 판단 기준(ECON_*)은 게임의 내용에 있다 (@game/shared/content).
// 값을 셈하는 도우미는 그 수치의 모양 곁에 있다: 파는 값 sellPrice는 defs/growth.ts, 거래소 수수료 marketFee와 길드 레벨 guildLevel은 defs/social.ts.
// 장부의 틀은 engine/server/game/systems/ledger.ts, 보는 도구는 게임마다 둔다 (등불지기: games/deungbul/scripts/econ.ts, npm run econ).
import { ECON_CURS, ECON_MOVE_PREFIXES } from '../content';

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
  /**
   * 재화의 종류 (선택, 묶음 4: docs/making-a-game.md 20절). 적으면 이 재화를 종류(유상·무상·이벤트·귀속)마다 따로 세고, 쓸 때는 spend의 차례로 꺼낸다.
   * 엔티티의 칸(p.gold, p.sparks)은 그대로 합이다. 장부의 원인에 종류가 붙는다('cmd:gacha:free'). 적지 않으면 지금과 같다 (지갑이 종류를 세지 않는다)
   */
  kinds?: CurrencyKinds;
  /**
   * 귀한 재화의 확인 단계 (선택): 한 번에 at 이상을 쓰는 단추(뽑기 같은 것)는 화면이 두 번 묻는다 (engine/client/hud/confirm.ts).
   * price는 실제 돈의 가격을 함께 적는 칸 (결제가 생긴 뒤에 채운다: 지금은 비워 둔다)
   */
  confirm?: { at: number; price?: string | null };
}

/** 재화의 종류: 유상(돈으로 산 것), 무상(플레이로 얻은 것), 이벤트(기간 한정, 만료가 흔하다), 귀속(거래할 수 없게 묶인 것) */
export type CurKind = 'paid' | 'free' | 'event' | 'bound';
export const CUR_KINDS: readonly CurKind[] = ['paid', 'free', 'event', 'bound'];
/** 한 재화의 종류 규칙 */
export interface CurrencyKinds {
  /** 이 재화가 가지는 종류와 쓰는 차례 (앞이 먼저. 예: ['event', 'free', 'paid'] = 만료가 있는 이벤트 → 무상 → 유상) */
  spend: readonly CurKind[];
  /** 종류를 말하지 않고 더할 때(사냥·임무·관리자 지급)의 종류. 없으면 spend에 free가 있으면 free, 아니면 spend의 첫째 */
  earn?: CurKind;
  /** 종류마다 받은 때부터 사라지기까지의 날 수 (없으면 만료 없음). 같은 종류 안에서는 먼저 사라질 것부터 쓴다 */
  days?: Partial<Record<CurKind, number>>;
}

/** 장부가 적는 재화 (ECON_CURS) */
export type EconCur = (typeof ECON_CURS)[number];
/** 그 원인이 생성도 소멸도 아닌 이동인가 (ECON_MOVE_PREFIXES) */
export const isEconMove = (why: string): boolean => ECON_MOVE_PREFIXES.some((p) => why.startsWith(p));
/** 그 재화의 종류 규칙 (적지 않았으면 null: 종류를 세지 않는다) */
export function curKinds(def: CurrencyDef | undefined): CurrencyKinds | null {
  const k = def?.kinds;
  return k && Array.isArray(k.spend) && k.spend.length ? k : null;
}
/** 종류를 말하지 않고 더할 때의 종류 */
export const earnKind = (k: CurrencyKinds): CurKind => (k.earn && k.spend.includes(k.earn) ? k.earn : k.spend.includes('free') ? 'free' : k.spend[0]);
/** 그 재화를 n만큼 쓸 때 두 번 묻는가 (CurrencyDef.confirm) */
export const needsConfirm = (def: CurrencyDef | undefined, n: number): boolean => !!def?.confirm && def.confirm.at > 0 && n >= def.confirm.at;
