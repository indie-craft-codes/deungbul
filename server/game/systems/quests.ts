// 메인 퀘스트: 플레이어마다 장과 단계를 따라간다. 다른 시스템의 사건을 듣고 진행을 올린다.
import { QUESTS, goalCount, type QuestStep } from '../../../shared/defs';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

export class Quests {
  private visitT = 0;

  constructor(private g: Game) {
    g.ticks.push((dt) => this.tick(dt));
    g.on('monsterKilled', (m, hitters) => {
      for (const p of hitters) {
        const step = this.step(p);
        if (step?.goal.kind === 'kill' && step.goal.monster === m.type) this.advance(p, step, 1);
      }
    });
    g.on('bought', (p, item) => {
      const step = this.step(p);
      if (step?.goal.kind === 'buy' && step.goal.item === item) this.advance(p, step, 1);
    });
    g.on('raidWon', (fighters) => {
      for (const p of fighters) {
        const step = this.step(p);
        if (step?.goal.kind === 'raid') this.advance(p, step, 1);
      }
    });
    g.on('offered', (p, _to, n, tower) => {
      const step = this.step(p);
      if (step?.goal.kind === 'offer' && (step.goal.tower === undefined || step.goal.tower === tower)) this.advance(p, step, n);
    });
  }

  /** 플레이어가 지금 하고 있는 단계. 다 마쳤으면 null */
  step(p: Ent): QuestStep | null {
    return QUESTS[p.qc]?.steps[p.qs] ?? null;
  }

  private advance(p: Ent, step: QuestStep, by: number): void {
    const g = this.g;
    p.qn += by; p.questDirty = true; p.unsaved = true;
    if (p.qn < goalCount(step.goal)) return;
    // 단계 완료: 보상을 주고 다음 단계로
    g.notify(p, 'questStep', step.reward.exp, step.reward.sparks);
    g.players.grant(p, step.reward.exp, step.reward.sparks);
    p.qn = 0; p.qs++;
    if (p.qs >= QUESTS[p.qc].steps.length) {
      g.notify(p, 'questDone', QUESTS[p.qc].id);
      p.qc++; p.qs = 0;
    }
  }

  tick(dt: number): void {
    // '그 자리에 간다' 목표는 가끔만 확인하면 된다
    this.visitT += dt;
    if (this.visitT < 0.5) return;
    this.visitT = 0;
    for (const p of this.g.ents.values()) {
      if (p.kind !== 'p' || p.bot) continue;
      const step = this.step(p);
      if (step?.goal.kind === 'visit' && dist(p, step.at) <= step.goal.r) this.advance(p, step, 1);
    }
  }
}
