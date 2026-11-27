// 처음의 재화 흐름 (scripts/flow.ts의 시뮬레이션을 짧게): 두 게임(탑·울림골)이 모두 뽑기 재화를 주고, 첫 뽑기가 몇 분 안에 오며,
// 보이지 않는 쪽도 '자동'으로 돌리면(함께) 번갈아 할 때보다 더 들어오되 지나치지 않고, 같은 씨앗이면 같은 흐름이다.
// 30분 표는 node node_modules/tsx/dist/cli.mjs --tsconfig games/echopact/tsconfig.json games/echopact/scripts/flow.ts 30 (docs/proof-echopact.md)
import { simulate } from '../scripts/flow';
import { check } from '@engine/testing';

const r = simulate(12, 1);
const last = r.minutes.at(-1)!;
check(r.firstPullS > 0 && r.firstPullS <= 5 * 60, `첫 뽑기(울림 조각 100)는 5분 안에 (${Math.round(r.firstPullS)}초: 탑의 처음 깬 보상)`);
check((r.total.field ?? 0) > 100 && (r.total.stage ?? 0) > 100, `울림골의 사냥(${r.total.field})과 탑의 단계(${r.total.stage})가 모두 울림 조각을 준다 (12분)`);
check(last.echoes >= 2 && last.best !== '' && last.pulls >= 1 && r.towerS > 0 && r.valeS > 0, `12분 뒤: 메아리 ${last.echoes}, 깬 단계 ${last.best}, 뽑은 수 ${last.pulls}, 탑 ${Math.round(r.towerS / 60)}분·울림골 ${Math.round(r.valeS / 60)}분`);
const seq = simulate(12, 1, false);
const sum = (x: typeof r) => Object.entries(x.total).filter(([k]) => k !== 'start').reduce((s, [, v]) => s + v, 0);
check(sum(r) > sum(seq) && sum(r) <= sum(seq) * 1.6, `보이지 않는 쪽도 돌리면(함께 ${sum(r)}) 번갈아 할 때(${sum(seq)})보다 더 들어오되 1.6배를 넘지 않는다 (${(sum(r) / sum(seq)).toFixed(2)}배)`);
check(r.morph.id !== '' && r.morph.mul > 1, `들판에서는 가장 센 메아리(${r.morph.id})로 변신해 카드의 공격으로 싸운다 (주는 피해 ×${r.morph.mul})`);
const again = simulate(12, 1);
check(JSON.stringify(again.minutes) === JSON.stringify(r.minutes), '같은 씨앗이면 같은 흐름이다 (가상 시계와 정해진 뽑기 난수)');
