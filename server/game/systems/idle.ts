// 방치 보상: 접속하지 않은 시간만큼 골드와 경험치가 쌓여, 돌아오면 우편으로 온다.
// 자동 사냥을 켠 채 나가 서버가 대신 사냥한 시간(systems/away.ts)은 여기에 들지 않는다: 그때는 캐릭터가 월드에 남아 있었다.
import { IDLE } from '../../../shared/defs';
import type { Game } from '../game';

export class Idle {
  constructor(g: Game) {
    g.on('playerJoined', (p) => {
      const minutes = Math.min(IDLE.maxMin, Math.floor(p.offMs / 60000));
      if (minutes < IDLE.minMin) return;
      g.mail.send(p, 'idle', [minutes], IDLE.reward(minutes, p.lv));
    });
  }
}
