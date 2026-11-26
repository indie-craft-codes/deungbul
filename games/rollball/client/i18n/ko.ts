// 한국어: 이 게임의 문장(koGame). 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다.
// 내용의 이름표는 withIdNames(index.ts)로 비워 둔다: 쓰는 모듈이 없어 몬스터·아이템·직업의 이름이 없다.
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { keyHints, teamName } from '@engine/client/i18n/ko';

/** 팀의 이름: 틀의 teamName이 내용의 TEAMS(name 키 teamA, teamB)로 이 파일의 ui에서 찾는다 */
const team = teamName;

export const koGame = {
  ui: {
    title: '굴림공',
    hint: keyHints(['땅 클릭/WASD: 이동', '공에 부딪히면 밀린다', 'F: 차기', 'V: 전체 보기', 'H: 우리 진영으로', '휠: 멀리·가까이', 'M: 메뉴', 'N: 지도', 'Enter: 대화']),
    // 미니맵 아래의 범례: 골문은 그 골문을 지키는 팀의 색
    mapLegend: '■ 골문 · 흰 점 공과 사람',
    goingTown: '우리 진영으로 걸어갑니다.',
    // 팀의 이름 (내용의 TEAMS가 이 키를 가리킨다: 틀의 teams 모듈이 점수판·고르기 창·안내문에 쓴다)
    teamA: '노을',
    teamB: '물결',
    // 틀의 팀 고르기 창의 설명을 이 게임의 말로 (사람 수 균형의 한 줄은 틀이 붙인다)
    teamPickInfo: '공을 몸으로 밀거나 차서 상대 골문에 넣으세요.',
    // 이 게임의 창
    kick: '차기[[ (F)|]]',
    overview: '전체[[ (V)|]]',
    phaseGoal: '골!',
    ballArrow: '공이 있는 쪽',
    phaseOver: '경기 끝',
  },
  /** 값이 들어가는 화면 문구 */
  fmt: {
    clock: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    round: (n: number) => `${n}판`,
    // 틀의 '내 팀' 줄: 사람마다의 점수가 이 게임에서는 넣은 골이다
    teamMine: (name: string, goals: number) => `내 팀 ${name} · 내 골 ${goals}`,
  },
  /** 이 게임이 더한 안내문 (shared/rollball.ts의 MsgMap) */
  msg: {
    goal: (a) => `${team(a[0])} 골!${a[1] ? ` ${a[1]} 님이 넣었습니다.` : ''} ${a[2]} : ${a[3]}`,
    roundOver: (a) => (Number(a[0]) < 0 ? `비겼습니다. ${a[1]} : ${a[2]}` : `${team(a[0])} 승리! ${a[1]} : ${a[2]}`),
    roundStart: (a) => `${a[0]}판이 시작됩니다.`,
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
