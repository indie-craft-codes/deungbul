// 영웅 들판의 규칙 플러그인: 처음 온 사람에게 직업(하나뿐), 처음 보석과 골드, 처음 영웅 둘을 준다. 나머지는 모두 틀의 모듈이다.
// 시험(../*.test.ts)과 실행 서버(./main.ts)가 함께 쓴다.
import { CLASS_IDS } from '../../../shared/defs';
import type { Plugin } from '../../../server/game/game';
import { STARTER } from '@game/shared/content';

/** 처음 온 사람인가: 영웅도, 깬 단계도, 재화도 없다 */
const fresh = (p: { heroes: object; stage: { best: string }; gold: number; sparks: number }) => Object.keys(p.heroes).length === 0 && p.stage.best === '' && p.gold === 0 && p.sparks === 0;

export const heath: Plugin = (g) => {
  g.on('playerJoined', (p) => {
    if (p.cls === '' && CLASS_IDS.length) g.classes.choose(p, CLASS_IDS[0]);
    if (!fresh(p)) return;
    if (STARTER.gold) g.wallet.add(p, 'gold', STARTER.gold, 'start');
    if (STARTER.sparks) g.wallet.add(p, 'sparks', STARTER.sparks, 'start');
    // 처음 영웅 둘 (편성의 빈 자리에 저절로 든다: SQUAD_RULES.autoFill)
    g.roster.grant(p, 'ironwall');
    g.roster.grant(p, 'swiftarrow');
  });
};
