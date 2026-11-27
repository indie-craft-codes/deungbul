// 라이브 콘텐츠의 모양 (묶음 6: docs/making-a-game.md 22절). 서버의 시스템과 화면이 함께 읽는다. 모두 선택이고, 적지 않으면 지금과 같다.
//   상품 GOODS        가격(재화·종류), 주는 것(묶음), 사람마다의 한정(기간마다 갱신), 서버 전체의 수량, 판매 기간, 이벤트 상점. 비어 있으면 상품이 없다 (NPC 상점은 그대로)
//   기간 이벤트 EVENTS  기간(UTC ms, 원격 설정으로 바꿀 수 있다: LIVE_KEYS 'EVENTS.id.to'), 이벤트 임무, 이벤트 재화(재화 종류 'event'), 끝나면 소멸 또는 환전 (event 모듈)
//   시즌 SEASON        주기(주·달·n일), 점수(사건 → 점수), 무료 보상 트랙, 초기화 방식(전부·부분·유지), 놓친 보상 (season 모듈)
//   업적 ACHIEVES      사건의 누적 수(일일 임무와 같은 셈), 보상, 칭호 (achieve 모듈)
//   도감 CODEX         처음 얻은 것(영웅·몬스터·아이템)의 기록과 모은 수의 보상 (codex 모듈)
//   쿠폰 COUPON·복귀 COMEBACK  쿠폰 코드의 규칙(길이·틀린 횟수 제한)과 오래 쉬었다 온 사람의 보상 (coupon 모듈. 쿠폰은 관리자가 만든다)
//   우편 MAIL_RULES    우편 종류마다의 만료(일)와 만료 전 알림 (mail 모듈)
// 사람마다의 진행을 세는 '사건'은 일일 임무의 종류(DailyKind: kill, enhance와 게임이 g.daily.add로 세는 것)와 같다: 틀의 사건 counted로 함께 받는다.
import * as C from '../content';
import type { CurKind } from './economy';
import type { Reward } from './growth';
import type { Period } from './live';

/** 상품의 값과 이벤트 재화가 쓰는 재화 (지갑의 칸) */
export type LiveCur = Exclude<keyof Reward, 'exp' | 'gear' | 'items'>;

/** 상품의 값: 재화(종류), 또는 가방의 아이템 */
export type GoodsPrice = { cur: LiveCur; n: number; kind?: CurKind; item?: undefined } | { item: string; n: number; cur?: undefined; kind?: undefined };
/** 상품 하나 (GOODS의 값). id는 GOODS의 키 */
export interface GoodsDef {
  /** 이름의 문장 키 (i18n ui) */
  name: string;
  /**
   * 어디서 파는가: 'npc'(길 상인의 창: 상인 곁에서만), 그 밖의 글은 메뉴 '상점' 탭의 묶음 이름표(문장 키). 기본 'shop'.
   * event를 주면 그 이벤트의 상점(이벤트 탭)이다
   */
  shop?: string;
  /** 그 이벤트(EVENTS의 키)의 상점: 그 이벤트의 기간에만 판다 */
  event?: string;
  /** 값: 재화와 양. kind를 주면 그 종류의 몫으로만 치른다 (이벤트 재화로만 사는 상품: kind 'event'). item을 주면 재화 대신 가방의 그 아이템 n개 (메아리 결정 같은 교환 재료) */
  price: GoodsPrice;
  /** 주는 것 (묶음: 골드·두 번째 재화·경험치·아이템 여럿). 재화는 바로, 아이템은 가방에 (자리가 없으면 사기 전에 막는다) */
  give: Reward;
  /** 덤으로 주는 영웅 (roster 모듈) */
  hero?: string;
  /** 사람마다 살 수 있는 수와 그 수가 새로 차는 기간 (per: 'ever' 한 번뿐, day·week·month 초기화 시각마다). 없으면 한도 없음 */
  limit?: { n: number; per?: 'ever' | Period };
  /** 서버 전체에서 팔 수 있는 수 (서버가 세고 월드와 함께 저장한다). 없으면 한도 없음 */
  stock?: number;
  /** 파는 기간 (UTC ms, [from, to)). 없는 끝은 열려 있다 */
  from?: number; to?: number;
}

