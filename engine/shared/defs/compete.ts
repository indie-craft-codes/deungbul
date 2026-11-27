// 경쟁(묶음 8)의 모양과 셈: 서버(engine/server/game/systems/boards.ts·ranked.ts·queue.ts)와 화면(engine/client/hud/compete.ts)이 함께 읽는다.
//   레이팅   Glicko-2 (숨은 실력 r, 불확실도 RD, 변동성 σ). 셋 이상·팀은 쌍대 비교로 한 번에. 배치 경기 n판, 쉬면 RD가 천천히 는다(상한)
//   등급     보이는 등급의 이름과 경계는 게임의 내용(COMPETE.tiers). 배치 중이거나 RD가 기준 이상이면 숨긴다
//   시즌     시즌 끝에 기준 쪽으로 당기고 RD를 올린다. 시즌 최고 등급의 보상(우편)은 게임의 내용
//   큐       기다릴수록 넓어지는 레이팅 범위, 예상 대기, 봇(게임이 허락할 때만)
//   이탈     이탈·잠수의 단계 제재(경고 → 큐 금지 n분 → 늘어남), 시간이 지나면 줄어든다
//   리플레이  결정적 판의 시드와 입력, 그리고 프레임 (끝난 뒤에만 본다)
// 이 파일은 내용(COMPETE)만 읽는다. 적지 않으면(null) 레이팅·큐·이탈은 없다: 순위표(boards 모듈)는 내용 없이도 돈다.
import * as C from '../content';
import type { Reward } from './growth';
import type { SeasonRules } from './livecontent';

/** 보이는 등급 하나: 이름의 문장 키(i18n ui), 이 레이팅 이상이면 이 등급 (차례대로 낮은 것부터) */
export interface TierDef { id: string; name: string; min: number }

/** 경쟁의 규칙 (내용의 COMPETE). 모두 선택 칸이 있고 적은 것만 쓴다 */
export interface CompeteRules {
  rating?: {
    /** 처음 레이팅·RD·변동성 (기본 1500, 350, 0.06) */
    start?: number; rd?: number; vol?: number;
    /** 변동성의 제약 τ (기본 0.5) */
    tau?: number;
    /** RD의 하한·상한 (기본 30, 350) */
    rdMin?: number; rdMax?: number;
    /** 배치 경기 수: 이만큼 두기 전에는 등급을 숨긴다 (기본 10) */
    placement?: number;
    /** RD가 이 값 이상이면 등급을 숨기고 순위표에서 빠진다 (휴면 점거 방지, 기본 100) */
    showRd?: number;
    /** 쉼: 마지막 판에서 이만큼(일) 지나면 하루에 perDay씩 RD가 는다 (rdMax까지. 기본 7일, 1) */
    idleDays?: number; perDay?: number;
  };
  /** 보이는 등급 (낮은 것부터). 비어 있으면 등급 없이 레이팅만 */
  tiers?: readonly TierDef[];
  /** 레이팅의 시즌: 주기(없으면 내용의 SEASON의 주기), 부분 초기화(기준 쪽으로 pull만큼 당김, RD를 rdTo 이상으로), 시즌 최고 등급의 보상(우편) */
  season?: { period?: SeasonRules['period']; pull?: number; rdTo?: number; rewards?: Readonly<Record<string, Reward>> };
  /** 큐: 처음 범위(±), 초마다 넓어지는 양, 가장 넓은 범위, 봇을 채울 때 봇의 레이팅(없으면 봇과의 판은 레이팅에 들지 않는다) */
  queue?: { range?: number; grow?: number; maxRange?: number; botR?: number };
  /** 이탈과 잠수: 잠수로 보는 연속 시간 넘김 수, 제재 단계(분: 0이면 경고만), 점수가 하나 줄어드는 시간(시) */
  leave?: { afkTurns?: number; steps?: readonly number[]; decayH?: number };
  /** 리플레이의 보관 기간(일, 기본 7) */
  replayDays?: number;
}

/** 내용의 COMPETE (적지 않았으면 null) */
export const competeRules = (): CompeteRules | null => (C.COMPETE as CompeteRules | null) ?? null;

/** 레이팅의 값들을 채운 모양 */
export interface RatingCfg { start: number; rd: number; vol: number; tau: number; rdMin: number; rdMax: number; placement: number; showRd: number; idleDays: number; perDay: number }
export function ratingCfg(r: CompeteRules | null = competeRules()): RatingCfg {
  const x = r?.rating ?? {};
  return { start: x.start ?? 1500, rd: x.rd ?? 350, vol: x.vol ?? 0.06, tau: x.tau ?? 0.5, rdMin: x.rdMin ?? 30, rdMax: x.rdMax ?? 350, placement: x.placement ?? 10, showRd: x.showRd ?? 100, idleDays: x.idleDays ?? 7, perDay: x.perDay ?? 1 };
}

