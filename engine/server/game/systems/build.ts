// 성장 선택: 레벨이 오를 때마다 받는 능력치 점수를 나눠 찍고, 골드로 기술을 강화한다.
// 수치는 games/deungbul/shared/content/growth.ts의 BUILD에 있다. 찍은 것은 수치 보정(g.mods)과 기술 배율로 들어간다.
import { BUILD, BUILD_STATS, classOf, isBuildStat, isSkillId, type BuildStat, type SkillId } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { WHY } from './wallet';

export class Build {
  constructor(private g: Game) {
    g.commands.set('stat', (p, m) => { if (isBuildStat(m.k)) this.spend(p, m.k); });
    g.commands.set('statReset', (p) => this.reset(p));
    g.commands.set('skillUp', (p, m) => { if (isSkillId(m.id)) this.skillUp(p, m.id); });

    g.mods.provide('damage', (p) => 1 + this.stat(p, 'pow') * BUILD.pow / 100);
    g.mods.provide('hp', (p) => this.stat(p, 'vit') * BUILD.vit);
    g.mods.provide('crit', (p) => this.stat(p, 'luck') * BUILD.luck / 100);

    g.saves.push({
      name: 'build',
      save: (p) => ({ stats: p.stats, skillLv: p.skillLv }),
      load: (p, raw) => {
        const d = raw as { stats?: Record<string, unknown>; skillLv?: Record<string, unknown> };
        const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
        for (const k of BUILD_STATS) p.stats[k] = n(d.stats?.[k], 9999);
        // 저장된 점수가 지금 레벨로 받을 수 있는 것보다 많으면(수치가 바뀐 경우) 모두 돌려준다
        if (this.spent(p) > this.total(p)) for (const k of BUILD_STATS) p.stats[k] = 0;
        for (const [id, lv] of Object.entries(d.skillLv ?? {})) if (isSkillId(id)) p.skillLv[id] = Math.max(1, n(lv, BUILD.skillMax));
      },
    });
  }

  private stat(p: Ent | undefined, k: BuildStat): number { return p && p.kind === 'p' ? p.stats[k] ?? 0 : 0; }
  /** 지금 레벨까지 받은 점수 */
  total(p: Ent): number { return (p.lv - 1) * BUILD.pointsPerLevel; }
  spent(p: Ent): number { return BUILD_STATS.reduce((s, k) => s + (p.stats[k] ?? 0), 0); }
  /** 아직 찍지 않은 점수 */
  left(p: Ent): number { return this.total(p) - this.spent(p); }

  /** 그 기술의 강화 단계 (1부터) */
  skillLevel(p: Ent, id: SkillId): number { return p.skillLv[id] ?? 1; }
  /** 기술의 피해와 회복에 곱하는 값 */
  skillScale(p: Ent, id: SkillId): number { return 1 + (this.skillLevel(p, id) - 1) * BUILD.skillPerLevel; }

  private changed(p: Ent): void { p.metaDirty = true; p.unsaved = true; this.g.players.refresh(p); }

  spend(p: Ent, k: BuildStat): void {
    if (this.left(p) < 1) { this.g.notify(p, 'statNone'); return; }
    p.stats[k] = (p.stats[k] ?? 0) + 1;
    this.changed(p);
  }

  /** 찍은 점수를 모두 돌려받는다. 골드가 든다 */
  reset(p: Ent): void {
    const g = this.g, cost = BUILD.resetGold(p.lv);
    if (this.spent(p) === 0) return;
    if (!g.wallet.take(p, 'gold', cost, WHY.statReset)) { g.notify(p, 'noGold'); return; }
    for (const k of BUILD_STATS) p.stats[k] = 0;
    g.notify(p, 'statReset');
    this.changed(p);
  }

  skillUp(p: Ent, id: SkillId): void {
    const g = this.g, lv = this.skillLevel(p, id);
    if (!(classOf(p.cls).skills as readonly string[]).includes(id)) return; // 내 직업의 기술만
    if (lv >= BUILD.skillMax) { g.notify(p, 'skillMax'); return; }
    if (p.lv < BUILD.skillNeedLv(lv)) { g.notify(p, 'skillNeedLv', BUILD.skillNeedLv(lv)); return; }
    const cost = BUILD.skillGold(lv);
    if (!g.wallet.take(p, 'gold', cost, WHY.skillUp)) { g.notify(p, 'noGold'); return; }
    p.skillLv[id] = lv + 1;
    g.notify(p, 'skillUp', id, lv + 1);
    this.changed(p);
  }
}
