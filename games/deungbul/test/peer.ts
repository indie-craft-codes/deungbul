// 이 게임(등불지기)의 서버에 붙는 가짜 클라이언트: 틀의 Peer(engine/test/harness.ts)에 이 게임의 칸을 더한다.
// 틀의 Peer는 틀의 메시지만 읽고, 모르는 메시지(이 게임의 개인 상태 me, 공유 상태 world)는 여기로 넘긴다.
import type { ServerMsg } from '@engine/shared/protocol';
import { connect, type Peer } from '@engine/test/harness';

export interface DeungbulPeer extends Peer {
  /** 개인 상태 (games/deungbul/shared/deungbul.ts의 MeState): 기여, 퀘스트 진행 [장, 단계, 수] */
  contrib: number; quest: [number, number, number];
  /** 공유 상태: 첫 등탑의 밝기, 주민별 진행, 습격 */
  glow: number; residents: number[];
  raid: { phase: string; foes: number; towerHp: number; towerMaxHp: number };
}

/** 이 게임의 칸을 처음 값으로 채운다 (이미 채웠으면 그대로 둔다) */
function asDeungbul(p: Peer): DeungbulPeer {
  const d = p as DeungbulPeer;
  if (d.quest === undefined) Object.assign(d, { contrib: 0, glow: -1, residents: [], raid: { phase: '', foes: 0, towerHp: 0, towerMaxHp: 0 }, quest: [-1, -1, -1] });
  return d;
}

function onMsg(m: ServerMsg, peer: Peer): void {
  const p = asDeungbul(peer);
  // 이 게임의 개인 상태(games/deungbul/shared/deungbul.ts의 MeState)를 전과 같은 이름으로 내준다: 퀘스트 진행과 기여
  if (m.t === 'me') { if (m.k === 'quest') { const q = m.s as { c: number; s: number; n: number }; p.quest = [q.c, q.s, q.n]; } else if (m.k === 'contrib') p.contrib = m.s as number; }
  else if (m.t === 'world' && m.s.tower) { p.glow = m.s.tower.glow; p.residents = m.s.tower.residents; p.raid = m.s.raid; }
}

export function connectDeungbul(port: number, name?: string, token?: string): Promise<DeungbulPeer> {
  return connect(port, name, token, onMsg).then(asDeungbul);
}
