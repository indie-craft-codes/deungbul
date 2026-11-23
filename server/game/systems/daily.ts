// 일일 임무와 출석: 날마다 새로 시작하는 임무의 진행을 세고, 채우면 보상을 우편으로 보낸다.
// 그날 처음 접속하면 출석 보상이 온다. 임무와 보상은 shared/content/growth.ts의 DAILIES, ATTEND에 있다.
import { ATTEND, DAILIES, DAILY_IDS, type DailyKind } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

const DAY_MS = 24 * 3600000;

export class Daily {
  constructor(private g: Game) {
    g.on('playerJoined', (p) => this.roll(p));
    g.on('monsterKilled', (_m, hitters) => { for (const p of hitters) this.add(p, 'kill', 1); });
    g.on('offered', (p, _to, n) => this.add(p, 'offer', n));
    g.on('enhanced', (p) => this.add(p, 'enhance', 1));
    g.saves.push({
      name: 'daily',
      save: (p) => p.daily,
      load: (p, raw) => {
        const d = raw as Partial<Ent['daily']>;
        if (typeof d.day !== 'string' || typeof d.prog !== 'object' || d.prog === null || !Array.isArray(d.got)) return;
        p.daily = { day: d.day, prog: { ...d.prog }, got: d.got.filter((x) => typeof x === 'string'), streak: typeof d.streak === 'number' ? d.streak : 0, last: typeof d.last === 'string' ? d.last : '' };
      },
    });
  }

  private dayOf(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** 날이 바뀌었으면 임무를 비우고, 그날 첫 접속이면 출석 보상을 보낸다 */
  roll(p: Ent): void {
    if (p.bot) return;
    const now = this.g.now(), today = this.dayOf(now), d = p.daily;
    if (d.day !== today) { d.day = today; d.prog = {}; d.got = []; p.metaDirty = true; p.unsaved = true; }
    if (d.last === today) return;
    // 어제도 왔으면 이어 가고, 하루라도 빠졌으면 1일째부터. 7일을 채운 다음 날도 1일째다
    d.streak = d.last === this.dayOf(now - DAY_MS) ? (d.streak % ATTEND.length) + 1 : 1;
    d.last = today;
    p.metaDirty = true; p.unsaved = true;
    this.g.mail.send(p, 'attend', [d.streak], ATTEND[d.streak - 1]);
  }

  /** 임무 진행을 더한다. 채운 임무는 보상을 우편으로 보낸다 */
  add(p: Ent, kind: DailyKind, n: number): void {
    if (p.bot) return;
    this.roll(p); // 접속한 채로 날이 바뀌었을 수 있다
    const d = p.daily;
    for (const id of DAILY_IDS) {
      const def = DAILIES[id];
      if (def.kind !== kind || d.got.includes(id)) continue;
      d.prog[id] = Math.min(def.n, (d.prog[id] ?? 0) + n);
      p.metaDirty = true; p.unsaved = true;
      if (d.prog[id] >= def.n) { d.got.push(id); this.g.mail.send(p, 'daily', [id], def.r); }
    }
  }
}
