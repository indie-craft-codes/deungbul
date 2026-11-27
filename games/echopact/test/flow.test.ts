// 처음의 재화 흐름 (scripts/flow.ts의 시뮬레이션을 짧게): 들판과 단계가 모두 뽑기 재화를 주고, 첫 뽑기가 몇 분 안에 오며, 같은 씨앗이면 같은 흐름이다.
// 30분 표는 node node_modules/tsx/dist/cli.mjs --tsconfig games/echopact/tsconfig.json games/echopact/scripts/flow.ts 30 (docs/proof-echopact.md)
import { simulate } from '../scripts/flow';
import { check } from '@engine/testing';

const r = simulate(12, 1);
const last = r.minutes.at(-1)!;
check(r.firstPullS > 0 && r.firstPullS <= 5 * 60, `첫 뽑기(울림 조각 100)는 5분 안에 (${Math.round(r.firstPullS)}초)`);
check((r.total.field ?? 0) > 100 && (r.total.stage ?? 0) > 100, `들판의 사냥(${r.total.field})과 단계(${r.total.stage})가 모두 울림 조각을 준다 (12분)`);
check(last.echoes >= 2 && last.best !== '' && last.pulls >= 1, `12분 뒤: 메아리 ${last.echoes}, 깬 단계 ${last.best}, 뽑은 수 ${last.pulls}`);
const again = simulate(12, 1);
check(JSON.stringify(again.minutes) === JSON.stringify(r.minutes), '같은 씨앗이면 같은 흐름이다 (가상 시계와 정해진 뽑기 난수)');
