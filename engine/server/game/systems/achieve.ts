// [achieve] 업적과 칭호 (묶음 6): 내용의 ACHIEVES. 사건(counted: 일일 임무와 같은 셈)의 누적 수를 종류마다 세고, n에 닿으면 이룬다:
// 보상(r)은 우편으로, 칭호(title: 문장 키)가 있으면 그 칭호를 고를 수 있다 (명령 { t: 'title', id }: id는 업적 id, ''이면 뗀다).
// 고른 칭호는 엔티티의 칸 title에 두고 남에게도 보인다 (들어올 때의 정보 ti, 바꾸면 모두에게 { t: 'title', id, ti }).
// 저장: ext.achieve = { c: 종류 → 수, got: 이룬 업적, title }. 개인 상태 'achieve'(AchieveMe).
import { achieveDef, achieveIds, type AchieveMe } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

interface State { c: Record<string, number>; got: string[] }

export class AchieveSys {
  private st = new WeakMap<Ent, State>();

  constructor(private g: Game) {
    g.on('counted', (p, kind, n) => this.count(p, kind, n));
    g.commands.set('title', (p, m) => { if (typeof m.id === 'string') this.setTitle(p, m.id); });
    g.saves.push({
      name: 'achieve',
      save: (p) => { const s = this.st.get(p); return s || p.title ? { ...(s ?? { c: {}, got: [] }), ...(p.title ? { title: p.title } : {}) } : undefined; },
      load: (p, raw) => {
        const r = raw as { c?: unknown; got?: unknown; title?: unknown } | null;
        if (typeof r !== 'object' || r === null) return;
        const c: Record<string, number> = {};
        if (typeof r.c === 'object' && r.c !== null) for (const [k, v] of Object.entries(r.c)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) c[k] = Math.floor(v);
        const got = Array.isArray(r.got) ? r.got.filter((x): x is string => typeof x === 'string' && !!achieveDef(x)) : [];
        this.st.set(p, { c, got });
        if (typeof r.title === 'string' && got.includes(r.title) && achieveDef(r.title)?.title) p.title = r.title;
      },
    });
    g.personal.push({ name: 'achieve', state: (p): AchieveMe => { const s = this.state(p); return { c: { ...s.c }, got: [...s.got], title: p.title }; } });
  }

  state(p: Ent): State { let s = this.st.get(p); if (!s) { s = { c: {}, got: [] }; this.st.set(p, s); } return s; }

  count(p: Ent, kind: string, n: number): void {
    if (p.bot || !(n > 0)) return;
    const ids = achieveIds().filter((id) => achieveDef(id)!.kind === kind);
    if (!ids.length) return;
    const s = this.state(p);
    s.c[kind] = (s.c[kind] ?? 0) + n;
    p.metaDirty = true; p.unsaved = true;
    for (const id of ids) {
      const a = achieveDef(id)!;
      if (s.got.includes(id) || s.c[kind] < a.n) continue;
      s.got.push(id);
      if (a.r && Object.keys(a.r).length) this.g.mail.send(p, 'achieve', [id], a.r);
      this.g.notify(p, 'achieveGot', id);
    }
  }

  /** 칭호를 단다 (''이면 뗀다). 이룬 업적의 칭호만 */
  setTitle(p: Ent, id: string): boolean {
    if (id && (!this.state(p).got.includes(id) || !achieveDef(id)?.title)) return false;
    if (p.title === id) return true;
    p.title = id;
    p.metaDirty = true; p.unsaved = true;
    this.g.casts.push({ t: 'title', id: p.id, ti: id });
    this.g.notify(p, 'titleSet', id);
    return true;
  }
}
