// 반딧불 연못의 시험: node scripts/game.mjs test pond [이름 …] (npm test가 함께 돈다: 이름은 pond/이름)
import { MAP as viaAlias } from '@game/shared/content';
import { check, failures } from '@engine/testing';
import { MAP } from '../shared/content';

/** 시험의 목록 (test/이름.test.ts) */
export const TESTS = ['rules', 'room', 'net'];
if (MAP !== viaAlias) throw new Error('별칭 @game이 games/pond를 가리키지 않습니다. tsx --tsconfig games/pond/tsconfig.json 으로 실행하세요');

const only = process.argv.slice(2);
for (const name of only.length ? only : TESTS) {
  console.log(`\n[pond/${name}]`);
  await import(`./${name}.test.ts`);
}
check(true, '시험을 끝까지 돌았다');
console.log(failures() ? `\n실패 ${failures()}건` : '\n모두 통과');
process.exit(failures() ? 1 : 0);