/** 이벤트 임무 하나: 사건의 종류와 수, 채우면 우편으로 가는 보상, 바로 받는 이벤트 재화 */
export interface EventMission { name: string; kind: string; n: number; r?: Reward; ev?: number }
/** 기간 이벤트 하나 (EVENTS의 값). id는 EVENTS의 키 */
export interface EventDef {
  /** 이름·안내의 문장 키 */
  name: string; note?: string;
  /** 기간 (UTC ms, [from, to)) */
  from: number; to: number;
  /** 이벤트 재화: 이 재화의 'event' 종류 몫 (CURRENCIES의 kinds.spend에 'event'가 있어야 한다). 없으면 이벤트 재화가 없다 */
  cur?: LiveCur;
  missions?: Readonly<Record<string, EventMission>>;
  /** 끝나면: swap을 주면 남은 이벤트 재화를 rate배 한 to 재화(무상 몫)로 우편에 바꿔 준다. 없으면 소멸 */
  end?: { swap?: { to: LiveCur; rate: number } };
}

/** 시즌의 초기화 방식: 점수를 모두 지움, 그대로 둠, 그 비율만 남김 (트랙의 받은 칸은 늘 새로) */
export type SeasonReset = 'all' | 'keep' | { part: number };
/** 시즌 (SEASON). 무료 보상 트랙만 (유료 트랙은 결제 결정 뒤) */
export interface SeasonRules {
  /** 이름의 문장 키 */
  name: string;
  /** 주기: 초기화 시각(RESET)의 주·달, 또는 from(UTC ms)부터 days일마다 */
  period: Period | { days: number; from: number };
  /** 사건의 종류 → 하나마다의 점수 */
  points: Readonly<Record<string, number>>;
  /** 보상 트랙: 차례대로 그 점수에 닿으면 받을 수 있다 */
  track: readonly { pts: number; r: Reward }[];
  reset?: SeasonReset;
  /** 시즌이 끝날 때 닿았지만 받지 않은 보상: mail(우편으로 보낸다, 기본) 또는 drop */
  missed?: 'mail' | 'drop';
}

/** 업적 하나 (ACHIEVES의 값): 사건의 누적 수, 보상(우편), 칭호의 문장 키(주면 칭호가 생긴다: 칭호 id = 업적 id) */
export interface AchieveDef { name: string; kind: string; n: number; r?: Reward; title?: string }

/** 도감의 묶음 하나 (CODEX의 값): 무엇을 모으나, 그 목록(없으면 그 종류 모두), 모은 수의 보상(선택) */
export interface CodexDef { name: string; of: 'hero' | 'monster' | 'item'; ids?: readonly string[]; rewards?: readonly { n: number; r: Reward }[] }

/** 쿠폰 코드의 규칙: 글자 수, 틀린 코드를 lockMin분 안에 tries번 넣으면 lockMin분 막는다 */
export interface CouponRules { min: number; max: number; tries: number; lockMin: number }
/** 복귀 보상: days일 넘게 쉬었다가 들어오면 우편으로 */
export interface ComebackRules { days: number; r: Reward }
/** 우편의 만료: 우편 종류 → 일 수('*'는 적지 않은 종류 모두), 만료 warnH시간 전에 한 번 알린다(기본 24). 비어 있으면 만료가 없다 */
export interface MailRules { days?: Readonly<Record<string, number>>; warnH?: number }

