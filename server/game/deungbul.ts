// 이 게임(등불지기)의 규칙을 틀에 까는 플러그인: 등탑, 습격, 등탑지기, 퀘스트.
// 틀(game.ts와 표준 시스템)은 이 파일과 네 시스템을 모른다. Game의 g.tower 같은 칸과 이 게임의 사건도 여기서 선언해 덧붙인다 (확장 지점: ./ext.ts).
// 공용 쪽의 짝(안내문, 메시지, 공유 상태)은 shared/deungbul.ts에 있다.
// 쓰는 법: new Game({ plugins: [installDeungbul] }), 설정을 줄 때는 plugins: [(g) => installDeungbul(g, { raid: { everyMin: 5 } })].
// (지금은 plugins를 주지 않아도 game.ts가 이것을 기본으로 깐다. 기존 코드와 시험이 new Game()으로 등불지기를 만들기 때문이다.)
import type { RaidConfig } from '../../shared/defs';
import type { Ent } from './entity';
import type { Game } from './game';
import { Keepers } from './systems/keepers';
import { Quests } from './systems/quests';
import { Raid } from './systems/raid';
import { Tower } from './systems/tower';

declare module './ext' {
  /** 이 게임의 규칙 시스템. installDeungbul이 채운다: 틀만으로 만든 게임(plugins: [])에는 없다 */
  interface GameSystems {
    tower: Tower;
    raid: Raid;
    quests: Quests;
    keepers: Keepers;
  }
  interface HooksExt {
    /** 불씨를 바쳤다 */
    offered: (p: Ent, to: 'tower' | 'resident', n: number, tower: number) => void;
    /** 주민이 마을로 돌아왔다 */
    residentReturned: (id: string) => void;
    /** 습격을 막아 냈다: 맞서 싸운 사람들 */
    raidWon: (fighters: Ent[]) => void;
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
