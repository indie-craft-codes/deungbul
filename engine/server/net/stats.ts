// 분석 사건의 집계 (운영 도구: 관리자 명령 stats, 웹 관리 화면의 '분석', npm run stats). 사건은 systems/analytics.ts가 쌓고 저장소의 events 표에 있다.
// 날은 UTC로 가른다 (YYYY-MM-DD). 모두 순수 함수다: 사건 줄의 목록을 받아 표를 돌려준다.
//   retention  잔존: 저장 키가 처음 들어온 날(first_join)의 무리마다 n일 뒤(D1·D7·D30)에 다시 접속(session_start)한 비율
//   daily      일별 활성: 그날 접속한 저장 키 수(DAU), 새로 온 수, 접속 수, 접속 길이의 중간값(초)
//   funnel     퍼널: 정한 사건의 차례를 그 차례대로 밟은 저장 키의 수 (앞 단계를 밟은 뒤에 일어난 것만)
import type { EventRow } from '../store/types';

const DAY = 86_400_000;
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const dayMs = (day: string): number => Date.parse(day + 'T00:00:00Z');
const median = (a: number[]): number => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rate = (n: number, of: number): number => (of ? Math.round((n / of) * 1000) / 10 : 0);

/** 잔존의 한 칸: 돌아온 수와 비율(%). 그날이 아직 오지 않았으면 null */
export type RetCell = { n: number; pct: number } | null;
export interface RetentionRow { day: string; n: number; d1: RetCell; d7: RetCell; d30: RetCell }
export const RET_DAYS = [1, 7, 30] as const;

/** 잔존 표: now(ms)는 '아직 오지 않은 날'을 가르는 데 쓴다. 맨 끝 줄(day: 'all')은 그 칸에 닿은 무리만 모은 합계 */
export function retention(rows: readonly EventRow[], now: number): RetentionRow[] {
  const first = new Map<string, string>(), seen = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.key) continue;
    const d = utcDay(r.at);
    if (r.name === 'first_join' && !first.has(r.key)) first.set(r.key, d);
    if (r.name === 'session_start') { let s = seen.get(r.key); if (!s) seen.set(r.key, s = new Set()); s.add(d); }
  }
  const today = utcDay(now);
  const cohorts = new Map<string, string[]>();
  for (const [key, d] of first) (cohorts.get(d) ?? cohorts.set(d, []).get(d)!).push(key);
  const out: RetentionRow[] = [];
  const sum = { n: 0, d1: [0, 0], d7: [0, 0], d30: [0, 0] } as { n: number } & Record<'d1' | 'd7' | 'd30', [number, number]>;
  for (const day of [...cohorts.keys()].sort()) {
    const keys = cohorts.get(day)!;
    const row: RetentionRow = { day, n: keys.length, d1: null, d7: null, d30: null };
    for (const n of RET_DAYS) {
      const target = utcDay(dayMs(day) + n * DAY);
      if (target > today) continue;
      const back = keys.filter((k) => seen.get(k)?.has(target)).length;
      const k = `d${n}` as 'd1' | 'd7' | 'd30';
      row[k] = { n: back, pct: rate(back, keys.length) };
      sum[k][0] += back; sum[k][1] += keys.length;
    }
    sum.n += keys.length;
    out.push(row);
  }
  if (out.length) out.push({ day: 'all', n: sum.n, ...Object.fromEntries(RET_DAYS.map((n) => { const [b, of] = sum[`d${n}`]; return [`d${n}`, of ? { n: b, pct: rate(b, of) } : null]; })) } as RetentionRow);
  return out;
}

export interface DailyRow { day: string; active: number; fresh: number; sessions: number; medianSec: number }
/** 일별 활성 (날의 차례) */
export function daily(rows: readonly EventRow[]): DailyRow[] {
  const by = new Map<string, { keys: Set<string>; fresh: number; sessions: number; secs: number[] }>();
  const of = (d: string) => by.get(d) ?? by.set(d, { keys: new Set(), fresh: 0, sessions: 0, secs: [] }).get(d)!;
  for (const r of rows) {
    const d = of(utcDay(r.at));
    if (r.name === 'session_start') { d.sessions++; if (r.key) d.keys.add(r.key); }
    else if (r.name === 'first_join') d.fresh++;
    else if (r.name === 'session_end' && typeof r.props.sec === 'number') d.secs.push(r.props.sec);
  }
  return [...by].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, d]) => ({ day, active: d.keys.size, fresh: d.fresh, sessions: d.sessions, medianSec: Math.round(median(d.secs)) }));
}

export interface FunnelStep { name: string; n: number; pct: number; ofPrev: number }
/**
 * 퍼널: 저장 키마다 사건을 시각 순으로 훑어 steps[0], steps[1] … 를 차례로 찾는다 (앞 단계보다 뒤에 일어난 것만 다음 단계로 친다).
 * withinMs를 주면 첫 단계에서 그 안에 일어난 것만. pct는 첫 단계에 대한 비율, ofPrev는 바로 앞 단계에 대한 비율(%)
 */
export function funnel(rows: readonly EventRow[], steps: readonly string[], withinMs = 0): FunnelStep[] {
  const reach = steps.map(() => 0);
  const byKey = new Map<string, EventRow[]>();
  for (const r of rows) if (r.key && steps.includes(r.name)) (byKey.get(r.key) ?? byKey.set(r.key, []).get(r.key)!).push(r);
  for (const list of byKey.values()) {
    list.sort((a, b) => a.at - b.at);
    let i = 0, start = 0;
    for (const r of list) {
      if (i >= steps.length) break;
      if (r.name !== steps[i]) continue;
      if (i === 0) start = r.at; else if (withinMs && r.at - start > withinMs) break;
      reach[i++]++;
    }
  }
  return steps.map((name, i) => ({ name, n: reach[i], pct: rate(reach[i], reach[0]), ofPrev: i ? rate(reach[i], reach[i - 1]) : 100 }));
}

/** 표를 글로 (관리자 명령과 npm run stats가 함께 쓴다) */
export function retentionText(t: RetentionRow[]): string {
  if (!t.length) return '잔존을 셀 사건이 없습니다 (first_join이 적힌 저장 키가 없다).';
  const cell = (c: RetCell) => (c ? `${c.n} (${c.pct}%)` : '-');
  return ['처음 온 날     수   D1            D7            D30', ...t.map((r) => `${r.day.padEnd(12)} ${String(r.n).padStart(4)}   ${cell(r.d1).padEnd(13)} ${cell(r.d7).padEnd(13)} ${cell(r.d30)}`)].join('\n');
}
export function dailyText(t: DailyRow[]): string {
  if (!t.length) return '사건이 없습니다.';
  return ['날            활성   새로   접속   접속 길이(중간, 초)', ...t.map((r) => `${r.day.padEnd(12)} ${String(r.active).padStart(5)} ${String(r.fresh).padStart(6)} ${String(r.sessions).padStart(6)}   ${r.medianSec}`)].join('\n');
}
export function funnelText(t: FunnelStep[]): string {
  return t.map((s, i) => `${i + 1}. ${s.name.padEnd(20)} ${String(s.n).padStart(5)}  ${s.pct}%${i ? `  (앞 단계의 ${s.ofPrev}%)` : ''}`).join('\n');
}
