// 한국어: 이 게임의 문장(koGame). 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다.
// 내용의 이름표는 withIdNames(index.ts)로 비워 둔다: 쓰는 모듈이 없어 몬스터·아이템·직업의 이름이 없다.
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';

const WHY: Record<string, string> = { ko: '말을 모두 쓰러뜨렸습니다', rounds: '차례를 다 써서 남은 체력으로 정했습니다', resign: '기권했습니다', left: '연결이 끊긴 채 돌아오지 않았습니다' };

export const koGame = {
  ui: {
    title: '징검돌 전술',
    hint: keyHints(['땅 클릭/WASD: 걷기(대기실)', '칸 클릭: 말 고르기·걷기·치기', 'Space: 차례 넘기기', '휠: 멀리·가까이', 'M: 메뉴', 'N: 지도', 'Enter: 대화']),
    mapLegend: '■ 대국판 · ● 대기실',
    // 대기실
    lobbyTitle: '대국장',
    lobbyInfo: '말 셋을 번갈아 움직여 상대의 말을 모두 쓰러뜨리세요. 한 차례는 30초입니다.',
    quick: '빠른 대국',
    host: '판 만들기',
    cpu: '컴퓨터와 두기',
    openTables: '상대를 기다리는 판',
    noTables: '기다리는 판이 없습니다. 판을 만들거나 컴퓨터와 두세요.',
    join: '들어가기',
    waiting: '상대를 기다리는 중… 다른 사람이 \'빠른 대국\'이나 \'들어가기\'를 누르면 시작합니다.',
    cancel: '그만두기',
    cpuName: '돌부처(컴퓨터)',
    // 판
    endTurn: '차례 넘기기[[ (Space)|]]',
    resign: '기권',
    myTurn: '내 차례',
    foeTurn: '상대 차례',
    cpuThinking: '컴퓨터가 두는 중',
    away: '끊김',
    pickUnit: '움직일 말을 누르세요. 파란 칸으로 걷고, 붉게 빛나는 적을 칩니다.',
    waitFoe: '상대가 두는 동안 기다리세요.',
    unitDone: '이 말은 이번 차례를 마쳤습니다.',
    lampTip: '가운데 등불돌: 차례를 마칠 때 그 위의 말이 체력 1을 되찾습니다.',
    // 결과
    win: '이겼습니다!',
    lose: '졌습니다',
    draw: '비겼습니다',
    again: '다시 하기',
    toLobby: '대기실로',
    againWait: '상대가 다시 하기를 누르면 시작합니다.',
    foeGone: '상대가 판을 떠났습니다.',
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
    clock: (s: number) => `${s}초`,
    round: (n: number, max: number) => `${n} / ${max} 차례`,
    rec: (w: number, l: number, d: number) => `전적 ${w}승 ${l}패 ${d}무`,
    playing: (n: number) => `두는 중인 판 ${n}`,
    unitStat: (hp: number, max: number, move: number, lo: number, hi: number, atk: number) => `체력 ${hp}/${max} · 걸음 ${move} · 사거리 ${lo === hi ? lo : `${lo}~${hi}`} · 피해 ${atk}`,
    vs: (a: string, b: string) => `${a} 대 ${b}`,
    why: (why: string) => WHY[why] ?? '',
    left: (name: string) => `${name} 님이 기다립니다`,
  },
  /** 이 게임이 더한 안내문 (shared/stepstone.ts의 MsgMap) */
  msg: {
    duelWait: () => '판을 열었습니다. 상대를 기다립니다.',
    duelStart: (a) => `대국 시작! 상대: ${a[0] || '돌부처(컴퓨터)'}. ${a[1] ? '먼저 둡니다.' : '상대가 먼저 둡니다.'}`,
    duelNoBoard: () => '빈 대국판이 없습니다. 잠시 뒤에 다시 해 보세요.',
    duelBusy: () => '이미 판에 앉아 있습니다.',
    duelGone: () => '그 판에는 들어갈 수 없습니다.',
    duelNotTurn: () => '내 차례가 아닙니다.',
    duelBad: () => '그 수는 둘 수 없습니다.',
    duelTimeout: (a) => `시간이 다 되어 ${a[0] || '돌부처'}의 차례가 넘어갔습니다.`,
    duelFoeLeft: (a) => `${a[0]} 님의 연결이 끊겼습니다. ${a[1]}초 동안 기다립니다.`,
    duelFoeBack: (a) => `${a[0]} 님이 돌아왔습니다.`,
    duelBack: () => '두던 판으로 돌아왔습니다.',
    duelResult: (a) => `${Number(a[0]) === 0 ? '이겼습니다!' : Number(a[0]) === 1 ? '졌습니다.' : '비겼습니다.'} ${WHY[String(a[1])] ?? ''}`,
    duelAgainWait: () => '상대가 다시 하기를 누르기를 기다립니다.',
    duelFoeGone: (a) => `${a[0]} 님이 판을 떠났습니다.`,
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
