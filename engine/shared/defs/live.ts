// 운영의 바탕의 공용 부품 (서버와 화면이 함께 읽는다):
//   달력    초기화 시각(내용의 RESET: 시간대·하루 시작 시각·주의 시작 요일)으로 날·주·달의 열쇠와 다음 경계를 셈한다. 서버의 시계 시스템(engine/server/game/systems/clock.ts)이 쓴다
//   원격 설정 게임이 덮어쓸 수 있다고 이름으로 선언한 내용의 칸(LIVE_KEYS)의 검사와 적용. 서버의 원격 설정 시스템(systems/live.ts)이 검사하고 적용하고, 화면에도 보내는 칸은 화면이 같은 함수로 적용한다
//   깃발    기능 깃발의 이름(틀의 것 ENGINE_FLAGS와 게임이 더한 FLAGS)과 명령 → 깃발의 표
//   공지·점검 화면에 보내는 모양
// 모든 시각은 UTC의 ms로 저장하고 주고받는다. 시간대는 '날이 언제 바뀌는가'를 셈할 때와 운영자가 시각을 적고 읽을 때만 쓴다.
import * as C from '../content';

// ---------- 초기화 시각과 달력 ----------
/**
 * 초기화 시각 (내용의 RESET). 적지 않은 칸은 기본값이다: 서버가 도는 PC의 현지 시각 자정, 주는 월요일에 시작한다 (예전의 '서버 현지 자정'과 같다).
 *   tz         'local'(서버 PC의 현지 시각), 'UTC', 또는 IANA 이름('Asia/Seoul', 'America/New_York': 서머타임도 따른다)
 *   dayAt      하루가 시작하는 시각(시, 0 이상 24 미만, 소수면 분: 4.5 = 04:30). 그 지역의 벽시계로 센다
 *   weekStart  주가 시작하는 요일 (0 일요일, 1 월요일 … 6 토요일). 그 요일의 dayAt에 주가 바뀐다
 *   달은 1일의 dayAt에 바뀐다
 */
export interface ResetRules { tz?: string; dayAt?: number; weekStart?: number }
/** 임무와 초기화의 기간 */
export type Period = 'day' | 'week' | 'month';
export const PERIODS: readonly Period[] = ['day', 'week', 'month'];

/** 벽시계의 칸 (그 지역의 시각) */
interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number; ms: number }

