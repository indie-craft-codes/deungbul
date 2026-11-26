// 방치 보상: 접속하지 않은 시간만큼 골드와 경험치가 쌓여, 돌아오면 우편으로 온다.
// 자동 사냥을 켠 채 나가 서버가 대신 사냥한 시간(systems/away.ts)은 여기에 들지 않는다: 그때는 캐릭터가 월드에 남아 있었다.
// 보상의 식(내용의 IDLE.reward)은 비운 분과 레벨, 그리고 틀이 넘기는 것(IdleCtx: 깬 단계의 수)을 받는다. 깬 단계는 단계 모듈(stages)이 stageOf에 건다.
import { IDLE, type IdleCtx, type Reward } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

export class Idle {
  /** 그 사람이 깬 단계의 수 (단계 모듈이 건다. 없으면 0) */
  stageOf: (p: Ent) => number = () => 0;

  constructor(g: Game) {
    g.on('playerJoined', (p) => {
      const minutes = Math.min(IDLE.maxMin, Math.floor(p.offMs / 60000));
      if (minutes < IDLE.minMin) return;
      const ctx: IdleCtx = { stage: this.stageOf(p) };
      // ctx를 읽지 않는 식(예전 모양)도 이 모양으로 받는다
      const reward: (minutes: number, lv: number, ctx: IdleCtx) => Reward = IDLE.reward;
      g.mail.send(p, 'idle', [minutes], reward(minutes, g.field(p, 'lv'), ctx));
    });
  }
}
