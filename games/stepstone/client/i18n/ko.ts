// 한국어: 이 게임의 문장(koGame). 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다.
// 내용의 이름표는 withIdNames(index.ts)로 비워 둔다: 쓰는 모듈이 판(rooms)뿐이라 몬스터·아이템·직업의 이름이 없다.
// 대기실·판의 막대·결과 창의 문장은 틀의 것(ui.room…, fmt.room…)이고, 아래에서 같은 키로 이 게임의 말로 덮어쓴다 (대국장, 돌부처, '차례', 끝난 까닭).
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';

const WHY: Record<string, string> = { ko: '말을 모두 쓰러뜨렸습니다.', rounds: '차례를 다 써서 남은 체력으로 정했습니다.', resign: '기권으로 끝났습니다.', left: '연결이 끊긴 채 돌아오지 않았습니다.' };

export const koGame = {
  ui: {
    title: '징검돌 전술',
    hint: keyHints(['땅 클릭/WASD: 걷기(대기실)', '칸 클릭: 말 고르기·걷기·치기', 'Space: 차례 넘기기', '휠: 멀리·가까이', 'M: 메뉴', 'N: 지도', 'Enter: 대화']),
    mapLegend: '■ 대국판 · ● 대기실',
    // 틀의 대기실·판 문장을 이 게임의 말로
    roomLobby: '대국장',
    roomLobbyInfo: '말 셋을 번갈아 움직여 상대의 말을 모두 쓰러뜨리세요. 한 차례는 30초입니다.',
    roomCpu: '돌부처(컴퓨터)',
    roomPass: '차례 넘기기[[ (Space)|]]',
    // 판
    pickUnit: '움직일 말을 누르세요. 파란 칸으로 걷고, 붉게 빛나는 적을 칩니다.',
    waitFoe: '상대가 두는 동안 기다리세요.',
    openerNote: '첫 차례: 나중에 두는 편은 피해를 1 덜 줍니다.',
    unitDone: '이 말은 이번 차례를 마쳤습니다.',
    lampTip: '가운데 등불돌: 차례를 마칠 때 그 위의 말이 체력 1을 되찾습니다.',
    myTurn: '내 차례',
    // 말
    unitShield: '방패돌',
    unitSling: '투석돌',
    unitRunner: '날쌘돌',
    infoShield: '단단합니다. 멀리서 날아온 돌은 1 덜 받습니다.',
    infoSling: '2~3칸 떨어진 적만 칩니다. 붙으면 약합니다.',
    infoRunner: '세 칸을 걷습니다.',
  },
  /** 값이 들어가는 화면 문구 */
  fmt: {
    roomRound: (n: number, max: number) => `${n} / ${max} 차례`,
    roomWhy: (why: string) => WHY[why] ?? '',
    rec: (w: number, l: number, d: number) => `전적 ${w}승 ${l}패 ${d}무`,
    unitStat: (hp: number, max: number, move: number, lo: number, hi: number, atk: number) => `체력 ${hp}/${max} · 걸음 ${move} · 사거리 ${lo === hi ? lo : `${lo}~${hi}`} · 피해 ${atk}`,
  },
  /** 이 게임이 더한 안내문 (shared/stepstone.ts의 MsgMap) */
  msg: {
    duelBad: () => '그 수는 둘 수 없습니다.',
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
