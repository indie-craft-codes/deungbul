// 한국어: 이 게임의 문장(koGame). 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다.
// 내용의 이름표는 withIdNames(index.ts)로 비워 둔다: 쓰는 모듈이 없어 몬스터·아이템·직업의 이름이 없다.
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';

const TEAM = ['노을', '물결'];
const team = (s: MsgArg) => TEAM[Number(s)] ?? '';

export const koGame = {
  ui: {
    title: '굴림공',
    hint: keyHints(['땅 클릭/WASD: 이동', '공에 부딪히면 밀린다', 'F: 차기', 'H: 우리 진영으로', 'M: 메뉴', 'N: 지도', 'Enter: 대화']),
    goingTown: '우리 진영으로 걸어갑니다.',
    // 이 게임의 창
    pickTitle: '팀을 고르세요',
    pickInfo: '공을 몸으로 밀거나 차서 상대 골문에 넣으세요. 사람이 더 많은 팀으로는 갈 수 없습니다.',
    teamA: '노을',
    teamB: '물결',
    kick: '차기[[ (F)|]]',
    switchTeam: '팀 바꾸기',
    phaseGoal: '골!',
    ballArrow: '공이 있는 쪽',
    phaseOver: '경기 끝',
  },
  /** 값이 들어가는 화면 문구 */
  fmt: {
    clock: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    round: (n: number) => `${n}판`,
    teamCount: (n: number) => `${n}명`,
    myTeam: (side: number, goals: number) => `내 팀 ${team(side)} · 내 골 ${goals}`,
  },
  /** 이 게임이 더한 안내문 (shared/rollball.ts의 MsgMap) */
  msg: {
    goal: (a) => `${team(a[0])} 골!${a[1] ? ` ${a[1]} 님이 넣었습니다.` : ''} ${a[2]} : ${a[3]}`,
    roundOver: (a) => (Number(a[0]) < 0 ? `비겼습니다. ${a[1]} : ${a[2]}` : `${team(a[0])} 승리! ${a[1]} : ${a[2]}`),
    roundStart: (a) => `${a[0]}판이 시작됩니다.`,
    teamFull: (a) => `${team(a[0])}에 사람이 더 많습니다. 다른 팀을 고르세요.`,
    teamJoined: (a) => `${team(a[0])} 팀에 들어갔습니다.`,
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
