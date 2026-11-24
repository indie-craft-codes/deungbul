// 안개 균열의 수치 맞추기: 기준 캐릭터 × 직업으로 자동 사냥만 켠 판을 여러 번 돌려 버틴 시간을 본다.
//   cd <저장소> && npx tsx <이 파일> [판 수] [고르기: random|first|smart]
import { RIFT, RIFT_UP_IDS } from '@game/shared/content/rift';
import { rng } from '@engine/shared/world';
import { newGame } from './games/deungbul/test/game';
import { TIERS, autoThink, hero } from './games/deungbul/test/rift-kit';

const N = Number(process.argv[2] ?? 6), how = process.argv[3] ?? 'random';
const classes = ['warrior', 'archer', 'mage'] as const;
const SMART = ['ring', 'leech', 'ward', 'might', 'reach', 'vigor', 'haste', 'chain', 'keen', 'swift'];

for (const tier of TIERS) {
  for (const cls of classes) {
    const times: number[] = [], kills: number[] = [], downs1: number[] = [], lows: number[] = [], dn: number[] = [];
    let nd = 0;
    let peak = 0;
    for (let i = 0; i < N; i++) {
      const rnd = rng(1000 + i * 77);
      const real = Math.random;
      Math.random = rnd;
      let clock = new Date(2026, 0, 10, 12).getTime();
      const g = newGame({ now: () => clock, raid: { hours: [] } });
      g.gear.random = rnd; g.rift.random = rnd;
      const p = hero(g, 'h', cls, tier);
      p.x = RIFT.portal.x + 1; p.z = RIFT.portal.z;
      g.command(p, { t: 'rift', a: 'enter' });
      let think = 0, firstDown = -1, t = 0, res = { timeS: 0, kills: 0 }, low = 1;
      for (let k = 0; k < 20 * 330; k++) {
        g.tick(0.05); clock += 50; t += 0.05;
        const run = g.rift.runOf(p);
        if (!run) break;
        if (run.out || run.ended) { break; }
        peak = Math.max(peak, run.foes); if (run.t >= 240) low = Math.min(low, p.hp / p.maxHp); nd = run.downs;
        if (run.downs > 0 && firstDown < 0) firstDown = t;
        if (run.offer) {
          const n = how === 'first' ? 0 : how === 'smart' ? run.offer.map((id, j) => [SMART.indexOf(id), j]).sort((a, b) => a[0] - b[0])[0][1] : Math.floor(rnd() * run.offer.length);
          if (rnd() < 0.2) g.command(p, { t: 'rift', a: 'pick', n }); // 고르는 데 평균 1.5초쯤
        }
        think -= 0.05;
        if (think <= 0) { think = 0.3; autoThink(g, p); }
        res = { timeS: run.t, kills: run.kills };
        g.out = []; g.notices = []; g.events = []; g.cdAcks = []; g.itemCds = [];
      }
      times.push(Math.min(300, Math.round(res.timeS))); kills.push(res.kills); downs1.push(firstDown < 0 ? 300 : Math.round(firstDown));
      lows.push(Math.round(low * 100)); dn.push(nd); nd = 0;
      Math.random = real;
    }
    const avg = (a: number[]) => Math.round(a.reduce((s, v) => s + v, 0) / a.length);
    const done = times.filter((v) => v >= 299).length;
    console.log(`${tier.padEnd(8)} ${cls.padEnd(7)} 버틴 ${avg(times)}s (${Math.min(...times)}~${Math.max(...times)}) 완주 ${done}/${N} 첫쓰러짐 ${avg(downs1)}s 처치 ${avg(kills)} 최대적 ${peak} 쓰러짐 ${dn.join('')} 막판최저체력% ${lows.join(',')}`);
  }
}
void RIFT_UP_IDS;
