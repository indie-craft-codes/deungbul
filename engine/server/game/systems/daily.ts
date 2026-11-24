// 일일 임무와 출석: 날마다 새로 시작하는 임무의 진행을 세고, 채우면 보상을 우편으로 보낸다.
// 그날 처음 접속하면 출석 보상이 온다. 임무와 보상은 games/deungbul/shared/content/growth.ts의 DAILIES, ATTEND에 있다.
import { ATTEND, DAILIES, DAILY_IDS, type DailyKind } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

const DAY_MS = 24 * 3600000;

export class Daily {
  constructor(private g: Game) {
    g.on('playerJoined', (p) => this.roll(p));
    g.on('monsterKilled', (_m, hitters) => { for (const p of hitters) this.add(p, 'kill', 1); });
    g.on('enhanced', (p) => this.add(p, 'enhance', 1));
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
      },
    });
  }

  /** 그 시각의 날짜 (서버 현지 시간, 자정에 바뀐다). 하루 단위로 세는 다른 시스템도 이것을 쓴다 */
  dayOf(ms: number): string {
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

  /** 임무 진행을 더한다. 채운 임무는 보상을 우편으로 보낸다. 게임에만 있는 종류(이 게임의 'offer')는 그 규칙을 가진 시스템이 직접 부른다 */
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