/** 초기화 시각으로 셈하는 달력 */
export interface Calendar {
  readonly tz: string; readonly dayAt: number; readonly weekStart: number;
  /** 그 시각이 속한 날 'YYYY-MM-DD' (하루 시작 시각 전이면 전날) */
  day(ms: number): string;
  /** 그 시각이 속한 주: 주가 시작한 날 'YYYY-MM-DD' */
  week(ms: number): string;
  /** 그 시각이 속한 달 'YYYY-MM' */
  month(ms: number): string;
  /** 기간의 열쇠 (day, week, month) */
  key(p: Period, ms: number): string;
  /** ms 뒤에 처음으로 그 기간이 바뀌는 시각 (UTC ms) */
  next(p: Period, ms: number): number;
  /** 날 'YYYY-MM-DD'의 전날 */
  prevDay(day: string): string;
  /** 두 열쇠 사이에 지난 경계의 수 (from이 to보다 앞이면 양수) */
  between(p: Period, from: string, to: string): number;
  /** 그 지역의 벽시계 시각 → UTC ms (서머타임으로 없는 시각은 뒤로 밀린다) */
  fromWall(y: number, mo: number, d: number, h?: number, mi?: number): number;
  /** UTC ms → 그 지역의 'YYYY-MM-DD HH:MM' */
  format(ms: number): string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const DAY = 86_400_000;
/** 시간대 이름이 쓸 수 있는 것인가 */
export function validTz(tz: string): boolean {
  if (tz === 'local' || tz === 'UTC') return true;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
/** 'YYYY-MM-DD'를 UTC 자정의 ms로 (달력 셈은 시간대 없는 날짜로 한다) */
const dateMs = (day: string): number => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const dateKey = (ms: number): string => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

/** 초기화 시각의 규칙으로 달력을 만든다. 모르는 시간대나 범위 밖의 값은 오류를 던진다 (서버가 켜질 때 알린다) */
export function makeCalendar(r: ResetRules = {}): Calendar {
  const tz = r.tz ?? 'local', dayAt = r.dayAt ?? 0, weekStart = r.weekStart ?? 1;
  if (!validTz(tz)) throw new Error(`RESET.tz를 알 수 없습니다: '${tz}' ('local', 'UTC' 또는 'Asia/Seoul' 같은 IANA 이름)`);
  if (!(typeof dayAt === 'number' && dayAt >= 0 && dayAt < 24)) throw new Error(`RESET.dayAt은 0 이상 24 미만의 시각(시)입니다: ${dayAt}`);
  if (!(Number.isInteger(weekStart) && weekStart >= 0 && weekStart <= 6)) throw new Error(`RESET.weekStart는 0(일)~6(토)의 요일입니다: ${weekStart}`);
  const fmt = tz !== 'local' && tz !== 'UTC' ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }) : null;
  const wall = (ms: number): Wall => {
    const x = new Date(ms);
    if (tz === 'local') return { y: x.getFullYear(), mo: x.getMonth() + 1, d: x.getDate(), h: x.getHours(), mi: x.getMinutes(), s: x.getSeconds(), ms: x.getMilliseconds() };
    if (tz === 'UTC' || !fmt) return { y: x.getUTCFullYear(), mo: x.getUTCMonth() + 1, d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), s: x.getUTCSeconds(), ms: x.getUTCMilliseconds() };
    const o: Record<string, number> = {};
    for (const part of fmt.formatToParts(x)) if (part.type !== 'literal') o[part.type] = Number(part.value);
    return { y: o.year, mo: o.month, d: o.day, h: o.hour % 24, mi: o.minute, s: o.second, ms: x.getUTCMilliseconds() };
  };
  /** 벽시계를 시간대 없는 ms로 (같은 벽시계면 같은 값) */
  const naive = (w: Wall): number => Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s, w.ms);
  const shift = Math.round(dayAt * 3_600_000);
  // 하루 시작 시각만큼 벽시계를 당기고 그 날짜를 읽는다: 서머타임으로 하루가 23·25시간이어도 '벽시계가 dayAt에 닿을 때' 날이 바뀐다
  const day = (ms: number): string => dateKey(naive(wall(ms)) - shift);
  const week = (ms: number): string => { const d = dateMs(day(ms)), dow = new Date(d).getUTCDay(); return dateKey(d - ((dow - weekStart + 7) % 7) * DAY); };
  const month = (ms: number): string => day(ms).slice(0, 7);
  const key = (p: Period, ms: number): string => (p === 'day' ? day(ms) : p === 'week' ? week(ms) : month(ms));
  /** 처음 바뀌는 때를 반으로 나눠 찾는다 (경계는 드물게 구하므로 느려도 된다). 넉넉한 위의 끝에서 다르지 않으면 넓힌다 */
  const next = (p: Period, ms: number): number => {
    const k = key(p, ms);
    let lo = ms, hi = ms + (p === 'day' ? 2 : p === 'week' ? 8 : 33) * DAY;
    for (let i = 0; i < 6 && key(p, hi) <= k; i++) hi += 31 * DAY;
    while (hi - lo > 1) { const mid = lo + Math.floor((hi - lo) / 2); if (key(p, mid) > k) hi = mid; else lo = mid; }
    return hi;
  };
  const between = (p: Period, from: string, to: string): number => {
    if (!from || !to) return 0;
    if (p === 'month') return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
    const d = Math.round((dateMs(to) - dateMs(from)) / DAY);
    return p === 'week' ? Math.round(d / 7) : d;
  };
  const fromWall = (y: number, mo: number, d: number, h = 0, mi = 0): number => {
    const want = Date.UTC(y, mo - 1, d, h, mi);
    // 그 시각의 시간대 차이로 맞추고, 서머타임 경계 근처면 한 번 더 맞춘다
    let t = want;
    for (let i = 0; i < 3; i++) t = want - (naive(wall(t)) - t);
    // 서머타임으로 없는 벽시계 시각(봄에 건너뛴 한 시간)이면 그 뒤의 첫 시각으로
    if (naive(wall(t)) < want) t += naive(wall(t + 3_600_000)) - naive(wall(t)) > 3_600_000 ? 3_600_000 : 0;
    return t;
  };
  const format = (ms: number): string => { const w = wall(ms); return `${w.y}-${pad(w.mo)}-${pad(w.d)} ${pad(w.h)}:${pad(w.mi)}`; };
  return { tz, dayAt, weekStart, day, week, month, key, next, prevDay: (d) => dateKey(dateMs(d) - DAY), between, fromWall, format };
}

