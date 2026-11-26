// 팀(선택 모듈 teams)의 모양. 팀의 표(TEAMS)와 규칙(TEAM_RULES)은 게임의 내용에 있다 (@game/shared/content).
// 서버의 engine/server/game/systems/teams.ts와 화면의 engine/client/hud/teams.ts가 함께 읽는다. 줄 위에서 팀은 TEAMS의 번호(0부터)로 오간다: 팀이 없으면 -1.

/** 팀 하나: id(저장에 쓰는 이름. 바꾸지 않는다), 색(옷과 고리, 점수판), 이름의 문장 키(게임의 언어 파일 ui에 그 키로 이름을 적는다) */
export interface TeamDef { id: string; color: number; name: string }

/** 팀의 규칙 */
export interface TeamRules {
  /** 사람이 더 많은 팀으로는 들어갈 수 없다 (같으면 된다. 옮길 때는 나를 빼고 센다) */
  balance: boolean;
  /** 팀이 있는 사람이 다른 팀으로 옮길 수 있다 */
  switch: boolean;
  /**
   * 저장한다: 사람마다의 팀과 점수(캐릭터 저장의 ext 'teams'), 팀의 점수(월드 저장의 'teams'). 기본은 저장하지 않는다 (판마다 새로 고르는 놀이).
   * 저장하면 다시 들어온 사람이 같은 팀으로 돌아온다 (손님은 저장되지 않는다)
   */
  persist: boolean;
}

/** 점수판의 공유 상태 (WorldState의 teams): 팀마다의 점수와 사람 수 (TEAMS의 차례) */
export interface TeamBoard { score: number[]; count: number[] }
/** 내 팀의 개인 상태 (me 메시지의 'team'): 팀 번호(-1이면 없음)와 내 점수 */
export interface TeamMe { i: number; score: number }

/** 0xRRGGBB → css의 #rrggbb */
export const teamCss = (color: number): string => `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
