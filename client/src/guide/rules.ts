// 도감이 서버 코드에서 직접 빌려 쓰는 것. 내용 정의(shared/content)가 아니라 서버 시스템 안에 있는 규칙 가운데,
// 브라우저에서도 그대로 돌 수 있는 것만 여기서 한 번 불러 쓴다 (값을 베껴 적지 않으려는 것이다).
// 여기서 불러오는 서버 파일은 shared/와 형(type)만 불러와야 한다: node 모듈이나 통신·저장 코드가 딸려 오면 안 된다.
// test/guide.test.ts가 도감이 불러오는 파일 전체를 따라가며 이것을 검사한다.
import { STAT_IDS, type Gear, type GearSlot, type Stat } from '../../../shared/defs';
import { AWAY_MAX_S } from '../../../server/game/systems/away';
import { GearSys } from '../../../server/game/systems/gear';

export { AWAY_MAX_S };

/**
 * 서버의 장비 굴림(GearSys.roll)을 정해 둔 난수로 부른다.
 * roll은 this.random만 쓰므로, 게임 전체를 만들지 않고 난수만 가진 빈 껍데기를 this로 넘긴다.
 */
function rollWith(seq: readonly number[], lv: number, rar: number, slot: GearSlot): Gear | null {
  let i = 0;
  const self = { random: () => seq[Math.min(i++, seq.length - 1)] };
  // 서버의 굴림이 this의 다른 것을 쓰도록 바뀌면 여기서 실패한다: 도감 전체가 멈추지 않게 그 칸만 비우고, 검사(test/guide.test.ts)가 알린다
  try { return GearSys.prototype.roll.call(self as unknown as GearSys, lv, rar, slot); } catch { return null; }
}

/** 난수의 가장 큰 값 (Math.random은 1 미만이다) */
const TOP = 1 - 2 ** -53;

/**
 * 그 등급·장비 레벨의 장비에 붙는 옵션 하나의 값 범위 [가장 작은 값, 가장 큰 값].
 * 서버가 실제로 굴리는 함수에 가장 작은 난수와 가장 큰 난수를 넣어 얻는다. 옵션이 없는 조합이면 null
 */
export function optRange(stat: Stat, rar: number, lv: number): [number, number] | null {
  // 첫 난수는 옵션의 종류를 고르고, 다음 난수는 값을 정한다. 종류 칸의 한가운데를 가리켜 그 옵션이 처음으로 뽑히게 한다
  const pick = (STAT_IDS.indexOf(stat) + 0.5) / STAT_IDS.length;
  const lo = rollWith([pick, 0], lv, rar, 'ring')?.opts[0], hi = rollWith([pick, TOP], lv, rar, 'ring')?.opts[0];
  if (!lo || !hi || lo[0] !== stat || hi[0] !== stat) return null;
  return [lo[1], hi[1]];
}

