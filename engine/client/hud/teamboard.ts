// 팀(teams 모듈)의 화면 셈: 점수판의 줄, 고르기 창의 단추, 사람의 팀. 화면 요소도 three.js도 읽지 않는다 (engine/test/fx/client.test.ts가 그대로 읽는다).
// 그리는 것은 hud/teams.ts.
import type { TeamBoard, TeamDef } from '../../shared/defs/teams';
import { teamCss } from '../../shared/defs/teams';

/** 사람의 상태 줄에 실려 온 값(g.playerSync: [팀 번호, …])에서 팀 번호. 없거나 이상하면 -1 */
export const teamOfVals = (vals: readonly number[], n: number): number => {
  const v = vals[0];
  return Number.isInteger(v) && v >= 0 && v < n ? v : -1;
};

/** 점수판의 모양: 팀이 둘이면 '노을 3 : 1 물결'(versus), 그 밖에는 팀마다 한 줄(list) */
export const boardLayout = (n: number): 'versus' | 'list' => (n === 2 ? 'versus' : 'list');

/** 점수판의 한 팀: 번호, 색(css), 점수, 사람 수, 내 팀인가 */
export interface BoardRow { i: number; color: string; score: number; count: number; mine: boolean }
/** 점수판의 줄들 (TEAMS의 차례). 서버의 점수판이 아직 오지 않았으면 0 */
export function boardRows(teams: readonly TeamDef[], board: TeamBoard | undefined, mine: number): BoardRow[] {
  return teams.map((t, i) => ({ i, color: teamCss(t.color), score: board?.score[i] ?? 0, count: board?.count[i] ?? 0, mine: i === mine }));
}

/** 고르기 창의 단추 하나: 번호, 지금 내 팀인가, 사람이 더 많아 들어갈 수 없는가(balance) */
export interface PickButton { i: number; mine: boolean; more: boolean }
/**
 * 고르기 창의 단추들: 서버의 규칙(engine/server/game/systems/teams.ts의 canJoin)과 같다.
 * 나를 빼고 셌을 때, 그 팀이 가장 적은 다른 팀보다 많으면 '사람이 더 많음' (같으면 된다)
 */
export function pickButtons(teams: readonly TeamDef[], board: TeamBoard | undefined, mine: number, balance: boolean): PickButton[] {
  const without = teams.map((_, i) => Math.max(0, (board?.count[i] ?? 0) - (i === mine ? 1 : 0)));
  return teams.map((_, i) => {
    let least = Infinity;
    for (let k = 0; k < teams.length; k++) if (k !== i) least = Math.min(least, without[k]);
    return { i, mine: i === mine, more: balance && i !== mine && without[i] > least };
  });
}

/** 팀 바꾸기 단추가 하는 일: 팀이 둘이면 곧바로 다른 팀으로(pick), 셋 이상이면 고르기 창을 연다(open). 팀이 없거나 바꿀 수 없으면 none */
export function switchAction(n: number, mine: number, canSwitch: boolean): { pick: number } | 'open' | 'none' {
  if (mine < 0 || !canSwitch || n < 2) return 'none';
  return n === 2 ? { pick: mine === 0 ? 1 : 0 } : 'open';
}
