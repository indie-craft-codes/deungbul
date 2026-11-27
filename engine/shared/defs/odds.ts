// 확률표의 단일 원본 (odds): 뽑기·강화·상자·합성의 확률을 '표' 하나의 모양으로 만들고, 굴림도 이 표에서만 한다.
// 서버의 실제 추첨(engine/server/game/systems/gacha.ts, gear.ts, odds.ts), 화면의 확률표 창(engine/client/hud/odds.ts),
// 게임 밖의 공개 페이지(engine/server/net/odds.ts의 odds.json·odds.html)가 모두 이 파일의 함수로 표를 만든다: 셋이 어긋날 수 없다.
//
// 표 하나 (OddsTable):
//   id      표의 이름. 자동 표는 'enhance'(장비 강화)와 'banner:<배너 id>'(뽑기). 게임이 ODDS.tables로 직접 주는 표는 게임이 짓는다
//   kind    capsule(뽑기·상자: 하나가 나온다) | enhance(강화: 성공·유지·하락·파괴) | combine(합성) | ceiling(천장형: 정해진 횟수 뒤 확정)
//   steps   단계마다의 결과와 확률. 강화는 강화 단계(+0, +1 …)마다, 뽑기는 평소·천장·10번 보장·반반 확정마다 한 단계
//   pity    천장(보정): after번째 뽑기는 r 등급 이상(그 단계의 표)에서. 10번 보장은 ten
//   limited 한정 상품: 총수와 기간 (시행령 제19조의2. 서버는 숫자를 보이기만 하고 수량을 세지 않는다: 남은 일)
//   version 서버가 붙이는 버전 (표의 내용이 바뀔 때마다 1씩 오른다. 이 파일의 함수가 만든 표는 0)
// 굴림: rollStep(단계, r) 하나. r은 0 이상 1 미만의 서버 난수. 결과를 차례로 더해 r보다 커지는 첫 결과 (뽑기의 pickOdds와 같은 셈, 강화의 random() < 확률과 같은 셈)
// 검사: checkTables(표들)가 합 100%, 음수·숫자 아님, 겹친 id, 빈 단계, 강화 단계의 빠짐을 거부 코드(ODDS_ERRORS)로 돌려준다. 서버가 켜질 때 하나라도 있으면 멈춘다.
// 게임이 표를 주지 않으면 지금의 정의(ENHANCE, BANNERS)에서 저절로 만든 표가 원본이다: 값이 예전과 글자까지 같다 (등불지기의 강화 확률도 그대로).
import { ENHANCE, ODDS } from '../content';
import { BANNER_IDS, BANNER_TABLE, effectiveOdds, heroDef, pullOdds, type BannerDef, type Odds } from './collect';
import { fuseTables } from './cardgrow';
import type { LangText } from './live';

export type OddsKind = 'capsule' | 'enhance' | 'combine' | 'ceiling';
export const ODDS_KINDS: readonly OddsKind[] = ['capsule', 'enhance', 'combine', 'ceiling'];
/** 강화의 결과: 성공(한 단계 오름), 유지(그대로), 하락(한 단계 내림), 파괴(사라짐: 틀의 장비 강화는 쓰지 않는다) */
export const ENHANCE_OUTCOMES = ['up', 'keep', 'down', 'break'] as const;

/** 결과 하나: id(영웅 id, 강화 결과, 상자의 물건 id), 확률(0~1), 등급(있으면) */
export interface OddsOutcome { id: string; p: number; r?: number }
/**
 * 그 단계가 쓰이는 때 (화면·페이지가 문장으로 바꾼다):
 *   base 평소, pity n번째 뽑기의 천장(r 등급 이상), ten 10번 뽑기의 열째(r 등급 이상), plus 강화 단계 n에서, roll 게임이 정한 때(n: 단계 번호)
 *   sure: 반반의 확정이 켜진 때
 */
export interface OddsWhen { k: 'base' | 'pity' | 'ten' | 'plus' | 'roll'; n?: number; r?: number; sure?: boolean }
export interface OddsStep { key: string; when: readonly OddsWhen[]; outcomes: readonly OddsOutcome[] }
/** 게임이 직접 주는 표 (ODDS.tables). version은 서버가 붙인다 */
export interface OddsTableDef {
  id: string; kind: OddsKind;
  /** 이름: 문장 키(게임의 언어 파일 ui), 또는 ODDS.names의 키 */
  name: string;
  steps: readonly OddsStep[];
  /** 천장: after번째에 step의 표를 쓴다. 등급이 있으면 r */
  pity?: { after: number; step: string; r?: number };
  /** 10번 뽑기의 보장: 열째에 step의 표 */
  ten?: { step: string; r?: number };
  /** 한정 상품: 총수, 판매 기간(UTC ms) */
  limited?: { total?: number; from?: number; to?: number };
  /** 강화의 보호 아이템 (있으면 하락 대신 유지) */
  guard?: string;
  /** 값: 재화와 1번·10번 */
  cost?: { cur: string; one: number; ten?: number };
}
export interface OddsTable extends OddsTableDef {
  /** 오래 되풀이할 때의 실효 확률 (뽑기: 천장과 반반을 넣은 평균). 없으면 평소의 표와 같다 */
  effective?: readonly OddsOutcome[];
  version: number;
}

