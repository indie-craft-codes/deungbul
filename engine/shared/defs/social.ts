// 사람들 사이의 것: 길드와 거래소의 화면에 보이는 모양과 도우미. 수치(CHANNEL, GUILD, MARKET)는 게임의 내용에 있다 (@game/shared/content).
import { GEAR_SLOTS, GUILD, MARKET } from '@game/shared/content';
import type { Gear } from './growth';

// ---------- 길드 ----------
/** 길드 레벨: 쌓인 기부(골드)로 정한다. 서버의 systems/guild.ts와 도감이 함께 쓴다 */
export const guildLevel = (exp: number): number => Math.min(GUILD.maxLevel, 1 + Math.floor(exp / GUILD.expPerGuildLevel));
/** 그 길드 레벨이 되는 데 필요한 누적 기부 (guildLevel을 거꾸로 푼 것) */
export const guildNeed = (lv: number): number => (lv - 1) * GUILD.expPerGuildLevel;

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
