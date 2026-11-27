// 처음 30분의 재화 흐름 시뮬레이션: 실제 게임(틀 + 이 게임의 규칙)을 가상 시계로 돌려 한 사람이 '보통으로' 놀 때 울림 조각이 어디서 얼마나 들어오는가,
// 첫 뽑기·첫 10번 뽑기까지 걸리는 시간, 천장(40번)까지의 어림을 잰다. 사람은 이렇게 논다:
//   들판 3분(울림 샘 동쪽 무리에서 자동 사냥) → 단계(자동 진행) → 실패해 자동 진행이 꺼지면 들판 3분 → 다시 단계 …
//   울림 조각이 100이 되면 처음 한 번은 1번 뽑기, 그 뒤로는 900이 모이면 10번 뽑기. 뽑으면 전투력 높은 넷으로 편성하고, 골드로 편성의 레벨을 올린다.
//   들판에 나갈 때마다 가장 센 메아리로 변신한다(일일 임무 '변신 1번'). 1분마다 우편(임무 보상)을 받는다.
// 실행: node node_modules/tsx/dist/cli.mjs --tsconfig games/echopact/tsconfig.json games/echopact/scripts/flow.ts [분=30] [씨앗=1]
// 시험(test/flow.test.ts)이 짧게(10분) 같은 함수를 부른다.
import { Game } from '@engine/server';
import { heroDef, seededRng } from '@engine/shared/defs';
import { BANNERS, CAMPS } from '../shared/content';
import { installEchopact } from '../server/echopact';

export interface FlowResult {
  /** 분마다: 그 분까지 들어온 울림 조각(출처별 누계), 가진 조각, 뽑은 수, 깬 단계, 레벨, 편성의 전투력 */
  minutes: { min: number; got: Record<string, number>; have: number; pulls: number; best: string; lv: number; power: number; echoes: number }[];
  /** 첫 1번 뽑기, 첫 10번 뽑기를 한 때(초). 못 했으면 -1 */
  firstPullS: number; firstTenS: number;
  /** 단계·들판에 있던 초 */
  stageS: number; fieldS: number;
  /** 출처별 울림 조각의 합 */
  total: Record<string, number>;
}

/** 원인(장부의 이름)을 시뮬레이션의 출처로 묶는다 */
const sourceOf = (why: string): string => (why === 'stage' ? 'stage' : why === 'kill' || why === 'huntAway' || why.startsWith('kill') ? 'field' : why.startsWith('mail') ? 'mail' : why);

export function simulate(minutes = 30, seed = 1): FlowResult {
  // 같은 씨앗이면 같은 흐름이 되게: 틀의 난수(피해의 폭, 몬스터의 자리, 떨어뜨리기)도 이 동안만 정해진 난수로 (끝나면 되돌린다)
  const random = Math.random;
  Math.random = seededRng(seed * 7919 + 1);
  try { return run(minutes, seed); } finally { Math.random = random; }
}

