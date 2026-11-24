// 메인 퀘스트: 플레이어마다 장과 단계를 따라간다. 다른 시스템의 사건을 듣고 진행을 올린다.
import { ECON_WHY, QUESTS, goalCount, type QuestStep } from '../../shared/defs';
import type { MeState } from '../../shared/deungbul';
import { dist, readInt, type Ent } from '@engine/server/game/entity';
import type { Game } from '@engine/server/game/game';

export class Quests {
  private visitT = 0;

  constructor(private g: Game) {
    // 엔티티 칸: 메인 퀘스트의 장·단계·진행 수치와, 본인에게 알려야 한다는 표시 (접속한 사람은 처음에 한 번 받는다)
    g.entInit.push((e) => { e.qc = 0; e.qs = 0; e.qn = 0; e.questDirty = e.kind === 'p'; });
    // 저장: ext.quest = [장, 단계, 진행 수치]. 칸을 옮기기 전의 저장은 같은 모양으로 최상위 quest에 있다
    g.saves.push({
      name: 'quest',
      save: (p) => [p.qc, p.qs, p.qn],
      load: (p, raw) => {
        // 내용이 바뀌어 없는 단계를 가리키면 그 장의 처음으로 돌린다
        const q = Array.isArray(raw) ? raw : [0, 0, 0];
        p.qc = readInt(q[0], 0, QUESTS.length, 0);
        const steps = QUESTS[p.qc]?.steps;
        p.qs = steps ? readInt(q[1], 0, steps.length - 1, 0) : 0;
        p.qn = steps ? readInt(q[2], 0, goalCount(steps[p.qs].goal) - 1, 0) : 0;
      },
      legacy: (whole) => whole.quest,
    });
    // 본인에게 알리는 개인 상태: 진행이 바뀌면(questDirty) 간다. 통신 계층이 보내고 나면 표시를 지운다
    g.personal.push({ name: 'quest', state: (p): MeState['quest'] => ({ c: p.qc, s: p.qs, n: p.qn }), dirty: (p) => p.questDirty, sent: (p) => { p.questDirty = false; } });
    // 퀘스트를 조금이라도 한 캐릭터는 저장할 것이 있다 (아무것도 하지 않은 새 캐릭터를 저장하지 않는 규칙)
    const touched = g.rules.touched;
    g.rules.touched = (p) => p.qc > 0 || p.qs > 0 || p.qn > 0 || !!touched?.(p);
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
    // 안내문에는 실제로 받는 양을 넣는다. 레벨 업 안내가 이 뒤에 오도록 안내문을 먼저 보낸다
    g.notify(p, 'questStep', g.wallet.amount(p, 'exp', step.reward.exp, ECON_WHY.quest), g.wallet.amount(p, 'sparks', step.reward.sparks, ECON_WHY.quest));
    g.players.grant(p, step.reward.exp, step.reward.sparks, ECON_WHY.quest);
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
