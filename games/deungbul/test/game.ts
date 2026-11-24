// 이 게임(등불지기)의 시험이 함께 쓰는 것: 등불지기의 규칙을 깐 게임과 서버를 만든다.
// new Game()과 startServer()는 틀만으로 만들어진다(규칙 플러그인 없음). 등탑·습격·퀘스트·등탑지기·휴식이 있어야 하는 시험은 여기를 거친다.
// 틀의 시험(test/*.test.ts)은 이 폴더를 import하지 않는다 (test/framework.test.ts가 검사한다).
import type { RaidConfig } from '@engine/shared/defs';
import { installDeungbul } from '../server/deungbul';
import { Game, type GameOptions } from '@engine/server/game/game';
import { startServer, type Options, type Running } from '@engine/server/net/server';

export interface DeungbulOptions extends GameOptions {
  /** 습격 설정 덮어쓰기 (시각표를 비우거나 물결을 줄인다): installDeungbul의 인자로 넘어간다 */
  raid?: Partial<RaidConfig>;
}

const withRules = ({ raid, ...rest }: DeungbulOptions): GameOptions => ({ plugins: [(g) => installDeungbul(g, { raid })], ...rest });

/** 등불지기의 규칙이 깔린 게임 */
export function newGame(opts: DeungbulOptions = {}): Game {
  return new Game(withRules(opts));
}

/** 등불지기의 규칙이 깔린 서버 */
export function startDeungbul(port: number, opts: Omit<Options, 'game'> & { game?: DeungbulOptions } = {}): Promise<Running> {
  return startServer(port, { ...opts, game: withRules(opts.game ?? {}) });
}
