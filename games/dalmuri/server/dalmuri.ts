// 달무리 원정대의 규칙 플러그인. 나머지(영웅, 뽑기, 편성, 단계, 열쇠 던전, 방치 보상, 영웅 장비, 소탕)는 틀의 모듈과 내용의 칸이다. 이 파일이 더하는 것:
//  - 처음 온 대장: 직업(하나뿐), 처음 월석·금화·소탕권, 처음 영웅 둘
//  - 일일 임무의 셈: 단계 깨기(stage), 열쇠 던전(keyrun). 소탕도 그 횟수만큼 센다
// 열쇠 던전으로 가기(메뉴의 dungeonGo), 던전 안의 자동 전투, 던전 뒤 단계로, 별정수 → 조각, 돌아왔을 때의 창은 내용의 칸
// (DungeonDef.fromMenu·auto, STAGE_RULES.returnAfterDungeon, HERO_RULES.trade, IDLE.popup)이 틀 안에서 한다.
import { CLASS_IDS } from '@engine/shared/defs';
import { MAP as aliased } from '@engine/shared/world';
import type { Ent, Game, Plugin } from '@engine/server';
import { MAP, STARTER, STARTER_HEROES } from '../shared/content';

if (MAP !== aliased) throw new Error('별칭 @game이 games/dalmuri를 가리키지 않습니다. tsx --tsconfig games/dalmuri/tsconfig.json 으로 실행하세요 (node scripts/game.mjs start dalmuri)');

/** 처음 온 대장인가: 영웅도, 깬 단계도, 재화도 없다 */
const fresh = (p: Ent) => Object.keys(p.heroes).length === 0 && p.stage.best === '' && p.gold === 0 && p.sparks === 0;

export const installDalmuri: Plugin = (g: Game) => {
  g.on('playerJoined', (p) => {
    if (p.cls === '' && CLASS_IDS.length) g.classes.choose(p, CLASS_IDS[0]);
    if (!fresh(p)) return;
    if (STARTER.gold) g.wallet.add(p, 'gold', STARTER.gold, 'start');
    if (STARTER.sparks) g.wallet.add(p, 'sparks', STARTER.sparks, 'start');
    for (const [id, n] of Object.entries(STARTER.items ?? {})) g.bag.putItem(p, id as Parameters<typeof g.bag.putItem>[1], n, 'start');
    for (const id of STARTER_HEROES) g.roster.grant(p, id);
  });

  g.ready.push(() => {
    // 일일 임무: 단계 깨기와 열쇠 던전. 소탕(싸우지 않고 끝내기)도 그 횟수만큼
    g.on('stageCleared', (p) => g.daily.add(p, 'stage', 1));
    g.on('dungeonCleared', (_id, players) => { for (const p of players) g.daily.add(p, 'keyrun', 1); });
    g.on('swept', (p, k, _id, n) => g.daily.add(p, k === 'stage' ? 'stage' : 'keyrun', n));
  });
};
