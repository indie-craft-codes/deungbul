// 부하 측정용 가짜 접속자들. 서버와 다른 프로세스에서 돌려서 서버의 측정을 흐리지 않게 한다.
//   tsx games/deungbul/test/load-clients.ts <포트> <인원> <cluster|spread|fight> <초>
// cluster: 모두 등탑 주변에 모여 서로가 서로의 시야에 든다 (전송량이 가장 큰 경우)
// spread:  월드 전체에 흩어져 돌아다닌다
// fight:   등탑 주변에 모여 가까운 몬스터를 계속 공격한다 (습격을 흉내 낸다)
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@engine/shared/protocol';
import { TOWER } from '../shared/world';

const [port, count, mode, seconds] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4] ?? 'cluster', Number(process.argv[5] ?? 15)];
let joined = 0, bytesIn = 0, closed = 0;

function client(i: number): void {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const send = (m: ClientMsg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
  const mons = new Set<number>();
  ws.on('open', () => send({ t: 'join', name: `L${i}` }));
  ws.on('error', () => { /* 닫힘에서 센다 */ });
  ws.on('close', () => { closed++; });
  ws.on('message', (data) => {
    const text = data.toString();
    bytesIn += text.length;
    const m = JSON.parse(text) as ServerMsg;
    if (m.t === 'welcome') { joined++; send({ t: 'class', id: (['warrior', 'archer', 'mage'] as const)[i % 3] }); }
    else if (m.t === 'snap') {
      for (const e of m.enter ?? []) if (e.kind === 'm') mons.add(e.id);
      for (const id of m.leave ?? []) mons.delete(id);
    }
  });
  // 1~3초마다 한 번씩 행동한다 (실제 사람의 클릭 빈도를 넉넉히 잡은 값)
  const act = () => {
    if (mode === 'fight' && mons.size && Math.random() < 0.7) {
      const ids = [...mons];
      send({ t: 'attack', id: ids[Math.floor(Math.random() * ids.length)] });
      if (Math.random() < 0.5) send({ t: 'skill', n: Math.floor(Math.random() * 2) });
    } else {
      const r = mode === 'spread' ? 55 : 14;
      const cx = mode === 'spread' ? 0 : TOWER.x, cz = mode === 'spread' ? 0 : TOWER.z + 4;
      send({ t: 'move', x: cx + (Math.random() - 0.5) * 2 * r, z: cz + (Math.random() - 0.5) * 2 * r });
    }
    setTimeout(act, 1000 + Math.random() * 2000);
  };
  setTimeout(act, 500 + Math.random() * 1500);
}

// 한꺼번에 붙지 않고 초당 100명씩 들어온다
for (let i = 0; i < count; i++) setTimeout(() => client(i), i * 10);
setTimeout(() => {
  // 결과 한 줄: 부모 프로세스(games/deungbul/test/load.ts)가 읽는다
  console.log(JSON.stringify({ joined, closed, bytesInPerClientPerS: bytesIn / Math.max(1, joined) / seconds }));
  process.exit(0);
}, seconds * 1000 + count * 10 + 1500);