/**
 * 운영자가 적은 시각을 UTC ms로 (관리자 명령의 시각): 'now', '+30m'·'+2h'·'+1d'(지금부터), 시간대가 붙은 ISO('2026-12-01T09:00+09:00', '…Z'),
 * 시간대가 없는 '2026-12-01 09:00'·'2026-12-01T09:00'·'2026-12-01'(초기화 시각의 시간대로 읽는다). 읽지 못하면 null
 */
export function parseWhen(text: string, now: number, cal: Calendar): number | null {
  const s = text.trim();
  if (/^now|지금$/i.test(s)) return now;
  const rel = /^\+(\d+(?:\.\d+)?)([mhd])$/i.exec(s);
  if (rel) { const v = Number(rel[1]), u = rel[2].toLowerCase(); return now + Math.round(v * (u === 'm' ? 60_000 : u === 'h' ? 3_600_000 : DAY)); }
  if (/(Z|[+-]\d\d:?\d\d)$/i.test(s) && /^\d{4}-\d\d-\d\dT/.test(s)) { const t = Date.parse(s); return Number.isFinite(t) ? t : null; }
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d?):(\d\d))?$/.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0)];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return cal.fromWall(y, mo, d, h, mi);
}

// ---------- 원격 설정 ----------
/**
 * 원격 설정으로 덮어쓸 수 있는 칸 하나 (내용의 LIVE_KEYS: 이름 → 이것).
 * 이름은 내용의 칸을 가리키는 길이다: 'GACHA_RULES.history', 'BANNERS.pickup.end', 'IDLE.maxMin'. 맨 앞은 내용 계약의 이름이고, 그 아래의 칸을 바꾼다
 * (맨 앞 이름 하나만으로 된 수 하나짜리 이름(MAIL_MAX)은 바꿀 수 없다: 묶음 안의 칸만). 그 칸을 읽는 코드가 쓸 때마다 읽어야 바뀐 값이 든다.
 * value를 주면 내용에 없는 게임만의 값이다: 그 이름 그대로 g.live.get(이름)으로 읽는다 (처음 값이 value).
 */
export interface LiveKeyDef {
  /** 바뀐 값을 접속한 화면에도 보낸다 (화면도 같은 칸을 읽을 때: 공개 확률표, 화면에 보이는 수치). 화면은 같은 칸에 같은 값을 적용한다 */
  client?: boolean;
  /** 처음 값이 없는 칸(선택 칸: 기간이 없는 배너의 end)의 모양. 처음 값이 있으면 그 모양을 따른다 */
  type?: 'number' | 'string' | 'boolean' | 'json';
  /** 내용에 없는 게임만의 값의 처음 값 (주면 내용의 칸이 아니다) */
  value?: unknown;
  /** 값의 검사: 문제가 있으면 까닭(운영자가 읽는 글), 없으면 null. 모양 검사(처음 값과 같은 모양) 다음에 불린다 */
  check?: (v: unknown) => string | null;
  /** 운영자가 볼 한 줄 설명 */
  note?: string;
}
export type LiveKeys = Readonly<Record<string, LiveKeyDef>>;

