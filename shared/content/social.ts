// 사람들 사이의 것: 길드와 거래소의 규칙과 수치. 모두 잠정값이다.
import { GEAR_SLOTS, type Gear } from './growth';

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
  /** 값의 한도(골드). 값은 1 이상 이 값 이하의 정수다 */
  maxPrice: 1_000_000,
  /** 한 사람이 동시에 올려 둘 수 있는 수 */
  maxListings: 8,
  /** 올려 두는 기간(시간). 지나면 물건이 우편으로 돌아간다 */
  hours: 48,
  /** 팔린 값에서 떼는 수수료 (비율, 내림). 뗀 골드는 사라진다 */
  tax: 0.05,
  /** 목록 한 쪽에 보이는 수 */
  pageSize: 20,
  /** 기간이 지난 물건을 거두는 주기(초) */
  sweepS: 5,
};
/** 그 값에 팔렸을 때 떼는 수수료 */
export const marketFee = (price: number): number => Math.max(0, Math.floor(price * MARKET.tax));
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
