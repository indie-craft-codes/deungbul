// [event] 기간 이벤트 (묶음 6): 내용의 EVENTS. 기간은 시계(g.now)로 보고, 원격 설정(LIVE_KEYS에 'EVENTS.id.from'·'EVENTS.id.to'를 선언)으로 재시작 없이 바꾼다.
//   이벤트 임무  일일 임무와 같은 사건(counted: kill, enhance, buy와 게임이 g.daily.add로 세는 것)을 센다. 채우면 보상은 우편으로, 이벤트 재화(ev)는 바로
//   이벤트 재화  그 재화(cur)의 'event' 종류 몫 (지갑의 재화 종류: CURRENCIES.kinds.spend에 'event'). 이벤트 상점(GOODS의 event)은 이 몫으로만 판다
//   끝          to가 지나면 사람마다 한 번: 남은 이벤트 재화를 빼고(소멸), end.swap이 있으면 rate배를 to 재화로 우편에 (환전). 접속하지 않은 사람은 다음에 들어올 때
//   알림        열릴 때 모두에게 eventStart, 사람에게 eventMission·eventEnd
// 저장: ext.event = { 이벤트 id: { f: 그 회차의 from, prog, got, end? } }. 개인 상태 'event'(EventMe[]): 지금 열린 이벤트들.
// 같은 재화의 이벤트 재화를 쓰는 이벤트는 기간이 겹치면 안 된다 (켜질 때 checkLiveContent가 막는다).
import { eventDef, eventIds, within, type EventMe, type LiveCur } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

interface Run { f: number; prog: Record<string, number>; got: string[]; end?: 1 }
const CHECK_S = 5;

export class EventSys {
  private runs = new WeakMap<Ent, Record<string, Run>>();
  /** 지난번 살필 때 열려 있던 이벤트 (열림을 한 번 알린다) */
  private open = new Set<string>();
  private acc = 0;

  constructor(private g: Game) {
    for (const id of eventIds()) if (this.isOpen(id)) this.open.add(id);
    g.on('counted', (p, kind, n) => this.count(p, kind, n));
    g.on('playerJoined', (p) => this.settle(p));
    g.ticks.push((dt) => this.tick(dt));
    g.saves.push({
      name: 'event',
      save: (p) => { const r = this.runs.get(p); return r && Object.keys(r).length ? r : undefined; },
      load: (p, raw) => {
        if (typeof raw !== 'object' || raw === null) return;
        const out: Record<string, Run> = {};
        for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
          const r = v as Partial<Run>;
          if (!eventDef(id) || typeof r !== 'object' || r === null || typeof r.f !== 'number' || typeof r.prog !== 'object' || r.prog === null || !Array.isArray(r.got)) continue;
          const prog: Record<string, number> = {};
          for (const [k, n] of Object.entries(r.prog)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) prog[k] = Math.floor(n);
          out[id] = { f: r.f, prog, got: r.got.filter((x): x is string => typeof x === 'string'), ...(r.end === 1 ? { end: 1 as const } : {}) };
        }
        this.runs.set(p, out);
      },
    });
    g.personal.push({ name: 'event', state: (p): EventMe[] => this.me(p) });
  }

  /** 지금 열려 있는가 */
  isOpen(id: string, now = this.g.now()): boolean { const e = eventDef(id); return !!e && within(now, e.from, e.to); }
  /** 지금 열린 이벤트들 */
  active(now = this.g.now()): string[] { return eventIds().filter((id) => this.isOpen(id, now)); }
  /** 그 사람의 그 이벤트의 진행 (이 회차의 것. 없으면 만든다) */
  run(p: Ent, id: string): Run {
    const e = eventDef(id)!, all = this.runs.get(p) ?? {};
    let r = all[id];
    if (!r || r.f !== e.from) { r = { f: e.from, prog: {}, got: [] }; all[id] = r; }
    this.runs.set(p, all);
    return r;
  }
  /** 이벤트 재화의 잔액 (지금 열린 이벤트의 재화) */
  have(p: Ent, id: string): number { const cur = eventDef(id)?.cur; return cur ? this.g.wallet.kindHave(p, cur, 'event') : 0; }
  me(p: Ent): EventMe[] {
    return this.active().map((id) => { const e = eventDef(id)!, r = this.runs.get(p)?.[id]; const cur = r && r.f === e.from; return { id, from: e.from, to: e.to, prog: cur ? { ...r.prog } : {}, got: cur ? [...r.got] : [], have: this.have(p, id) }; });
  }

  /** 사건을 센다 (일일 임무의 counted) */
  count(p: Ent, kind: string, n: number): void {
    if (p.bot || !(n > 0)) return;
    for (const id of this.active()) {
      const e = eventDef(id)!, ms = Object.entries(e.missions ?? {}).filter(([, m]) => m.kind === kind);
      if (!ms.length) continue;
      const r = this.run(p, id);
      for (const [mid, m] of ms) {
        if (r.got.includes(mid)) continue;
        r.prog[mid] = Math.min(m.n, (r.prog[mid] ?? 0) + n);
        p.metaDirty = true; p.unsaved = true;
        if (r.prog[mid] < m.n) continue;
        r.got.push(mid);
        if (m.ev && e.cur) this.g.wallet.add(p, e.cur, m.ev, `event:${id}`, 'event');
        if (m.r && Object.keys(m.r).length) this.g.mail.send(p, 'event', [id, mid], m.r);
        this.g.notify(p, 'eventMission', id, mid, m.ev ?? 0);
      }
    }
  }

  /**
   * 끝난 이벤트를 그 사람에게 한 번 정리한다: 남은 이벤트 재화를 빼고, 바꿔 주는 이벤트면 우편으로. 정리한 이벤트의 수.
   * 그 이벤트에 한 번도 손대지 않았고 이벤트 재화도 없는 사람은 적지 않는다
   */
  settle(p: Ent, now = this.g.now()): number {
    if (p.bot) return 0;
    let n = 0;
    for (const id of eventIds()) {
      const e = eventDef(id)!;
      if (now < e.to) continue;
      const all = this.runs.get(p), r = all?.[id];
      if (r?.end && r.f === e.from) continue;
      const cur: LiveCur | undefined = e.cur;
      const left = cur ? this.g.wallet.kindHave(p, cur, 'event') : 0;
      if (!r && left <= 0) continue;
      const gone = cur && left > 0 ? this.g.wallet.drainKind(p, cur, 'event', `event:${id}:end`) : 0;
      const swap = e.end?.swap, got = swap && gone > 0 ? Math.floor(gone * swap.rate) : 0;
      if (got > 0 && swap) this.g.mail.send(p, 'eventSwap', [id, gone], { [swap.to]: got });
      const run = this.run(p, id);
      run.end = 1;
      p.metaDirty = true; p.unsaved = true;
      this.g.notify(p, 'eventEnd', id, gone, got);
      n++;
    }
    return n;
  }

  private tick(dt: number): void {
    this.acc += dt;
    if (this.acc < CHECK_S) return;
    this.acc = 0;
    const now = this.g.now(), act = new Set(this.active(now));
    for (const id of act) if (!this.open.has(id)) this.g.announce('eventStart', id);
    const closed = [...this.open].some((id) => !act.has(id));
    this.open = act;
    if (closed) for (const e of this.g.ents.values()) if (e.kind === 'p' && !e.bot) this.settle(e, now);
  }
}