/** 원격 설정 값의 크기 상한 (JSON 글자 수) */
export const LIVE_MAX_CHARS = 64 * 1024;
const contentNs: Readonly<Record<string, unknown>> = C;
/** 이름의 칸: 붙어 있는 묶음과 마지막 칸 이름. 길이 없으면 null */
function slotOf(name: string): { obj: Record<string, unknown>; last: string } | null {
  const path = name.split('.');
  if (path.length < 2 || path.some((p) => !p || p === '__proto__' || p === 'constructor' || p === 'prototype')) return null;
  let o: unknown = contentNs[path[0]];
  for (const p of path.slice(1, -1)) { if (typeof o !== 'object' || o === null) return null; o = (o as Record<string, unknown>)[p]; }
  return typeof o === 'object' && o !== null ? { obj: o as Record<string, unknown>, last: path[path.length - 1] } : null;
}
/** 덮어쓰기 전의 값 (처음 덮어쓸 때 떠 둔다): 되돌릴 때 쓴다 */
const originals = new Map<string, { had: boolean; v: unknown }>();
/** 선언된 원격 설정의 칸인가 */
export const liveDef = (name: string): LiveKeyDef | undefined => (Object.hasOwn(C.LIVE_KEYS, name) ? (C.LIVE_KEYS as LiveKeys)[name] : undefined);
/** 그 칸의 소스(내용)의 값: 덮어썼으면 덮어쓰기 전의 값 */
export function liveOriginal(name: string): unknown {
  const def = liveDef(name);
  if (def && 'value' in def) return def.value;
  if (originals.has(name)) return originals.get(name)!.v;
  const s = slotOf(name);
  return s ? s.obj[s.last] : undefined;
}
/** 그 칸의 지금 값 (내용의 칸: 덮어쓴 값이 있으면 그것) */
export function liveCurrent(name: string): unknown {
  const s = slotOf(name);
  return s ? s.obj[s.last] : undefined;
}