function run(minutes: number, seed: number): FlowResult {
  let clock = Date.UTC(2026, 10, 30, 3, 0, 0);
  const g = new Game({ plugins: [installEchopact], now: () => clock });
  g.gacha.rng = seededRng(seed);
  const total: Record<string, number> = {};
  // 들어오는 울림 조각을 출처별로 센다 (지갑을 감싼다: 시뮬레이션만)
  const add = g.wallet.add.bind(g.wallet);
  g.wallet.add = (p, cur, n, why) => { const got = add(p, cur, n, why); if (cur === 'sparks' && got > 0) total[sourceOf(why)] = (total[sourceOf(why)] ?? 0) + got; return got; };

  const p = g.players.spawn('시뮬', false, null, 'flow-sim-1');
  g.fire('playerJoined', p);
  g.command(p, { t: 'class', id: 'warden' });
  const out: FlowResult = { minutes: [], firstPullS: -1, firstTenS: -1, stageS: 0, fieldS: 0, total };
  const camp = CAMPS[1];
  let mode = 'field' as 'field' | 'stage', modeUntil = 180, t = 0, nextMin = 60, nextChores = 60;

  let pulled = 0;
  const pulls = () => pulled;
  const rebuild = () => {
    const best = Object.keys(p.heroes).sort((a, b) => g.roster.power(p, b) - g.roster.power(p, a)).slice(0, 4);
    g.squad.set(p, best);
  };
  const levelUp = () => {
    for (let k = 0; k < 40; k++) {
      const cheapest = [...p.squad].sort((a, b) => p.heroes[a].lv * (heroDef(a).rarity + 1) - p.heroes[b].lv * (heroDef(b).rarity + 1))[0];
      if (!cheapest || p.gold < 60 || !g.roster.levelUp(p, cheapest)) break;
    }
  };
  const pull = () => {
    const b = BANNERS.well;
    if (out.firstPullS < 0 && p.sparks >= b.one) { g.command(p, { t: 'gacha', id: 'well', n: 1 }); pulled += 1; out.firstPullS = t; rebuild(); }
    while (out.firstPullS >= 0 && p.sparks >= b.ten) { g.command(p, { t: 'gacha', id: 'well', n: 10 }); pulled += 10; if (out.firstTenS < 0) out.firstTenS = t; rebuild(); }
  };
  const toField = () => {
    if (g.stages.inStage(p)) g.command(p, { t: 'stage', a: 'leave' });
    p.x = camp.x - 6; p.z = camp.z - 6; p.moving = false; p.path = null; p.targetId = 0;
    // 들판에 나갈 때 가장 센 메아리로 변신한다 (재사용 대기 중이면 못 한다)
    const best = Object.keys(p.heroes).sort((a, b) => g.roster.power(p, b) - g.roster.power(p, a))[0];
    if (best && p.morph.on !== best) g.command(p, { t: 'morph', a: 'on', id: best });
    p.auto = true; g.away.start(p);
    mode = 'field'; modeUntil = t + 180;
  };
  const toStage = () => {
    g.away.stop(p); p.auto = false; p.targetId = 0;
    p.hp = p.maxHp;
    g.command(p, { t: 'stage', a: 'auto', on: true });
    g.command(p, { t: 'stage', a: 'start' });
    mode = 'stage'; modeUntil = Infinity;
  };
  toField();

  while (t < minutes * 60) {
    g.tick(0.05); clock += 50; t += 0.05;
    if (mode === 'field') out.fieldS += 0.05; else out.stageS += 0.05;
    if (t >= nextChores) {
      nextChores += 60;
      g.mail.claim(p, 0);
      pull();
      levelUp();
    }
    if (mode === 'field' && t >= modeUntil) toStage();
    // 실패해 자동 진행이 꺼졌으면(같은 단계를 되풀이한다) 들판으로 나가 조각을 모으고 다시 도전한다
    else if (mode === 'stage' && !p.stage.auto) toField();
    if (t >= nextMin) {
      nextMin += 60;
      out.minutes.push({ min: Math.round(t / 60), got: { ...total }, have: p.sparks, pulls: pulls(), best: p.stage.best, lv: p.lv, power: g.squad.power(p), echoes: Object.keys(p.heroes).length });
    }
  }
  return out;
}

// 직접 실행하면 표를 찍는다
if (process.argv[1]?.endsWith('flow.ts')) {
  const mins = Number(process.argv[2] ?? 30), seed = Number(process.argv[3] ?? 1);
  const r = simulate(mins, seed);
  console.log('분 | 들판 | 단계 | 우편(임무) | 가진 조각 | 뽑은 수 | 메아리 | 깬 단계 | 레벨 | 편성 전투력');
  for (const m of r.minutes) console.log(`${m.min} | ${m.got.field ?? 0} | ${m.got.stage ?? 0} | ${m.got.mail ?? 0} | ${m.have} | ${m.pulls} | ${m.echoes} | ${m.best || '-'} | ${m.lv} | ${m.power}`);
  console.log(JSON.stringify({ firstPullS: Math.round(r.firstPullS), firstTenS: Math.round(r.firstTenS), stageMin: +(r.stageS / 60).toFixed(1), fieldMin: +(r.fieldS / 60).toFixed(1), total: r.total }));
}
