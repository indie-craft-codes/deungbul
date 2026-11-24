// 던전: 문으로 들어가는 따로 떨어진 지역. 들어간 사람(과 그 파티)만의 인스턴스가 만들어진다.
// 규칙은 engine/server/game/systems/dungeon.ts가 맡는다. 수치는 모두 잠정값이다.
// 모양(DungeonDef)과 도우미는 틀에 있다: engine/shared/defs/dungeons.ts
import type { DungeonDef } from '@engine/shared/defs/dungeons';
import { DUNGEON_ECON } from './economy';
import { MAP } from './map';

export const DUNGEONS = {
  crypt: {
    portal: MAP.portals.crypt,
    entry: { x: 266, z: 0 },
    minLv: 8,
    // 하루 횟수와 끝낸 보상은 economy.ts에 있다
    perDay: DUNGEON_ECON.crypt.perDay,
    timeS: 600,
    exitS: 30,
    packs: [
      { type: 'goblin', x: 283, z: 0, n: 4 },
      { type: 'lost_soldier', x: 296, z: -16, n: 3 },
      { type: 'lost_soldier', x: 296, z: 16, n: 3 },
      { type: 'goblin', x: 310, z: 0, n: 5 },
    ],
    boss: { type: 'crypt_lord', x: 328, z: 0 },
    reward: DUNGEON_ECON.crypt.reward,
    dropRar: 2, dropLv: 5,
  },
} as const satisfies Record<string, DungeonDef>;
/** 문에 이만큼 다가가야 들어갈 수 있다 */
export const PORTAL_REACH = 4;
