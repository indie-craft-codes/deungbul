// 처음 n분의 재화 흐름 시뮬레이션: 실제 게임(틀 + 이 게임의 규칙)을 가상 시계로 돌려 한 사람이 '보통으로' 두 게임을 오갈 때
// 울림 조각이 어디서 얼마나 들어오는가, 첫 뽑기·첫 10번 뽑기까지의 시간, 두 게임을 함께 돌릴 때(보이지 않는 쪽도 '자동') 경제의 총량이 얼마나 커지는가를 잰다.
// 사람은 이렇게 논다 (모두 실제 명령: mode, stage, auto, morph, gacha, hero):
//   계약의 탑(A)에서 시작: 자동 진행을 켜고 다음 단계로 → 4분 뒤 '게임 바꾸기'로 울림골(B): 가장 센 메아리로 변신하고 무리 곁에서 자동 사냥 → 4분 뒤 다시 탑 …
//   함께(concurrent, 기본): B로 갈 때 탑의 싸움이 뒤에서 이어 가고(자동 진행), A로 갈 때 자동 사냥을 켠 채라 들판의 몸이 남아 사냥한다.
//   번갈아(sequential): 보이지 않는 쪽은 멈춘다 (탑은 대기실로 나오고, 자동 사냥을 끄고 떠난다). 둘을 견주어 '함께'가 총량을 얼마나 키우는지 본다.
//   탑에서 지면(자동 진행이 꺼짐) 다음에 탑에 올 때 가장 멀리 깬 단계의 다음을 다시 고른다.
//   울림 조각이 100이 되면 처음 한 번은 1번 뽑기, 그 뒤로는 900이 모이면 10번 뽑기. 뽑으면 전투력 높은 넷으로 편성하고, 1분마다 골드로 편성의 레벨을 올리고 우편(임무 보상)을 받는다.
// 실행: node node_modules/tsx/dist/cli.mjs --tsconfig games/echopact/tsconfig.json games/echopact/scripts/flow.ts [분=30] [씨앗=1] [seq]
// 시험(test/flow.test.ts)이 짧게 같은 함수를 부른다.
import { Game, type Ent } from '@engine/server';
import { heroDef, seededRng, STAGES } from '@engine/shared/defs';
import { BANNERS, CAMPS } from '../shared/content';
import { MODE } from '../shared/content/pact';
import { installEchopact } from '../server/echopact';

export interface FlowMinute { min: number; got: Record<string, number>; have: number; pulls: number; best: string; lv: number; power: number; echoes: number; gold: number; where: string }
export interface FlowResult {
  /** 분마다: 그 분까지 들어온 울림 조각(출처별 누계), 가진 조각, 뽑은 수, 깬 단계, 레벨, 편성의 전투력, 메아리 수, 그때 보던 게임 */
  minutes: FlowMinute[];
  /** 첫 1번 뽑기, 첫 10번 뽑기를 한 때(초). 못 했으면 -1 */
  firstPullS: number; firstTenS: number;
  /** 탑·울림골을 보던 초 */
  towerS: number; valeS: number;
  /** 출처별 울림 조각·골드의 합 (field 들판의 사냥: 보던 때와 대역 / stage 탑 / mail 임무) */
  total: Record<string, number>; gold: Record<string, number>;
  /** 변신 중 들판의 능력치 (마지막 분): 최대 체력, 주는 피해의 배율 */
  morph: { id: string; hp: number; mul: number };
  /** 끝에 접속을 끊고 offMin분 동안 둔 것 (두 쪽 다 '자동'): 자리 비움 사냥이 모은 울림 조각·골드, 돌아왔을 때 단계의 오프라인 진행이 넘긴 단계와 보상 */
  off?: { min: number; fieldSparks: number; fieldGold: number; stages: number; stageSparks: number; from: string; to: string };
}

/** 원인(장부의 이름)을 시뮬레이션의 출처로 묶는다 */
const sourceOf = (why: string): string => (why === 'stage' || why === 'huntDungeon' ? 'stage' : why === 'hunt' || why === 'huntAway' ? 'field' : why.startsWith('mail') ? 'mail' : why);

export function simulate(minutes = 30, seed = 1, concurrent = true, offMin = 0): FlowResult {
  // 같은 씨앗이면 같은 흐름이 되게: 틀의 난수(피해의 폭, 몬스터의 자리, 떨어뜨리기)도 이 동안만 정해진 난수로 (끝나면 되돌린다)
  const random = Math.random;
  Math.random = seededRng(seed * 7919 + 1);
  try { return run(minutes, seed, concurrent, offMin); } finally { Math.random = random; }
}

