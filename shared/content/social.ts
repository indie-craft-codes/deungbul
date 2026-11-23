// 사람들 사이의 것: 길드와 거래소의 규칙과 수치. 모두 잠정값이다.

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