const DAY = 86_400_000;
/** 상품의 표 */
export const goodsDef = (id: string): GoodsDef | undefined => (Object.hasOwn(C.GOODS, id) ? (C.GOODS as Readonly<Record<string, GoodsDef>>)[id] : undefined);
export const goodsIds = (): string[] => Object.keys(C.GOODS);
export const eventDef = (id: string): EventDef | undefined => (Object.hasOwn(C.EVENTS, id) ? (C.EVENTS as Readonly<Record<string, EventDef>>)[id] : undefined);
export const eventIds = (): string[] => Object.keys(C.EVENTS);
export const achieveDef = (id: string): AchieveDef | undefined => (Object.hasOwn(C.ACHIEVES, id) ? (C.ACHIEVES as Readonly<Record<string, AchieveDef>>)[id] : undefined);
export const achieveIds = (): string[] => Object.keys(C.ACHIEVES);
export const codexDef = (id: string): CodexDef | undefined => (Object.hasOwn(C.CODEX, id) ? (C.CODEX as Readonly<Record<string, CodexDef>>)[id] : undefined);
export const codexIds = (): string[] => Object.keys(C.CODEX);
/** 지금 그 기간 안인가 ([from, to)) */
export const within = (now: number, from?: number, to?: number): boolean => (from === undefined || now >= from) && (to === undefined || now < to);
/** 그 상품을 지금 파는가 (기간, 이벤트 상점이면 이벤트의 기간) */
export function goodsOpen(def: GoodsDef, now: number): boolean {
  if (!within(now, def.from, def.to)) return false;
  if (def.event) { const e = eventDef(def.event); return !!e && within(now, e.from, e.to); }
  return true;
}
/** 시즌의 지금 칸: 열쇠, 몇째 시즌(n일 주기만, 아니면 0), 끝나는 때 (UTC ms). period가 주·달이면 달력(cal)으로 */
export function seasonAt(s: SeasonRules, now: number, cal: { key: (p: Period, ms: number) => string; next: (p: Period, ms: number) => number }): { key: string; n: number; to: number } {
  if (typeof s.period === 'string') return { key: `${s.period}:${cal.key(s.period, now)}`, n: 0, to: cal.next(s.period, now) };
  const len = Math.max(1, s.period.days) * DAY, i = Math.floor((now - s.period.from) / len);
  return { key: `d${i}`, n: i + 1, to: s.period.from + (i + 1) * len };
}
/** 새 시즌에 남는 점수 */
export function seasonKeep(reset: SeasonReset | undefined, pts: number): number {
  if (reset === 'keep') return pts;
  if (typeof reset === 'object') return Math.floor(pts * Math.min(1, Math.max(0, reset.part)));
  return 0;
}
/** 쿠폰 코드를 다듬는다: 앞뒤 빈칸·가운데의 빈칸과 '-'를 빼고 대문자로 */
export const couponNorm = (s: string): string => String(s).replace(/[\s-]/g, '').toUpperCase();
/** 쿠폰 코드의 모양이 맞는가 (영문 대문자·숫자, 글자 수) */
export const couponShape = (code: string, r: CouponRules = C.COUPON): boolean => code.length >= r.min && code.length <= r.max && /^[A-Z0-9]+$/.test(code);

/** 화면에 보내는 상품 상태: 이번 기간에 산 수, 서버에 남은 수 (수량이 있는 것만) */
export interface GoodsMe { b: Record<string, number>; s: Record<string, number> }
/** 화면에 보내는 이벤트 하나 (진행 중인 것만): 기간(원격 설정으로 바뀐 값), 임무의 진행·받은 것, 이벤트 재화의 잔액 */
export interface EventMe { id: string; from: number; to: number; prog: Record<string, number>; got: string[]; have: number }
/** 화면에 보내는 시즌: 열쇠, 몇째, 끝나는 때, 점수, 받은 칸 */
export interface SeasonMe { key: string; n: number; to: number; pts: number; got: number[] }
/** 화면에 보내는 업적: 종류마다 센 수, 이룬 것, 쓰는 칭호 */
export interface AchieveMe { c: Record<string, number>; got: string[]; title: string }
/** 화면에 보내는 도감: 묶음마다 모은 id와 받은 보상의 차례 */
export interface CodexMe { seen: Record<string, string[]>; got: Record<string, number[]> }

