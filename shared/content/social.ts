// 사람들 사이의 것: 길드와 거래소, 채널의 규칙과 수치. 모두 잠정값이다.

// ---------- 채널 ----------
// 같은 들판을 여러 벌로 돌린다. 채널이 다르면 서로 보이지 않고 몬스터도 따로다 (server/game/systems/channels.ts).
export const CHANNEL = {
  /** 채널의 수. 서버를 켤 때 정해진다 */
  count: 3,
  /** 접속할 때 한 채널에 이 인원까지 채우고 다음 채널로 넘긴다 (사람이 적을 때 모두가 1채널에 모이게, 가장 적은 곳이 아니라 번호가 낮은 곳부터) */
  soft: 30,
  /** 이 인원이 찬 채널로는 옮겨 올 수 없다 */
  hard: 50,
  /** 채널을 한 번 바꾼 뒤 다시 바꿀 수 있을 때까지(초). 채널을 돌며 보스만 골라 잡는 것을 늦춘다 */
  switchCdS: 10,
  /** 마지막으로 맞거나 때린 뒤 이 시간(초)이 지나야 바꿀 수 있다. 싸움에서 도망치는 데 쓰지 못하게 한다 */
  calmS: 5,
  /** 채널별 인원을 다시 알리는 간격(초). 습격 중에는 채널마다 남은 적도 보이므로 더 자주 알린다 */
  tellS: 10,
  tellRaidS: 2,
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
