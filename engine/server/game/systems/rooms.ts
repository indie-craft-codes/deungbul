// 판(rooms 모듈): 사람(과 컴퓨터) 몇이 따로 된 층에서 차례대로 두는 한 판. 턴제 전술·보드·카드 게임의 방.
// 틀이 맡는 것: 판마다의 인스턴스 층(엔티티·스냅샷이 판마다 나뉜다), 대기실과 짝짓기(빠른 대국·판 만들기·들어가기·컴퓨터와 두기·기다리다 컴퓨터로 채우기),
// 차례의 순서와 기한(시간이 지나면 게임이 정한 처리, 기본은 차례 넘기기), 끊긴 사람의 자리(같은 저장 키로 다시 들어오면 그 자리로, 기다림이 지나면 몰수),
// 기권·다시 하기·판의 끝과 정리(판에 놓은 엔티티를 치우고 사람을 들판으로), 판의 저장(게임이 save/load를 주면 서버를 다시 켜도 이어진다).
// 판의 공통화(묶음 7, 모두 RoomDef의 선택 칸: 주지 않으면 예전 그대로): 게임당 판 여럿(id)과 방장의 규칙 옵션(options), 방 코드·초대 링크·공개 설정(codes: ../invites.ts),
// 방장(lead: 강퇴·위임·자동 이전·준비), 투표(voteS), 같은 무리로 다음 판(regroup), 관전과 관전 지연·관전 대기(watch, watchView), 판 중간 참가(midJoin, catchUp),
// 차례 없는 실시간 판(realtimeS), 판 기록과 전적(record), 판을 열 때 자리 수 고르기(명령 host의 n).
// 경쟁(묶음 8, 선택 칸): 판마다의 시드와 정해진 난수(room.rng), 리플레이(replay: 시드·입력·프레임을 끝난 뒤 저장, 명령 replay), 랭크 판(rated: ranked 모듈이 큐로 짝지어
// openWith로 연다. 레이팅·이탈 제재는 ranked.ts가 hooks로 받는다), 자리마다 둔 수(moves)와 떠난 자리(leavers)의 기록.
// 게임이 맡는 것: 판의 규칙 (RoomDef: 판을 차리는 start, 컴퓨터의 한 수 cpu, 차례의 앞뒤, 판의 끝을 정해 finish를 부르기, 게임 명령의 검사).
// 판의 규칙은 g.rooms.define(def)로 플러그인에서 준다. 화면의 짝은 engine/client/hud/rooms.ts, 모양은 engine/shared/defs/rooms.ts.
import type { RoomDefView, RoomLobby, RoomPhase, RoomPrivacy, RoomRow, RoomStatsView, RoomTally, RoomView, RoomVoteView } from '../../../shared/defs/rooms';
import type { ReplayView } from '../../../shared/defs/compete';
import type { RoomRecordRow, RoomStore } from '../../store/types';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { Invites, PASS_MAX, hashPass, isPrivacy } from '../invites';
import { fieldLayer, instanceLayer, isField } from '../layers';
import { personalData } from '../personal';
import { competeRules } from '../../../shared/defs/compete';

/** 판의 한 자리: 사람(저장 키로 기억한다: 끊겼다 돌아와도 같은 자리) 또는 컴퓨터 */
export interface RoomSeat {
  /** 사람의 열쇠: 저장 키(pid). 손님은 'guest:<엔티티 id>'(끊기면 돌아올 수 없다). 컴퓨터는 빈 문자열 */
  key: string;
  /** 지금 그 사람의 엔티티 id (끊겼으면 0) */
  ent: number;
  name: string;
  cpu: boolean;
  /** 끊긴 때(ms, g.now). 0이면 접속해 있다. -1이면 판을 떠났다(돌아오지 않는다) */
  goneAt: number;
  /** 판에서 빠졌다 (기권·몰수): 차례가 건너뛴다 */
  out: boolean;
  /** 다시 하기를 눌렀다 */
  again: boolean;
  /** 준비 완료 (방장이 있는 판: RoomDef.lead) */
  ready: boolean;
  /** 큐가 채운 봇 (컴퓨터 자리. 묶음 8) */
  bot?: boolean;
}

/** 판을 구경하는 사람 (RoomDef.watch). queued: 다음 판에 들어가려고 기다린다 (진행 중 난입) */
export interface RoomWatcher { key: string; ent: number; name: string; queued: boolean; onLayer: boolean }

/** 진행 중인 투표 (RoomDef.voteS) */
export interface RoomVote { kind: 'opt' | 'again' | 'kick'; k?: string; v?: string | number; seat?: number; by: string; yes: Set<string>; no: Set<string>; until: number }

/** 판 하나. data는 게임의 판 상태 (RoomDef.start가 채운다) */
export interface Room<D = unknown> {
  readonly id: number;
  /** 판의 이름 (RoomDef.id, 기본 'main') */
  readonly def: string;
  /** 이 판의 층 (판에 앉은 사람과 room.place로 놓은 엔티티가 이 층에 있다: 다른 판·들판과 서로 보이지 않는다) */
  readonly layer: number;
  st: RoomPhase;
  /** 자리 (빈 자리는 null) */
  seats: (RoomSeat | null)[];
  /** 판을 연 자리 수 (명령 host의 n: 자리 수가 범위인 판에서 고른 수, 아니면 max). 같은 무리로 다음 판에서 다시 이만큼 연다 */
  size: number;
  /** 두는 자리 (두는 중이 아니면 -1. 실시간 판은 늘 -1) */
  turn: number;
  /** 이번 판에서 먼저 둔 자리 (한 바퀴의 시작) */
  first: number;
  /** 몇째 바퀴 (1부터) */
  round: number;
  /** 이번 차례가 끝나는 때(ms, g.now). 기한이 없으면 0. 실시간 판은 판이 끝나는 때 */
  deadline: number;
  /** 끝났으면 이긴 자리 (비김 -2, 1등이 여럿이어도 -2), 아니면 -1 */
  win: number;
  why: string;
  /** 등수로 끝낸 판의 자리마다 등수 (1부터, 같으면 같은 등수). finish에 등수를 주지 않았으면 빈 배열 (rankOf가 이김/짐에서 셈한다) */
  ranks: number[];
  /** finish에 준 자리마다의 점수 (주지 않았으면 빈 배열): 결과 창이 등수 옆에 적는다 */
  scores: number[];
  data: D;
  /** 이 판에 놓은 엔티티 (판이 닫히거나 다시 시작하면 치운다) */
  readonly ents: Set<number>;
  /** 판을 연 때(ms): 기다리다 컴퓨터로 채우는 셈 (RoomDef.cpuAfterS) */
  openedAt: number;
  /** 컴퓨터가 다음 수를 두는 때(ms, g.now). 차례가 시작될 때(turnStart보다 먼저) 틀이 정하므로, 게임이 turnStart에서 늦출 수 있다 (펼친 결과를 보여 줄 동안 쉬기) */
  cpuAt: number;
  /** 화면에 보낼 것이 바뀌면 오른다 (개인 상태 room을 다시 보낸다) */
  ver: number;
  /** 방 코드 (RoomDef.codes가 아니면 빈 문자열), 공개 설정, 비밀번호의 해시 */
  code: string;
  privacy: RoomPrivacy;
  pass: string;
  /** 방장의 열쇠 (RoomDef.lead가 아니거나 방장이 없으면 빈 문자열) */
  lead: string;
  /** 방장이 내보낸 사람들 (이 판에 다시 들어오지 못한다) */
  readonly banned: Set<string>;
  /** 방장이 고른 규칙 (RoomDef.options: 이름 → 값). start에서 읽는다 */
  opts: Record<string, string | number>;
  /** 구경하는 사람들 (열쇠 → 구경꾼) */
  readonly watchers: Map<string, RoomWatcher>;
  /** 진행 중인 투표 */
  vote: RoomVote | null;
  // ---- 경쟁 (묶음 8) ----
  /** 이번 판의 시드 (RoomDef.replay나 rated인 판: 판을 차릴 때마다 새로. 아니면 0) */
  seed: number;
  /** 정해진 난수 (0 이상 1 미만): 시드가 있으면 시드에서, 없으면 Math.random. 결정적 판(리플레이)은 판의 난수를 모두 이것으로 */
  rng(): number;
  /** 자리마다 둔 수 (g.rooms.myTurn이 답한 수: 첫 수 전 이탈은 레이팅에 들지 않고, 잠수는 시간 넘김 사이에 수가 늘지 않은 것) */
  moves: number[];
  /** 판을 떠난 자리 (두는 중에 나감, 끊긴 채 돌아오지 않음, 잠수): 이탈 제재와 랭크 판의 패배 */
  readonly leavers: Map<number, 'leave' | 'left' | 'afk'>;
  /** 큐가 짝지은 랭크 판 (RoomDef.rated: 레이팅에 든다) */
  rated: boolean;
  /** 끝난 판의 리플레이 id (없으면 0) */
  rp: number;
}

/** 리플레이를 적는 중 (판마다) */
interface ReplayRec { at0: number; names: string[]; inputs: ReplayView['inputs']; frames: ReplayView['frames']; lastVer: number }
/** 정해진 난수 (mulberry32) */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** 자리 (월드 좌표와 바라보는 방향: 틀의 face, atan2(dx, dz)) */
export interface Spot { x: number; z: number; face?: number }

/**
 * 판의 규칙 (g.rooms.define). 칸은 모두 선택이고, start만 꼭 준다. 시간은 g.now()(벽시계, 시험은 정해진 시계)로 잰다
 */
