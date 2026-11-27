// 시계와 초기화 (핵심: 끌 수 없다). 날·주·달의 경계를 내용의 RESET(시간대, 하루 시작 시각, 주의 시작 요일)으로 셈하고, 경계를 넘으면 사건을 한 번씩 알린다.
//   g.time.dayOf(ms) · weekOf · monthOf   그 시각이 속한 날 'YYYY-MM-DD', 주(시작한 날), 달 'YYYY-MM'
//   g.time.next('day' | 'week' | 'month')  다음 경계 (UTC ms)
//   g.time.open(start, end)               지금이 그 기간 안인가 (기간 한정 배너·이벤트)
//   사건 dayReset · weekReset · monthReset (새 열쇠, 옛 열쇠, 지난 경계의 수): 경계를 넘을 때 한 번
// 모든 시각은 UTC의 ms다(g.now). RESET을 적지 않으면 서버 PC의 현지 시각 자정이다: 예전의 dayOf(engine/server/game/entity.ts)와 같은 날짜가 나온다.
// 지켜 주는 것:
//   서머타임   '벽시계가 하루 시작 시각에 닿을 때' 날이 바뀐다 (23·25시간의 날도 한 번). 돌아간 시간(가을)에 같은 시각이 두 번 와도 사건은 한 번
//   되감김     PC의 시계가 뒤로 가도 이미 처리한 경계의 사건은 다시 나지 않는다 (열쇠가 마지막으로 처리한 것보다 뒤일 때만 알린다)
//   꺼져 있던 동안  서버를 켜며 저장소(LiveStore의 live_meta 'clock')에서 마지막으로 처리한 경계를 읽고, 그 뒤로 지난 경계가 있으면 사건을 한 번씩 (지난 수와 함께) 알린다
// 사람마다의 일(일일 임무를 비우기, 하루 횟수)은 경계 사건을 기다리지 않고 그 사람이 다음에 무엇을 할 때 열쇠를 견주어 한다 (접속하지 않은 사람도 맞게): systems/daily.ts
import { RESET, makeCalendar, type Calendar, type Period, type ResetRules } from '../../../shared/defs';
import type { LiveStore } from '../../store/types';
import type { Game } from '../game';

type Keys = Record<Period, string>;
const META = 'clock';

export class Clock {
  /** 초기화 시각의 달력 (engine/shared/defs/live.ts) */
  readonly cal: Calendar;
  /** 마지막으로 처리한(사건을 알린) 경계의 열쇠 */
  private last: Keys;
  /** 다음 경계 [날, 주, 달] (UTC ms). 틱은 그 가운데 가장 가까운 것 전에는 수 하나만 견준다 */
  private upc: [number, number, number];
  private nextAt: number;
  /** 지난번 틱의 시각 (되감김을 알아챈다) */
  private prev: number;
  private store: LiveStore | null = null;

  /** rules를 주면 내용의 RESET 대신 그것으로 (시험이 시간대를 바꿔 본다) */
  constructor(private g: Game, rules: ResetRules = RESET) {
    this.cal = makeCalendar(rules);
    const now = g.now();
    this.last = this.keys(now);
    this.prev = now;
    this.upc = this.upcomingAt(now);
    this.nextAt = Math.min(...this.upc);
    g.ticks.push(() => this.check());
  }

  /** 지금 (UTC ms): g.now와 같다 */
  now(): number { return this.g.now(); }
  /** 그 시각이 속한 날 'YYYY-MM-DD' (하루 시작 시각 전이면 전날) */
  dayOf(ms = this.g.now()): string { return this.cal.day(ms); }
  /** 그 시각이 속한 주: 주가 시작한 날 'YYYY-MM-DD' */
  weekOf(ms = this.g.now()): string { return this.cal.week(ms); }
  /** 그 시각이 속한 달 'YYYY-MM' */
  monthOf(ms = this.g.now()): string { return this.cal.month(ms); }
  /** 기간의 열쇠 */
  keyOf(p: Period, ms = this.g.now()): string { return this.cal.key(p, ms); }
  /** 날 'YYYY-MM-DD'의 전날 */
  prevDay(day: string): string { return this.cal.prevDay(day); }
  /** ms 뒤에 처음으로 그 기간이 바뀌는 시각 (UTC ms) */
  next(p: Period, ms = this.g.now()): number { return this.cal.next(p, ms); }
  /** 지금(또는 ms)이 [start, end) 안인가. 주지 않은 끝은 열려 있다 (기간 한정 배너·이벤트) */
  open(start?: number, end?: number, ms = this.g.now()): boolean { return (start === undefined || ms >= start) && (end === undefined || ms < end); }

  /**
   * 저장소를 붙인다 (통신 계층이 서버를 켤 때): 마지막으로 처리한 경계를 읽어, 서버가 꺼져 있던 동안 지난 경계가 있으면 사건을 한 번씩 알린다.
   * 처음 켜는 서버(적힌 것이 없다)는 알리지 않고 지금을 적는다
   */
  attach(store: LiveStore): void {
    this.store = store;
    const raw = store.liveMeta(META) as Partial<Keys> | null;
    if (raw && typeof raw.day === 'string' && typeof raw.week === 'string' && typeof raw.month === 'string') this.last = { day: raw.day, week: raw.week, month: raw.month };
    else this.save();
    this.check(true);
  }

  /** 틱마다: 경계를 넘었으면 사건을 알린다 */
  check(force = false): void {
    const now = this.g.now(), back = now < this.prev;
    this.prev = now;
    if (!force && !back && now < this.nextAt) return;
    this.upc = this.upcomingAt(now);
    this.nextAt = Math.min(...this.upc);
    const keys = this.keys(now);
    let moved = false;
    for (const p of ['day', 'week', 'month'] as const) {
      // 열쇠는 글자의 차례가 곧 때의 차례다 (YYYY-MM-DD, YYYY-MM): 뒤로 간 열쇠(되감김, 가을의 같은 시각)는 알리지 않는다
      if (keys[p] <= this.last[p]) continue;
      const prev = this.last[p], missed = Math.max(1, this.cal.between(p, prev, keys[p]));
      this.last[p] = keys[p]; moved = true;
      if (p === 'day') this.g.fire('dayReset', keys[p], prev, missed);
      else if (p === 'week') this.g.fire('weekReset', keys[p], prev, missed);
      else this.g.fire('monthReset', keys[p], prev, missed);
    }
    if (moved) this.save();
  }

  /** 다음 경계 [날, 주, 달] (UTC ms, 틱마다 맞춘 것: 화면에 '초기화까지'를 보낼 때) */
  upcoming(): readonly [number, number, number] { return this.upc; }
  /** 마지막으로 처리한 경계 (시험과 관리자 보기) */
  lastKeys(): Readonly<Keys> { return { ...this.last }; }

  private keys(ms: number): Keys { return { day: this.cal.day(ms), week: this.cal.week(ms), month: this.cal.month(ms) }; }
  private upcomingAt(ms: number): [number, number, number] { return [this.cal.next('day', ms), this.cal.next('week', ms), this.cal.next('month', ms)]; }
  private save(): void {
    if (!this.store) return;
    try { this.store.setLiveMeta(META, this.last); } catch (err) { console.error('[clock] 마지막 경계를 적지 못했습니다:', err); }
  }
}