/**
 * 라이브 콘텐츠의 표를 서버가 켜질 때 살핀다: 모르는 이벤트를 가리키는 상품, 이벤트 재화의 종류가 없는 재화, 겹치는 이벤트 재화, 깨진 수.
 * 문제마다 한 줄 (없으면 빈 목록)
 */
export function checkLiveContent(kinds: (cur: LiveCur) => readonly CurKind[] | null): string[] {
  const out: string[] = [];
  const pos = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  for (const id of goodsIds()) {
    const g = goodsDef(id)!;
    if (!pos(g.price?.n) || (g.price.item === undefined ? typeof g.price.cur !== 'string' || (g.price.cur as string) === 'exp' : typeof g.price.item !== 'string')) out.push(`GOODS.${id}: 값(price)이 깨졌습니다`);
    if (g.price?.kind && g.price.cur && !(kinds(g.price.cur) ?? []).includes(g.price.kind)) out.push(`GOODS.${id}: ${g.price.cur}에 종류 '${g.price.kind}'가 없습니다 (CURRENCIES.${g.price.cur}.kinds.spend)`);
    if (g.event && !eventDef(g.event)) out.push(`GOODS.${id}: 모르는 이벤트 '${g.event}'`);
    if (g.limit && !(g.limit.n >= 1)) out.push(`GOODS.${id}: limit.n은 1 이상`);
    if (g.stock !== undefined && !(g.stock >= 0)) out.push(`GOODS.${id}: stock은 0 이상`);
  }
  const withCur = eventIds().map((id) => ({ id, e: eventDef(id)! })).filter((x) => x.e.cur);
  for (const id of eventIds()) {
    const e = eventDef(id)!;
    if (!pos(e.from) || !pos(e.to) || e.to <= e.from) out.push(`EVENTS.${id}: 기간(from < to, UTC ms)이 깨졌습니다`);
    if (e.cur && !(kinds(e.cur) ?? []).includes('event')) out.push(`EVENTS.${id}: 이벤트 재화 ${e.cur}에 종류 'event'가 없습니다 (CURRENCIES.${e.cur}.kinds.spend에 'event'를 더한다)`);
    if (e.end?.swap && !(e.end.swap.rate >= 0)) out.push(`EVENTS.${id}: end.swap.rate는 0 이상`);
    for (const [mid, m] of Object.entries(e.missions ?? {})) if (!(m.n >= 1) || typeof m.kind !== 'string') out.push(`EVENTS.${id}.missions.${mid}: kind와 n(1 이상)`);
  }
  // 같은 재화의 이벤트 재화는 한 주머니(종류 'event')라 기간이 겹치면 한쪽이 끝날 때 다른 쪽의 몫까지 사라진다
  for (let i = 0; i < withCur.length; i++) for (let j = i + 1; j < withCur.length; j++) {
    const a = withCur[i], b = withCur[j];
    if (a.e.cur === b.e.cur && a.e.from < b.e.to && b.e.from < a.e.to) out.push(`EVENTS.${a.id}·${b.id}: 같은 이벤트 재화(${a.e.cur})를 쓰는 이벤트의 기간이 겹칩니다`);
  }
  const s = C.SEASON as SeasonRules | null;
  if (s) {
    if (typeof s.period === 'object' && (!(s.period.days >= 1) || !pos(s.period.from))) out.push('SEASON.period: { days(1 이상), from(UTC ms) }');
    if (s.track.some((t, i) => !pos(t.pts) || (i > 0 && t.pts < s.track[i - 1].pts))) out.push('SEASON.track: 점수는 0 이상이고 차례대로 커져야 합니다');
  }
  for (const id of achieveIds()) { const a = achieveDef(id)!; if (!(a.n >= 1)) out.push(`ACHIEVES.${id}: n은 1 이상`); }
  const cr = C.COUPON as CouponRules;
  if (!(cr.min >= 4) || !(cr.max >= cr.min) || !(cr.tries >= 1)) out.push('COUPON: min 4 이상, max ≥ min, tries 1 이상');
  return out;
}
