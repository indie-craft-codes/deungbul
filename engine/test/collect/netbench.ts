// 시험 도우미: 수집형의 실제 서버 시험(net, growthnet, idleflownet, sweepnet)이 함께 쓰는 준비.
// 영웅 들판(heath) 규칙으로 서버를 띄우고, 접속하고, 나갔다가 다시 들어오고, 던전의 적을 한꺼번에 쓰러뜨린다.
// 서버는 시험마다 따로 띄운다: 시험마다 서버 시계(벽시계, 또는 정해 둔 시각)와 난수의 준비가 달라서 한 서버에 묶으면 결과가 서로에게 기대게 된다.
import type { ServerMsg } from '../../shared/protocol';
import type { Ent } from '../../server/game/entity';
import { startServer } from '../../server/net/server';
import { MemoryStore } from '../../server/store';
import { connect, until, type Peer } from '../harness';
import { heath } from './server/heath';

/** 영웅 들판의 서버를 띄운다 (포트는 0: 비어 있는 것을 받는다). now를 주면 서버 시계를 그것으로 */
export async function heathServer(now?: () => number) {
  const store = new MemoryStore();
  const server = await startServer(0, { store, game: { plugins: [heath], ...(now ? { now } : {}) } });
  return { server, store, g: server.game };
}

type Server = Awaited<ReturnType<typeof heathServer>>['server'];

/** 접속한다. onMsg는 틀의 가짜 클라이언트가 읽지 않는 메시지(개인 상태 me 등)를 받는다 */
export const join = (server: Server, name: string, token: string, onMsg?: (m: ServerMsg) => void): Promise<Peer> => connect(server.port, name, token, onMsg);

/** 나간다: 연결을 닫고 서버가 그 캐릭터를 월드에서 뺄 때까지 기다린다 */
export async function leave(server: Server, p: Peer): Promise<void> {
  p.ws.close();
  await until(() => !server.game.ents.has(p.id));
}

/** 그 사람이 있는 층(단계, 던전)의 몬스터를 모두 쓰러뜨린다 */
export function clearLayer(server: Server, who: Ent): void {
  const g = server.game;
  for (const e of [...g.ents.values()]) if (e.kind === 'm' && e.layer === who.layer) g.combat.damage(who, e, e.hp + 1, false);
}
