// [season] 시즌과 무료 보상 트랙 (묶음 6): 내용의 SEASON. 유료 트랙은 없다 (결제 결정 뒤).
//   주기      초기화 시각(RESET)의 주·달, 또는 from부터 n일마다 (seasonAt). 열쇠가 바뀌면 새 시즌이다
//   점수      사건(counted: 일일 임무와 같은 셈) → SEASON.points[종류] × 수
//   트랙      그 점수에 닿은 칸을 받는다 (명령 { t: 'season', i }: i가 -1이면 받을 수 있는 칸 모두). 재화는 바로, 물건은 가방(넘치면 우편)
//   초기화    새 시즌에 점수를 reset대로 (all 0, keep 그대로, { part } 그 비율만). 받은 칸은 늘 새로
//   놓친 보상  시즌이 끝날 때 닿았지만 받지 않은 칸은 우편 한 통으로 (missed 'mail', 기본). 접속하지 않았던 사람은 다음에 들어올 때
// 저장: ext.season = { key, pts, got }. 개인 상태 'season'(SeasonMe).
import { SEASON, seasonAt, seasonKeep, type SeasonMe, type SeasonRules } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { giveNow, mergeRewards } from './goods';

interface State { key: string; pts: number; got: number[] }
const CHECK_S = 5;
export const SEASON_WHY = 'cmd:season';

export class SeasonSys {
  private st = new WeakMap<Ent, State>();
  private acc = 0;
  private last = '';

  constructor(private g: Game) {
    g.on('counted', (p, kind, n) => this.count(p, kind, n));
    g.on('playerJoined', (p) => this.roll(p));
    g.commands.set('season', (p, m) => { if (typeof m.i === 'number' && Number.isInteger(m.i)) this.claim(p, m.i); });
    g.ticks.push((dt) => this.tick(dt));
    g.saves.push({
      name: 'season',
      save: (p) => this.st.get(p),
      load: (p, raw) => {
        const r = raw as Partial<State> | null;
        if (typeof r !== 'object' || r === null || typeof r.key !== 'string' || typeof r.pts !== 'number' || !Array.isArray(r.got)) return;
        this.st.set(p, { key: r.key, pts: Math.max(0, Math.floor(Number.isFinite(r.pts) ? r.pts : 0)), got: r.got.filter((x): x is number => Number.isInteger(x) && x >= 0) });
      },
    });
    g.personal.push({ name: 'season', state: (p): SeasonMe | null => this.me(p) });
  }

  private rules(): SeasonRules | null { return SEASON as SeasonRules | null; }
  /** 지금 시즌: 열쇠, 몇째, 끝나는 때 */
  now(): { key: string; n: number; to: number } | null { const s = this.rules(); return s ? seasonAt(s, this.g.now(), this.g.time.cal) : null; }
  state(p: Ent): State { this.roll(p); return this.st.get(p) ?? { key: '', pts: 0, got: [] }; }
  me(p: Ent): SeasonMe | null {
    const cur = this.now();
    if (!cur || p.bot) return null;
    const s = this.state(p);
    return { key: cur.key, n: cur.n, to: cur.to, pts: s.pts, got: [...s.got] };
  }

  /** 시즌이 바뀌었으면 놓친 보상을 보내고 점수를 초기화 방식대로 넘긴다 */
  roll(p: Ent): void {
    const rules = this.rules(), cur = this.now();
    if (!rules || !cur || p.bot) return;
    const old = this.st.get(p);
    if (old?.key === cur.key) return;
    if (!old) { this.st.set(p, { key: cur.key, pts: 0, got: [] }); p.metaDirty = true; p.unsaved = true; return; }
    const missed = rules.track.map((t, i) => ({ t, i })).filter(({ t, i }) => old.pts >= t.pts && !old.got.includes(i));
    if (missed.length && (rules.missed ?? 'mail') === 'mail') this.g.mail.send(p, 'season', [old.key], mergeRewards(missed.map((x) => x.t.r)));
    const keep = seasonKeep(rules.reset, old.pts);
    this.st.set(p, { key: cur.key, pts: keep, got: [] });
    p.metaDirty = true; p.unsaved = true;
    this.g.notify(p, 'seasonNew', cur.n, keep, (rules.missed ?? 'mail') === 'mail' ? missed.length : 0);
  }

  count(p: Ent, kind: string, n: number): void {
    const rules = this.rules(), per = rules?.points[kind];
    if (!rules || !per || p.bot || !(n > 0)) return;
    const s = this.state(p);
    s.pts += Math.floor(per * n);
    p.metaDirty = true; p.unsaved = true;
  }

  /** 트랙의 칸을 받는다 (i가 -1이면 받을 수 있는 칸 모두). 받은 칸의 수 */
  claim(p: Ent, i: number): number {
    const rules = this.rules();
    if (!rules || p.bot) return 0;
    const s = this.state(p);
    const list = (i === -1 ? rules.track.map((_, k) => k) : [i]).filter((k) => k >= 0 && k < rules.track.length && s.pts >= rules.track[k].pts && !s.got.includes(k));
    for (const k of list) { s.got.push(k); giveNow(this.g, p, rules.track[k].r, SEASON_WHY); this.g.notify(p, 'seasonGot', k); }
    if (list.length) { p.dirty = true; p.metaDirty = true; p.unsaved = true; }
    return list.length;
  }

  private tick(dt: number): void {
    this.acc += dt;
    if (this.acc < CHECK_S) return;
    this.acc = 0;
    const key = this.now()?.key ?? '';
    if (key === this.last) return;
    this.last = key;
    for (const e of this.g.ents.values()) if (e.kind === 'p' && !e.bot) this.roll(e);
  }
}