export interface RoomDef<D = unknown> {
  /** 판의 이름: 게임에 판이 여럿이면 이름마다 define을 한 번씩 (처음 것이 기본: 빠른 대국·컴퓨터와 두기). 기본 'main' */
  id?: string;
  /**
   * 자리 수 (기본 2). { min, max }면 판은 max 자리로 열리고, min 이상 모이면 모인 만큼으로 시작할 수 있다
   * (가장 먼저 앉은 사람의 '지금 시작'(명령 room a:'start'), 또는 startAfterS가 지나면 저절로). 다 차면 곧바로 시작한다.
   * 판을 여는 사람이 자리 수를 고를 수도 있다 (명령 host의 n: min~max)
   */
  seats?: number | { min: number; max: number };
  /** 자리 수가 범위인 판: 판을 열고 이만큼(초) 지나 사람이 min 이상이면 모인 만큼으로 시작한다. 0이면 저절로 시작하지 않는다 (기본 0) */
  startAfterS?: number;
  /** 컴퓨터가 채우는 자리 (cpuAfterS, '컴퓨터와 두기'): 'max'는 빈 자리 모두 (기본), 'min'은 사람과 합쳐 min이 될 만큼만 (사람이 min 이상이면 컴퓨터 없이) */
  cpuFill?: 'max' | 'min';
  /** 한 차례의 제한 시간(초). 0이면 기한이 없다 (기본 30) */
  turnS?: number;
  /** 바퀴의 상한: 넘으면 outOfRounds (0이면 없다, 기본 0) */
  rounds?: number;
  /** 끊긴 사람을 기다리는 초: 지나면 그 자리는 판에서 빠진다(두는 중이면 몰수, 까닭 'left') (기본 60) */
  graceS?: number;
  /** 동시에 열 수 있는 판의 수 (기본 200: 판의 이름마다) */
  max?: number;
  /** 판을 열고 이만큼(초) 기다려도 사람이 차지 않으면 빈 자리를 컴퓨터로 채워 시작한다. 0이면 채우지 않는다 (cpu가 있어야 한다. 기본 0) */
  cpuAfterS?: number;
  /** 컴퓨터가 한 수를 두는 간격(ms): 사람이 보고 따라갈 수 있게 (기본 700) */
  cpuStepMs?: number;
  /** 앉은 동안 걸을 수 있는가 (기본 false: 판에 앉으면 g.rules.speed가 0, 화면의 조이스틱이 숨는다) */
  walk?: boolean;
  /** 사람이 '차례 넘기기'(명령 room a:'pass')를 할 수 있는가 (기본 true) */
  pass?: boolean;
  /** 다시 하기에서 자리를 한 칸씩 돌린다: 먼저 두는 사람이 바뀐다 (기본 true) */
  againSwap?: boolean;
  /** 바퀴마다 먼저 두는 자리(room.first)를 다음의 빠지지 않은 자리로 옮긴다: 넷이면 1바퀴는 0부터, 2바퀴는 1부터 … (기본 false: 늘 같은 자리가 먼저) */
  rotateFirst?: boolean;
  /**
   * 자리 하나가 판에서 빠졌을 때(기권·몰수·두는 중에 나가기) 남은 자리가 둘 이상이면: false(기본)는 남은 사람끼리 이어 간다(빠진 자리의 차례는 건너뛴다),
   * true는 판을 끝낸다 (out이 finish를 부르지 않았으면 남은 자리가 함께 1등, 빠진 자리가 그 다음 등수). 남은 자리가 하나면 어느 쪽이든 그 자리가 이긴다
   */
  outEnds?: boolean;
  // ---- 판의 공통화 (묶음 7). 모두 선택: 주지 않으면 예전 그대로 ----
  /** 방 코드(6자)·초대 링크(?join=코드)·공개 설정(public/private/friends/password)을 쓴다 (기본 false: 코드 없이 모두 공개) */
  codes?: boolean;
  /** 방장: 판을 연 사람이 방장이고 강퇴·위임·규칙 고르기·시작을 한다. 방장이 나가면 다음 사람에게 넘어간다(돌아와도 되돌리지 않는다). 다 차도 저절로 시작하지 않고, 사람이 모두 준비하면 방장이 시작한다 (기본 false) */
  lead?: boolean;
  /** 방장이 고르는 규칙: 이름 → 고를 값들(첫 값이 기본). 판의 room.opts에 들어가고 start에서 읽는다. 방장이 없는 판은 가장 먼저 앉은 사람이 고른다 */
  options?: Record<string, readonly (string | number)[]>;
  /** 투표의 초: 앉은 사람 누구나 규칙 바꾸기·다시 하기·내보내기를 내고, 과반이 찬성하면 된다 (0이면 투표 없음, 기본 0) */
  voteS?: number;
  /** 관전: 앉지 않고 구경한다. delayS는 관전 지연(초: 0이면 판의 층에서 실시간으로 보고, 0보다 크면 층에 들지 않고 늦은 상태만 받는다), max는 판마다 구경꾼 상한 (기본 20). 없으면 관전 없음 */
  watch?: { delayS?: number; max?: number };
  /** 구경꾼이 보는 판 상태 (숨은 정보를 빼고: 손패·비밀 수 …). 관전 지연만큼 늦게 간다(RoomView.pub). 없으면 틀의 판 모양(자리·차례·결과)만 */
  watchView?(room: Room<D>): unknown;
  /** 두는 중에 들어오기: 'seat'(협동형)면 떠난 자리나 남은 자리에 앉고 catchUp이 불린다. 없으면 관전이 있는 판은 관전 대기(다음 판에 앉는다), 아니면 들어가지 못한다 */
  midJoin?: 'seat';
  /** 판 중간에 앉은 사람을 따라잡게 하는 고리 (midJoin 'seat': 앞선 사람만큼의 보상·말을 주기) */
  catchUp?(room: Room<D>, seat: number): void;
  /** 차례 없는 실시간 판: 판의 길이(초). 주면 차례·기한·넘기기가 없고 앉은 사람 모두가 동시에 둔다 (g.rooms.myTurn이 빠지지 않은 자리면 언제나 답한다). 컴퓨터는 cpuStepMs마다 자리마다 cpu */
  realtimeS?: number;
  /** 실시간 판의 시간이 다 됐다: finish로 끝을 정한다. 없으면 비김 (까닭 'time') */
  timeUp?(room: Room<D>): void;
  /** 판 기록: 끝난 판의 결과를 저장 키마다 적는다 → 전적·프로필 (명령 room a:'stats'). 손님과 컴퓨터는 적지 않는다 (기본 false) */
  record?: boolean;
  /** 컴퓨터 자리의 이름 (컴퓨터로 채울 때 자리마다 한 번, 40자까지). 없으면 화면이 언어 파일의 roomCpu로 적는다 (컴퓨터가 둘 이상이면 번호를 붙인다) */
  cpuName?(room: Room<D>, seat: number): string;
  /** 자리 i에 앉은 사람이 서는 곳 (판의 층 안). 없으면 사람은 제자리에서 판의 층으로만 옮긴다 */
  seatAt?(room: Room<D>, seat: number): Spot;
  /** 판 밖의 자리: 판을 떠날 때, 그리고 판 없이 접속한 사람(서버를 다시 켜서 판이 없어졌거나 끝난 판의 자리에서 나간 사람). 없으면 제자리 */
  exitAt?(p: Ent): Spot;
  /** 판을 차린다: 판 상태(room.data)를 만들고 말을 놓는다 (room.place). 판이 시작할 때와 다시 하기마다. 놓았던 엔티티는 이미 치웠다 */
  start(room: Room<D>): void;
  /** 그 자리의 차례가 시작됐다 / 끝난다 (넘기기 전에: 등불돌의 회복 같은 것) */
  turnStart?(room: Room<D>, seat: number): void;
  turnEnd?(room: Room<D>, seat: number): void;
  /** 이번에 그 자리의 차례를 건너뛸까 (참이면 빠진 자리처럼 지나간다: turnStart·turnEnd도 불리지 않는다). 다음 바퀴의 모든 자리가 건너뛰면 틀은 건너뛰기를 무시한다 */
  skip?(room: Room<D>, seat: number): boolean;
  /**
   * 한 바퀴가 끝났다 (마지막 자리의 turnEnd 뒤, 다음 바퀴의 round·first를 정하기 전: room.round는 끝난 바퀴). 펼치기·점수 셈 같은 바퀴의 일.
   * finish를 불러 판을 끝내도 되고, room.first를 바꿔 다음 바퀴를 먼저 둘 자리를 정해도 된다 (rotateFirst는 그 뒤에 한 칸 옮긴다)
   */
  roundEnd?(room: Room<D>): void;
  /** 자리 하나가 판에서 빠졌다 (why: 'resign' 기권·나가기, 'left' 몰수). 남은 자리가 둘 이상일 때만, 틀이 이어 갈지 끝낼지(outEnds) 정하기 전에 불린다: 여기서 finish를 불러도 된다 */
  out?(room: Room<D>, seat: number, why: string): void;
  /** 그 자리의 시간이 다 됐다. 없으면 차례를 넘긴다 (g.rooms.pass). 모두에게 roomTimeout을 알린 뒤에 불린다 */
  timeout?(room: Room<D>, seat: number): void;
  /** 컴퓨터의 한 수 (cpuStepMs마다 불린다). 할 것이 없으면 g.rooms.pass(room). 없으면 컴퓨터는 늘 넘긴다 (그런 판에서는 컴퓨터와 두기가 막힌다) */
  cpu?(room: Room<D>, seat: number): void;
  /** 바퀴를 다 썼다: 게임이 finish로 끝을 정한다. 없으면 비김 (까닭 'rounds') */
  outOfRounds?(room: Room<D>): void;
  /** 판이 끝났다 (finish 뒤): 전적 같은 것을 적는다. 접속해 있는 사람은 g.rooms.playerAt(room, i) */
  finished?(room: Room<D>): void;
  /** 판 상태를 저장할 값으로 (주면 두는 중인 판이 월드와 함께 저장되어 서버를 다시 켜도 이어진다: load와 짝) */
  save?(room: Room<D>): unknown;
  /** 저장한 값으로 판 상태와 엔티티를 되살린다 (room.place). 예외를 던지면 그 판은 버린다 */
  load?(room: Room<D>, raw: unknown): void;
  // ---- 경쟁 (묶음 8). 모두 선택: 주지 않으면 예전 그대로 ----
  /**
   * 랭크 판: ranked 모듈의 큐(빠른 대국이 큐가 된다)로 짝지은 판이 레이팅에 든다. true면 사다리 이름이 판의 이름, 글이면 그 사다리(판 여럿이 한 레이팅을 함께 쓴다).
   * 방 만들기·코드로 연 판은 레이팅에 들지 않는다
   */
  rated?: boolean | string;
  /** 큐가 사람을 기다리다 이만큼(초) 지나면 빈 자리를 봇(컴퓨터 자리, 화면에 '봇'이라고 적는다)으로 채운다. 없거나 0이면 봇 없음 (cpu가 있어야 한다) */
  queueBots?: number;
  /** 팀 판: 자리의 팀 (같은 팀끼리는 레이팅을 견주지 않는다). 없으면 모두 따로 */
  teamOf?(room: Room<D>, seat: number): number;
  /**
   * 리플레이: 판의 시드와 입력(cmds의 게임 명령, 컴퓨터의 수, 시간 넘김)과 프레임(판이 바뀔 때마다 view의 모양)을 적어 판이 끝나면 저장한다.
   * view는 숨은 정보까지 다 담아도 된다(끝난 뒤에만, 앉았던 사람만 본다). 보관 기간은 COMPETE.replayDays(기본 7일). 결정적 판은 판의 난수를 room.rng로
   */
  replay?: { cmds: readonly string[]; view(room: Room<D>): unknown; maxFrames?: number };
}

const MSG_ROOM = new Set(['quick', 'host', 'cpu', 'join', 'leave', 'pass', 'resign', 'again', 'start', 'code', 'watch', 'privacy', 'kick', 'give', 'ready', 'opt', 'vote', 'ballot', 'regroup', 'stats']);
/** 리플레이를 메모리에 두는 수 (저장소가 없을 때), 한 판의 프레임·입력 상한 (기본), 보관 기간을 훑는 간격(ms) */
const MEM_REPLAYS = 200, REPLAY_FRAMES = 600, PRUNE_MS = 600_000;
/** 저장한 판에서 읽는 칸의 상한 (깨진 저장을 막는다) */
const SEATS_MAX = 16;
/** 판 기록을 메모리에 두는 줄 수 (저장소가 없을 때), 전적을 셀 때 읽는 줄 수, 전적 창의 최근 판 */
const MEM_RECORDS = 20_000, STATS_ROWS = 2000, STATS_RECENT = 10;
/** 관전 지연의 기록: 판마다 이만큼까지 */
const HIST_MAX = 400;

type AnyDef = RoomDef<unknown>;

export class Rooms {
  /** 판의 이름 → 규칙 (넣은 차례: 처음 것이 기본) */
  private readonly defs = new Map<string, AnyDef>();
  private readonly rooms = new Map<number, Room<unknown>>();
  /** 사람의 열쇠 → 앉은 판 id */
  private readonly seated = new Map<string, number>();
  /** 사람의 열쇠 → 구경하는 판 id */
  private readonly watching = new Map<string, number>();
  /** 앉기 전의 들판 층 (열쇠마다): 판을 떠나면 돌아간다 */
  private readonly back = new Map<string, number>();
  /** 사람(엔티티 id)마다 마지막으로 보낸 판의 버전 (개인 상태 room) */
  private readonly sentVer = new Map<number, string>();
  /** 관전 지연: 판마다 늦게 보낼 모양들 (때와 모양) */
  private readonly hist = new Map<number, { at: number; ver: number; view: RoomView }[]>();
  /** 방 코드 (RoomDef.codes) */
  private readonly codes: Invites<number>;
  private store: RoomStore | null = null;
  private memRecords: RoomRecordRow[] = [];
  private nextId = 1;
  /** 판의 저장을 월드 저장에 걸었다 (save와 load를 준 판이 하나라도 있다) */
  private saving = false;
  /** 리플레이를 적는 중인 판 (묶음 8), 메모리의 리플레이(저장소가 없을 때), 마지막으로 오래된 리플레이를 지운 때 */
  private readonly recs = new Map<number, ReplayRec>();
  private memReplays: { id: number; at: number; def: string; keys: string[]; data: ReplayView }[] = [];
  private memReplaySeq = 0;
  private prunedAt = 0;
  /**
   * 다른 시스템이 판에 거는 고리 (묶음 8: ranked 모듈). finish 판이 끝났다(게임의 finished 뒤), timeout 시간 넘김(게임의 처리 전), quick 빠른 대국을 가로챈다(참이면 판을 열지 않는다),
   * guard 판에 앉기 전의 검사(거짓이면 막는다: 큐 금지)
   */
  readonly hooks = {
    finish: [] as ((room: Room<unknown>) => void)[],
    timeout: [] as ((room: Room<unknown>, seat: number) => void)[],
    quick: null as ((p: Ent, def: string) => boolean) | null,
  };

  constructor(private g: Game) {
    this.codes = new Invites<number>(g);
    g.commands.set('room', (p, m) => this.command(p, m));
    g.commands.set('replay', (p, m) => { if (typeof m.id === 'number' && Number.isInteger(m.id)) this.sendReplay(p, m.id); });
    g.ticks.push(() => this.tick());
    g.personal.push({
      name: 'room',
      state: (p): RoomView | null => this.view(p),
      dirty: (p) => this.sentVer.get(p.id) !== this.verOf(p),
      sent: (p) => { this.sentVer.set(p.id, this.verOf(p)); },
    });
    g.shared.push({ name: 'rooms', state: (): RoomLobby => this.lobby() });
    g.on('playerJoined', (p) => this.joined(p));
    g.on('playerLeft', (id) => this.left(id));
    // 앉은 사람(과 판의 층에서 구경하는 사람)은 걷지 않는다 (RoomDef.walk). 모든 시스템과 게임의 규칙이 g.rules.speed를 정한 뒤에 감싼다
    g.ready.push(() => {
      const walk = g.rules.speed;
      g.rules.speed = (p) => (this.defs.size && this.still(p) ? 0 : walk(p));
    });
    // 내 데이터: 내보내기에 내 판 기록, 지우기는 그 줄들을 지운다
    personalData(g).push({
      name: 'rooms',
      get: (pid) => { const rows = this.records(pid, MEM_RECORDS); return rows.length ? rows : undefined; },
      erase: (pid) => {
        if (this.store) { this.store.forgetRoomRecords(pid); this.store.forgetReplays?.(pid); } else this.memRecords = this.memRecords.filter((r) => r.key !== pid);
        this.memReplays = this.memReplays.filter((r) => !r.keys.includes(pid));
      },
    });
    // 리플레이 (RoomDef.replay): 그 판의 게임 명령을 감싸 입력을 적는다. 모든 플러그인이 명령을 등록한 뒤에
    g.ready.push(() => {
      const cmds = new Set([...this.defs.values()].flatMap((d) => d.replay?.cmds ?? []));
      for (const name of cmds) {
        const fn = g.commands.get(name);
        if (!fn) continue;
        g.commands.set(name, (p, m) => {
          const room = this.of(p), rec = room && room.st === 'play' ? this.recs.get(room.id) : undefined;
          if (!rec || !room) { fn(p, m); return; }
          // 먼저 적고, 판이 바뀌지 않았으면(받지 않은 수) 거둔다: 그 수로 판이 끝나도 입력이 리플레이에 든다
          const ver = room.ver, { t: _t, ...rest } = m, mark = rec.inputs.length;
          this.input(room, this.seatOf(room, p), { c: name, ...rest });
          fn(p, m);
          if (room.ver === ver && this.recs.get(room.id) === rec) rec.inputs.length = mark;
        });
      }
    });
  }