/** v가 처음 값(orig)과 같은 모양인가. 다르면 까닭 */
export function liveShape(orig: unknown, v: unknown, at = ''): string | null {
  const where = at ? `${at}: ` : '';
  if (typeof orig === 'function') return `${where}함수로 된 칸은 바꿀 수 없습니다`;
  if (orig === null || orig === undefined) return null; // 처음 값이 없으면 type이나 check가 본다
  if (typeof orig === 'number') return typeof v === 'number' && Number.isFinite(v) ? null : `${where}수여야 합니다`;
  if (typeof orig === 'string' || typeof orig === 'boolean') return typeof v === typeof orig ? null : `${where}${typeof orig === 'string' ? '글' : '참/거짓(true, false)'}이어야 합니다`;
  if (Array.isArray(orig)) {
    if (!Array.isArray(v)) return `${where}목록이어야 합니다`;
    if (!orig.length) return null;
    for (let i = 0; i < v.length; i++) { const e = liveShape(orig[0], v[i], `${at}[${i}]`); if (e) return e; }
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return `${where}묶음({ … })이어야 합니다`;
  const o = orig as Record<string, unknown>, n = v as Record<string, unknown>;
  // 모든 값의 모양이 같은 묶음(이름 → 수 같은 표)은 칸을 더하거나 뺄 수 있다. 그 밖의 묶음은 처음 칸 그대로
  const vals = Object.values(o), sameKind = vals.length > 0 && vals.every((x) => typeof x === typeof vals[0] && Array.isArray(x) === Array.isArray(vals[0]) && typeof x !== 'object');
  for (const k of Object.keys(n)) {
    if (k === '__proto__' || k === 'constructor') return `${where}쓸 수 없는 칸 이름: ${k}`;
    if (Object.hasOwn(o, k)) { const e = liveShape(o[k], n[k], at ? `${at}.${k}` : k); if (e) return e; }
    else if (!sameKind) return `${where}모르는 칸입니다: ${k}`;
    else { const e = liveShape(vals[0], n[k], at ? `${at}.${k}` : k); if (e) return e; }
  }
  if (!sameKind) { const miss = Object.keys(o).filter((k) => !Object.hasOwn(n, k) && typeof o[k] !== 'function'); if (miss.length) return `${where}빠진 칸이 있습니다: ${miss.join(', ')}`; }
  return null;
}

/**
 * 원격 설정 값의 검사: 선언된 칸인가, JSON으로 옮길 수 있는가(크기 상한), 처음 값과 같은 모양인가(처음 값이 없으면 type), 게임의 check.
 * 문제가 있으면 까닭(운영자가 읽는 글), 없으면 null. 화면과 서버가 같은 함수를 쓴다 ('믿지 않고 검증')
 */
export function checkLive(name: string, v: unknown): string | null {
  const def = liveDef(name);
  if (!def) return `덮어쓸 수 있다고 선언되지 않은 칸입니다: ${name} (내용의 LIVE_KEYS)`;
  if (!('value' in def) && !slotOf(name)) return `내용에 그 칸이 없습니다: ${name}`;
  let json: string | undefined;
  try { json = JSON.stringify(v); } catch { return 'JSON으로 옮길 수 없는 값입니다'; }
  if (json === undefined) return '값이 없습니다';
  if (json.length > LIVE_MAX_CHARS) return `값이 너무 큽니다 (${json.length}자, 상한 ${LIVE_MAX_CHARS}자)`;
  const orig = liveOriginal(name);
  const shape = liveShape(orig, v);
  if (shape) return shape;
  if (orig === undefined || orig === null) {
    const t = def.type;
    if (!t && !def.check) return '처음 값이 없는 칸은 LIVE_KEYS에 type이나 check가 있어야 합니다';
    if (t && t !== 'json' && typeof v !== t) return `${t === 'number' ? '수' : t === 'string' ? '글' : '참/거짓'}이어야 합니다`;
    if (t === 'number' && !Number.isFinite(v as number)) return '수여야 합니다';
  }
  return def.check?.(v) ?? null;
}

/**
 * 원격 설정 값을 내용의 칸에 적용한다 (검사는 먼저 checkLive로). v가 undefined면 소스의 값으로 되돌린다.
 * 내용에 없는 게임만의 값(value를 준 칸)은 적용할 칸이 없다: 서버는 g.live.get으로 읽는다. 적용하지 못하면(얼린 묶음) 까닭을 돌려준다
 */
export function applyLive(name: string, v: unknown): string | null {
  const def = liveDef(name);
  if (!def || 'value' in def) return null;
  const s = slotOf(name);
  if (!s) return `내용에 그 칸이 없습니다: ${name}`;
  try {
    if (!originals.has(name)) originals.set(name, { had: Object.hasOwn(s.obj, s.last), v: s.obj[s.last] });
    if (v === undefined) {
      const o = originals.get(name)!;
      if (o.had) s.obj[s.last] = o.v; else delete s.obj[s.last];
      originals.delete(name);
    } else s.obj[s.last] = structuredClone(v);
    return null;
  } catch (err) { return `칸을 바꾸지 못했습니다 (얼린 값일 수 있습니다): ${String(err)}`; }
}

// ---------- 기능 깃발 ----------
/**
 * 틀의 기능 깃발: join(새 접속. 이미 들어와 있는 사람은 그대로), chat(전체·길드 대화), market(거래소), mail(우편 받기), gacha(뽑기).
 * 깃발이 없으면 켜짐이다 (지금과 같다). 게임은 내용의 FLAGS에 자기 깃발의 이름을 더하고 g.flags.on(이름)으로 묻는다
 */
export const ENGINE_FLAGS = ['join', 'chat', 'market', 'mail', 'gacha'] as const;
/** 깃발이 막는 플레이어 명령: 명령 이름 → 깃발. 게임의 명령은 g.live.gate(명령, 깃발)로 더한다 */
export const COMMAND_FLAGS: Readonly<Record<string, string>> = { market: 'market', mailClaim: 'mail', gacha: 'gacha', gchat: 'chat' };
/** 쓸 수 있는 깃발의 이름 (틀의 것과 게임의 FLAGS) */
export const flagNames = (): string[] => [...new Set([...ENGINE_FLAGS, ...C.FLAGS])];

// ---------- 공지와 점검 ----------
/** 언어 코드 → 글. 둘 다 적거나(ko, en) 하나만 적는다 */
export type LangText = Readonly<Record<string, string>>;
/** 화면에 보내는 공지 하나: 보이는 기간(UTC ms), 접속 때 창(popup), 흐르는 띠(ticker) */
export interface NoticeView { id: string; text: LangText; from: number; to: number; popup?: boolean; ticker?: boolean }
/** 화면에 보내는 점검: 시작 시각(at), 예정 끝 시각(until, 없으면 0), 지금 점검 중인가(on), 안내 글 */
export interface MaintView { at: number; until: number; on: boolean; text?: LangText }
/** 그 언어의 글: 없으면 한국어, 영어, 적힌 것 아무거나 */
export const pickText = (t: LangText | undefined, lang: string): string => (t ? t[lang] ?? t.ko ?? t.en ?? Object.values(t)[0] ?? '' : '');
