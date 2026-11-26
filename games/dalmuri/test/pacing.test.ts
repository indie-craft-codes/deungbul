// 처음 30분의 흐름: 틀의 게임 그대로(전투·단계·뽑기·열쇠 던전) 30분을 돌린다. 난수는 정해져 있다 (test/sim.ts).
// 목표: 처음 10번 뽑기 5분 안, 처음 우두머리(1-5) 10분 안팎, 30분 안에 2장. 씨앗 셋 가운데 둘 이상이 2장에 든다 (하나는 1-10에서 막혀도 된다: 벽).
import { check } from '@engine/testing';
import { simulate } from './sim';

const mmss = (s: number) => (s < 0 ? '없음' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const runs = [1, 2, 3].map((seed) => ({ seed, r: simulate(30, seed) }));
for (const { seed, r } of runs) {
  console.log(`  씨앗 ${seed}: 10번 뽑기 ${mmss(r.firstTen)} · 첫 우두머리 ${mmss(r.firstBoss)} · 2장 ${mmss(r.chapter2)} · 첫 열쇠 던전 ${mmss(r.firstDungeon)} · 30분에 ${r.best}, 뽑기 ${r.draws}번, 편성 ${r.squad.join('/')} (전투력 ${r.power}), 대장 레벨 ${r.leaderLv}`);
  check(r.firstTen > 0 && r.firstTen <= 300, `씨앗 ${seed}: 처음 10번 뽑기가 5분 안 (${mmss(r.firstTen)})`);
  check(r.firstBoss >= 360 && r.firstBoss <= 720, `씨앗 ${seed}: 처음 우두머리(1-5)를 6~12분에 깬다 (${mmss(r.firstBoss)})`);
  check(r.firstDungeon > 0 && r.firstDungeon <= 600, `씨앗 ${seed}: 열쇠 던전을 10분 안에 처음 깬다 (${mmss(r.firstDungeon)})`);
  check(r.draws >= 20, `씨앗 ${seed}: 30분에 10번 뽑기를 두 번 이상 (${r.draws}번)`);
}
const ch2 = runs.filter(({ r }) => r.chapter2 > 0);
check(ch2.length >= 2 && ch2.every(({ r }) => r.chapter2 >= 600), `씨앗 셋 가운데 둘 이상이 10분 뒤·30분 안에 2장에 든다 (${runs.map(({ r }) => mmss(r.chapter2)).join(', ')})`);
const again = simulate(30, 1);
check(JSON.stringify(again) === JSON.stringify(runs[0].r), '같은 씨앗이면 같은 30분 (뽑기와 전투의 난수가 정해져 있다)');
