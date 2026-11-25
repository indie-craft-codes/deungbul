// 성장 선택: 레벨이 오를 때마다 받는 능력치 점수를 나눠 찍고, 골드로 기술을 강화한다.
// 수치는 games/deungbul/shared/content/growth.ts의 BUILD에 있다. 찍은 것은 수치 보정(g.mods)과 기술 배율로 들어간다.
import { BUILD, BUILD_STAT_IDS, STAT_MODS, buildStatDef, classOf, modValue, isBuildStat, isSkillId, type BuildStat, type SkillId } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { WHY } from './wallet';

export class Build {
  constructor(private g: Game) {
    g.commands.set('stat', (p, m) => { if (isBuildStat(m.k)) this.spend(p, m.k, typeof m.n === 'number' && Number.isFinite(m.n) ? m.n : 1); });
    g.commands.set('statReset', (p) => this.reset(p));
    g.commands.set('skillUp', (p, m) => { if (isSkillId(m.id)) this.skillUp(p, m.id); });

    // 능력치의 id는 게임이 짓고, 능력치마다 드는 효과(BUILD_STATS의 mod)로 모아 보정한다
    for (const mod of STAT_MODS) {
      const ids = BUILD_STAT_IDS.filter((k) => buildStatDef(k).mod === mod);
      if (ids.length) g.mods.provide(mod, (p) => modValue(mod, ids.reduce((s, k) => s + this.stat(p, k) * buildStatDef(k).per, 0)));
    }

    g.saves.push({
      name: 'build',
      save: (p) => ({ stats: p.stats, skillLv: p.skillLv }),
      load: (p, raw) => {
        const d = raw as { stats?: Record<string, unknown>; skillLv?: Record<string, unknown> };
        const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
        for (const k of BUILD_STAT_IDS) p.stats[k] = n(d.stats?.[k], 9999);
        // 저장된 점수가 지금 레벨로 받을 수 있는 것보다 많으면(수치가 바뀐 경우) 모두 돌려준다
        if (this.spent(p) > this.total(p)) for (const k of BUILD_STAT_IDS) p.stats[k] = 0;
        for (const [id, lv] of Object.entries(d.skillLv ?? {})) if (isSkillId(id)) p.skillLv[id] = Math.max(1, n(lv, BUILD.skillMax));
      },
    });
  }

  private stat(p: Ent | undefined, k: BuildStat): number { return p && p.kind === 'p' ? p.stats[k] ?? 0 : 0; }
  /** 지금 레벨까지 받은 점수 */
  total(p: Ent): number { return (p.lv - 1) * BUILD.pointsPerLevel; }
  spent(p: Ent): number { return BUILD_STAT_IDS.reduce((s, k) => s + (p.stats[k] ?? 0), 0); }
  /** 아직 찍지 않은 점수 */
  left(p: Ent): number { return this.total(p) - this.spent(p); }

  /** 그 기술의 강화 단계 (1부터) */
  skillLevel(p: Ent, id: SkillId): number { return p.skillLv[id] ?? 1; }
  /** 기술의 피해와 회복에 곱하는 값 */
  skillScale(p: Ent, id: SkillId): number { return 1 + (this.skillLevel(p, id) - 1) * BUILD.skillPerLevel; }

  private changed(p: Ent): void { p.metaDirty = true; p.unsaved = true; this.g.players.refresh(p); }

  /** n점을 찍는다 (남은 점수만큼까지). 한 번에 여러 점: 9점을 찍으려고 아홉 번 누르던 것(플레이어 재검토) */
  spend(p: Ent, k: BuildStat, n = 1): void {
    const left = this.left(p);
    if (left < 1) { this.g.notify(p, 'statNone'); return; }
    p.stats[k] = (p.stats[k] ?? 0) + Math.max(1, Math.min(left, Math.floor(n)));
    this.changed(p);
  }

  /** 찍은 점수를 모두 돌려받는다. 골드가 든다 */
  reset(p: Ent): void {
    const g = this.g, cost = BUILD.resetGold(p.lv);
    if (this.spent(p) === 0) return;
    if (!g.wallet.take(p, 'gold', cost, WHY.statReset)) { g.notify(p, 'noGold'); return; }
    for (const k of BUILD_STAT_IDS) p.stats[k] = 0;
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
