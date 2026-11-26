// 부하·장시간 측정의 가짜 접속자들 (scripts/load.mjs가 서버와 다른 프로세스로 띄운다: 서버의 측정을 흐리지 않게).
//   node scripts/load/clients.mjs <포트> <인원> <방식> <초> [바꿔 접속 간격 초] [이름 앞머리]
// 방식:
//   stage   단계가 있는 게임: 접속하면 서버가 단계로 데려가 대신 싸운다. 접속자는 가끔 핑만 (사람마다 따로인 층)
//   field   단계에서 나와(단계가 없는 게임은 그대로) 처음 자리 둘레 14m 안을 1~3초마다 걷는다: 모두가 서로의 시야에 든다
//   fight   field처럼 모여, 보이는 몬스터를 1~3초마다 친다 (기술도)
//   spread  처음 자리 둘레 55m 안을 걷는다
//   room    판이 있는 게임(rooms 모듈): 접속하면 빠른 대국(둘씩 한 판), 1~3초마다 내 차례면 넘긴다
//   roomcpu 판이 있는 게임: 접속하면 컴퓨터와 두기(한 사람이 한 판, 컴퓨터가 0.7초마다 둔다), 1~3초마다 내 차례면 넘긴다
// 바꿔 접속: 그 간격마다 한 사람이 끊고 같은 토큰으로 다시 들어온다 (저장과 읽기, 영웅·단계의 정리를 되풀이)
// 토큰이 있어 저장된다. 끝에 한 줄 JSON: 접속한 수, 받은 글자(1인 초당), 끊긴 수
import { WebSocket } from 'ws';

const [port, count, mode = 'field', seconds = '30', churnS = '0', tag = 'load'] = process.argv.slice(2);
const N = Number(count), SECS = Number(seconds), CHURN = Number(churnS);
let joined = 0, bytesIn = 0, closed = 0, rejoins = 0;
const live = new Map();

function client(i) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const token = `${tag}-tok-${String(i).padStart(6, '0')}-aaaaaaaa`.slice(0, 64);
  const st = { ws, mons: new Set(), x: 0, z: 0, cx: null, cz: null, alive: true };
  live.set(i, st);
  const send = (m) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
  ws.on('open', () => send({ t: 'join', name: `L${i}`, token }));
  ws.on('error', () => { /* 닫힘에서 센다 */ });
  ws.on('close', () => { closed++; st.alive = false; });
  ws.on('message', (data) => {
    const text = data.toString();
    bytesIn += text.length;
    let m; try { m = JSON.parse(text); } catch { return; }
    if (m.t === 'welcome') {
      joined++;
      if (st.cx === null) { st.cx = m.x; st.cz = m.z; }
      if (mode === 'room' || mode === 'roomcpu') setTimeout(() => send({ t: 'room', a: mode === 'room' ? 'quick' : 'cpu' }), 300);
      else if (mode !== 'stage') setTimeout(() => send({ t: 'stage', a: 'leave' }), 300);
    } else if (m.t === 'me' && m.k === 'room') {
      st.room = m.s;
      // 끝난 판은 다시 둔다 (재는 동안 판이 계속 돌게)
      if (m.s && m.s.st === 'over') setTimeout(() => send({ t: 'room', a: 'again' }), 500);
    } else if (m.t === 'snap') {
      for (const e of m.enter ?? []) if (e.kind === 'm') st.mons.add(e.id);
      for (const id of m.leave ?? []) st.mons.delete(id);
    }
  });
  const act = () => {
    if (!st.alive) return;
    if (mode === 'stage') send({ t: 'ping', c: Date.now() % 1e6 });
    else if (mode === 'room' || mode === 'roomcpu') { if (st.room && st.room.st === 'play' && st.room.turn === st.room.me) send({ t: 'room', a: 'pass' }); }
    else if (mode === 'fight' && st.mons.size && Math.random() < 0.7) {
      const ids = [...st.mons];
      send({ t: 'attack', id: ids[Math.floor(Math.random() * ids.length)] });
      if (Math.random() < 0.5) send({ t: 'skill', n: Math.floor(Math.random() * 2) });
    } else if (st.cx !== null) {
      const r = mode === 'spread' ? 55 : 14;
      send({ t: 'move', x: st.cx + (Math.random() - 0.5) * 2 * r, z: st.cz + (Math.random() - 0.5) * 2 * r });
    }
    setTimeout(act, 1000 + Math.random() * 2000);
  };
  setTimeout(act, 800 + Math.random() * 1500);
}

// 한꺼번에 붙지 않고 초당 50명씩
for (let i = 0; i < N; i++) setTimeout(() => client(i), i * 20);
if (CHURN > 0) {
  setInterval(() => {
    const i = Math.floor(Math.random() * N), st = live.get(i);
    if (!st || !st.alive) return;
    st.alive = false; st.ws.close();
    rejoins++;
    setTimeout(() => client(i), 500);
  }, CHURN * 1000);
}
setTimeout(() => {
  console.log(JSON.stringify({ t: 'clients', joined, closed, rejoins, bytesInPerClientPerS: bytesIn / Math.max(1, N) / SECS }));
  for (const st of live.values()) try { st.ws.terminate(); } catch { /* 이미 닫힘 */ }
  process.exit(0);
}, SECS * 1000);
