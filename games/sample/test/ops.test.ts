// 예제의 운영 칸 (shared/content/index.ts의 RESET, LIVE_KEYS, FLAGS와 주간·월간 임무): 가상 시계로 일·주·달을 넘기고, 원격 설정과 깃발이 이 게임의 규칙에 닿는가.
import { DAILIES } from '../shared/content';
import { installSample } from '../server/sample';
import { Game, MemoryStore } from '@engine/server';
import type { ServerMsg } from '@engine/shared';
import { check } from '@engine/testing';

// ---------- 주간·월간 임무: 기간마다 따로 비워진다 ----------
{
  // 2026-11-27(금) 정오, 서버 현지 시각 (이 게임의 RESET은 기본과 같다: 현지 자정, 월요일)
  let clock = new Date(2026, 10, 27, 12, 0, 0).getTime();
  const g = new Game({ plugins: [installSample], now: () => clock });
  const p = g.players.spawn('임무꾼', false, null, 'k-quest');
  const d = p.daily;
  const kill = (n: number) => g.daily.add(p, 'kill', n);
  const metas: Extract<ServerMsg, { t: 'meta' }>[] = [];
  const flush = () => { for (const make of g.perFlush) { const m = make(p); if (m?.t === 'meta') metas.push(m); } };
  const to = (y: number, mo: number, day: number, h = 12) => { clock = new Date(y, mo - 1, day, h, 0, 0).getTime(); for (let i = 0; i < 3; i++) g.tick(0.05); };
  kill(25);
  check(d.got.includes('kill20') && d.prog.kill150 === 25 && d.wk === '2026-11-23' && d.mo === '2026-11', `처치가 일일·주간 임무에 함께 세인다 (일일 완료, 주간 25/150, 주 ${d.wk}, 달 ${d.mo})`);
  flush();
  const next = metas.at(-1)?.daily?.next ?? [];
  check(next.length === 3 && next[0] === new Date(2026, 10, 28).getTime() && next[1] === new Date(2026, 10, 30).getTime() && next[2] === new Date(2026, 11, 1).getTime(), '화면에 다음 초기화 시각(날, 주, 달)이 간다');
  to(2026, 11, 28);
  check(!d.got.includes('kill20') && !d.prog.kill20 && d.prog.kill150 === 25, `다음 날: 일일 임무만 비워진다 (접속한 사람은 날 사건에 바로) (주간 ${d.prog.kill150})`);
  kill(130);
  check(d.got.includes('kill150') && d.prog.kill150 === 150, '주간 임무를 채우면 보상 우편');
  const mails = p.mail.filter((m) => m.k === 'daily').map((m) => m.a[0]);
  to(2026, 11, 29);
  check(d.got.includes('kill150') && mails.includes('kill150'), '같은 주 안에서는 주간 임무가 그대로');
  to(2026, 11, 30, 0);
  check(!d.got.includes('kill150') && !d.prog.kill150 && d.wk === '2026-11-30', '월요일 자정: 주간 임무가 비워진다');
  g.daily.add(p, 'feed', 12);
  to(2026, 12, 1, 0);
  check(d.prog.feed40 === undefined && d.mo === '2026-12', '1일 자정: 월간 임무가 비워진다');
  // 서버가 꺼져 있던 동안(저장해 두었다가 일주일 뒤에 접속)
  g.daily.add(p, 'kill', 30);
  const save = g.players.export(p);
  clock = new Date(2026, 11, 9, 9).getTime();
  const g2 = new Game({ plugins: [installSample], now: () => clock });
  const q = g2.players.spawn('임무꾼', false, save, 'k-quest');
  check(q.daily.wk === '2026-12-07' && !q.daily.prog.kill150 && q.daily.mo === '2026-12' && !q.daily.got.includes('kill20'), `저장에서 읽어 접속하면 지난 주의 진행은 비워지고 달은 그대로 (주 ${q.daily.wk})`);
}

// ---------- 원격 설정과 깃발이 이 게임의 규칙에 닿는다 ----------
{
  let clock = 1_800_000_000_000;
  const g = new Game({ plugins: [installSample], now: () => clock });
  g.live.attach(new MemoryStore());
  const p = g.players.spawn('불지기', false, null, 'k-fire');
  p.x = 0; p.z = 0;
  g.bag.putItem(p, 'log', 6, 'test');
  const heat = () => g.bonfire.heat;
  g.command(p, { t: 'feed', n: 1 });
  const h1 = heat();
  const r = g.live.set('bonfireHeat', 25, '시험');
  g.command(p, { t: 'feed', n: 1 });
  check(h1 === 10 && !('err' in r) && heat() === 35, `게임만의 값(bonfireHeat): 처음 10, 바꾸면 재시작 없이 25씩 (${h1} → ${heat()})`);
  check('err' in g.live.set('bonfireHeat', 99, '시험') && 'err' in g.live.set('DAILIES.kill20.n', 0, '시험'), '범위를 넘는 값은 거절');
  g.live.set('DAILIES.kill20.n', 3, '시험');
  g.daily.add(p, 'kill', 3);
  check((DAILIES.kill20.n as number) === 3 && p.daily.got.includes('kill20'), '일일 임무의 마릿수를 3으로: 내용의 칸이 바뀌고 서버의 셈이 따른다');
  g.live.reset('DAILIES.kill20.n', '시험');
  check(DAILIES.kill20.n === 20, '되돌리면 소스의 20');
  g.live.setFlag('bonfire', false, '시험');
  g.notices = [];
  g.command(p, { t: 'feed', n: 1 });
  check(heat() === 35 && g.notices.some((n) => n.k === 'featureOff' && n.a[0] === 'bonfire'), '깃발 bonfire를 끄면 장작 넣기를 받지 않고 featureOff');
  g.live.setFlag('bonfire', true, '시험');
  clock += 1000;
}