/** odds 모듈의 규칙 (내용 칸 ODDS) */
export interface OddsRules {
  /** 게임이 직접 주는 표 (상자·합성·천장형). id 'enhance'로 주면 장비 강화가 자동 표 대신 이것을 쓴다 */
  tables: readonly OddsTableDef[];
  /** 추첨 기록을 남기는 날 수 (그보다 오래된 줄은 하루 한 번 지운다). 0이면 지우지 않는다 */
  keepDays: number;
  /** 공개 페이지의 제목 (없으면 틀의 문장) */
  title?: LangText;
  /** 공개 페이지 맨 아래에 적을 운영자 정보(상호·문의처·등급 표시 같은 법 문구). 없으면 빈 칸이라고 적는다 */
  operator?: LangText;
  /** 이름표: 표·결과의 이름 키 → 언어마다의 글. 공개 페이지(서버가 쓴다)가 게임의 언어 파일을 읽지 못하므로 여기서 받는다. 없으면 영웅의 label, 그다음 키 그대로 */
  names?: Readonly<Record<string, LangText>>;
  /** 자동 표를 공개하지 않는다 (강화: enhance, 뽑기: banners). 굴림은 그래도 그 표로 한다 */
  hide?: { enhance?: boolean; banners?: boolean };
}
export const ODDS_RULES: OddsRules = ODDS;

/** 확률의 합이 1과 다를 수 있는 오차 (뽑기의 무게 나눗셈이 남기는 부동소수 오차보다 크고, 사람이 적는 0.1% 단위보다 훨씬 작다) */
export const ODDS_EPS = 1e-9;
/** 거부 코드: 서버가 켜질 때(게임의 표)와 원격 설정이 바뀔 때 알린다 */
export const ODDS_ERRORS = {
  id: '표 id는 영문자·숫자·밑줄·쌍점 1~48자',
  dup: '같은 id의 표가 둘 있다',
  kind: 'kind가 capsule·enhance·combine·ceiling이 아니다',
  empty: '단계가 없거나 결과가 없는 단계가 있다',
  stepDup: '같은 key의 단계가 둘 있다',
  outDup: '한 단계에 같은 id의 결과가 둘 있다',
  neg: '확률이 수가 아니거나 0보다 작거나 1보다 크다',
  sum: '한 단계의 확률의 합이 100%가 아니다',
  pity: '천장·10번 보장이 가리키는 단계가 없거나 after가 1 이상의 정수가 아니다',
  enhanceSteps: '강화 표에 0 ~ ENHANCE.max-1의 단계(+0 …)가 모두 있지 않다',
  enhanceOut: '강화 결과는 up·keep·down만 쓴다 (틀의 장비는 파괴가 없다)',
} as const;
export type OddsError = keyof typeof ODDS_ERRORS;
export interface OddsProblem { code: OddsError; table: string; at?: string }

const ID = /^[A-Za-z0-9_:]{1,48}$/;

/** 단계에서 하나를 뽑는다: r은 0 이상 1 미만. 결과의 확률을 차례로 더해 r보다 커지는 첫 결과 (끝까지 가면 마지막 결과: 합의 부동소수 오차). 결과가 없으면 undefined */
export function rollStep(step: OddsStep, r: number): OddsOutcome | undefined {
  const list = step.outcomes;
  let acc = 0;
  for (let i = 0; i < list.length; i++) { acc += list[i].p; if (r < acc) return list[i]; }
  return list[list.length - 1];
}
/** 표에서 key의 단계 (없으면 undefined) */
export const stepOf = (t: Pick<OddsTableDef, 'steps'>, key: string): OddsStep | undefined => t.steps.find((s) => s.key === key);

