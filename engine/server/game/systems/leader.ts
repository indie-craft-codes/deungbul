// 사람(이끄는 사람)을 서버가 대신 싸우게 하는 한 셈: 단계 안(STAGE_RULES.leaderAuto: stages.ts)과 자동 전투 던전 안(DungeonDef.auto: dungeon.ts)이 함께 쓴다.
// 손으로 움직이는 중(마지막으로 움직인 뒤 1.5초)에는 맡기지 않는다. 대상이 없거나 쓰러졌거나 다른 층이면 후보 가운데 가장 가까운 것을 대상으로 준다
// (대상이 있으면 전투 모듈의 사람 틱이 사거리까지 다가가 친다). 직업이 있으면 쿨다운이 끝난 기술 가운데 쓸 수 있는 것 하나를 쓴다 (회복은 체력이 60% 아래일 때만).
import { classOf, isSkillId, skillDef } from '../../../shared/defs';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

export function leaderFight(g: Game, p: Ent, mobs: Iterable<number>): void {
  if (g.clock - p.lastMove < 1.5) return; // 손으로 움직이는 중
  let t = g.ents.get(p.targetId);
  if (!t || t.dead || t.layer !== p.layer) {
    t = undefined;
    let bd = Infinity;
    for (const id of mobs) { const m = g.ents.get(id); if (m && !m.dead) { const d = dist(p, m); if (d < bd) { bd = d; t = m; } } }
    if (t) { p.targetId = t.id; p.stuck = 0; }
  }
  if (!t || !g.has('classes')) return;
  // 기술: 쿨다운이 끝난 것 가운데 쓸 수 있는 것 하나 (회복은 체력이 60% 아래일 때만)
  const skills = classOf(p.cls).skills, d = dist(p, t);
  for (let n = 0; n < skills.length; n++) {
    const id = skills[n];
    if (!isSkillId(id) || (p.cds[n] ?? 0) > 0) continue;
    const sd = skillDef(id);
    if (sd.effect.kind === 'heal' && p.hp > p.maxHp * 0.6) continue;
    if (sd.range !== undefined && d > sd.range) continue;
    g.command(p, { t: 'skill', n });
    break;
  }
}
