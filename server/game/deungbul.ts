// 이 게임(등불지기)의 규칙을 틀에 까는 플러그인: 등탑, 습격, 등탑지기, 퀘스트.
// 틀(game.ts와 표준 시스템)은 이 파일과 네 시스템을 모른다. Game의 g.tower 같은 칸도 여기서 선언해 덧붙인다.
// 쓰는 법: new Game({ plugins: [installDeungbul] }), 설정을 줄 때는 plugins: [(g) => installDeungbul(g, { raid: { everyMin: 5 } })].
// (지금은 plugins를 주지 않아도 game.ts가 이것을 기본으로 깐다. 기존 코드와 시험이 new Game()으로 등불지기를 만들기 때문이다.)
import type { RaidConfig } from '../../shared/defs';
import type { Game } from './game';
import { Keepers } from './systems/keepers';
import { Quests } from './systems/quests';
import { Raid } from './systems/raid';
import { Tower } from './systems/tower';

declare module './game' {
  /** 이 게임의 규칙 시스템. installDeungbul이 채운다: 틀만으로 만든 게임(plugins: [])에는 없다 */
  interface Game {
    tower: Tower;
    raid: Raid;
    quests: Quests;
    keepers: Keepers;
  }
}

export interface DeungbulConfig {
  /** 습격 설정 덮어쓰기 (서버의 RAID_EVERY_MIN, 시험) */
  raid?: Partial<RaidConfig>;
}

/** 만드는 순서를 지킨다: 틱과 사건 처리기는 등록한 순서대로 불리고, 습격과 등탑지기는 등탑을 읽는다 */
export function installDeungbul(g: Game, cfg: DeungbulConfig = {}): void {
  g.tower = new Tower(g);
  g.raid = new Raid(g, cfg.raid);
  g.quests = new Quests(g);
  g.keepers = new Keepers(g);
}
