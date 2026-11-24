// 부하 측정: 서버를 띄우고, 다른 프로세스에서 가짜 접속자를 붙여서 서버가 얼마나 버티는지 잰다.
//   npm run load                  기본 시나리오 전체
//   npm run load -- 200 cluster   한 가지만 (인원, 방식)
// 결과 표를 출력한다. 수치의 뜻은 docs/infra.md에 있다.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TICK_MS } from '../shared/world';
import { startDeungbul } from './deungbul/game';

const SECONDS = 15;
const here = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row { n: number; mode: string; joined: number; tick: string; flush: string; lag: string; kbTotal: number; kbEach: number; cpu: number; rssMb: number }

async function run(n: number, mode: string): Promise<Row> {
  // 습격 흉내: 시작하자마자 습격을 열어 적을 불러낸다
  const server = await startDeungbul(0, { maxClients: 2000, maxPerIp: 5000, maxAway: 0, game: { raid: { hours: [], max: 200 } } });
  const child = spawn(process.execPath, ['--import', 'tsx', path.join(here, 'load-clients.ts'), String(server.port), String(n), mode, String(SECONDS)], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  const done = new Promise<void>((ok) => child.on('exit', () => ok()));

  await sleep(n * 10 + 2500); // 모두 들어와 자리를 잡을 때까지 기다린다
  if (mode === 'fight') server.game.raid.start();
  server.metrics(); // 여기부터 잰다
  const cpu0 = process.cpuUsage(), t0 = performance.now();
  await sleep((SECONDS - 3) * 1000);
  const m = server.metrics();
  const cpu = process.cpuUsage(cpu0), elapsed = (performance.now() - t0) * 1000;
  const rssMb = process.memoryUsage().rss / 1048576;
  await done;
  await server.close();
  const res = JSON.parse(out.trim().split('\n').pop() || '{}') as { joined?: number };
  const f = (a: number, b: number, c: number) => `${a.toFixed(2)} / ${b.toFixed(2)} / ${c.toFixed(1)}`;
  return {
    n, mode, joined: res.joined ?? 0,
    tick: f(m.tickAvg, m.tickP95, m.tickMax), flush: f(m.flushAvg, m.flushP95, m.flushMax), lag: `${m.lagAvg.toFixed(2)} / ${m.lagMax.toFixed(1)}`,
    kbTotal: m.bytesPerS / 1024, kbEach: m.bytesPerS / 1024 / Math.max(1, m.clients),
    cpu: ((cpu.user + cpu.system) / elapsed) * 100, rssMb,
  };
}

const args = process.argv.slice(2);
const plan: [number, string][] = args.length
  ? [[Number(args[0]), args[1] ?? 'cluster']]
  : [[50, 'spread'], [50, 'cluster'], [50, 'fight'], [100, 'cluster'], [100, 'fight'], [200, 'spread'], [200, 'cluster'], [200, 'fight'], [300, 'cluster'], [300, 'fight'], [500, 'cluster']];

console.log(`CPU: ${os.cpus()[0].model.trim()} (${os.cpus().length} 논리 코어), Node ${process.version}, 틱 목표 ${TICK_MS}ms, 시나리오당 ${SECONDS}초`);
console.log('| 인원 | 방식 | 접속 | 틱 계산 ms (평균/95%/최대) | 전송 ms (평균/95%/최대) | 틱 지연 ms (평균/최대) | 전송량 KB/s (전체) | KB/s (1인) | CPU % (1코어) | 메모리 MB |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const [n, mode] of plan) {
  const r = await run(n, mode);
  console.log(`| ${r.n} | ${r.mode} | ${r.joined} | ${r.tick} | ${r.flush} | ${r.lag} | ${r.kbTotal.toFixed(0)} | ${r.kbEach.toFixed(1)} | ${r.cpu.toFixed(0)} | ${r.rssMb.toFixed(0)} |`);
}
process.exit(0);
