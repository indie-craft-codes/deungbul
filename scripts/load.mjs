// 부하·장시간 측정: 게임 하나의 진짜 서버를 띄우고, 다른 프로세스의 가짜 접속자를 붙여, 틱 시간·전송 시간·보낸 양·메모리·쌓이는 목록을 잰다.
// 결과의 읽는 법과 잰 수치는 docs/infra.md '부하와 장시간'. 무거운 측정이라 npm test에는 넣지 않는다.
//
//   npm run load:game -- <게임> <인원> <초> [이름=값 …]
//   node scripts/load.mjs collect 100 30 squad=4 mode=stage
//   node scripts/load.mjs dalmuri 50 30 squad=8 mode=field
//   node scripts/load.mjs deungbul 20 1800 bots=6 mode=fight speed=96 churn=20 db=sqlite every=30
//   node scripts/load.mjs collect "10,50,100,200" 20 squad=4 mode=stage      (인원 여럿: 차례로 돌려 표 하나)
//   node scripts/load.mjs bench collect 200 1200 squad=4 mode=stage           (통신 없이 틱·스냅샷의 셈만, 결과의 지문 sha까지: scripts/load/bench.ts)
//
// 게임: deungbul, dalmuri, collect(틀의 시험용 내용 '영웅 들판'), rollball, sample, cave, starmine, bastion
// 이름=값:
//   mode=stage|field|fight|spread  접속자의 움직임 (scripts/load/clients.mjs의 머리 주석). 기본 field
//   squad=N      사람마다 영웅 N을 주고 편성한다 (squad 모듈이 있는 게임, 내용의 영웅 수까지). 기본 0 = 게임의 처음 그대로
//   bots=N       서버의 봇. 기본 0
//   warmup=초    들어와 자리 잡을 때까지 재지 않는 시간. 기본 인원×0.02+5
//   every=초     지표 한 줄의 간격. 기본 5
//   speed=X      가상 시계(g.now)의 배속: 날짜·출석·열쇠 채움·습격 시각이 X배로 흐른다 (게임 안의 초는 그대로). 기본 1
//   start=ISO    가상 시계의 출발 (예: 2026-11-27T23:30:00). 기본 지금
//   churn=초     그 간격마다 한 사람이 끊고 다시 접속한다. 기본 0
//   db=sqlite|memory  저장 (sqlite: data/load/<이름>/game.db). 기본 memory
//   port=3017    서버 포트 (0이면 빈 포트). 기본 3017
//   compress=0   WebSocket 압축을 끈다
//   out=파일     지표 줄(JSON)을 모두 이 파일에 쓴다
//   metrics=0    서버의 구간 지표(server.metrics())를 읽지 않는다: 운영처럼 (장시간 측정. 전송 시간·지연은 0으로 찍힌다)
//   prof=폴더    서버 프로세스의 CPU 프로필(.cpuprofile)을 이 폴더에 남긴다
//   verbose=1    지표 줄을 간추려 찍는다 (장시간 측정에서 추이를 보려고)
// 끝에 결과 표(마크다운)를 찍는다. 서버 프로세스의 지표 줄은 data/load/<이름>/series.json에도 남는다.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TSCONFIG = { collect: 'engine/test/collect/tsconfig.json' };
// 통신 없이 한 프로세스에서 틱과 스냅샷의 셈만 잰다 (scripts/load/bench.ts): node scripts/load.mjs bench <게임> <인원> <틱> [squad=N] [mode=stage|field] [seed=N]
if (process.argv[2] === 'bench') {
  const [, g, n, ticks, ...more] = process.argv.slice(2);
  const o = Object.fromEntries(more.map((a) => a.split('=')));
  const tsc = TSCONFIG[g] ?? `games/${g}/tsconfig.json`;
  const cfg = { game: g, people: Number(n), ticks: Number(ticks ?? 1200), squad: Number(o.squad ?? 0), mode: o.mode ?? 'stage', seed: o.seed ? Number(o.seed) : undefined };
  const r = spawnSync(process.execPath, ['--no-warnings', '--import', 'tsx', 'scripts/load/bench.ts', JSON.stringify(cfg)], { cwd: root, stdio: 'inherit', env: { ...process.env, TSX_TSCONFIG_PATH: tsc } });
  process.exit(r.status ?? 1);
}
const [game, people, seconds, ...rest] = process.argv.slice(2);
if (!game || !people || !seconds) { console.error('쓰는 법: node scripts/load.mjs <게임> <인원[,인원…]> <초> [이름=값 …]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => a.split('=')).map(([k, ...v]) => [k, v.join('=')]));
const num = (k, d) => (opt[k] === undefined ? d : Number(opt[k]));
const tsconfig = TSCONFIG[game] ?? `games/${game}/tsconfig.json`;
if (!fs.existsSync(path.join(root, tsconfig))) { console.error(`모르는 게임: ${game}`); process.exit(2); }
const outFile = opt.out ? fs.openSync(opt.out, 'a') : null;

function runOne(n) {
  return new Promise((done) => {
    const mode = opt.mode ?? 'field';
    const cfg = {
      game, port: num('port', 3017), seconds: Number(seconds), warmup: num('warmup', Math.round(n * 0.02 + 5)), every: num('every', 5),
      squad: num('squad', 0), bots: num('bots', 0), speed: num('speed', 1), start: opt.start, db: opt.db === 'sqlite' ? 'sqlite' : 'memory',
      name: `${game}-${n}-${mode}-${process.pid}`, compress: opt.compress !== '0', noMetrics: opt.metrics === '0',
    };
    const prof = opt.prof ? ['--cpu-prof', '--cpu-prof-dir', path.resolve(opt.prof)] : [];
    const server = spawn(process.execPath, [...prof, '--no-warnings=ExperimentalWarning', '--import', 'tsx', 'scripts/load/server.ts', JSON.stringify(cfg)], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, TSX_TSCONFIG_PATH: tsconfig } });
    let buf = '', clients = null, result = null, cres = null;
    server.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { process.stderr.write(line + '\n'); continue; }
        if (outFile) fs.writeSync(outFile, JSON.stringify({ run: cfg.name, ...m }) + '\n');
        if (m.t === 'ready') {
          clients = spawn(process.execPath, [path.join(root, 'scripts', 'load', 'clients.mjs'), String(m.port), String(n), mode, String(cfg.warmup + cfg.seconds + 5), String(num('churn', 0)), `ld${process.pid}`], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
          clients.stdout.on('data', (x) => { for (const l of String(x).split('\n')) { try { const o = JSON.parse(l); if (o.t === 'clients') cres = o; } catch { /* 빈 줄 */ } } });
        } else if (m.t === 'tick' && opt.verbose) {
          const s = m.sizes, top = Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}=${v}`).join(' ');
          console.log(`  [${m.el}s ${m.vt.slice(5, 16)}] 접속 ${m.clients} 엔티티 ${m.ents} 틱 ${m.tick.avg.toFixed(2)}/${m.tick.p95.toFixed(2)}/${m.tick.max.toFixed(1)} 전송 ${m.flush.avg.toFixed(2)} ${m.kbps.toFixed(0)}KB/s rss ${m.rssMb.toFixed(0)} heap ${m.heapMb.toFixed(0)} 저장실패 ${m.saveFails} | ${top}`);
        } else if (m.t === 'done') result = m;
      }
    });
    server.on('exit', () => {
      const finish = () => done({ n, mode, result, cres });
      if (clients && clients.exitCode === null) { clients.on('exit', finish); setTimeout(() => clients.kill(), 8000); } else finish();
    });
  });
}

const f = (v, d = 2) => (v ?? 0).toFixed(d);
console.log(`CPU: ${os.cpus()[0].model.trim()} (${os.cpus().length} 논리 코어), Node ${process.version}. 게임 ${game}, ${seconds}초 (${rest.join(' ')})`);
console.log('| 인원 | 방식 | 편성 | 엔티티 (사람/몬스터/영웅) | 틱 ms 평균/95%/99%/최대 | 전송 ms 평균/95%/최대 | 지연 ms 평균/최대 | 보낸 KB/s (압축 전/회선) | 1인 KB/s (회선) | CPU % | 메모리 MB (rss/heap) | 저장 실패 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const n of people.split(',').map(Number)) {
  const { mode, result: r } = await runOne(n);
  if (!r) { console.log(`| ${n} | ${mode} | 결과 없음 |`); continue; }
  const k = r.kinds;
  console.log(`| ${r.clients} | ${mode} | ${r.squad} | ${k.p ?? 0}/${k.m ?? 0}/${k.hero ?? 0} | ${f(r.tick.avg)} / ${f(r.tick.p95)} / ${f(r.tick.p99)} / ${f(r.tick.max, 1)} | ${f(r.flush.avg)} / ${f(r.flush.p95)} / ${f(r.flush.max, 1)} | ${f(r.lag.avg)} / ${f(r.lag.max, 1)} | ${f(r.rawKBps, 0)} / ${f(r.wireKBps, 0)} | ${f(r.wireKBps / Math.max(1, r.clients), 1)} | ${f(r.cpuPct, 0)} | ${f(r.rssMb, 0)} / ${f(r.heapMb, 0)} | ${r.saveFails} |`);
}
if (outFile) fs.closeSync(outFile);
