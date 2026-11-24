// 사람들 사이의 것: 길드와 거래소, 채널의 규칙과 수치. 모두 잠정값이다.
import { GEAR_SLOTS, type Gear } from './growth';

// ---------- 채널 ----------
// 같은 들판을 여러 벌로 돌린다. 채널이 다르면 서로 보이지 않고 몬스터도 따로다 (server/game/systems/channels.ts).
export const CHANNEL = {
  /** 채널의 수. 서버를 켤 때 정해진다 */
  count: 3,
  /** 접속할 때 한 채널에 이 인원까지 채우고 다음 채널로 넘긴다 (사람이 적을 때 모두가 1채널에 모이게, 가장 적은 곳이 아니라 번호가 낮은 곳부터) */
  soft: 30,
  /**
   * 이 인원이 찬 채널로는 옮겨 올 수 없다. 채널의 정원이 아니라 '옮겨 오기'의 한도다:
   * 접속하는 사람은 이 수와 무관하게 세운다(붐비지 않는 채널부터, 모두 붐비면 가장 적은 곳). 서버 접속 상한(300)까지 차면 채널마다 100명이 될 수 있다.
   */
  hard: 50,
  /** 채널을 한 번 바꾼 뒤 다시 바꿀 수 있을 때까지(초). 채널을 돌며 보스만 골라 잡는 것을 늦춘다 */
  switchCdS: 10,
  /** 마지막으로 맞거나 때린 뒤 이 시간(초)이 지나야 바꿀 수 있다. 싸움에서 도망치는 데 쓰지 못하게 한다 */
  calmS: 5,
  /** 채널별 인원을 다시 알리는 간격(초). 바쁜 때(이 게임에서는 습격 중)에는 채널마다 남은 적도 보이므로 더 자주 알린다 */
  tellS: 10,
  tellBusyS: 2,
};

// ---------- 길드 ----------
export const GUILD = {
  /** 만들 수 있는 레벨과 드는 골드 */
  createLv: 5,
  createGold: 500,
  nameMin: 2,
  nameMax: 12,
  noticeMax: 60,
  maxMembers: 30,
  /** 초대가 유효한 시간(초) */
  inviteS: 60,
  /** 초대가 거절되거나 받지 않은 채 사라진 뒤, 같은 사람이 같은 상대를 다시 초대할 수 있을 때까지(초). 초대를 되풀이해 남의 초대가 들어올 자리를 붙들지 못하게 한다 */
  reinviteS: 30,
  /** 길드 레벨 하나에 필요한 기부(골드)와 가장 높은 레벨 */
  expPerGuildLevel: 2000,
  maxLevel: 10,
  /** 길드 레벨 하나마다 길드원이 더 받는 처치 경험치 (비율) */
  expPerLevel: 0.02,
  /** 한 번에 기부하는 단위 (화면의 단추) */
  gives: [100, 1000] as readonly number[],
};

/** 길드 화면에 보이는 길드원 한 사람. pid는 내 것이거나 내가 길드장일 때만 채워진다(추방에 쓴다) */
export interface GuildMember { pid: string; name: string; lv: number; cls: string; gave: number; leader: boolean; on: boolean; me: boolean }
/** 내 길드의 모습 */
export interface GuildView {
  name: string; lv: number;
  /** 이번 레벨에서 쌓인 기부와 다음 레벨까지 필요한 양 */
  exp: number; need: number; max: boolean;
  notice: string;
  /** 내가 길드장인가 */
  leader: boolean;
  members: GuildMember[];
}

// ---------- 거래소 ----------
export const MARKET = {
  /** 값의 한도(골드). 값은 minPrice 이상 이 값 이하의 정수다 */
  maxPrice: 1_000_000,
  /** 가장 싼 값. 수수료가 적어도 1골드라서 1골드짜리는 팔아도 남는 것이 없다 */
  minPrice: 2,
  /** 이 레벨부터 올리고 살 수 있다. 막 만든 부캐의 출석·방치 골드를 거래로 한 캐릭터에 모으지 못하게 한다 */
  minLv: 8,
  /** 목록을 다시 달라고 할 수 있는 간격(초) */
  listGapS: 0.4,
  /** 한 사람이 동시에 올려 둘 수 있는 수 */
  maxListings: 8,
  /** 거래소 전체에 올라와 있을 수 있는 물건의 수. 넘으면 올리기를 막는다 (계정을 늘려 목록과 월드 저장을 끝없이 불리지 못하게. 250명이 8개씩 올린 양이다) */
  maxTotal: 2000,
  /** 올려 두는 기간(시간). 지나면 물건이 우편으로 돌아간다 */
  hours: 48,
  /** 팔린 값에서 떼는 수수료 (비율, 올림: 아래 marketFee). 뗀 골드는 사라진다 */
  tax: 0.05,
  /** 목록 한 쪽에 보이는 수 */
  pageSize: 20,
  /** 기간이 지난 물건을 거두는 주기(초) */
  sweepS: 5,
};
/** 그 값에 팔렸을 때 떼는 수수료 */
// 올림이고 적어도 1골드다: 내림이면 싼 값으로 쪼개 팔아 수수료 없이 큰 돈을 옮길 수 있다
export const marketFee = (price: number): number => Math.max(1, Math.ceil(price * MARKET.tax));
/** 목록을 거르는 종류: 전체, 장비 칸, 재료 */
export const MARKET_FILTERS = ['all', ...GEAR_SLOTS, 'mat'] as const;
export type MarketFilter = (typeof MARKET_FILTERS)[number];
export const isMarketFilter = (v: unknown): v is MarketFilter => typeof v === 'string' && (MARKET_FILTERS as readonly string[]).includes(v);
/** 목록의 순서: 새로 올라온 순, 싼 순, 비싼 순 */
export const MARKET_SORTS = ['new', 'cheap', 'costly'] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];
export const isMarketSort = (v: unknown): v is MarketSort => typeof v === 'string' && (MARKET_SORTS as readonly string[]).includes(v);

/** 거래소에 올라온 물건 하나. 장비(gear)이거나 재료 묶음(item과 n)이다. 값은 묶음 전체의 값이다 */
export interface MarketItem {
  /** 물건 번호 */
  id: number;
  gear?: Gear;
  item?: string;
  n: number;
  price: number;
  /** 올릴 때의 판매자 이름 */
  seller: string;
  /** 내가 올린 것인가 */
  mine: boolean;
  /** 남은 시간(초) */
  left: number;
}
