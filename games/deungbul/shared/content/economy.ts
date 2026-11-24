// 재화 흐름 지표(경제 장부)의 내용: 무엇을 어떤 원인으로 적을지와, 지표를 읽을 때의 판단 기준.
// 장부의 틀(server/game/systems/ledger.ts)은 이 게임의 낱말을 모르고 여기만 본다. 보는 도구는 scripts/econ.ts(npm run econ)다.
import type { MsgKey } from '@engine/shared/messages';

/** 장부가 적는 재화. 장비는 `gear:등급`, 재료와 물약은 `item:아이템 id`로 따로 적힌다 */
export const ECON_CURS = ['gold', 'sparks', 'exp'] as const;
export type EconCur = (typeof ECON_CURS)[number];

/**
 * 안내문으로 원인을 가리는 보상: 명령이나 처치의 한가운데, 또는 틱 안에서 주는 것(퀘스트 단계, 습격, 기여 단계)은
 * 앞뒤 차이만으로는 원인을 알 수 없다. 그 보상을 알리는 안내문의 종류와, 안내문의 몇 번째 값이 어느 재화인지를 적어 두면
 * 장부가 그만큼을 그 원인으로 먼저 적는다. 값의 순서는 shared/messages.ts의 주석과 같다
 */
export const ECON_NOTICES: Partial<Record<MsgKey, { why: string } & Partial<Record<EconCur, number>>>> = {
  questStep: { why: 'quest', exp: 0, sparks: 1 },
  raidReward: { why: 'raid', sparks: 0, exp: 1 },
  tierUp: { why: 'tier', gold: 1 },
};

/**
 * 생성도 소멸도 아닌 이동: 사람 사이를 건너가는 골드는 원인의 이름을 바꿔 적는다.
 * 거래소에서 사는 사람이 낸 값(market:out)과 파는 사람이 우편으로 받은 값(market:in)의 차이가 수수료, 곧 진짜 소멸이다
 * (아직 받지 않은 판 값 우편도 그 차이에 들어 있다).
 */
export const ECON_MOVES: readonly { cur: string; why: string; dir: '+' | '-'; as: string }[] = [
  { cur: 'gold', why: 'cmd:market:buy', dir: '-', as: 'market:out' },
  { cur: 'gold', why: 'mail:marketSold', dir: '+', as: 'market:in' },
];
/** 이 머리말로 시작하는 원인은 이동이다 (거래소에 올리고 사고 돌려받는 물건 포함). 생성·소멸의 합계에서는 빼고 따로 보여 준다 */
export const ECON_MOVE_PREFIXES: readonly string[] = ['market:', 'cmd:market:', 'mail:market'];
export const isEconMove = (why: string): boolean => ECON_MOVE_PREFIXES.some((p) => why.startsWith(p));

/** 원인을 가리지 못한 변화가 적히는 칸: 틱 안에서 생긴 것(tick)과 그 밖(other). 이 칸이 크면 빠뜨린 통로나 재화 복사 버그가 있다는 뜻이다 */
export const ECON_UNKNOWN: readonly string[] = ['other', 'tick'];
/** 가방이 가득 차 버려진 장비가 적히는 원인 */
export const ECON_LOST_FULL = 'lostFull';
/** 사냥으로 번 것의 원인: 접속 중, 자리 비움 사냥 중(서버가 대신 사냥), 던전 인스턴스 안(끝낸 보상으로 받는 장비 포함) */
export const ECON_HUNT = { live: 'hunt', away: 'huntAway', inst: 'huntDungeon' } as const;

/** 캐릭터별 기록에 '처음 닿은 플레이 시간'을 남기는 레벨 */
export const ECON_LEVEL_MARKS: readonly number[] = [5, 10, 20];
/** 분포 스냅샷이 '새로 온 사람'으로 보는 기간(일) */
export const ECON_FRESH_DAYS = 7;

/**
 * 지표를 읽는 판단 기준. 모두 임시값이다: 실제 자료가 쌓이면 여기서 고친다.
 * min/max는 정상 범위의 끝이고, 벗어나면 `npm run econ`이 '주의'로 표시한다.
 */
export const ECON_WATCH = {
  /** 골드 소멸 ÷ 생성 (최근 7일). 1보다 한참 낮으면 골드가 쌓이기만 한다 */
  sinkRatio: { min: 0.7, max: 1.0 },
  /** 보유 일수 = 보유 골드의 중간값 ÷ 하루 수입의 중간값. 길수록 쓸 곳이 없다는 뜻이다 */
  holdDays: { max: 7 },
  /** 상위 10% 경계 ÷ 중간값. 클수록 골드가 한쪽에 몰려 있다 */
  topRatio: { max: 10 },
  /** 생성된 골드 가운데 자리 비움 사냥이 번 몫 */
  awayShare: { max: 0.35 },
  /** 낀 장비 가운데 강화가 끝(+10)인 것의 비율. 높으면 강화가 더는 골드를 태우지 못한다 */
  maxEnhShare: { max: 0.3 },
  /** 원인을 가리지 못한 변화(other, tick)가 전체 흐름에서 차지하는 몫 */
  unknownShare: { max: 0.01 },
  /** 활동 캐릭터가 이보다 적으면 표본이 적어 참고만 한다 */
  minSample: 30,
} as const;