/** 표들을 검사한다: 문제를 모두 돌려준다 (없으면 빈 목록) */
export function checkTables(tables: readonly OddsTableDef[]): OddsProblem[] {
  const out: OddsProblem[] = [], seen = new Set<string>();
  for (const t of tables) {
    const id = typeof t?.id === 'string' ? t.id : String(t?.id);
    if (!ID.test(id)) out.push({ code: 'id', table: id });
    if (seen.has(id)) out.push({ code: 'dup', table: id });
    seen.add(id);
    if (!ODDS_KINDS.includes(t.kind)) out.push({ code: 'kind', table: id });
    if (!Array.isArray(t.steps) || !t.steps.length) { out.push({ code: 'empty', table: id }); continue; }
    const keys = new Set<string>();
    for (const s of t.steps) {
      if (keys.has(s.key)) out.push({ code: 'stepDup', table: id, at: s.key });
      keys.add(s.key);
      if (!Array.isArray(s.outcomes) || !s.outcomes.length) { out.push({ code: 'empty', table: id, at: s.key }); continue; }
      const ids = new Set<string>();
      let sum = 0, bad = false;
      for (const o of s.outcomes) {
        if (ids.has(o.id)) out.push({ code: 'outDup', table: id, at: `${s.key}/${o.id}` });
        ids.add(o.id);
        if (typeof o.p !== 'number' || !Number.isFinite(o.p) || o.p < 0 || o.p > 1) { out.push({ code: 'neg', table: id, at: `${s.key}/${o.id}` }); bad = true; }
        else sum += o.p;
        if (t.kind === 'enhance' && o.id !== 'up' && o.id !== 'keep' && o.id !== 'down') out.push({ code: 'enhanceOut', table: id, at: `${s.key}/${o.id}` });
      }
      if (!bad && Math.abs(sum - 1) > ODDS_EPS) out.push({ code: 'sum', table: id, at: s.key });
    }
    if (t.pity && (!keys.has(t.pity.step) || !Number.isInteger(t.pity.after) || t.pity.after < 1)) out.push({ code: 'pity', table: id, at: 'pity' });
    if (t.ten && !keys.has(t.ten.step)) out.push({ code: 'pity', table: id, at: 'ten' });
    if (t.kind === 'enhance' && id === ENHANCE_TABLE) for (let n = 0; n < ENHANCE.max; n++) if (!keys.has(plusKey(n))) { out.push({ code: 'enhanceSteps', table: id, at: plusKey(n) }); break; }
  }
  return out;
}
/** 문제 하나를 사람이 읽는 글로 */
export const problemText = (x: OddsProblem): string => `[odds] 표 '${x.table}'${x.at ? `의 ${x.at}` : ''}: ${ODDS_ERRORS[x.code]} (${x.code})`;

// ---------- 강화 (gear 모듈) ----------
/** 장비 강화의 표 id */
export const ENHANCE_TABLE = 'enhance';
/** 강화 단계의 key */
export const plusKey = (plus: number): string => `+${plus}`;
/** 게임이 직접 준 표 (ODDS.tables에서 id로. 없으면 undefined) */
export const givenTable = (id: string): OddsTableDef | undefined => ODDS_RULES.tables.find((t) => t.id === id);
/**
 * 강화 단계 하나 (그 단계에서 한 번 시도할 때의 결과): 게임이 'enhance' 표를 주었으면 그것, 아니면 ENHANCE에서 만든 것.
 * 자동 단계: 성공 ENHANCE.rate(plus), 실패는 ENHANCE.dropFrom 이상이면 하락, 아니면 유지. 확률이 0인 결과는 넣지 않는다 (굴림은 random() < rate와 같다)
 */
export function enhanceStep(plus: number): OddsStep {
  const given = givenTable(ENHANCE_TABLE);
  const s = given ? stepOf(given, plusKey(plus)) : undefined;
  if (s) return s;
  const up = ENHANCE.rate(plus), fail = 1 - up, risky = plus >= ENHANCE.dropFrom;
  const outcomes: OddsOutcome[] = [];
  if (up > 0) outcomes.push({ id: 'up', p: up });
  if (fail > 0 || !outcomes.length) outcomes.push({ id: risky ? 'down' : 'keep', p: fail > 0 ? fail : 0 });
  return { key: plusKey(plus), when: [{ k: 'plus', n: plus }], outcomes };
}
/** 강화의 표 전체 (+0 ~ ENHANCE.max-1. 보급형 장비는 그보다 낮은 단계까지만 쓴다) */
export function enhanceTable(): OddsTableDef {
  const given = givenTable(ENHANCE_TABLE);
  if (given) return given;
  const steps: OddsStep[] = [];
  for (let n = 0; n < ENHANCE.max; n++) steps.push(enhanceStep(n));
  return { id: ENHANCE_TABLE, kind: 'enhance', name: 'oddsEnhanceName', steps, ...(ENHANCE.charm ? { guard: ENHANCE.charm } : {}) };
}

