// 일일 임무와 출석: 날마다(주마다, 달마다) 새로 시작하는 임무의 진행을 세고, 채우면 보상을 우편으로 보낸다.
// 그날 처음 접속하면 출석 보상이 온다. 임무와 보상은 게임의 내용(DAILIES, ATTEND)에 있다 (등불지기는 games/deungbul/shared/content/growth.ts).
// 임무의 period('day' 기본, 'week', 'month')가 그 임무가 새로 시작하는 기간이다. 날·주·달의 경계는 시계(g.time: 내용의 RESET)가 정한다.
// 비우기는 그 사람이 무엇을 할 때(접속, 진행) 열쇠를 견주어 한다: 접속하지 않은 사람도 돌아오면 맞게 비워진다.
// 주간·월간 임무가 있는 게임만 주·달을 센다(저장의 wk·mo, 화면에 보내는 다음 초기화 시각, 경계 사건에 접속한 사람의 임무를 바로 비우기): 없는 게임의 저장과 줄 위의 글자는 예전 그대로다.
import { ATTEND, DAILY_IDS, type DailyKind, type DailyState, type Period, dailyDef, dailyPeriod, hasLongDailies } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

export class Daily {
  /** 주간·월간 임무가 있는 게임인가 */
  readonly long = hasLongDailies();

  constructor(private g: Game) {
    g.on('playerJoined', (p) => this.roll(p));
    g.on('monsterKilled', (_m, hitters) => { for (const p of hitters) this.add(p, 'kill', 1); });
    g.on('enhanced', (p) => this.add(p, 'enhance', 1));
    // 주간·월간 임무가 있는 게임: 경계에 접속해 있는 사람의 임무를 바로 비워 창이 새 기간을 보이게 한다
    if (this.long) g.on('dayReset', () => { for (const e of g.ents.values()) if (e.kind === 'p' && !e.bot) this.roll(e); });
    g.saves.push({
      name: 'daily',
      save: (p) => p.daily,
      load: (p, raw) => {
        const d = raw as Partial<Ent['daily']>;
        if (typeof d.day !== 'string' || typeof d.prog !== 'object' || d.prog === null || !Array.isArray(d.got)) return;
        // 깨진 값(문자열 진행 수치, 소수 출석 일수)이 들어 있어도 규칙을 건너뛰거나 서버가 죽지 않게 정수로 맞춘다
        const prog: Record<string, number> = {};
        for (const [k, v] of Object.entries(d.prog)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) prog[k] = Math.floor(v);
        const streak = typeof d.streak === 'number' && Number.isFinite(d.streak) ? Math.max(0, Math.min(ATTEND.length, Math.floor(d.streak))) : 0;
        p.daily = { day: d.day, prog, got: d.got.filter((x) => typeof x === 'string'), streak, last: typeof d.last === 'string' ? d.last : '' };
        if (typeof d.wk === 'string') p.daily.wk = d.wk;
        if (typeof d.mo === 'string') p.daily.mo = d.mo;
      },
    });
  }

  /** 그 시각의 날짜 (초기화 시각 RESET으로: 적지 않으면 서버 현지 자정에 바뀐다). 하루 단위로 세는 다른 시스템도 이것을 쓴다 */
  dayOf(ms: number): string { return this.g.time.dayOf(ms); }

  /** 날(주, 달)이 바뀌었으면 그 기간의 임무를 비우고, 그날 첫 접속이면 출석 보상을 보낸다 */
  roll(p: Ent): void {
    if (p.bot) return;
    const now = this.g.now(), t = this.g.time, today = t.dayOf(now), d = p.daily;
    let fresh = false;
    if (d.day !== today) { d.day = today; this.clear(d, 'day'); fresh = true; }
    if (this.long) {
      const wk = t.weekOf(now), mo = t.monthOf(now);
      if (d.wk !== wk) { d.wk = wk; this.clear(d, 'week'); fresh = true; }
      if (d.mo !== mo) { d.mo = mo; this.clear(d, 'month'); fresh = true; }
    }
    if (fresh) { p.metaDirty = true; p.unsaved = true; }
    // 출석 보상이 없는 게임(ATTEND가 빈 표)은 출석을 세지 않는다: 빈 보상의 우편이 생기지 않게
    if (d.last === today || ATTEND.length === 0) return;
    // 어제도 왔으면 이어 가고, 하루라도 빠졌으면 1일째부터. 7일을 채운 다음 날도 1일째다
    d.streak = d.last === t.prevDay(today) ? (d.streak % ATTEND.length) + 1 : 1;
    d.last = today;
    p.metaDirty = true; p.unsaved = true;
    this.g.mail.send(p, 'attend', [d.streak], ATTEND[d.streak - 1]);
  }

  /** 다음 초기화 시각 [날, 주, 달] (UTC ms): 주간·월간 임무가 있는 게임의 화면에 보낸다 */
  next(): readonly number[] { return this.g.time.upcoming(); }

  /** 그 기간의 임무를 비운다. 주간·월간 임무가 없는 게임은 예전처럼 통째로 (모르는 임무의 남은 칸도 함께) */
  private clear(d: DailyState, period: Period): void {
    if (!this.long) { d.prog = {}; d.got = []; return; }
    const drop = (id: string) => (DAILY_IDS as readonly string[]).includes(id) ? dailyPeriod(id) === period : period === 'day';
    for (const id of Object.keys(d.prog)) if (drop(id)) delete d.prog[id];
    d.got = d.got.filter((id) => !drop(id));
  }

  /** 임무 진행을 더한다. 채운 임무는 보상을 우편으로 보낸다. 게임에만 있는 종류(이 게임의 'offer')는 그 규칙을 가진 시스템이 직접 부른다 */
  add(p: Ent, kind: DailyKind, n: number): void {
    if (p.bot) return;
    this.roll(p); // 접속한 채로 날이 바뀌었을 수 있다
    const d = p.daily;
    for (const id of DAILY_IDS) {
      const def = dailyDef(id);
      if (def.kind !== kind || d.got.includes(id)) continue;
      d.prog[id] = Math.min(def.n, (d.prog[id] ?? 0) + n);
      p.metaDirty = true; p.unsaved = true;
      if (d.prog[id] >= def.n) { d.got.push(id); this.g.mail.send(p, 'daily', [id], def.r); }
    }
    // 같은 사건을 이벤트 임무·시즌 점수·업적이 함께 센다 (묶음 6: 듣는 것이 없으면 아무 일도 없다)
    this.g.fire('counted', p, kind, n);
  }
}