// ---------- Glicko-2 ----------
const Q = 173.7178;
const gOf = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

/** 한 사람의 레이팅 */
export interface Rating { r: number; rd: number; vol: number }
/** 맞선 한 사람: 그 사람의 레이팅과 RD, 나의 결과(1 이김 0.5 비김 0 짐) */
export interface Versus { r: number; rd: number; s: number }

/**
 * Glicko-2의 한 기간(한 판): 맞선 사람들과의 결과로 새 레이팅. 맞선 사람이 없으면 RD만 는다 (쉬는 기간).
 * 셋 이상·팀은 쌍대 비교로 준다 (pairwise). 레이팅은 1500 눈금, 결과는 소수 둘째 자리까지
 */
export function glicko(me: Rating, vs: readonly Versus[], cfg: Pick<RatingCfg, 'tau' | 'rdMin' | 'rdMax'>): Rating {
  const mu = (me.r - 1500) / Q, phi = me.rd / Q, sigma = me.vol;
  const clampRd = (rd: number) => Math.max(cfg.rdMin, Math.min(cfg.rdMax, rd));
  if (!vs.length) return { r: me.r, rd: clampRd(Q * Math.sqrt(phi * phi + sigma * sigma)), vol: sigma };
  let vInv = 0, sum = 0;
  for (const o of vs) {
    const mj = (o.r - 1500) / Q, pj = o.rd / Q, g = gOf(pj), e = 1 / (1 + Math.exp(-g * (mu - mj)));
    vInv += g * g * e * (1 - e);
    sum += g * (o.s - e);
  }
  const v = 1 / vInv, delta = v * sum, tau = cfg.tau, a = Math.log(sigma * sigma);
  const f = (x: number) => { const ex = Math.exp(x); return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau); };
  let A = a, B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * tau) < 0 && k < 100) k++; B = a - k * tau; }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const Cx = A + ((A - B) * fA) / (fB - fA), fC = f(Cx);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = Cx; fB = fC;
  }
  const vol = Math.exp(A / 2), phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v), muNew = mu + phiNew * phiNew * sum;
  const round = (x: number) => Math.round(x * 100) / 100;
  return { r: round(Q * muNew + 1500), rd: round(clampRd(Q * phiNew)), vol: Math.round(vol * 1e6) / 1e6 };
}

/**
 * 쌍대 비교: 자리마다의 등수(1부터, 같으면 비김)와 팀(같은 팀끼리는 견주지 않는다)으로, 자리마다 맞선 자리와 결과의 목록.
 * 등수가 0인 자리(빈 자리)는 빠진다
 */
export function pairwise(ranks: readonly number[], teams?: readonly number[]): { j: number; s: number }[][] {
  return ranks.map((ri, i) => (ri > 0 ? ranks.map((rj, j) => ({ j, s: rj > 0 && j !== i && !(teams && teams[i] === teams[j]) ? (ri < rj ? 1 : ri > rj ? 0 : 0.5) : -1 })).filter((x) => x.s >= 0) : []));
}

/** 쉬는 동안 늘어난 RD (마지막 판에서 지난 일 수: idleDays를 넘긴 날마다 perDay, rdMax까지) */
export function idleRd(rd: number, lastAt: number, now: number, cfg: Pick<RatingCfg, 'idleDays' | 'perDay' | 'rdMax'>): number {
  if (!lastAt) return rd;
  const days = Math.floor((now - lastAt) / 86_400_000) - cfg.idleDays;
  return days > 0 ? Math.min(cfg.rdMax, Math.max(rd, rd + days * cfg.perDay)) : rd;
}

/** 레이팅의 등급 (차례: tiers의 자리, 없으면 -1) */
export function tierOf(r: number, tiers: readonly TierDef[] = competeRules()?.tiers ?? []): number {
  let at = -1;
  tiers.forEach((t, i) => { if (r >= t.min) at = i; });
  return at;
}

/** 시즌의 부분 초기화: 기준(start) 쪽으로 pull만큼 당기고 RD를 rdTo 이상으로 */
export function seasonPull(x: Rating, cfg: RatingCfg, s: CompeteRules['season']): Rating {
  const pull = Math.min(1, Math.max(0, s?.pull ?? 0));
  return { r: Math.round((x.r + (cfg.start - x.r) * pull) * 100) / 100, rd: Math.min(cfg.rdMax, Math.max(x.rd, s?.rdTo ?? x.rd)), vol: x.vol };
}

