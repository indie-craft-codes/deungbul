// 이 게임(등불지기)의 클라이언트 상태. 틀의 상태(../state.ts의 S)에는 이 칸들이 없다.
//   G    개인 상태: 서버가 me 메시지로 알려 주는 내 진행 (퀘스트, 기여, 기여 단계, 휴식 보너스)
//   GS   공유 상태: 서버가 world 메시지로 모두에게 알려 주는 것 (등탑 밝기, 주민, 오늘의 등탑지기, 습격)
// 고치는 곳은 메시지를 받는 game/deungbul.ts 하나이고, 이 게임의 화면이 읽는다.
import { GLOW_START, RESIDENTS, stageOf, type Stage } from '@engine/shared/defs';
import type { MeState } from '../shared/deungbul';
import type { WorldState } from '@engine/shared/protocol';
import { TOWERS, zoneOf } from '@engine/shared/world';
import { S } from '@engine/client/state';

export const G: MeState = {
  quest: { c: 0, s: 0, n: 0 },
  contrib: 0,
  tier: 0,
  rested: 0,
};

export const GS = {
  /** 서버 전체가 공유하는 상태 */
  world: {
    tower: { glow: GLOW_START, glows: TOWERS.map((t) => t.start), residents: RESIDENTS.map(() => 0) },
    keepers: [],
    raid: { phase: 'idle', left: 0, foes: 0, towerHp: 0, towerMaxHp: 0 },
  } as WorldState,
  /** 공유 상태를 받은 시각. 남은 시간을 직접 세는 데 쓴다 */
  worldAt: 0,
};

/** 내가 있는 구역의 번호 (접속 전에는 첫 구역) */
export const myZone = (): number => zoneOf(S.me?.x ?? 0);
/** 내가 있는 구역의 등탑 밝기 */
export const zoneGlow = (): number => GS.world.tower.glows[myZone()] ?? 0;
/** 내가 있는 구역의 등탑 밝기 단계. 이동 속도 예측과 화면 분위기에 쓴다 */
export const stage = (): Stage => stageOf(zoneGlow());
/** 공유 상태의 남은 시간(초)을 지금 기준으로 */
export const raidLeft = (now: number): number => Math.max(0, GS.world.raid.left - (now - GS.worldAt) / 1000);