  /** 사람의 열쇠: 저장 키, 손님은 엔티티 id */
  static keyOf(p: Ent): string { return p.pid || `guest:${p.id}`; }

  /** 판의 규칙을 준다 (플러그인에서 판의 이름마다 한 번). 주지 않으면 판을 열 수 없다 (명령을 무시한다) */
  define<D>(def: RoomDef<D>): void {
    const id = def.id ?? 'main';
    if (this.defs.has(id)) throw new Error(`g.rooms.define은 판의 이름마다 한 번만 부릅니다 (id '${id}')`);
    if (!/^[a-z][a-z0-9_-]{0,23}$/i.test(id)) throw new Error(`RoomDef.id는 영문자로 시작하는 24자 이내입니다 ('${id}')`);
    const s = def.seats ?? 2, [lo, hi] = typeof s === 'number' ? [s, s] : [s.min, s.max];
    if (![lo, hi].every((n) => Number.isInteger(n) && n >= 1 && n <= SEATS_MAX) || lo > hi) throw new Error(`RoomDef.seats는 1~${SEATS_MAX}의 정수이거나 { min, max }(min ≤ max)입니다 (${JSON.stringify(s)})`);
    for (const [k, vs] of Object.entries(def.options ?? {})) if (!Array.isArray(vs) || !vs.length || vs.some((v) => typeof v !== 'string' && typeof v !== 'number')) throw new Error(`RoomDef.options.${k}는 고를 값(글자나 수)이 하나 이상인 배열입니다`);
    if (def.realtimeS !== undefined && !(def.realtimeS > 0)) throw new Error('RoomDef.realtimeS는 0보다 큰 초입니다');
    this.defs.set(id, def as AnyDef);
    if (def.save && def.load && !this.saving) { this.saving = true; this.g.worldSaves.push({ name: 'rooms', save: () => this.saveAll(), load: (raw) => this.loadAll(raw) }); }
    this.g.stateDirty = true;
  }

  /** 저장소를 붙인다 (통신 계층이 서버를 켤 때): 판 기록(RoomDef.record)이 그 저장소에 적힌다 */
  attach(store: RoomStore): void { this.store = store; }

  /** 기본 판의 규칙 (처음 define한 것) */
  private get main(): AnyDef | undefined { return this.defs.values().next().value; }
  private dOf(room: Room<unknown>): AnyDef { return this.defs.get(room.def) ?? this.main!; }
  private defBy(id: unknown): AnyDef | undefined { return typeof id === 'string' ? this.defs.get(id) : this.main; }
  private idOf(def: AnyDef): string { return def.id ?? 'main'; }
  /** 판을 여는 자리 수 (범위면 max) */
  private sizeOf(def: AnyDef): number { const s = def.seats ?? 2; return typeof s === 'number' ? s : s.max; }
  /** 시작할 수 있는 가장 적은 자리 수 (범위가 아니면 size) */
  private minOf(def: AnyDef): number { const s = def.seats ?? 2; return typeof s === 'number' ? s : s.min; }
  private turnMsOf(def: AnyDef): number { return def.realtimeS ? def.realtimeS * 1000 : Math.max(0, def.turnS ?? 30) * 1000; }
  private delayMs(def: AnyDef): number { return Math.max(0, def.watch?.delayS ?? 0) * 1000; }

  // ---------- 읽기 ----------

  /** 판의 이름들 (define한 차례)과 그 규칙 (묶음 8: 랭크 판의 사다리를 고른다) */
  defIds(): string[] { return [...this.defs.keys()]; }
  defOf(id: string): RoomDef<unknown> | undefined { return this.defs.get(id); }
  /** 그 판의 자리 수 범위 */
  seatsOf(id: string): { min: number; max: number } { const d = this.defs.get(id); return d ? { min: this.minOf(d), max: this.sizeOf(d) } : { min: 0, max: 0 }; }
  /** 그 사람의 열쇠가 판에 앉아 있는가 */
  seatedKey(key: string): boolean { return this.seated.has(key); }
  /** 그 사람이 앉은 판 (기다리는 판, 끝난 판도) */
  of<D = unknown>(p: Ent): Room<D> | undefined { const id = this.seated.get(Rooms.keyOf(p)); return id === undefined ? undefined : (this.rooms.get(id) as Room<D> | undefined); }
  /** 그 사람이 구경하는 판 */
  watched<D = unknown>(p: Ent): Room<D> | undefined { const id = this.watching.get(Rooms.keyOf(p)); return id === undefined ? undefined : (this.rooms.get(id) as Room<D> | undefined); }
  /** 판 (id) */
  get<D = unknown>(id: number): Room<D> | undefined { return this.rooms.get(id) as Room<D> | undefined; }
  /** 방 코드의 판 */
  byCode<D = unknown>(code: string): Room<D> | undefined { const id = this.codes.find(code); return id === undefined ? undefined : (this.rooms.get(id) as Room<D> | undefined); }
  /** 열린 판들 */
  all(): Room<unknown>[] { return [...this.rooms.values()]; }
  /** 열린 판의 수 */
  get count(): number { return this.rooms.size; }
  /** 그 사람의 자리 번호 (앉지 않았으면 -1) */
  seatOf(room: Room<unknown>, p: Ent): number { const k = Rooms.keyOf(p); return room.seats.findIndex((s) => !!s && !s.cpu && s.key === k); }
  /** 자리 i에 앉아 지금 접속해 있는 사람 (컴퓨터, 빈 자리, 끊긴 사람이면 undefined) */
  playerAt(room: Room<unknown>, i: number): Ent | undefined {
    const s = room.seats[i];
    return s && !s.cpu && s.goneAt === 0 ? this.g.ents.get(s.ent) : undefined;
  }
  /**
   * 끝난 판에서 자리 i의 등수 (1부터, 끝나지 않았으면 0). finish에 등수를 주었으면 그것, 아니면 이김/짐에서: 이긴 자리 1, 나머지 2, 비김이면 모두 1.
   * 전적을 적을 때(finished) 둘의 판과 여럿의 판을 같은 셈으로 읽는다
   */
  rankOf(room: Room<unknown>, i: number): number {
    if (room.st !== 'over' || !room.seats[i]) return 0;
    if (room.ranks.length) return room.ranks[i] ?? 0;
    return room.win === -2 || room.win === i ? 1 : 2;
  }
  /** 판에 앉아 접속해 있는 사람들 */
  players(room: Room<unknown>): Ent[] { return room.seats.map((_, i) => this.playerAt(room, i)).filter((p): p is Ent => !!p); }
  /** 판을 구경하는 사람들 (접속해 있는) */
  watchersOf(room: Room<unknown>): Ent[] { return [...room.watchers.values()].map((w) => this.g.ents.get(w.ent)).filter((p): p is Ent => !!p); }
  /** 그 사람이 판에 앉아(또는 판의 층에서 구경하고) 있는가 (채널이 그 사람을 들판에 세우지 않게) */
  holds(p: Ent): boolean {
    const r = this.of(p) ?? this.watched(p);
    return !!r && !isField(p.layer) && p.layer === r.layer;
  }
  /** 걷지 않는 사람: 걷지 않는 판에 앉았거나 그 판의 층에서 구경한다 */
  private still(p: Ent): boolean {
    const r = this.of(p) ?? (this.watched(p)?.watchers.get(Rooms.keyOf(p))?.onLayer ? this.watched(p) : undefined);
    return !!r && !this.dOf(r).walk;
  }

  /**
   * 그 사람이 두는 중인 판에서 자기 차례인가 (게임 명령의 검사): 맞으면 판과 자리, 아니면 null.
   * 판에 앉아 두는 중인데 차례가 아니면 roomNotTurn을 알린다. 실시간 판(realtimeS)은 빠지지 않은 자리면 언제나 답한다
   */
  myTurn<D = unknown>(p: Ent): { room: Room<D>; seat: number } | null {
    const room = this.of<D>(p);
    if (!room || room.st !== 'play') return null;
    const seat = this.seatOf(room as Room<unknown>, p);
    if (this.dOf(room as Room<unknown>).realtimeS) { if (seat < 0 || room.seats[seat]!.out) return null; room.moves[seat]++; return { room, seat }; }
    if (seat !== room.turn) { this.g.notify(p, 'roomNotTurn'); return null; }
    room.moves[seat]++;
    return { room, seat };
  }

  // ---------- 판 위의 엔티티 ----------

  /** 판의 층에 게임의 종류를 놓는다 (g.place와 같고 층만 판의 것). 판이 다시 시작하거나 닫히면 치운다 */
  place(room: Room<unknown>, kind: string, at: { x: number; z: number; type?: string; name?: string; face?: number }): Ent {
    const e = this.g.place(kind, { ...at, layer: room.layer });
    room.ents.add(e.id);
    return e;
  }
  /** 판에 놓은 엔티티 하나를 치운다 */
  unplace(room: Room<unknown>, id: number): void { room.ents.delete(id); this.g.remove(id); }

  /** 판의 화면 상태가 바뀌었다 (틀이 모르는 바뀜을 게임이 알릴 때: 개인 상태 room을 다시 보낸다) */
  touch(room: Room<unknown>): void {
    room.ver++;
    if (this.dOf(room).save) this.g.saveDirty = true;
    if (room.st === 'play') this.frame(room);
  }

  // ---------- 명령 ----------