// ---------- 뽑기 (gacha 모듈) ----------
/** 배너의 표 id */
export const bannerTableId = (banner: string): string => `banner:${banner}`;
/** 뽑기 단계의 key: 바닥 등급(-1이면 평소)과 반반의 확정 */
export const pullKey = (floor: number, sure: boolean): string => `${floor < 0 ? 'base' : `r${floor}`}${sure ? ':sure' : ''}`;
const toOut = (o: Odds): OddsOutcome => ({ id: o.hero, p: o.p, r: o.rarity });
/**
 * 배너 하나의 표: 평소, 천장의 바닥, 10번 보장의 바닥 (각각 반반의 확정이 켜진 때까지). 표의 확률은 pullOdds 그대로다 (뽑기 판에 든 영웅이 없으면 null).
 * withEffective면 실효 확률(천장·반반을 넣은 오랜 평균, effectiveOdds)도 (서버의 추첨은 쓰지 않는다: 셈이 무겁다)
 */
export function bannerTable(id: string, withEffective = false): OddsTableDef & { effective?: OddsOutcome[] } | null {
  const b: BannerDef | undefined = BANNER_TABLE[id];
  if (!b) return null;
  const fifty = !!b.fiftyFifty && !!b.pickup;
  const floors = [-1, ...(b.pity ? [b.pity.rarity] : []), ...(b.tenAtLeast !== undefined ? [b.tenAtLeast] : [])].filter((f, i, a) => a.indexOf(f) === i);
  const steps: OddsStep[] = [];
  for (const sure of fifty ? [false, true] : [false]) for (const f of floors) {
    const outcomes = pullOdds(b, f, sure).map(toOut);
    if (!outcomes.length) continue;
    const when: OddsWhen[] = [];
    if (f < 0) when.push({ k: 'base', ...(sure ? { sure } : {}) });
    if (b.pity && f === b.pity.rarity) when.push({ k: 'pity', n: b.pity.after, r: f, ...(sure ? { sure } : {}) });
    if (b.tenAtLeast !== undefined && f === b.tenAtLeast) when.push({ k: 'ten', r: f, ...(sure ? { sure } : {}) });
    steps.push({ key: pullKey(f, sure), when, outcomes });
  }
  if (!steps.length) return null;
  const has = (k: string) => steps.some((s) => s.key === k);
  return {
    id: bannerTableId(id), kind: 'capsule', name: b.name, steps,
    ...(b.pity && has(pullKey(b.pity.rarity, false)) ? { pity: { after: b.pity.after, step: pullKey(b.pity.rarity, false), r: b.pity.rarity } } : {}),
    ...(b.tenAtLeast !== undefined && has(pullKey(b.tenAtLeast, false)) ? { ten: { step: pullKey(b.tenAtLeast, false), r: b.tenAtLeast } } : {}),
    ...(b.start !== undefined || b.end !== undefined ? { limited: { ...(b.start !== undefined ? { from: b.start } : {}), ...(b.end !== undefined ? { to: b.end } : {}) } } : {}),
    cost: { cur: b.cur, one: b.one, ten: b.ten },
    ...(withEffective && (b.pity || b.pickup) ? { effective: effectiveOdds(b).map(toOut) } : {}),
  };
}
/** 뽑기 한 번에 쓸 단계: 바닥 등급과 확정에 맞는 단계, 없으면(그 등급 이상의 영웅이 없다) 평소(확정은 그대로) */
export function pullStep(t: OddsTableDef, floor: number, sure: boolean): OddsStep | undefined {
  return stepOf(t, pullKey(floor, sure)) ?? stepOf(t, pullKey(-1, sure));
}

// ---------- 모든 표 ----------
/**
 * 지금 공개하는 표 모두 (버전은 0: 서버가 붙인다): 게임이 준 표, 장비 강화(gear 모듈), 배너마다(gacha 모듈), 카드 합성(roster 모듈의 HERO_RULES.cards.fuse). has는 고른 모듈을 묻는다.
 * 원격 설정이나 캐릭터 정의로 내용이 바뀌면 다시 부르면 된다 (표는 부를 때마다 지금의 내용으로 만든다)
 */