/** 큐에서 기다린 초만큼 넓어진 범위(±) */
export function queueRange(waitedS: number, r: CompeteRules | null = competeRules()): number {
  const q = r?.queue ?? {};
  return Math.min(q.maxRange ?? 1000, (q.range ?? 100) + Math.max(0, waitedS) * (q.grow ?? 10));
}

/** 이탈 점수(지금)의 제재 분: 점수 1이면 steps[0], 넘치면 마지막 단계. 0이면 경고만 */
export function leaveMinutes(pts: number, r: CompeteRules | null = competeRules()): number {
  const steps = r?.leave?.steps ?? [0, 5, 15, 60];
  if (pts <= 0 || !steps.length) return 0;
  return steps[Math.min(pts, steps.length) - 1];
}
/** 시간이 지나 줄어든 이탈 점수 (decayH시간마다 하나) */
export function leaveDecay(pts: number, at: number, now: number, r: CompeteRules | null = competeRules()): number {
  const h = r?.leave?.decayH ?? 24;
  return Math.max(0, pts - Math.floor(Math.max(0, now - at) / (h * 3_600_000)));
}

// ---------- 화면에 보내는 모양 ----------

/** 순위표의 기간: 상시, 날·주·달(초기화 시각), 레이팅 시즌 */
export type BoardPeriod = 'ever' | 'day' | 'week' | 'month' | 'season';
/** 화면이 값을 적는 모양: 수, 레이팅, 전투력, 층(단계 번호) */
export type BoardFmt = 'num' | 'rating' | 'power' | 'stage';
/** 순위표 목록의 한 줄 (탭) */
export interface BoardTab { id: string; name: string; period: BoardPeriod; fmt: BoardFmt }
/** 순위표의 한 줄: 등수, 이름, 값, 덧붙인 값(전투력 판의 레벨·직업 따위) */
export type BoardRow = [rank: number, name: string, v: number, x?: string];
/** 순위표 하나 (명령 board의 답) */
export interface BoardView {
  id: string; name: string; period: BoardPeriod; fmt: BoardFmt;
  /** 다음 초기화 (UTC ms, 상시면 0) */
  to: number;
  rows: BoardRow[];
  /** 내 줄 (없으면 null)과 내 위아래 몇 줄 */
  me: BoardRow | null;
  around: BoardRow[];
  /** 줄에 오른 사람 수 (휴면 빼고) */
  n: number;
  /** 지난 기간의 1~3등 (기간 순위표만, 없으면 빈 배열) */
  prev: BoardRow[];
}

/** 내 레이팅 한 사다리 (개인 상태 rating의 값) */
export interface RatingMe {
  /** 사다리 (판의 이름: RoomDef.rated) */
  id: string;
  /** 보이는 레이팅 (배치 중이면 0) */
  r: number;
  /** 등급 (tiers의 자리, 숨김이면 -1) */
  tier: number;
  /** 배치: 둔 판 수와 배치 수 (끝났으면 둘이 같다) */
  n: number; need: number;
  /** RD가 높아 등급을 숨겼다 (쉼) */
  unsure: 0 | 1;
  /** 이번 시즌 최고 등급 (없으면 -1), 시즌의 몇째와 끝 (UTC ms, 시즌이 없으면 0) */
  best: number; season: number; to: number;
  /** 마지막 판의 변화 (보이는 레이팅의 차이. 배치 중이면 0)와 그 판의 id */
  last: { d: number; room: number; tier: number } | null;
  /** 승·패·무 */
  w: number; l: number; dr: number;
}
/** 개인 상태 queue: 큐에 서 있으면 판의 이름, 선 때(ms 전), 예상 대기(초, 모르면 -1), 지금 범위(±) */
export interface QueueMe { def: string; waited: number; est: number; range: number; bots: 0 | 1 }
/** 개인 상태 leave: 지금의 큐 금지(남은 ms, 0이면 없음)와 이탈 점수 */
export interface LeaveMe { ban: number; pts: number }

/** 리플레이 (명령 replay의 답): 판의 이름, 때, 자리의 이름, 시드, 입력, 프레임(받은 ms, 그때의 판 모양: RoomDef.replayView) */
export interface ReplayView {
  id: number; def: string; at: number; names: string[]; seed: number;
  inputs: { t: number; s: number; m: unknown }[];
  frames: { t: number; v: unknown }[];
  /** 끝: 자리마다 등수(없으면 빈 배열), 이긴 자리, 까닭 */
  ranks: number[]; win: number; why: string;
}