function run(minutes: number, seed: number, concurrent: boolean, offMin: number): FlowResult {
  let clock = Date.UTC(2026, 10, 30, 3, 0, 0);
  const g = new Game({ plugins: [installEchopact], now: () => clock });
  g.gacha.rng = seededRng(seed);
  const total: Record<string, number> = {}, gold: Record<string, number> = {};
  // 들어오는 울림 조각·골드를 출처별로 센다 (지갑이 지난 변화를 듣는 곳: 시뮬레이션만)
  g.wallet.seen.push((_p, cur, d, why) => { if (d <= 0) return; const box = cur === 'sparks' ? total : cur === 'gold' ? gold : null; if (box) box[sourceOf(why)] = (box[sourceOf(why)] ?? 0) + d; });

  const p = g.players.spawn('시뮬', false, null, 'flow-sim-1');
  g.command(p, { t: 'class', id: 'warden' });
  const out: FlowResult = { minutes: [], firstPullS: -1, firstTenS: -1, towerS: 0, valeS: 0, total, gold, morph: { id: '', hp: 0, mul: 1 } };
  const camp = CAMPS[1];
  let t = 0, nextMin = 60, nextChores = 60, switchAt = 240, pulled = 0;
  const cmd = (m: Record<string, unknown>) => g.command(p, m);
  const inTower = () => g.modes.of(p) === MODE.tower;

  const rebuild = () => { cmd({ t: 'squad', ids: Object.keys(p.heroes).sort((a, b) => g.roster.power(p, b) - g.roster.power(p, a)).slice(0, 4) }); };
  const levelUp = () => {
    for (let k = 0; k < 40; k++) {
      const cheapest = [...p.squad].sort((a, b) => p.heroes[a].lv * (heroDef(a).rarity + 1) - p.heroes[b].lv * (heroDef(b).rarity + 1))[0];
      if (!cheapest || p.gold < 60 || !g.roster.levelUp(p, cheapest)) break;
    }
  };
  const pull = () => {
    const b = BANNERS.well;
    if (out.firstPullS < 0 && p.sparks >= b.one) { cmd({ t: 'gacha', id: 'well', n: 1 }); pulled += 1; out.firstPullS = t; rebuild(); }
    while (out.firstPullS >= 0 && p.sparks >= b.ten) { cmd({ t: 'gacha', id: 'well', n: 10 }); pulled += 10; if (out.firstTenS < 0) out.firstTenS = t; rebuild(); }
  };
  /** 탑에서: 싸우는 중이 아니면 가장 멀리 깬 단계의 다음을 자동 진행으로 */
  const fightTower = () => {
    const r = g.stages.runOf(p);
    if (r && r.state !== 'lobby') return;
    cmd({ t: 'stage', a: 'auto', on: true });
    const next = STAGES[Math.min(STAGES.length - 1, g.stages.bestIndex(p) + 1)];
    cmd({ t: 'stage', a: 'go', id: next.id });
  };
  const toVale = () => {
    // 번갈아: 탑을 멈추고 나온다 (대기실에서 떠나면 회차가 닫힌다)
    if (!concurrent) cmd({ t: 'stage', a: 'leave' });
    cmd({ t: 'mode', id: MODE.vale });
    // 처음이거나 대역이 없으면 무리 곁으로 (대역이 있으면 그 자리를 이어받는다)
    if (Math.hypot(p.x - camp.x, p.z - camp.z) > 30) { p.x = camp.x - 6; p.z = camp.z - 6; p.tx = p.x; p.tz = p.z; p.moving = false; p.path = null; }
    const best = Object.keys(p.heroes).sort((a, b) => g.roster.power(p, b) - g.roster.power(p, a))[0];
    if (best && p.morph.on !== best) { p.lastHurt = -999; cmd({ t: 'morph', a: 'on', id: best }); }
    // 화면의 자동 사냥(R)을 흉내 낸다: 틀의 자리 비움 사냥과 같은 판단. 보고 있는 동안은 안전장치가 아니라 화면의 자동 사냥처럼 쉬어 간다
    g.away.safety = null;
    cmd({ t: 'auto', on: true }); g.away.start(p);
  };
  const toTower = () => {
    g.away.stop(p);
    g.away.safety = safety; // 보이지 않는 동안의 대역은 안전장치를 쓴다
    if (!concurrent) cmd({ t: 'auto', on: false });
    cmd({ t: 'mode', id: MODE.tower });
    fightTower();
  };
  const safety = g.away.safety;
  /** 물약이 3개 아래면 상인에게서 5개까지 산다 (보통의 사람: 상인에게 들르는 길은 흉내 내지 않고 값만 치른다) */
  const tonics = () => { while ((p.items.tonic ?? 0) < 5 && g.wallet.take(p, 'gold', 12, 'cmd:buy')) g.bag.putItem(p, 'tonic', 1, 'cmd:buy'); };
  fightTower();

  while (t < minutes * 60) {
    g.tick(0.05); clock += 50; t += 0.05;
    if (inTower()) out.towerS += 0.05; else out.valeS += 0.05;
    if (t >= nextChores) {
      nextChores += 60;
      g.mail.claim(p, 0);
      pull();
      if ((p.items.tonic ?? 0) < 3) tonics();
      levelUp();
      if (inTower()) fightTower();
      else if (!g.away.active(p)) { p.auto = true; g.away.start(p); } // 안전장치로 멈췄으면 다시 켠다 (사람이 보고 있다)
    }
    if (t >= switchAt) { switchAt += 240; if (inTower()) toVale(); else toTower(); }
    if (t >= nextMin) {
      nextMin += 60;
      out.minutes.push({ min: Math.round(t / 60), got: { ...total }, have: p.sparks, pulls: pulled, best: p.stage.best, lv: p.lv, power: g.squad.power(p), echoes: Object.keys(p.heroes).length, gold: p.gold, where: g.modes.of(p) });
    }
  }
  out.morph = { id: p.morph.on, hp: p.maxHp, mul: Math.round(g.mods.product('damage', p as Ent) * 100) / 100 };
  if (offMin > 0) {
    // 접속을 끊는다 (통신 계층과 같은 차례: 끊김 사건 → 자동 사냥이 켜져 있으면 자리 비움 사냥). 탑의 회차는 닫히고, 돌아왔을 때 오프라인 진행이 맡는다
    if (inTower()) { cmd({ t: 'auto', on: true }); }
    g.away.safety = safety;
    g.fire('playerDropped', p);
    p.auto = true; g.away.start(p);
    const f0 = { s: total.field ?? 0, g: gold.field ?? 0 };
    for (let i = 0; i < offMin * 60 * 20; i++) { g.tick(0.05); clock += 50; }
    const fieldSparks = (total.field ?? 0) - f0.s, fieldGold = (gold.field ?? 0) - f0.g;
    // 돌아온다: 저장을 새 게임에 읽어 오프라인 진행(STAGE_RULES.offline)을 받는다
    g.away.stop(p);
    const save = structuredClone(g.players.export(p)), from = p.stage.best;
    const h = new Game({ plugins: [installEchopact], now: () => clock });
    let stageSparks = 0;
    h.wallet.seen.push((_q, cur, d, why) => { if (cur === 'sparks' && d > 0 && why === 'stageAway') stageSparks += d; });
    const q = h.players.spawn('시뮬', false, save, 'flow-sim-1');
    out.off = { min: offMin, fieldSparks, fieldGold, stages: Math.max(0, STAGES.findIndex((x) => x.id === q.stage.best) - STAGES.findIndex((x) => x.id === from)), stageSparks, from, to: q.stage.best };
  }
  return out;
}

// 직접 실행하면 표를 찍는다
if (process.argv[1]?.endsWith('flow.ts')) {
  const mins = Number(process.argv[2] ?? 30), seed = Number(process.argv[3] ?? 1), concurrent = process.argv[4] !== 'seq', off = Number(process.argv[5] ?? 0);
  const r = simulate(mins, seed, concurrent, off);
  console.log(`(${concurrent ? '함께' : '번갈아'}) 분 | 보던 곳 | 들판 | 탑 | 우편 | 가진 조각 | 뽑은 수 | 메아리 | 깬 단계 | 레벨 | 편성 전투력`);
  for (const m of r.minutes) console.log(`${m.min} | ${m.where} | ${m.got.field ?? 0} | ${m.got.stage ?? 0} | ${m.got.mail ?? 0} | ${m.have} | ${m.pulls} | ${m.echoes} | ${m.best || '-'} | ${m.lv} | ${m.power}`);
  console.log(JSON.stringify({ firstPullS: Math.round(r.firstPullS), firstTenS: Math.round(r.firstTenS), towerMin: +(r.towerS / 60).toFixed(1), valeMin: +(r.valeS / 60).toFixed(1), sparks: r.total, gold: r.gold, morph: r.morph, off: r.off }));
}
