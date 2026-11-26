// 반딧불 연못의 한국어 문장: 틀의 판 문장(roomLobby …)을 이 게임의 말로 덮어쓰고, 이 게임의 창·안내문의 글을 더한다
import type { MsgArg } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';
import { withIdNames } from '@engine/client/i18n/names';

const SPOT = ['가', '나', '다'];
export const koNames = withIdNames({
  nameA: ['조용한', '느긋한', '반짝이는', '졸린', '날랜', '밤빛'],
  nameB: ['낚시꾼', '찌지기', '뱃사공', '반딧불', '물새'],
});

export const koGame = {
  ui: {
    title: '반딧불 연못',
    hint: keyHints(['땅 클릭/WASD: 이동', '1–8: 미끼 고르기', 'Z·X·C: 가·나·다 나루에 던지기', 'M: 메뉴', 'N: 지도', 'Enter: 대화']),
    mapLegend: keyHints(['가운데 나', '흰 점 사람', '푸른 원 연못']),
    // 틀의 판 문장을 이 게임의 말로
    roomLobby: '나루터',
    roomLobbyInfo: '넷이 연못에 둘러앉아 미끼 패를 엎어 던져 물고기를 낚습니다. 빈자리는 컴퓨터 낚시꾼이 채웁니다.',
    roomQuick: '빠른 판',
    roomWithCpu: '컴퓨터와 낚기',
    roomHost: '자리 펴기',
    roomOpen: '사람을 기다리는 연못',
    roomCpuTurn: '컴퓨터가 던지는 중',
    // 이 게임의 창
    pondHand: '내 미끼',
    pondPick: '[[미끼를 고르고 나루(물고기)를 누르세요 (1–8, Z·X·C)|미끼를 고르고 나루(물고기)를 누르세요]]',
    pondWait: '다른 낚시꾼이 던지는 중입니다',
    pondRules: '같은 수의 미끼는 서로 얽혀 빠집니다. 물고기는 제 크기보다 작은 미끼는 물지 않습니다. 남은 가장 큰 미끼가 낚습니다.',
    pondEmptyHand: '미끼를 다 던졌습니다',
  },
  fmt: {
    pondCpu: (i: number) => `컴퓨터(${['노랑', '파랑', '분홍', '초록'][i] ?? i + 1})`,
    roomRound: (n: number, max: number) => `던지기 ${n} / ${max}`,
    roomWhy: (why: string) => ({ score: '여덟 번을 다 던졌습니다.', resign: '기권으로 끝났습니다.', left: '연결이 끊긴 채 돌아오지 않았습니다.', rounds: '던지기를 다 썼습니다.' } as Record<string, string>)[why] ?? '',
    pondSpot: (s: number) => `${SPOT[s] ?? '?'} 나루`,
    pondSpotKey: (s: number) => SPOT[s] ?? '?',
    pondFish: (v: number) => `${v}점`,
    pondThrown: (n: number) => (n ? `찌 ${n}` : ''),
    pondMine: (spot: string, v: number) => `내 미끼: ${spot}에 ${v}`,
    pondScore: (score: number, caught: number) => `${score}점 · ${caught}마리`,
    pondLeft: (n: number) => `패 ${n}`,
    pondCatch: (spot: string, name: string, v: number, fish: number) => `${spot}: ${name}(${v})이(가) ${fish}점을 낚음`,
    pondMiss: (spot: string, best: number, fish: number) => `${spot}: ${best ? `${best}은(는) ${fish}점짜리에 작음` : '아무도 못 낚음'}`,
    pondTangle: (vals: string) => `얽힘 ${vals}`,
    pondRevealTitle: (n: number) => `${n}번째 던지기를 펼쳤습니다`,
    pondRank: (rank: number, score: number) => `${rank}등 · ${score}점`,
    pondRecord: (games: number, wins: number, best: number) => (games ? `전적 ${games}판 ${wins}승 · 최고 ${best}점` : ''),
    pondTurnNote: (cast: number, leader: string) => `${cast}번째 던지기 · 선 ${leader}`,
  },
  msg: {
    pondBad: () => '그 미끼는 던질 수 없습니다.',
    roomStart: (a: MsgArg[]) => `넷이 낚시를 시작합니다.${Number(a[0]) ? ' 내가 선입니다.' : ''}`,
    roomTimeout: (a: MsgArg[]) => `시간이 다 되어 ${a[0] || '컴퓨터'}의 미끼를 대신 던졌습니다.`,
  },
};

export type GameLocale = typeof koGame;
