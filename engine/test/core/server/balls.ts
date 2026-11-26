// 공 마당의 규칙 플러그인: 공을 놓고, 가까운 공을 줍는 명령 하나. 공은 빛남(glow)과 주운 사람(owner)을 화면에 실어 보내고, 월드와 함께 저장된다.
// 핵심만 쓰는 게임의 작은 본보기다 (docs/making-a-game.md의 '전투 없는 게임'): 시험(../core.test.ts)과 실행 서버(./main.ts)가 함께 쓴다.
import { BALL_SPOTS } from '@game/shared/content';
import { dist } from '../../../server/game/entity';
import type { Plugin } from '../../../server/game/game';

export const balls: Plugin = (g) => {
  g.defineKind('ball', {
    tick: (e, dt) => { e.data.age = Number(e.data.age ?? 0) + dt; },
    sync: (e) => [Number(e.data.glow ?? 0), Number(e.data.owner ?? 0)],
    save: (e) => ({ x: e.x, z: e.z, glow: Number(e.data.glow ?? 0) }),
    load: (raw) => {
      const r = raw as { x: number; z: number; glow: number };
      g.place('ball', { x: r.x, z: r.z, type: 'gold' }).data.glow = r.glow;
    },
  });
  for (const s of BALL_SPOTS) g.place('ball', { x: s.x, z: s.z, type: 'gold' }).data.glow = 1;
  g.commands.set('pick', (p) => {
    for (const b of g.ents.values()) if (b.kind === 'ball' && !b.data.owner && dist(p, b) < 2.5) { b.data.owner = p.id; b.data.glow = 0; g.saveDirty = true; }
  });
};
