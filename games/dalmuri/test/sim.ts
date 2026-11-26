// 처음 30분의 흐름을 서버 없이 틀의 게임 그대로 돌린다: 실제 전투(대장·영웅·몬스터)와 단계, 뽑기(정해진 난수), 영웅 키우기.
// 사람의 몫은 '보통의 손님'처럼 몇 초마다 한 번: 우편 받기, 월석이 900이면 10번 뽑기, 별 올리기, 편성을 가장 센 넷으로, 남는 금화로 편성의 약한 영웅부터 레벨 업,
// 실패해 자동 진행이 꺼졌으면 다시 켜기, 열쇠가 있으면 열쇠 던전(대장 레벨 3부터).
// 시험(pacing.test.ts)과 손으로 숫자를 볼 때(npx tsx --tsconfig games/dalmuri/tsconfig.json games/dalmuri/test/sim.ts) 함께 쓴다.
import { HERO_RULES, HEROES, seededRng, stageIndex, STAGES } from '@engine/shared/defs';
import { Game, type Ent } from '@engine/server';
import { installDalmuri } from '../server/dalmuri';

export interface SimEvent { t: number; what: string }
export interface SimResult {
  /** 처음 10번 뽑기, 처음 우두머리(1-5)를 깸, 2장에 들어섬(1-10을 깸), 처음 열쇠 던전: 초 (없으면 -1) */
  firstTen: number; firstBoss: number; chapter2: number; firstDungeon: number;
  best: string; draws: number; squad: string[]; power: number; leaderLv: number; fails: number;
  events: SimEvent[];
}

export function simulate(minutes: number, seed = 1, opts: { dungeons?: boolean } = {}): SimResult {
  // 전투의 난수(치명타, 피해의 폭, 몬스터의 자리)도 정해진 난수로: 같은 씨앗이면 같은 30분
  const random = Math.random;
  Math.random = seededRng(seed * 7919 + 13);
  try { return run(minutes, seed, opts); } finally { Math.random = random; }
}

function run(minutes: number, seed: number, opts: { dungeons?: boolean }): SimResult {
  let clock = Date.parse('2026-11-26T09:00:00Z');
  const g = new Game({ plugins: [installDalmuri], now: () => clock });
  g.gacha.rng = seededRng(seed);
  const p: Ent = g.players.spawn('시험대장', false, null, 'sim-' + seed);
  const res: SimResult = { firstTen: -1, firstBoss: -1, chapter2: -1, firstDungeon: -1, best: '', draws: 0, squad: [], power: 0, leaderLv: 1, fails: 0, events: [] };
  let t = 0;
  const ev = (what: string) => res.events.push({ t: Math.round(t), what });
  g.on('stageCleared', (_q, id, first) => {
    if (!first) return;
    ev(`깸 ${id}`);
    if (id === '1-5' && res.firstBoss < 0) res.firstBoss = t;
    if (id === '1-10' && res.chapter2 < 0) res.chapter2 = t;
  });
  g.on('dungeonCleared', (id) => { ev(`던전 ${id}`); if (res.firstDungeon < 0) res.firstDungeon = t; });
  const said = new Set<string>();
  const act = () => {
    // 우편 받기 (출석·임무·던전 보상)
    for (const m of [...p.mail]) g.command(p, { t: 'mailClaim', id: m.id });
    // 월석이 모이면 10번 뽑기
    while (p.sparks >= 900) {
      g.command(p, { t: 'gacha', id: 'halo', n: 10 });
      res.draws += 10;
      if (res.firstTen < 0) res.firstTen = t;
      ev(`10번 뽑기 → ${Object.keys(p.heroes).length}명`);
    }
    // 별정수는 편성의 가장 높은 등급 영웅에게
    for (const id of [...p.squad].sort((a, b) => HEROES[b].rarity - HEROES[a].rarity)) for (let i = 0; i < 5; i++) g.command(p, { t: 'essence', id });
    // 별 올리기
    for (const id of Object.keys(p.heroes)) while (g.roster.starUp(p, id));
    // 편성: 전투력이 가장 높은 넷
    const best4 = Object.keys(p.heroes).sort((a, b) => g.roster.power(p, b) - g.roster.power(p, a)).slice(0, 4);
    if ([...best4].sort().join() !== [...p.squad].sort().join()) g.squad.set(p, best4);
    // 레벨 업: 편성의 가장 약한 영웅부터, 금화가 바닥날 때까지
    for (let guard = 0; guard < 200; guard++) {
      const weak = [...p.squad].filter((id) => p.heroes[id].lv < HERO_RULES.maxLv(p.heroes[id].stars)).sort((a, b) => g.roster.power(p, a) - g.roster.power(p, b))[0];
      if (!weak || p.gold < HERO_RULES.levelCost(p.heroes[weak].lv, HEROES[weak].rarity)) break;
      g.roster.levelUp(p, weak);
    }
    // 실패해서 자동 진행이 꺼졌으면 다시 켜고 다음 단계에 도전
    if (!p.stage.auto) {
      res.fails++;
      g.command(p, { t: 'stage', a: 'auto', on: true });
      const next = STAGES[Math.min(STAGES.length - 1, stageIndex(p.stage.best) + 1)];
      if (next && g.stages.inStage(p)) g.command(p, { t: 'stage', a: 'go', id: next.id });
    }
    // 열쇠 던전
    if (opts.dungeons !== false && !g.dungeon.runOf(p) && p.lv >= 3) {
      for (const id of ['goldvein', 'starwell']) if (g.dungeon.keyCount(p, id) > 0) { g.command(p, { t: 'keyrun', id }); if (g.dungeon.runOf(p)) { if (!said.has(id)) { said.add(id); ev(`열쇠 던전 ${id} 들어감`); } break; } }
    }
  };
  const dt = 0.05;
  for (let i = 0; i < minutes * 60 * 20; i++) {
    g.tick(dt); t += dt; clock += 50;
    if (i % 100 === 0) act(); // 5초마다
  }
  ev(`끝: 금화 ${p.gold} 월석 ${p.sparks} 영웅 ${Object.entries(p.heroes).map(([id, h]) => `${id}${h.lv}/${h.stars}`).join(' ')}`);
  res.best = p.stage.best; res.squad = [...p.squad]; res.power = g.squad.power(p); res.leaderLv = p.lv;
  return res;
}

if (import.meta.main ?? process.argv[1]?.endsWith('sim.ts')) {
  const r = simulate(Number(process.argv[2] ?? 30), Number(process.argv[3] ?? 1));
  for (const e of r.events) console.log(`${String(Math.floor(e.t / 60)).padStart(3)}:${String(e.t % 60).padStart(2, '0')} ${e.what}`);
  console.log(JSON.stringify({ ...r, events: undefined }));
}