  private command(p: Ent, m: Record<string, unknown>): void {
    const a = m.a;
    if (!this.defs.size || typeof a !== 'string' || !MSG_ROOM.has(a)) return;
    const int = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);
    switch (a) {
      case 'quick': this.quick(p, m.def); return;
      case 'host': this.host(p, m.def, int(m.n)); return;
      case 'cpu': this.withCpu(p, m.def); return;
      case 'join': { const id = int(m.id); if (id !== undefined) this.join(p, id, { pass: m.pass }); return; }
      case 'code': this.joinCode(p, m.code, m.pass); return;
      case 'watch': this.watch(p, int(m.id), m.code); return;
      case 'leave': this.leave(p); return;
      case 'pass': { const r = this.of(p); if (r && this.dOf(r).pass !== false && !this.dOf(r).realtimeS) { const t = this.myTurn(p); if (t) this.pass(t.room); } return; }
      case 'resign': this.resign(p); return;
      case 'again': this.again(p); return;
      case 'start': this.startNow(p); return;
      case 'privacy': this.setPrivacy(p, m.v, m.pass); return;
      case 'kick': { const s = int(m.seat); if (s !== undefined) this.kick(p, s); return; }
      case 'give': { const s = int(m.seat); if (s !== undefined) this.give(p, s); return; }
      case 'ready': this.ready(p, m.on !== false); return;
      case 'opt': if (typeof m.k === 'string') this.setOpt(p, m.k, m.v); return;
      case 'vote': this.propose(p, m); return;
      case 'ballot': this.ballot(p, m.yes === true); return;
      case 'regroup': this.regroup(p); return;
      case 'stats': this.sendStats(p, int(m.seat), int(m.id)); return;
    }
  }

  /** 앉아 있으면 알리고 참. 구경하던 사람은 구경을 그만두고 들어간다 */
  private busy(p: Ent): boolean {
    if (this.watching.has(Rooms.keyOf(p))) this.unwatch(p);
    if (!this.seated.has(Rooms.keyOf(p))) return false;
    this.g.notify(p, 'roomBusy');
    return true;
  }

  /** 빠른 대국: 그 판의 이름(없으면 기본)으로 기다리는 공개 판 가운데 가장 먼저 연 판에 들어가고, 없으면 판을 열고 기다린다 */
  quick(p: Ent, defId?: unknown): void {
    const def = this.defBy(defId);
    if (!def) return;
    // 랭크 판의 빠른 대국은 큐로 (ranked 모듈)
    if (def.rated && this.hooks.quick && !this.seated.has(Rooms.keyOf(p)) && this.hooks.quick(p, this.idOf(def))) return;
    if (this.busy(p)) return;
    const open = [...this.rooms.values()].find((r) => r.def === this.idOf(def) && r.privacy === 'public' && this.joinable(r) && !r.banned.has(Rooms.keyOf(p)));
    if (open) this.join(p, open.id); else this.host(p, defId);
  }

  /** 판을 연다 (사람이 다 차면 시작한다: 방장이 있는 판은 방장이 시작한다). n: 자리 수가 범위인 판에서 고른 자리 수 */
  host(p: Ent, defId?: unknown, n?: number): Room<unknown> | undefined {
    const def = this.defBy(defId);
    if (!def || this.busy(p) || p.bot) return undefined;
    const id = this.idOf(def);
    if ([...this.rooms.values()].filter((r) => r.def === id).length >= (def.max ?? 200)) { this.g.notify(p, 'roomFull'); return undefined; }
    const now = this.g.now();
    const size = n !== undefined && n >= this.minOf(def) && n <= this.sizeOf(def) ? n : this.sizeOf(def);
    const room: Room<unknown> = {
      id: this.nextId++, def: id, layer: instanceLayer(this.g), st: 'wait', seats: Array.from({ length: size }, () => null), size, turn: -1, first: 0, round: 1,
      deadline: 0, win: -1, why: '', ranks: [], scores: [], data: undefined, ents: new Set(), openedAt: now, cpuAt: 0, ver: 0,
      code: '', privacy: 'public', pass: '', lead: def.lead ? Rooms.keyOf(p) : '', banned: new Set(), opts: this.defaultOpts(def), watchers: new Map(), vote: null,
      seed: 0, rng: Math.random, moves: [], leavers: new Map(), rated: false, rp: 0,
    };
    if (def.codes) room.code = this.codes.issue(room.id);
    this.rooms.set(room.id, room);
    this.sit(room, p, 0);
    this.g.stateDirty = true;
    if (!this.fillIfFull(room)) this.g.notify(p, 'roomWait');
    return room;
  }

  private defaultOpts(def: AnyDef): Record<string, string | number> {
    return Object.fromEntries(Object.entries(def.options ?? {}).map(([k, vs]) => [k, vs[0]]));
  }

  /** 컴퓨터와 두기: 판을 열고 기다리던 사람(방장)이면 그 판의 빈 자리를 컴퓨터로, 아니면 새 판을 열어 컴퓨터로 채운다 */
  withCpu(p: Ent, defId?: unknown): void {
    const r = this.of(p);
    const def = r && r.st === 'wait' ? this.dOf(r) : this.defBy(defId);
    if (!def) return;
    if (!def.cpu) { this.g.notify(p, 'roomGone'); return; }
    if (r && r.st === 'wait' && this.isLead(r, p)) { if (this.readyToGo(r, p)) this.fillCpu(r); return; }
    const room = this.host(p, defId);
    if (room && room.st === 'wait') this.fillCpu(room);
  }

  /** 그 사람이 이 판의 방장인가 (방장이 없는 판은 가장 먼저 앉은 사람) */
  private isLead(room: Room<unknown>, p: Ent): boolean {
    if (this.dOf(room).lead) return room.lead === Rooms.keyOf(p);
    const lead = room.seats.findIndex((s) => !!s && !s.cpu);
    return lead >= 0 && this.seatOf(room, p) === lead;
  }
  /** 방장이 있는 판: 방장 말고 앉은 사람이 모두 준비했는가 (아니면 알린다) */
  private readyToGo(room: Room<unknown>, p: Ent): boolean {
    if (!this.dOf(room).lead) return true;
    const not = room.seats.filter((s) => !!s && !s.cpu && s.key !== room.lead && !s.ready);
    if (not.length) { this.g.notify(p, 'roomNotReady', not.length); return false; }
    return true;
  }

  /** 지금 시작: 기다리는 판의 방장(방장이 없으면 가장 먼저 앉은 사람)이, 앉은 사람이 min 이상이면 모인 만큼으로 시작한다 */
  startNow(p: Ent): void {
    const r = this.of(p);
    if (!r || r.st !== 'wait') return;
    if (!this.isLead(r, p)) { if (this.dOf(r).lead) this.g.notify(p, 'roomLeadOnly'); return; }
    const min = this.minOf(this.dOf(r));
    if (r.seats.filter((s) => !!s).length < min) { this.g.notify(p, 'roomFewer', min); return; }
    if (!this.readyToGo(r, p)) return;
    this.startWithPresent(r);
  }

  /** 앉은 사람만으로 시작한다: 빈 자리를 빼고 자리를 앞으로 당긴다 */
  private startWithPresent(room: Room<unknown>): void {
    room.seats = room.seats.filter((s) => !!s);
    this.g.stateDirty = true;
    this.start(room);
  }

  /** 문을 지나갈 수 있는가 (공개 설정·내보냄): 못 지나가면 까닭을 알리고 false */
  private door(room: Room<unknown>, p: Ent, o: { byCode?: boolean; pass?: unknown }): boolean {
    if (room.banned.has(Rooms.keyOf(p))) { this.g.notify(p, 'roomBanned'); return false; }
    const lead = room.seats.find((s) => !!s && !s.cpu && s.key === room.lead) ?? room.seats.find((s) => !!s && !s.cpu);
    const ans = this.codes.enter({ privacy: room.privacy, pass: room.pass }, p, lead && lead.goneAt === 0 ? this.g.ents.get(lead.ent) : undefined, o);
    if (ans === 'ok') return true;
    this.g.notify(p, ans === 'private' ? 'roomGone' : ans === 'friends' ? 'roomFriendsOnly' : ans === 'password' ? 'roomPassword' : 'roomSlow');
    return false;
  }

  /**
   * 판에 들어간다. 기다리는 판이면 빈 자리에 앉는다 (다 차면 시작). 두는 중인 판이면: midJoin 'seat'는 판 중간에 앉고(catchUp),
   * 관전이 있는 판은 관전 대기(다음 판에 앉는다), 아니면 들어가지 못한다
   */
  join(p: Ent, id: number, o: { byCode?: boolean; pass?: unknown } = {}): void {
    if (!this.defs.size || this.busy(p) || p.bot) return;
    const room = this.rooms.get(id);
    if (!room) { this.g.notify(p, 'roomGone'); return; }
    if (!this.door(room, p, o)) return;
    const def = this.dOf(room);
    if (room.st === 'play' && def.midJoin === 'seat' && this.midSeat(room) >= 0) { this.joinMid(room, p); return; }
    if (!this.joinable(room)) {
      if (room.st !== 'wait' && def.watch) this.addWatcher(room, p, true);
      else this.g.notify(p, 'roomGone');
      return;
    }
    this.sit(room, p, room.seats.findIndex((s) => !s));
    this.g.stateDirty = true;
    this.fillIfFull(room);
  }

  /** 방 코드로 들어가기 (초대 링크 ?join=코드도 화면이 이것을 보낸다) */
  joinCode(p: Ent, code: unknown, pass?: unknown): void {
    const room = this.byCode(typeof code === 'string' ? code : '');
    if (!room) { this.g.notify(p, 'roomCodeBad'); return; }
    this.join(p, room.id, { byCode: true, pass });
  }

  private joinable(r: Room<unknown>): boolean { return r.st === 'wait' && r.seats.some((s) => !s) && r.seats.every((s) => !s || s.cpu || s.goneAt === 0); }

  /** 판 중간에 앉을 자리 (midJoin 'seat'): 떠난 사람의 자리, 없으면 판을 연 자리 수보다 적게 시작했을 때 새 자리. 없으면 -1 */
  private midSeat(room: Room<unknown>): number {
    const gone = room.seats.findIndex((s) => !!s && !s.cpu && s.goneAt < 0);
    if (gone >= 0) return gone;
    return room.seats.length < room.size ? room.seats.length : -1;
  }
  private joinMid(room: Room<unknown>, p: Ent): void {
    const i = this.midSeat(room);
    if (i === room.seats.length) room.seats.push(null);
    const old = room.seats[i];
    if (old) { this.seated.delete(old.key); room.seats[i] = null; }
    this.sit(room, p, i);
    this.dOf(room).catchUp?.(room, i);
    this.g.notify(p, 'roomStart', 0, '', room.seats.length);
    for (const q of this.players(room)) if (q !== p) this.g.notify(q, 'roomMidJoin', p.name);
    this.touch(room);
    this.g.stateDirty = true;
  }

  /** 대기실로: 두는 중이면 기권으로 치고 판을 떠난다 (다시 돌아오지 않는다). 구경하던 사람은 구경을 그만둔다 */
  leave(p: Ent): void {
    if (this.watching.has(Rooms.keyOf(p))) { this.unwatch(p); return; }
    const room = this.of(p);
    if (!room) { this.exit(p); return; }
    const i = this.seatOf(room, p);
    if (i >= 0) this.vacate(room, i, 'roomFoeGone');
    this.seated.delete(Rooms.keyOf(p));
    this.exit(p);
    room.ver++;
    this.closeIfEmpty(room);
    this.g.stateDirty = true;
  }

  /** 자리 i의 사람이 판을 떠난다 (나가기·내보내기): 두는 중이면 기권, 기다리는 판은 빈 자리, 끝난 판은 떠난 자리. 방장이면 넘긴다 */
  private vacate(room: Room<unknown>, i: number, tell: 'roomFoeGone' | 'roomKickedOut'): void {
    const s = room.seats[i]!;
    if (room.st === 'play') { if (!s.out) room.leavers.set(i, 'leave'); this.forfeit(room, i, 'resign'); }
    if (room.st === 'wait') room.seats[i] = null; // 기다리는 판의 빈 자리로 돌린다
    else { s.ent = 0; s.goneAt = -1; }
    if (room.st === 'over' || tell === 'roomKickedOut') for (const q of this.players(room)) if (q.id !== s.ent) this.g.notify(q, tell, s.name);
    if (room.vote) { room.vote.yes.delete(s.key); room.vote.no.delete(s.key); }
    if (room.lead === s.key) this.passLead(room);
  }

  /** 방장을 다음 사람(접속해 있는 사람, 자리 차례)에게 넘긴다. 아무도 없으면 비운다 (다음에 앉는 사람이 방장) */
  private passLead(room: Room<unknown>): void {
    if (!this.dOf(room).lead) return;
    const next = room.seats.find((s) => !!s && !s.cpu && s.goneAt === 0 && s.key !== room.lead);
    room.lead = next ? next.key : '';
    if (next) { next.ready = false; for (const q of [...this.players(room), ...this.watchersOf(room)]) this.g.notify(q, 'roomLeadNew', next.name); }
    room.ver++;
  }

  /** 기권: 두는 중인 판에서 빠진다 (둘이 두는 판이면 상대가 이긴다) */
  resign(p: Ent): void {
    const room = this.of(p);
    if (!room || room.st !== 'play') return;
    const i = this.seatOf(room, p);
    if (i >= 0) this.forfeit(room, i, 'resign');
  }

  /** 다시 하기: 컴퓨터만 남았으면 곧바로, 사람끼리는 모두 누르면 (RoomDef.againSwap이면 자리를 한 칸씩 돌려) 새 판. 투표가 있는 판은 다시 하기 투표를 낸다 */
  again(p: Ent): void {
    const room = this.of(p);
    if (!room || room.st !== 'over' || room.rated) return; // 랭크 판은 다시 큐로 (같은 상대와 이어 두지 않는다)
    const i = this.seatOf(room, p);
    if (i < 0) return;
    const gone = room.seats.find((s) => !!s && !s.cpu && s.goneAt !== 0);
    if (gone) { this.g.notify(p, 'roomFoeGone', gone.name); return; }
    if (this.dOf(room).voteS && this.players(room).length > 1) { this.propose(p, { kind: 'again' }); return; }
    room.seats[i]!.again = true;
    room.ver++;
    if (room.seats.some((s) => !!s && !s.cpu && !s.again)) { this.g.notify(p, 'roomAgainWait'); return; }
    this.restart(room);
  }
  private restart(room: Room<unknown>): void {
    if (this.dOf(room).againSwap !== false && room.seats.length > 1) room.seats = [...room.seats.slice(1), room.seats[0]];
    this.start(room);
  }

  // ---------- 방장·공개 설정·규칙·투표 ----------

  /** 공개 설정 (방장, RoomDef.codes): public / private / friends / password(비밀번호를 함께) */
  setPrivacy(p: Ent, v: unknown, pass?: unknown): void {
    const room = this.of(p);
    if (!room || !this.dOf(room).codes || !isPrivacy(v)) return;
    if (!this.isLead(room, p)) { this.g.notify(p, 'roomLeadOnly'); return; }
    const pw = typeof pass === 'string' ? pass.trim().slice(0, PASS_MAX) : '';
    if (v === 'password' && !pw) { this.g.notify(p, 'roomPassword'); return; }
    room.privacy = v;
    room.pass = v === 'password' ? hashPass(pw) : '';
    room.ver++;
    this.g.stateDirty = true;
  }

  /** 방장이 자리 i의 사람을 내보낸다 (기다리는 판과 끝난 판에서: 이 판에 다시 들어오지 못한다) */
  kick(p: Ent, seat: number): void {
    const room = this.of(p);
    if (!room || !this.dOf(room).lead) return;
    if (!this.isLead(room, p)) { this.g.notify(p, 'roomLeadOnly'); return; }
    this.kickSeat(room, seat);
  }
  private kickSeat(room: Room<unknown>, seat: number): void {
    const s = room.seats[seat];
    if (!s || s.cpu || s.key === room.lead || room.st === 'play') return;
    const who = this.playerAt(room, seat);
    room.banned.add(s.key);
    this.vacate(room, seat, 'roomKickedOut');
    this.seated.delete(s.key);
    if (who) { this.exit(who); this.g.notify(who, 'roomKicked'); }
    else this.back.delete(s.key);
    room.ver++;
    this.g.stateDirty = true;
    this.closeIfEmpty(room);
  }

  /** 방장을 자리 i의 사람에게 넘긴다 */
  give(p: Ent, seat: number): void {
    const room = this.of(p);
    if (!room || !this.dOf(room).lead || !this.isLead(room, p)) return;
    const s = room.seats[seat];
    if (!s || s.cpu || s.goneAt !== 0 || s.key === room.lead) return;
    room.lead = s.key;
    s.ready = false;
    for (const q of [...this.players(room), ...this.watchersOf(room)]) this.g.notify(q, 'roomLeadNew', s.name);
    room.ver++;
  }

  /** 준비 완료 / 풀기 (방장이 있는 판의 기다리는 판) */
  ready(p: Ent, on: boolean): void {
    const room = this.of(p);
    if (!room || room.st !== 'wait' || !this.dOf(room).lead) return;
    const s = room.seats[this.seatOf(room, p)];
    if (!s || s.ready === on) return;
    s.ready = on;
    room.ver++;
  }

  /** 규칙 고르기 (방장, 기다리는 판): RoomDef.options의 값 하나 */
  setOpt(p: Ent, k: string, v: unknown): void {
    const room = this.of(p);
    if (!room || room.st !== 'wait') return;
    if (!this.isLead(room, p)) { this.g.notify(p, 'roomLeadOnly'); return; }
    this.applyOpt(room, k, v);
  }
  private applyOpt(room: Room<unknown>, k: string, v: unknown): boolean {
    const list = this.dOf(room).options?.[k];
    if (!list || !list.some((x) => x === v) || room.opts[k] === v) return false;
    room.opts[k] = v as string | number;
    for (const s of room.seats) if (s) s.ready = false; // 규칙이 바뀌면 준비를 다시
    room.ver++;
    return true;
  }

  /** 투표를 낸다 (RoomDef.voteS): kind 'opt'(k, v: 기다리는 판·끝난 판), 'again'(끝난 판), 'kick'(seat: 기다리는 판·끝난 판). 낸 사람은 찬성으로 센다 */
  private propose(p: Ent, m: Record<string, unknown>): void {
    const room = this.of(p);
    const def = room ? this.dOf(room) : undefined;
    if (!room || !def?.voteS || this.seatOf(room, p) < 0) return;
    if (room.vote) { this.g.notify(p, 'roomVoteBusy'); return; }
    const kind = m.kind, now = this.g.now();
    let v: RoomVote;
    if (kind === 'opt' && room.st !== 'play' && typeof m.k === 'string' && def.options?.[m.k]?.some((x) => x === m.v) && room.opts[m.k] !== m.v) v = { kind, k: m.k, v: m.v as string | number, by: p.name, yes: new Set(), no: new Set(), until: 0 };
    else if (kind === 'again' && room.st === 'over') v = { kind, by: p.name, yes: new Set(), no: new Set(), until: 0 };
    else if (kind === 'kick' && room.st !== 'play' && typeof m.seat === 'number' && room.seats[m.seat] && !room.seats[m.seat]!.cpu && m.seat !== this.seatOf(room, p)) v = { kind, seat: m.seat, by: p.name, yes: new Set(), no: new Set(), until: 0 };
    else return;
    v.until = now + def.voteS * 1000;
    v.yes.add(Rooms.keyOf(p));
    room.vote = v;
    for (const q of this.players(room)) this.g.notify(q, 'roomVote', v.kind, p.name, v.kind === 'kick' ? room.seats[v.seat!]!.name : '');
    room.ver++;
    this.settle(room);
  }

  /** 투표에 표를 던진다 (찬성 yes) */
  private ballot(p: Ent, yes: boolean): void {
    const room = this.of(p);
    if (!room?.vote || this.seatOf(room, p) < 0) return;
    const k = Rooms.keyOf(p);
    (yes ? room.vote.yes : room.vote.no).add(k);
    (yes ? room.vote.no : room.vote.yes).delete(k);
    room.ver++;
    this.settle(room);
  }

  /** 표를 낼 사람: 앉아 접속해 있는 사람 */
  private voters(room: Room<unknown>): string[] { return room.seats.filter((s): s is RoomSeat => !!s && !s.cpu && s.goneAt === 0).map((s) => s.key); }
  /** 투표가 정해졌으면 끝낸다: 과반 찬성이면 통과, 반 이상 반대거나 시간이 지나면 부결 */
  private settle(room: Room<unknown>, timeUp = false): void {
    const v = room.vote;
    if (!v) return;
    const who = this.voters(room), yes = who.filter((k) => v.yes.has(k)).length, no = who.filter((k) => v.no.has(k)).length;
    const pass = yes * 2 > who.length, fail = no * 2 >= who.length || timeUp;
    if (!pass && !fail) return;
    room.vote = null;
    room.ver++;
    for (const q of this.players(room)) this.g.notify(q, 'roomVoteEnd', pass ? 1 : 0, v.kind);
    if (!pass) return;
    if (v.kind === 'opt') this.applyOpt(room, v.k!, v.v);
    else if (v.kind === 'kick') this.kickSeat(room, v.seat!);
    else if (room.st === 'over') { if (room.seats.some((s) => !!s && !s.cpu && s.goneAt !== 0)) this.regroupRoom(room); else this.restart(room); }
  }

  /** 같은 무리로 다음 판 (결과 창): 끝난 판을 기다리는 판으로 되돌린다. 떠난 사람과 컴퓨터는 빠지고, 관전 대기하던 사람이 빈 자리에 앉는다. 방장이 있는 판은 방장이 */
  regroup(p: Ent): void {
    const room = this.of(p);
    if (!room || room.st !== 'over' || this.seatOf(room, p) < 0 || room.rated) return;
    if (this.dOf(room).lead && !this.isLead(room, p)) { this.g.notify(p, 'roomLeadOnly'); return; }
    this.regroupRoom(room);
  }
  private regroupRoom(room: Room<unknown>): void {
    for (const id of room.ents) this.g.remove(id);
    room.ents.clear();
    const keep = room.seats.filter((s): s is RoomSeat => !!s && !s.cpu && s.goneAt === 0);
    for (const s of room.seats) if (s && !s.cpu && s.goneAt !== 0) { if (this.seated.get(s.key) === room.id) this.seated.delete(s.key); this.back.delete(s.key); }
    const size = Math.max(room.size, keep.length);
    room.seats = [...keep, ...Array.from({ length: size - keep.length }, () => null)];
    for (const s of keep) { s.ready = false; s.again = false; s.out = false; }
    room.st = 'wait'; room.turn = -1; room.deadline = 0; room.win = -1; room.why = ''; room.ranks = []; room.scores = []; room.round = 1; room.first = 0;
    room.openedAt = this.g.now(); room.vote = null;
    if (room.lead && !keep.some((s) => s.key === room.lead)) room.lead = keep[0]?.key ?? '';
    for (const p of this.players(room)) this.g.notify(p, 'roomRegroup');
    // 관전 대기하던 사람이 빈 자리에
    for (const w of [...room.watchers.values()].filter((x) => x.queued)) {
      const p = this.g.ents.get(w.ent), i = room.seats.findIndex((s) => !s);
      if (!p || i < 0) break;
      this.unwatch(p);
      this.sit(room, p, i);
    }
    room.ver++;
    this.g.stateDirty = true;
    if (!this.dOf(room).lead) this.fillIfFull(room);
  }

  // ---------- 관전 ----------

  /** 구경하기 (RoomDef.watch): 판 id 또는 방 코드로. 기다리는 판은 그냥 들어간다(앉는다). 비공개 판은 코드로만 */
  watch(p: Ent, id?: number, code?: unknown): void {
    const room = id !== undefined ? this.rooms.get(id) : this.byCode(typeof code === 'string' ? code : '');
    if (!room || !this.dOf(room).watch) { this.g.notify(p, 'roomGone'); return; }
    if (room.st === 'wait') { this.join(p, room.id, { byCode: id === undefined }); return; }
    if (this.busy(p) || p.bot || !this.door(room, p, { byCode: id === undefined })) return;
    this.addWatcher(room, p, false);
  }
  private addWatcher(room: Room<unknown>, p: Ent, queued: boolean): void {
    const def = this.dOf(room), k = Rooms.keyOf(p);
    if (room.watchers.size >= (def.watch?.max ?? 20)) { this.g.notify(p, 'roomWatchFull'); return; }
    const onLayer = this.delayMs(def) === 0;
    room.watchers.set(k, { key: k, ent: p.id, name: p.name, queued, onLayer });
    this.watching.set(k, room.id);
    if (onLayer) {
      if (isField(p.layer)) this.back.set(k, p.layer);
      p.layer = room.layer;
      this.g.movement.teleport(p, p.x, p.z);
    }
    this.g.notify(p, queued ? 'roomQueued' : 'roomWatching', Math.round(this.delayMs(def) / 1000));
    room.ver++;
    this.g.stateDirty = true;
  }
  /** 구경을 그만둔다 */
  private unwatch(p: Ent): void {
    const k = Rooms.keyOf(p), id = this.watching.get(k);
    this.watching.delete(k);
    const room = id === undefined ? undefined : this.rooms.get(id);
    const w = room?.watchers.get(k);
    if (room) { room.watchers.delete(k); room.ver++; }
    if (w?.onLayer) this.exit(p);
    this.g.stateDirty = true;
  }

  // ---------- 차례 ----------

  /**
   * 차례를 다음 자리로 넘긴다: 마친 자리의 turnEnd, 빠진 자리(와 skip이 참인 자리)는 건너뛴다. 이번 바퀴에 둘 자리가 남지 않으면 바퀴의 끝:
   * roundEnd, round가 오르고 상한을 넘으면 outOfRounds, rotateFirst면 먼저 두는 자리를 한 칸 옮기고, 다음 바퀴는 room.first(빠졌으면 그다음)부터.
   * 실시간 판(realtimeS)에서는 아무것도 하지 않는다
   */
  pass(room: Room<unknown>): void {
    if (room.st !== 'play' || this.dOf(room).realtimeS) return;
    const n = room.seats.length, cur = room.turn;
    this.dOf(room).turnEnd?.(room, cur);
    if (room.st !== 'play') return;
    const rel = (i: number) => (i - room.first + n) % n;
    for (let k = 1; k < n; k++) {
      const i = (cur + k) % n;
      if (rel(i) <= rel(cur)) break; // 바퀴를 한 번 돌았다
      if (this.wants(room, i)) { this.begin(room, i); return; }
    }
    this.roundOver(room);
  }

  /** 자리 i가 이번에 둘 자리인가: 빠지지 않았고 게임이 건너뛰지 않는다 */
  private wants(room: Room<unknown>, i: number): boolean {
    const s = room.seats[i];
    return !!s && !s.out && !this.dOf(room).skip?.(room, i);
  }

  /** 바퀴의 끝: 게임의 roundEnd, 바퀴의 상한, 먼저 두는 자리 돌리기, 다음 바퀴의 첫 차례 */
  private roundOver(room: Room<unknown>): void {
    const def = this.dOf(room), n = room.seats.length;
    def.roundEnd?.(room);
    if (room.st !== 'play') return;
    room.round++;
    const max = def.rounds ?? 0;
    if (max > 0 && room.round > max) {
      room.round = max;
      if (def.outOfRounds) def.outOfRounds(room); else this.finish(room, -2, 'rounds');
      if (room.st === 'play') this.finish(room, -2, 'rounds'); // 게임이 끝을 정하지 않았으면 비김
      return;
    }
    const live = (i: number) => !!room.seats[i] && !room.seats[i]!.out;
    const from = (f: number, ok: (i: number) => boolean) => { for (let k = 0; k < n; k++) { const i = (((f + k) % n) + n) % n; if (ok(i)) return i; } return -1; };
    if (def.rotateFirst) room.first = Math.max(0, from(room.first + 1, live));
    const next = from(room.first, (i) => this.wants(room, i));
    const at = next >= 0 ? next : from(room.first, live); // 모두 건너뛰면 건너뛰기를 무시한다
    if (at < 0) { this.finish(room, -2, 'left'); return; }
    this.begin(room, at);
  }

  /** 그 자리의 차례를 시작한다: 기한과 컴퓨터의 시각을 새로 */
  private begin(room: Room<unknown>, seat: number): void {
    const now = this.g.now(), def = this.dOf(room), ms = this.turnMsOf(def);
    room.turn = seat;
    room.deadline = ms ? now + ms : 0;
    room.cpuAt = now + (def.cpuStepMs ?? 700) * 1.5;
    this.touch(room);
    def.turnStart?.(room, seat);
  }

  /**
   * 판을 끝낸다. win은 이긴 자리 (비김 -2), 또는 자리마다의 등수 배열(1부터, 같으면 같은 등수: 1등이 하나면 그 자리가 room.win, 여럿이면 -2).
   * why는 까닭 (화면의 roomWhy가 문장으로), scores는 결과 창에 적을 자리마다의 점수(선택).
   * 접속해 있는 사람에게 roomResult [0 이김 1 짐 2 비김, 까닭, 내 등수(등수로 끝냈으면, 아니면 0), 등수를 받은 자리 수, 같은 등수가 또 있으면 1]
   */
  finish(room: Room<unknown>, win: number | readonly number[], why: string, scores?: readonly number[]): void {
    if (room.st !== 'play') return;
    const n = room.seats.length;
    let w: number, ranks: number[] = [];
    if (typeof win === 'number') w = win;
    else {
      ranks = room.seats.map((s, i) => (s && Number.isInteger(win[i]) && win[i] >= 1 ? win[i] : 0));
      const top = ranks.map((k, i) => (k === 1 ? i : -1)).filter((i) => i >= 0);
      w = top.length === 1 ? top[0] : -2;
    }
    room.st = 'over'; room.win = w; room.why = why; room.turn = -1; room.deadline = 0;
    room.ranks = ranks;
    room.scores = scores ? Array.from({ length: n }, (_, i) => (Number.isFinite(scores[i]) ? Number(scores[i]) : 0)) : [];
    for (const s of room.seats) if (s) s.again = false;
    const ranked = ranks.filter((k) => k > 0).length;
    const res = (i: number): 0 | 1 | 2 => {
      const k = ranks[i] ?? 0, tied = k > 0 && ranks.some((x, j) => j !== i && x === k);
      return k > 0 ? (k === 1 ? (tied ? 2 : 0) : 1) : w === -2 ? 2 : w === i ? 0 : 1;
    };
    room.seats.forEach((_, i) => {
      const p = this.playerAt(room, i);
      if (!p) return;
      const k = ranks[i] ?? 0, tied = k > 0 && ranks.some((x, j) => j !== i && x === k) ? 1 : 0;
      this.g.notify(p, 'roomResult', res(i), why, k, k > 0 ? ranked : 0, tied);
    });
    if (this.recs.has(room.id)) this.saveReplay(room);
    if (this.dOf(room).record) this.record(room, res);
    this.touch(room);
    this.g.stateDirty = true;
    this.dOf(room).finished?.(room);
    for (const fn of this.hooks.finish) fn(room);
  }

  /**
   * 자리 i가 판에서 빠진다 (기권·몰수·두는 중에 나가기): 남은 자리가 하나면 그 자리가 이기고, 없으면 비김. 남은 자리가 여럿이면 게임의 out, 그리고
   * outEnds면 판을 끝내고(남은 자리 함께 1등, 빠진 자리는 그 다음), 아니면 남은 사람끼리 이어 간다 (빠진 자리의 차례만 건너뛴다)
   */
  private forfeit(room: Room<unknown>, i: number, why: string): void {
    const s = room.seats[i];
    if (!s || s.out || room.st !== 'play') return; // 이미 빠진 자리 (기권한 뒤 대기실로)
    s.out = true;
    const live = room.seats.map((x, k) => (x && !x.out ? k : -1)).filter((k) => k >= 0);
    if (live.length <= 1) { this.finish(room, live[0] ?? -2, why); return; }
    this.dOf(room).out?.(room, i, why);
    if (room.st !== 'play') return;
    if (this.dOf(room).outEnds) { this.finish(room, room.seats.map((x) => (!x ? 0 : x.out ? live.length + 1 : 1)), why); return; }
    if (room.turn === i) this.pass(room); else this.touch(room);
  }

  // ---------- 경쟁 (묶음 8): 짝지은 판, 리플레이 ----------

  /**
   * 큐가 짝지은 사람들로 판을 연다 (ranked 모듈): 자리 차례대로 앉히고 bots만큼 봇(컴퓨터 자리)을 더해 곧바로 시작한다. rated면 레이팅에 드는 판.
   * 앉을 수 없는 사람(이미 앉음·봇·없음)이 있으면 열지 않고 undefined
   */
  openWith(defId: string, players: readonly Ent[], bots: number, rated: boolean): Room<unknown> | undefined {
    const def = this.defs.get(defId);
    const n = players.length + bots;
    if (!def || !players.length || n < this.minOf(def) || n > this.sizeOf(def) || players.some((p) => p.bot || this.seated.has(Rooms.keyOf(p)))) return undefined;
    for (const p of players) if (this.watching.has(Rooms.keyOf(p))) this.unwatch(p);
    const now = this.g.now();
    const room: Room<unknown> = {
      id: this.nextId++, def: defId, layer: instanceLayer(this.g), st: 'wait', seats: Array.from({ length: n }, () => null), size: n, turn: -1, first: 0, round: 1,
      deadline: 0, win: -1, why: '', ranks: [], scores: [], data: undefined, ents: new Set(), openedAt: now, cpuAt: 0, ver: 0,
      code: '', privacy: 'private', pass: '', lead: '', banned: new Set(), opts: this.defaultOpts(def), watchers: new Map(), vote: null,
      seed: 0, rng: Math.random, moves: [], leavers: new Map(), rated, rp: 0,
    };
    this.rooms.set(room.id, room);
    players.forEach((p, i) => this.sit(room, p, i));
    for (let i = players.length; i < n; i++) room.seats[i] = { key: '', ent: 0, name: def.cpuName ? String(def.cpuName(room, i) ?? '').slice(0, 40) : '', cpu: true, goneAt: 0, out: false, again: false, ready: true, bot: true };
    this.g.stateDirty = true;
    this.start(room);
    return room;
  }

  /** 끝난 판에서 자리 i의 결과: 0 이김 1 짐 2 비김 (등수로 끝냈으면 1등 하나만 이김, 함께 1등은 비김) */
  resultOf(room: Room<unknown>, i: number): 0 | 1 | 2 {
    const k = room.ranks[i] ?? 0, tied = k > 0 && room.ranks.some((x, j) => j !== i && x === k);
    return k > 0 ? (k === 1 ? (tied ? 2 : 0) : 1) : room.win === -2 ? 2 : room.win === i ? 0 : 1;
  }
  /** 자리 i를 판에서 뺀다 (잠수 따위: 다른 시스템이). 그 자리를 떠난 자리로 적는다 */
  drop(room: Room<unknown>, i: number, why: 'afk'): void {
    const s = room.seats[i];
    if (!s || s.cpu || s.out || room.st !== 'play') return;
    room.leavers.set(i, why);
    this.forfeit(room, i, why);
  }

  /** 리플레이의 입력 하나를 적는다 (적는 중인 판만): 자리와 수(게임 명령의 칸, 'cpu' 컴퓨터의 수, 'timeout' 시간 넘김) */
  private input(room: Room<unknown>, seat: number, m: unknown): void {
    const rec = this.recs.get(room.id);
    if (!rec || rec.inputs.length >= (this.dOf(room).replay?.maxFrames ?? REPLAY_FRAMES) * 4) return;
    rec.inputs.push({ t: this.g.now() - rec.at0, s: seat, m });
  }
  /** 리플레이의 프레임 하나 (판이 바뀔 때: touch). 같은 버전이면 다시 적지 않는다 */
  private frame(room: Room<unknown>): void {
    const rec = this.recs.get(room.id), view = this.dOf(room).replay?.view;
    if (!rec || !view || rec.lastVer === room.ver || rec.frames.length >= (this.dOf(room).replay?.maxFrames ?? REPLAY_FRAMES)) return;
    rec.lastVer = room.ver;
    try { rec.frames.push({ t: this.g.now() - rec.at0, v: structuredClone(view(room)) }); } catch (err) { console.error('[rooms] 리플레이의 프레임을 적지 못했습니다:', err); }
  }
  /** 끝난 판의 리플레이를 저장한다 (마지막 프레임까지): room.rp에 번호 */
  private saveReplay(room: Room<unknown>): void {
    const rec = this.recs.get(room.id);
    this.recs.delete(room.id);
    const view = this.dOf(room).replay?.view;
    if (!rec || !view) return;
    try { rec.frames.push({ t: this.g.now() - rec.at0, v: structuredClone(view(room)) }); } catch { /* 앞의 프레임으로 */ }
    const keys = [...new Set(room.seats.filter((s): s is RoomSeat => !!s && !s.cpu && !!s.key).map((s) => s.key))];
    const data: ReplayView = { id: 0, def: room.def, at: rec.at0, names: rec.names, seed: room.seed, inputs: rec.inputs, frames: rec.frames, ranks: [...room.ranks], win: room.win, why: room.why };
    const at = this.g.now();
    try {
      if (this.store?.addReplay) room.rp = this.store.addReplay({ at, def: room.def, keys, data: JSON.stringify(data) });
      else {
        room.rp = ++this.memReplaySeq;
        this.memReplays.push({ id: room.rp, at, def: room.def, keys, data });
        if (this.memReplays.length > MEM_REPLAYS) this.memReplays.splice(0, this.memReplays.length - MEM_REPLAYS);
      }
    } catch (err) { console.error('[rooms] 리플레이를 저장하지 못했습니다:', err); }
  }
  /** 리플레이 하나 (보관 기간 안의 것). 저장 키를 주면 그 사람이 앉았던 판만 */
  replayOf(id: number, key?: string): ReplayView | null {
    const since = this.g.now() - this.replayDays() * 86_400_000;
    let row: { at: number; keys: string[]; data: ReplayView } | null = null;
    if (this.store?.replay) {
      const r = this.store.replay(id);
      if (r) { try { row = { at: r.at, keys: r.keys, data: JSON.parse(r.data) as ReplayView }; } catch { row = null; } }
    } else { const r = this.memReplays.find((x) => x.id === id); if (r) row = { at: r.at, keys: r.keys, data: structuredClone(r.data) }; }
    if (!row || row.at < since || (key !== undefined && !row.keys.includes(key))) return null;
    return { ...row.data, id };
  }
  /** 리플레이의 보관 기간 (일): 내용의 COMPETE.replayDays, 기본 7 */
  replayDays(): number { return Math.max(1, competeRules()?.replayDays ?? 7); }
  private sendReplay(p: Ent, id: number): void {
    const r = this.replayOf(id, Rooms.keyOf(p));
    if (!r) { this.g.notify(p, 'replayNone'); return; }
    this.g.out.push({ id: p.id, msg: { t: 'replay', s: r } });
  }
  /** 보관 기간이 지난 리플레이를 지운다 (10분마다) */
  private prune(): void {
    this.prunedAt = this.g.now();
    const before = this.g.now() - this.replayDays() * 86_400_000;
    if (this.store?.pruneReplays) { try { this.store.pruneReplays(before); } catch (err) { console.error('[rooms] 오래된 리플레이를 지우지 못했습니다:', err); } }
    if (this.memReplays.length && this.memReplays[0].at < before) this.memReplays = this.memReplays.filter((r) => r.at >= before);
  }

  // ---------- 판 기록 (RoomDef.record) ----------

  /** 끝난 판을 저장 키마다 적는다 (손님·컴퓨터는 빼고) */
  private record(room: Room<unknown>, res: (i: number) => 0 | 1 | 2): void {
    const at = this.g.now();
    const rows: RoomRecordRow[] = [];
    room.seats.forEach((s, i) => {
      if (!s || s.cpu || !s.key || s.key.startsWith('guest:')) return;
      rows.push({ key: s.key, at, def: room.def, res: res(i), rank: room.ranks[i] ?? 0, n: room.seats.length, why: room.why, ...(room.scores.length ? { score: room.scores[i] ?? 0 } : {}), ...(room.rp ? { rp: room.rp } : {}) });
    });
    if (!rows.length) return;
    if (this.store) { try { this.store.addRoomRecords(rows); } catch (err) { console.error('[rooms] 판 기록을 적지 못했습니다:', err); } }
    else { this.memRecords.push(...rows); if (this.memRecords.length > MEM_RECORDS) this.memRecords.splice(0, this.memRecords.length - MEM_RECORDS); }
  }
  /** 그 저장 키의 판 기록 (최근부터) */
  records(key: string, limit = STATS_ROWS): RoomRecordRow[] {
    if (this.store) return this.store.roomRecords(key, limit);
    return this.memRecords.filter((r) => r.key === key).slice(-limit).reverse().map((r) => ({ ...r }));
  }
  /** 전적: 저장 키의 기록을 센다 */
  stats(key: string, name: string, me: boolean): RoomStatsView {
    const rows = this.records(key, STATS_ROWS);
    const tally = (): RoomTally => ({ n: 0, win: 0, lose: 0, draw: 0 });
    const all = tally(), defs: Record<string, RoomTally> = {};
    for (const r of rows) for (const t of [all, (defs[r.def] ??= tally())]) { t.n++; if (r.res === 0) t.win++; else if (r.res === 1) t.lose++; else t.draw++; }
    return { name, me: me ? 1 : 0, all, defs, recent: rows.slice(0, STATS_RECENT).map((r) => ({ at: r.at, def: r.def, res: r.res, rank: r.rank, n: r.n, why: r.why, ...(r.rp && me ? { rp: r.rp } : {}) })) };
  }
  /** 전적 창 (명령 room a:'stats'): 나, 내 판의 자리 seat의 사람(구경 중이면 그 판), 또는 같은 층의 사람(엔티티 id). 저장 키는 보내지 않는다 */
  private sendStats(p: Ent, seat?: number, id?: number): void {
    let key = Rooms.keyOf(p), name = p.name;
    const room = this.of(p) ?? this.watched(p);
    if (seat !== undefined && room) { const s = room.seats[seat]; if (!s || s.cpu) return; key = s.key; name = s.name; }
    else if (id !== undefined && id !== p.id) { const e = this.g.ents.get(id); if (!e || e.kind !== 'p' || e.layer !== p.layer || e.bot) return; key = Rooms.keyOf(e); name = e.name; }
    const me = key === Rooms.keyOf(p);
    this.g.out.push({ id: p.id, msg: { t: 'roomStats', s: key.startsWith('guest:') ? this.stats('', name, me) : this.stats(key, name, me) } });
  }

  // ---------- 시작과 자리 ----------

  /** 자리가 다 찼으면 시작한다 (방장이 있는 판은 방장이 시작한다) */
  private fillIfFull(room: Room<unknown>): boolean {
    if (room.seats.some((s) => !s) || this.dOf(room).lead) return false;
    this.start(room);
    return true;
  }
  /** 빈 자리를 컴퓨터로 채워 시작한다 (cpuFill 'min'이면 사람을 앞으로 당기고 min이 될 만큼만) */
  private fillCpu(room: Room<unknown>): void {
    const def = this.dOf(room);
    const cpu = (): RoomSeat => ({ key: '', ent: 0, name: '', cpu: true, goneAt: 0, out: false, again: false, ready: true });
    if (def.cpuFill === 'min') {
      const humans = room.seats.filter((s): s is RoomSeat => !!s);
      room.seats = [...humans, ...Array.from({ length: Math.max(0, this.minOf(def) - humans.length) }, cpu)];
    } else room.seats = room.seats.map((s) => s ?? cpu());
    const name = def.cpuName;
    if (name) room.seats.forEach((s, i) => { if (s?.cpu && !s.name) s.name = String(name(room, i) ?? '').slice(0, 40); });
    this.g.stateDirty = true;
    this.start(room);
  }

  /** 판을 (처음부터 다시) 차린다: 놓았던 엔티티를 치우고, 게임의 start, 자리 0이 먼저 둔다 (실시간 판은 모두가 함께) */
  private start(room: Room<unknown>): void {
    const def = this.dOf(room);
    for (const id of room.ents) this.g.remove(id);
    room.ents.clear();
    room.st = 'play'; room.round = 1; room.first = 0; room.win = -1; room.why = ''; room.ranks = []; room.scores = []; room.vote = null;
    for (const s of room.seats) if (s) { s.again = false; s.out = false; s.ready = false; }
    // 경쟁 (묶음 8): 시드는 리플레이나 랭크 판만 (다른 판의 난수 차례는 예전과 같다)
    room.moves = room.seats.map(() => 0); room.leavers.clear(); room.rp = 0;
    if (def.replay || def.rated) { room.seed = Math.floor(Math.random() * 2 ** 31) || 1; room.rng = seededRng(room.seed); } else { room.seed = 0; room.rng = Math.random; }
    if (def.replay) this.recs.set(room.id, { at0: this.g.now(), names: room.seats.map((s, i) => (s ? s.name || (s.cpu ? (s.bot ? `bot${i + 1}` : `cpu${i + 1}`) : '?') : '')), inputs: [], frames: [], lastVer: -1 });
    else this.recs.delete(room.id);
    def.start(room);
    this.g.stateDirty = true;
    room.seats.forEach((s, i) => {
      if (!s || s.cpu) return;
      const p = this.playerAt(room, i);
      if (!p) return;
      this.place2(room, p, i);
      const foe = room.seats.find((o, k) => k !== i && !!o);
      this.g.notify(p, 'roomStart', !def.realtimeS && i === room.first ? 1 : 0, foe ? foe.name : '', room.seats.length);
    });
    if (def.realtimeS) {
      const now = this.g.now();
      room.turn = -1;
      room.deadline = now + def.realtimeS * 1000;
      room.cpuAt = now + (def.cpuStepMs ?? 700);
      this.touch(room);
      return;
    }
    this.begin(room, room.first);
  }

  /** 사람을 판의 자리 i에 앉힌다 (판의 층으로 옮기고 그 자리에 세운다). 방장이 없는 방장 판이면 그 사람이 방장 */
  private sit(room: Room<unknown>, p: Ent, i: number): void {
    const k = Rooms.keyOf(p);
    room.seats[i] = { key: k, ent: p.id, name: p.name, cpu: false, goneAt: 0, out: false, again: false, ready: false };
    this.seated.set(k, room.id);
    if (isField(p.layer)) this.back.set(k, p.layer);
    if (this.dOf(room).lead && !room.lead) room.lead = k;
    this.place2(room, p, i);
    room.ver++;
  }

  /** 사람을 판의 층과 자리로 옮긴다 */
  private place2(room: Room<unknown>, p: Ent, i: number): void {
    p.layer = room.layer;
    const at = this.dOf(room).seatAt?.(room, i);
    if (at) this.g.movement.teleport(p, at.x, at.z, at.face);
    else this.g.movement.teleport(p, p.x, p.z);
  }

  /** 판 밖으로: 앉기 전의 들판 층과 판 밖의 자리 (RoomDef.exitAt: 기본 판의 것) */
  private exit(p: Ent): void {
    const k = Rooms.keyOf(p);
    if (!isField(p.layer)) p.layer = this.back.get(k) ?? fieldLayer(1);
    this.back.delete(k);
    const at = this.main?.exitAt?.(p);
    if (at) this.g.movement.teleport(p, at.x, at.z, at.face);
    else this.g.movement.teleport(p, p.x, p.z);
  }

  /** 접속해 있는 사람도, 돌아올 사람도 없으면 판을 닫는다 (엔티티를 치우고 남은 열쇠를 지운다, 구경꾼은 밖으로) */
  private closeIfEmpty(room: Room<unknown>): boolean {
    const humans = room.seats.filter((s): s is RoomSeat => !!s && !s.cpu);
    if (humans.some((s) => s.goneAt >= 0)) return false;
    this.close(room);
    return true;
  }
  private close(room: Room<unknown>): void {
    for (const id of room.ents) this.g.remove(id);
    room.ents.clear();
    for (const s of room.seats) if (s && !s.cpu && this.seated.get(s.key) === room.id) this.seated.delete(s.key);
    for (const p of this.watchersOf(room)) { this.unwatch(p); this.g.notify(p, 'roomGone'); }
    for (const w of room.watchers.keys()) this.watching.delete(w);
    if (room.code) this.codes.drop(room.code);
    this.rooms.delete(room.id);
    this.hist.delete(room.id);
    this.recs.delete(room.id);
    this.g.stateDirty = true;
    if (this.dOf(room).save) this.g.saveDirty = true;
  }

  // ---------- 접속 ----------

  /** 사람이 접속했다: 끊겼던 판이 있으면 그 자리로 (roomBack, 다른 사람에게 roomFoeBack), 아니면 판 밖의 자리로 */
  private joined(p: Ent): void {
    if (!this.defs.size) return;
    const room = this.of(p);
    const i = room ? this.seatOf(room, p) : -1;
    const exitAt = this.main?.exitAt;
    if (!room || i < 0) { if (exitAt && !p.bot) { const at = exitAt(p); this.g.movement.teleport(p, at.x, at.z, at.face); } return; }
    const s = room.seats[i]!;
    s.ent = p.id; s.goneAt = 0; s.name = p.name;
    this.place2(room, p, i);
    this.g.notify(p, 'roomBack');
    for (const q of this.players(room)) if (q !== p) this.g.notify(q, 'roomFoeBack', p.name);
    this.touch(room);
  }

  /** 사람이 월드에서 빠졌다: 두는 중·끝난 판은 자리를 남기고 기다린다(graceS), 기다리는 판의 자리는 비운다. 방장이면 넘긴다. 구경꾼은 구경을 그만둔다 */
  private left(id: number): void {
    this.sentVer.delete(id);
    for (const room of [...this.rooms.values()]) {
      for (const w of [...room.watchers.values()]) if (w.ent === id) { room.watchers.delete(w.key); this.watching.delete(w.key); this.back.delete(w.key); room.ver++; this.g.stateDirty = true; }
      const i = room.seats.findIndex((s) => !!s && !s.cpu && s.ent === id && s.goneAt === 0);
      if (i < 0) continue;
      const s = room.seats[i]!;
      s.ent = 0;
      if (room.st === 'wait') { this.seated.delete(s.key); this.back.delete(s.key); room.seats[i] = null; }
      else {
        s.goneAt = this.g.now();
        for (const q of this.players(room)) this.g.notify(q, room.st === 'play' ? 'roomFoeLeft' : 'roomFoeGone', s.name, this.dOf(room).graceS ?? 60);
      }
      if (room.vote) { room.vote.yes.delete(s.key); room.vote.no.delete(s.key); }
      if (room.lead === s.key) this.passLead(room); // 방장이 끊기면 곧바로 넘긴다 (돌아와도 되돌리지 않는다)
      room.ver++;
      this.g.stateDirty = true;
      this.closeIfEmpty(room);
    }
  }

  // ---------- 시간 ----------

  private tick(): void {
    if (!this.defs.size) return;
    if (this.g.now() - this.prunedAt >= PRUNE_MS) this.prune();
    if (!this.rooms.size) return;
    const now = this.g.now();
    for (const room of [...this.rooms.values()]) {
      const def = this.dOf(room), grace = (def.graceS ?? 60) * 1000;
      // 끊긴 사람: 기다림이 지나면 판에서 빠진다 (두는 중이면 몰수)
      room.seats.forEach((s, i) => {
        if (!s || s.cpu || s.goneAt <= 0 || now - s.goneAt < grace) return;
        s.goneAt = -1;
        if (this.seated.get(s.key) === room.id) this.seated.delete(s.key);
        this.back.delete(s.key);
        if (room.st === 'play') { if (!s.out) room.leavers.set(i, 'left'); this.forfeit(room, i, 'left'); } else room.ver++;
      });
      if (this.closeIfEmpty(room)) continue;
      if (room.vote && now >= room.vote.until) this.settle(room, true);
      this.remember(room, def, now);
      // 기다리는 판: 오래 차지 않으면 컴퓨터로 채운다 (방장이 있는 판은 방장이 정한다)
      if (room.st === 'wait') {
        if (def.lead) continue;
        const after = def.cpuAfterS ?? 0, startAfter = def.startAfterS ?? 0, waited = now - room.openedAt;
        if (startAfter > 0 && waited >= startAfter * 1000 && room.seats.filter((s) => !!s).length >= this.minOf(def)) this.startWithPresent(room);
        else if (after > 0 && def.cpu && waited >= after * 1000) this.fillCpu(room);
        continue;
      }
      if (room.st !== 'play') continue;
      if (def.realtimeS) { this.tickRealtime(room, def, now); continue; }
      // 시간이 다 됐다: 모두에게 알리고 게임이 정한 처리 (기본: 넘기기)
      if (room.deadline && now >= room.deadline) {
        const seat = room.turn, who = room.seats[seat];
        for (const q of this.players(room)) this.g.notify(q, 'roomTimeout', who?.name ?? '');
        this.input(room, seat, 'timeout');
        for (const fn of this.hooks.timeout) fn(room, seat);
        if (room.st !== 'play' || room.turn !== seat) continue; // 고리가 그 자리를 뺐다 (잠수)
        if (def.timeout) def.timeout(room, seat); else this.pass(room);
        // 게임의 처리가 차례를 넘기지 않았으면 기한만 새로 (같은 틱에서 끝없이 돌지 않게)
        if (room.st === 'play' && room.turn === seat && room.deadline <= now) this.begin(room, seat);
        continue;
      }
      // 컴퓨터의 차례: 한 수씩 간격을 두고
      const s = room.seats[room.turn];
      if (s?.cpu && now >= room.cpuAt) {
        room.cpuAt = now + (def.cpuStepMs ?? 700);
        this.input(room, room.turn, 'cpu');
        if (def.cpu) def.cpu(room, room.turn); else this.pass(room);
      }
    }
  }

  /** 실시간 판: 시간이 다 되면 끝, 컴퓨터는 간격마다 자리마다 한 수 */
  private tickRealtime(room: Room<unknown>, def: AnyDef, now: number): void {
    if (now >= room.deadline) {
      def.timeUp?.(room);
      if (room.st === 'play') this.finish(room, -2, 'time');
      return;
    }
    if (now < room.cpuAt || !def.cpu) return;
    room.cpuAt = now + (def.cpuStepMs ?? 700);
    room.seats.forEach((s, i) => { if (s?.cpu && !s.out && room.st === 'play') def.cpu!(room, i); });
  }

  /** 관전 지연이 있는 판: 판의 모양이 바뀔 때마다 적어 둔다 (구경꾼에게는 지연만큼 지난 것을 보낸다) */
  private remember(room: Room<unknown>, def: AnyDef, now: number): void {
    const delay = this.delayMs(def);
    if (!def.watch || !delay) return;
    let h = this.hist.get(room.id);
    if (!h) { h = []; this.hist.set(room.id, h); }
    if (h.length && h[h.length - 1].ver === room.ver) return;
    h.push({ at: now, ver: room.ver, view: this.shape(room, -1) });
    // 지연보다 오래된 것은 가장 최근 하나만 남긴다
    let cut = 0;
    while (cut + 1 < h.length && h[cut + 1].at <= now - delay) cut++;
    if (cut) h.splice(0, cut);
    if (h.length > HIST_MAX) h.splice(0, h.length - HIST_MAX);
  }

  // ---------- 화면에 보내는 것 ----------

  private verOf(p: Ent): string {
    const r = this.of(p);
    if (r) return `${r.id}.${r.ver}.${this.seatOf(r, p)}`;
    const w = this.watched(p);
    if (!w) return '-';
    const def = this.dOf(w), q = w.watchers.get(Rooms.keyOf(p))?.queued ? 'q' : '';
    if (!this.delayMs(def)) return `w${w.id}.${w.ver}${q}`;
    return `w${w.id}.${this.delayed(w)?.ver ?? -1}.${w.watchers.size}${q}`;
  }
  /** 관전 지연만큼 지난 판의 모양 */
  private delayed(room: Room<unknown>): { at: number; ver: number; view: RoomView } | undefined {
    const h = this.hist.get(room.id), cut = this.g.now() - this.delayMs(this.dOf(room));
    if (!h) return undefined;
    let got: { at: number; ver: number; view: RoomView } | undefined;
    for (const x of h) if (x.at <= cut) got = x;
    return got;
  }

  private view(p: Ent): RoomView | null {
    const room = this.of(p);
    if (room) return this.shape(room, this.seatOf(room, p));
    const w = this.watched(p);
    if (!w) return null;
    const def = this.dOf(w), me = w.watchers.get(Rooms.keyOf(p));
    const base = this.delayMs(def) ? this.delayed(w)?.view : this.shape(w, -1);
    // 아직 지연만큼 지난 모양이 없다 (판이 막 시작했다): 기다림만 알린다
    const v: RoomView = base ? { ...base } : { ...this.shape(w, -1), st: 'wait', seats: [], turn: -1, left: 0, pub: undefined };
    return { ...v, watch: 1, queued: me?.queued ? 1 : 0, watchers: w.watchers.size };
  }

  /** 판의 화면 모양. me는 내 자리 (구경꾼은 -1: 방 코드를 싣지 않고, 판 상태는 watchView만) */
  private shape(room: Room<unknown>, me: number): RoomView {
    const def = this.dOf(room), now = this.g.now();
    const v: RoomView = {
      id: room.id, st: room.st, me,
      seats: room.seats.map((s) => ({ name: s ? s.name : '', cpu: s?.cpu ? 1 : 0, away: !s || s.cpu ? 0 : s.goneAt > 0 ? 1 : s.goneAt < 0 || s.out ? 2 : 0, empty: s ? 0 : 1, again: s?.again ? 1 : 0, ...(def.lead ? { ready: s?.ready ? 1 : 0 } : {}), ...(s?.bot ? { bot: 1 as const } : {}) })),
      turn: room.st === 'play' ? room.turn : -1, round: room.round, rounds: def.rounds ?? 0,
      left: room.st === 'play' && room.deadline ? Math.max(0, room.deadline - now) : 0, turnMs: this.turnMsOf(def),
      win: room.win, why: room.why, pass: def.pass === false || def.realtimeS ? 0 : 1, walk: def.walk ? 1 : 0,
      min: room.st === 'wait' ? this.minOf(def) : room.seats.length, ranks: room.ranks, scores: room.scores,
    };
    if (this.defs.size > 1) v.def = room.def;
    if (def.codes && me >= 0) { v.code = room.code; v.privacy = room.privacy; }
    if (def.lead) v.lead = room.seats.findIndex((s) => !!s && !s.cpu && s.key === room.lead);
    if (def.options) v.opts = { ...room.opts };
    if (def.voteS) v.vote = room.vote ? this.voteView(room, room.vote, me) : null;
    if (def.watch) { v.watchers = room.watchers.size; v.delayS = def.watch.delayS ?? 0; if (me < 0 && def.watchView && room.st !== 'wait') v.pub = def.watchView(room); }
    if (def.realtimeS) v.rt = 1;
    if ((def.lead || def.codes || def.watch || def.voteS) && !room.rated) v.regroup = 1;
    if (room.rated) v.rated = 1;
    if (room.rp && me >= 0) v.rp = room.rp;
    return v;
  }
  private voteView(room: Room<unknown>, v: RoomVote, me: number): RoomVoteView {
    const who = this.voters(room), key = room.seats[me]?.key ?? '';
    return {
      kind: v.kind, ...(v.k !== undefined ? { k: v.k, v: v.v } : {}), ...(v.seat !== undefined ? { seat: v.seat } : {}), by: v.by,
      yes: who.filter((k) => v.yes.has(k)).length, no: who.filter((k) => v.no.has(k)).length, need: Math.floor(who.length / 2) + 1,
      left: Math.max(0, v.until - this.g.now()), mine: v.yes.has(key) ? 1 : v.no.has(key) ? 0 : -1,
    };
  }

  private lobby(): RoomLobby {
    const order = [...this.defs.keys()];
    const rows: RoomRow[] = [...this.rooms.values()].filter((r) => r.privacy !== 'private').map((r) => [
      r.id, r.seats[0] && !r.seats[0].cpu ? r.seats[0].name : r.seats.find((s) => !!s && !s.cpu)?.name ?? '',
      r.seats.filter((s) => !!s).length, r.seats.length, r.st === 'wait' ? 0 : r.st === 'play' ? 1 : 2, r.seats.some((s) => s?.cpu) ? 1 : 0,
      Math.max(0, order.indexOf(r.def)), r.privacy === 'password' ? 1 : r.privacy === 'friends' ? 2 : 0, r.watchers.size,
    ]);
    const main = this.main;
    const defs: RoomDefView[] = [...this.defs.values()].map((d) => ({
      id: this.idOf(d), min: this.minOf(d), max: this.sizeOf(d), cpu: d.cpu ? 1 : 0, codes: d.codes ? 1 : 0, lead: d.lead ? 1 : 0, vote: d.voteS ? 1 : 0,
      watch: d.watch ? 1 : 0, rt: d.realtimeS ? 1 : 0, record: d.record ? 1 : 0, opts: d.options ?? {},
      ...(d.rated && this.hooks.quick ? { rated: 1 as const } : {}), ...(d.replay ? { replay: 1 as const } : {}),
    }));
    return {
      rows, cpu: main?.cpu ? 1 : 0, cpuAfterS: main?.cpu ? main.cpuAfterS ?? 0 : 0, startAfterS: main && this.minOf(main) < this.sizeOf(main) ? main.startAfterS ?? 0 : 0, defs,
    };
  }

  // ---------- 저장 (RoomDef.save와 load를 준 판만) ----------

  /** 두는 중인 판만 적는다 (기다리는 판과 끝난 판은 다시 켜면 없어진다: 사람은 대기실로) */
  private saveAll(): unknown {
    const now = this.g.now();
    const rooms = [...this.rooms.values()].filter((r) => r.st === 'play' && this.dOf(r).save && this.dOf(r).load).map((r) => ({
      id: r.id, turn: r.turn, first: r.first, round: r.round, left: r.deadline ? Math.max(0, r.deadline - now) : 0,
      seats: r.seats.map((s) => (s ? { key: s.key, name: s.name, cpu: s.cpu ? 1 : 0, out: s.out || s.goneAt < 0 ? 1 : 0 } : null)),
      data: this.dOf(r).save!(r),
      ...(this.defs.size > 1 ? { def: r.def } : {}),
      ...(r.code ? { code: r.code, privacy: r.privacy, pass: r.pass } : {}),
      ...(r.lead ? { lead: r.lead } : {}),
      ...(Object.keys(r.opts).length ? { opts: r.opts } : {}),
    }));
    return { next: this.nextId, rooms };
  }

  /**
   * 저장한 판을 되살린다 (서버를 켤 때, 아무도 접속하기 전). 사람의 자리는 모두 '끊긴 채'(지금부터 graceS를 기다린다)로 둔다:
   * 같은 저장 키로 다시 접속하면 그 자리로 돌아온다. 손님의 자리는 돌아올 수 없어 빠진 것으로 친다. 두던 차례는 처음부터 다시 준다(재시작은 누구의 탓도 아니다)
   */
  private loadAll(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const w = raw as { next?: unknown; rooms?: unknown };
    const now = this.g.now();
    if (typeof w.next === 'number' && Number.isInteger(w.next) && w.next > this.nextId && w.next < 1e9) this.nextId = w.next;
    for (const one of Array.isArray(w.rooms) ? w.rooms : []) {
      if (typeof one !== 'object' || one === null) continue;
      try {
        const r = one as Record<string, unknown>;
        const def = this.defBy(typeof r.def === 'string' ? r.def : undefined);
        if (!def?.load || !Array.isArray(r.seats) || r.seats.length < this.minOf(def) || r.seats.length > this.sizeOf(def)) continue;
        const seats = r.seats.map((x): RoomSeat | null => {
          if (typeof x !== 'object' || x === null) return null;
          const s = x as Record<string, unknown>, cpu = s.cpu === 1, key = typeof s.key === 'string' ? s.key.slice(0, 200) : '';
          const guest = !cpu && (!key || key.startsWith('guest:'));
          return { key: cpu ? '' : key, ent: 0, name: typeof s.name === 'string' ? s.name.slice(0, 40) : '', cpu, goneAt: cpu ? 0 : guest || s.out === 1 ? -1 : now, out: s.out === 1 || guest, again: false, ready: false };
        });
        if (seats.some((s) => !s) || seats.some((s) => !!s && !s.cpu && s.goneAt >= 0 && this.seated.has(s.key))) continue;
        const int = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : d);
        const id = int(r.id, 1, 1e9, this.nextId++);
        if (this.rooms.has(id)) continue;
        const opts = this.defaultOpts(def);
        if (typeof r.opts === 'object' && r.opts !== null) for (const [k, v] of Object.entries(r.opts)) if (def.options?.[k]?.some((x) => x === v)) opts[k] = v as string | number;
        const room: Room<unknown> = {
          id, def: this.idOf(def), layer: instanceLayer(this.g), st: 'play', seats, size: seats.length, turn: int(r.turn, 0, seats.length - 1, 0), first: int(r.first, 0, seats.length - 1, 0), round: int(r.round, 1, 1e6, 1),
          deadline: 0, win: -1, why: '', ranks: [], scores: [], data: undefined, ents: new Set(), openedAt: now, cpuAt: 0, ver: 0,
          code: '', privacy: isPrivacy(r.privacy) ? r.privacy : 'public', pass: typeof r.pass === 'string' ? r.pass.slice(0, 200) : '',
          lead: typeof r.lead === 'string' ? r.lead.slice(0, 200) : '', banned: new Set(), opts, watchers: new Map(), vote: null,
          seed: 0, rng: Math.random, moves: seats.map(() => 1), leavers: new Map(), rated: false, rp: 0,
        };
        def.load(room, r.data);
        this.rooms.set(room.id, room);
        if (def.codes) room.code = this.codes.issue(room.id);
        for (const s of seats) if (s && !s.cpu && s.goneAt >= 0) this.seated.set(s.key, room.id);
        if (this.nextId <= room.id) this.nextId = room.id + 1;
        const live = seats.filter((s) => !!s && !s.out);
        if (live.length <= 1) { this.finish(room, seats.findIndex((s) => !!s && !s.out), 'left'); this.closeIfEmpty(room); continue; }
        if (def.realtimeS) { room.turn = -1; room.deadline = now + (int(r.left, 1, def.realtimeS * 1000, def.realtimeS * 1000)); room.cpuAt = now; this.touch(room); }
        else if (room.seats[room.turn]?.out) { this.begin(room, room.turn); this.pass(room); } else this.begin(room, room.turn);
        this.closeIfEmpty(room);
      } catch (err) {
        console.error('[rooms] 저장된 판 하나를 되살리지 못했습니다:', err);
      }
    }
    this.g.stateDirty = true;
  }
}
