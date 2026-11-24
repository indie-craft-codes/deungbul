// 휴식 보너스(등불 맡기기): 접속을 끊고 쉰 시간만큼 보너스가 쌓이고, 몬스터를 잡을 때 그만큼 경험치를 더 받는다.
// 수치와 쌓이는 식은 내용에 있다 (shared/content/items.ts의 REST, restGain).
import { REST, restGain } from '@engine/shared/defs';
import type { MeState } from '../../shared/deungbul';
import { readInt } from '@engine/server/game/entity';
import type { Game } from '@engine/server/game/game';

export class Rest {
  constructor(g: Game) {
    g.entInit.push((e) => { e.rested = 0; });
    // 저장: ext.rest = { left: 남은 보너스 }. 칸을 옮기기 전의 저장은 최상위 rested에 있다.
    // 읽을 때 떠나 있던 시간(p.offMs)만큼 새로 쌓는다. 남은 보너스가 적힌 적 없는 저장도 쉰 시간은 쳐 주어야 하므로, 옛 형식에서는 값이 없어도 읽는다
    g.saves.push({
      name: 'rest',
      save: (p) => ({ left: p.rested }),
      load: (p, raw) => {
        const gain = restGain(p.offMs);
        p.rested = Math.min(REST.cap, readInt((raw as { left?: unknown } | null)?.left, 0, REST.cap, 0) + gain);
        if (gain > 0) g.notify(p, 'rested', p.rested);
      },
      legacy: (whole) => ({ left: whole.rested }),
      legacySave: (p) => ({ rested: p.rested }),
    });
    // 본인에게 알리는 개인 상태: 쉬고 와서 쌓였거나 사냥으로 줄면 간다
    g.personal.push({ name: 'rested', state: (p): MeState['rested'] => p.rested });
    // 보너스가 남아 있으면 그만큼 경험치를 더 받는다 (한 마리당 그 몬스터의 경험치까지, 즉 최대 2배)
    g.killBonus.push((p, m) => {
      const bonus = Math.min(m.def?.exp ?? 0, p.rested);
      p.rested -= bonus;
      return bonus;
    });
  }
}
