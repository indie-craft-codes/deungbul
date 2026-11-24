// 이 게임(등불지기)의 규칙을 틀에 까는 플러그인: 등탑, 습격, 등탑지기, 퀘스트, 휴식 보너스.
// 틀(game.ts와 표준 시스템)은 이 파일과 네 시스템을 모른다. Game의 g.tower 같은 칸과 이 게임의 사건도 여기서 선언해 덧붙인다 (확장 지점: ./ext.ts).
// 공용 쪽의 짝(안내문, 메시지, 공유 상태)은 shared/deungbul.ts에 있다.
// 쓰는 법: new Game({ plugins: [installDeungbul] }), 설정을 줄 때는 plugins: [(g) => installDeungbul(g, { raid: { everyMin: 5 } })].
// plugins를 주지 않은 new Game()은 틀만으로 만들어진다: 이 게임의 서버(server/main.ts)와 시험(test/deungbul/game.ts)이 이 플러그인을 적어 넘긴다.
import type { RaidConfig } from '../../shared/defs';
import type { Ent } from './entity';
import type { Game } from './game';
import { Keepers } from './systems/keepers';
import { Quests } from './systems/quests';
import { Raid } from './systems/raid';
import { Rest } from './systems/rest';
import { Tower } from './systems/tower';

declare module './ext' {
  /** 이 게임의 규칙 시스템. installDeungbul이 채운다: 틀만으로 만든 게임(plugins: [])에는 없다 */
  interface GameSystems {
    tower: Tower;
    raid: Raid;
    quests: Quests;
    keepers: Keepers;
    rest: Rest;
  }
  /** 이 게임의 엔티티 칸. 처음 값은 그 칸을 맡은 시스템이 g.entInit으로 채우고, 저장도 그 시스템이 한다 (g.saves) */
  interface EntExt {
    /** 지금까지 바친 불씨 (누적 기여): systems/tower.ts */
    contrib: number;
    /** 받은 기여 단계 보상의 수: systems/keepers.ts */
    tier: number;
    /** 남은 휴식 보너스 (등불 맡기기): systems/rest.ts */
    rested: number;
    /** 메인 퀘스트: 장, 단계, 진행 수치 (systems/quests.ts) */
    qc: number; qs: number; qn: number;
    /** 퀘스트 진행이 바뀌었다: 본인에게 알려야 한다 */
    questDirty: boolean;
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
  g.rest = new Rest(g);
}