export function allTables(has: (m: 'gear' | 'gacha' | 'roster') => boolean, withEffective = true): OddsTableDef[] {
  const out: OddsTableDef[] = ODDS_RULES.tables.filter((t) => t.id !== ENHANCE_TABLE || has('gear'));
  if (has('gear') && !givenTable(ENHANCE_TABLE) && !ODDS_RULES.hide?.enhance) out.push(enhanceTable());
  if (has('gacha') && !ODDS_RULES.hide?.banners) for (const id of BANNER_IDS) { const t = bannerTable(id, withEffective); if (t) out.push(t); }
  // 카드 합성 (HERO_RULES.cards.fuse: engine/shared/defs/cardgrow.ts)
  if (has('roster')) out.push(...fuseTables());
  return out;
}
/** 표의 내용의 서명 (버전을 뺀 JSON): 서명이 바뀌면 서버가 버전을 올리고 이력을 남긴다 */
export const tableSig = (t: OddsTableDef): string => JSON.stringify({ ...t, version: undefined });

// ---------- 이름 ----------
/** 결과 id의 이름 키: 뽑기는 영웅(이름 키나 label), 강화는 'oddsUp' 같은 틀의 문장 */
export function outcomeLabel(t: Pick<OddsTableDef, 'kind'>, id: string): { key: string; text?: string } {
  if (t.kind === 'enhance') return { key: `odds${id[0].toUpperCase()}${id.slice(1)}` };
  const h = heroDef(id);
  return h ? (h.label ? { key: h.name, text: h.label } : { key: h.name }) : { key: id };
}
/** 확률을 공개용 백분율 글로: 소수 넷째 자리까지(0.0001%), 끝의 0은 지운다. 0보다 크면 0%로 보이지 않게 아주 작은 값은 '<0.0001%' */
export function oddsPct(p: number): string {
  if (p > 0 && p < 5e-7) return '<0.0001%';
  return `${(Math.round(p * 1e6) / 1e4).toFixed(4).replace(/\.?0+$/, '')}%`;
}

// ---------- 추첨 기록·공개 (서버와 화면이 함께 쓰는 모양) ----------
/** 추첨 기록 한 줄: 시각(UTC ms), 종류(gacha·enhance·게임이 정한 이름), 표 id와 그 버전, 쓴 단계들, 결과(결과 id들), 치른 것 */
export interface DrawRow { n?: number; at: number; owner: string; char: string; kind: string; table: string; ver: number; steps: string[]; got: string[]; cost?: { cur: string; n: number; kinds?: Record<string, number> } }
/** 표의 변경 이력 한 줄: 시각, 표, 새 버전, 전·후(없던 표·없어진 표는 null), 까닭 (boot: 켜질 때 소스가 달라짐, live:칸: 원격 설정, auto: 캐릭터 정의 같은 내용의 변화, admin: 관리자) */
export interface OddsHistoryRow { n?: number; at: number; table: string; ver: number; before: OddsTableDef | null; after: OddsTableDef | null; why: string }
/** 사전 공지 한 줄: 표, 적용할 때(UTC ms), 글, 적은 때와 사람 */
export interface OddsPlanRow { n?: number; table: string; at: number; text: LangText; made: number; by: string; state: 'wait' | 'done' | 'cancel' }
/** 공개 JSON의 모양 (odds.json, 화면의 확률표 창이 받는 것과 같다) */
export interface OddsPublic {
  /** 이 파일을 만든 시각 (UTC ms) */
  at: number;
  tables: OddsTable[];
  /** 최근 변경 이력: 시각, 표, 새 버전, 까닭(boot·live:칸·auto·admin. 누가는 빼고), 없어진 표면 gone, 바뀐 확률(단계·결과마다 전 → 후, 앞의 40개) */
  history: { at: number; table: string; ver: number; why: string; gone?: true; changes?: OddsChange[] }[];
  plans: { table: string; at: number; text: LangText }[];
}

/** 이력 한 줄에서 바뀐 결과: 단계, 결과 id, 전·후 확률 (없던 것·없어진 것은 null) */
export interface OddsChange { step: string; id: string; a: number | null; b: number | null }
/** 두 표의 바뀐 결과 (단계와 결과의 id로 맞춘다) */
export function tableChanges(a: OddsTableDef | null, b: OddsTableDef | null): OddsChange[] {
  const map = (t: OddsTableDef | null) => new Map((t?.steps ?? []).flatMap((s) => s.outcomes.map((o) => [`${s.key}\u0000${o.id}`, o.p] as const)));
  const x = map(a), y = map(b), out: OddsChange[] = [];
  for (const k of new Set([...x.keys(), ...y.keys()])) {
    const pa = x.get(k) ?? null, pb = y.get(k) ?? null;
    if (pa === pb) continue;
    const [step, id] = k.split('\u0000');
    out.push({ step, id, a: pa, b: pb });
  }
  return out;
}
