// 개인 데이터의 칸: 캐릭터 저장 밖(월드 저장)에 한 사람의 것을 두는 시스템이 자기 몫을 알린다.
// 내 데이터 내보내기(get)와 삭제(erase)가 이 목록을 돈다 (engine/server/net/web.ts). 캐릭터 저장(players 표)은 통신 계층이 따로 지운다.
// 틀의 시스템: 길드(guild.ts: 구성원 명단), 거래소(market.ts: 올린 물건), 우편(mail.ts: 맡아 둔 우편). 게임의 시스템도 같은 식으로 더한다:
//   personalData(g).push({ name: 'tower', get: (pid) => …, erase: (pid) => … })
// 다른 사람과 얽힌 데이터의 처리 규칙은 docs/making-a-game.md '약관·데이터 권리'에 적었다. 등록만으로는 아무 일도 일어나지 않는다 (황금 실행 그대로).
import type { Game } from './game';

export interface PersonalData {
  /** 내보내기 JSON의 칸 이름 */
  name: string;
  /** 그 저장 키(pid)의 것. 없으면 undefined (칸이 빠진다) */
  get(pid: string): unknown;
  /** 그 저장 키의 것을 지운다 (다른 사람과 얽힌 것은 규칙대로 남기거나 넘긴다). 월드 저장이 바뀌면 g.saveDirty를 켠다 */
  erase(pid: string): void;
}

const lists = new WeakMap<Game, PersonalData[]>();
/** 그 게임의 개인 데이터 칸 목록 (처음 부르면 빈 목록) */
export function personalData(g: Game): PersonalData[] {
  let l = lists.get(g);
  if (!l) lists.set(g, l = []);
  return l;
}
