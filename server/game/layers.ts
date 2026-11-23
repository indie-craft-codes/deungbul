// 층(Ent.layer) 번호의 뜻을 한 곳에서 정한다. 층이 다르면 서로 보이지 않고 싸우지 않는다.
//   0 이상 DUNGEON_LAYER 미만 : 들판. 채널마다 한 층이다 (채널 n = 층 n - 1, 채널 수는 CHANNEL.count)
//   DUNGEON_LAYER 이상        : 던전 인스턴스. 만들 때마다 하나씩 올라간다
// 다른 코드는 숫자를 직접 비교하지 않고 여기의 함수를 쓴다 (채널이 늘거나 층의 종류가 더 생겨도 이 파일만 고치게).
import type { MsgArg, MsgKey } from '../../shared/messages';
import type { Game } from './game';

/** 던전 인스턴스의 층은 이 수부터 센다. 채널 수가 이보다 많아질 일은 없다 */
export const DUNGEON_LAYER = 1000;

/** 들판(모두가 오가는 월드)의 층인가. 아니면 인스턴스다 */
export const isField = (layer: number): boolean => layer >= 0 && layer < DUNGEON_LAYER;
/** 들판 층의 채널 번호 (1부터). 화면과 명령은 이 번호를 쓴다 */
export const channelOf = (layer: number): number => layer + 1;
/** 채널 번호(1부터)의 들판 층 */
export const fieldLayer = (channel: number): number => channel - 1;

/**
 * 그 층에 있는 사람 모두에게 안내문을 보낸다.
 * 채널마다 따로 일어나는 일(필드 보스)을 서버 전체에 알리면 내 채널에 없는 것을 찾아 헤매게 되므로, 그 층에만 알린다.
 */
export function notifyLayer(g: Game, layer: number, k: MsgKey, ...a: MsgArg[]): void {
  for (const p of g.ents.values()) if (p.kind === 'p' && p.layer === layer) g.notify(p, k, ...a);
}
