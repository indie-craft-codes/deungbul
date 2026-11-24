// 도감이 게임의 규칙에서 값을 얻는 곳. 규칙의 식은 내용 정의(shared/content)의 순수 함수로 있고, 서버와 도감이 같은 함수를 부른다:
// 도감은 서버 코드(server/)를 불러오지 않는다 (test/guide.test.ts가 도감이 불러오는 파일 전체를 따라가며 검사한다).
import { RARITIES, rollOpt, type Stat } from '../../../shared/defs';

/** 난수의 가장 큰 값 (Math.random은 1 미만이다) */
const TOP = 1 - 2 ** -53;

/**
 * 그 등급·장비 레벨의 장비에 붙는 옵션 하나의 값 범위 [가장 작은 값, 가장 큰 값].
 * 서버가 장비를 굴릴 때 쓰는 함수(rollOpt)에 가장 작은 난수와 가장 큰 난수를 넣어 얻는다. 없는 등급이면 null
 */
export function optRange(stat: Stat, rar: number, lv: number): [number, number] | null {
  if (!RARITIES[rar]) return null;
  return [rollOpt(stat, rar, lv, 0), rollOpt(stat, rar, lv, TOP)];
}
