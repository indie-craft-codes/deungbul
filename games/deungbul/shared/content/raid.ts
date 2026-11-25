// 안개 습격: 정해진 시각에 안개에서 나온 것들이 등탑으로 몰려온다. 수치는 모두 잠정값이다.
import type { MonsterId } from '@engine/shared/defs/monsters';
import { RAID_REWARD } from './economy';

export interface RaidConfig {
  /** 습격이 시작되는 시각 (서버 현지 시간의 시). 매시 정각에 시작한다 */
  hours: readonly number[];
  /** 0보다 크면 시각표 대신 이 간격(분)으로 연다. 개발과 시험용 */
  everyMin: number;
  /** 시작 전 예고 시간(초) */
  warnS: number;
  /** 제한 시간(초). 이 안에 다 막지 못하면 진다 */
  durationS: number;
  /** 물결마다 시작 뒤 몇 초에 나오는가 */
  waveAtS: readonly number[];
  /** 적의 수 = base + perPlayer × 참여 인원 (max까지) */
  base: number; perPlayer: number; max: number;
  /** 등탑 근처 이 거리 안의 사람을 참여 인원으로 센다 */
  joinRadius: number;
  /**
   * 참여 인원으로 세는 조건: 최근 이 시간(초) 안에 스스로 무언가를 했다(명령을 냈거나 몬스터를 때렸다).
   * 서 있기만 한 캐릭터(부계정)로 적의 수를 부풀리지 못하게 한다. 혼자 가만히 기다리던 사람도 습격은 열리고(1명 몫),
   * 물결마다 다시 세므로 싸우기 시작하면 그 인원만큼 늘어난다.
   */
  activeS: number;
  /** 막아야 할 적이 있는데 그 채널에서 이 시간(초) 동안 아무도 움직이지 않으면, 그 채널은 버려진 것으로 보고 싸움을 끝낸다 (남은 적은 등탑을 한 번 치고 사라진다) */
  abandonS: number;
  /** 적이 나타나는 거리 (등탑 기준) */
  spawnRadius: readonly [number, number];
  /** 등탑 내구 = base + 밝기 × perGlow. 미리 불씨를 바쳐 둘수록 오래 버틴다 */
  towerHpBase: number; towerHpPerGlow: number;
  /** 등탑에 붙은 적 하나가 초당 깎는 내구 */
  drainPerS: number;
  /** 결과에 따른 밝기 변화 */
  winGlow: number; loseGlow: number;
  /** 막아 냈을 때 참여자 각자가 받는 보상 */
  rewardSparks: number; rewardExp: number;
  /** 경험치 보상에 더하는 레벨² 배수: 보상 경험치 = rewardExp + rewardExpPerLv2 × 레벨² (raidExp) */
  rewardExpPerLv2: number;
  /** 첫 물결의 적 */
  types: readonly MonsterId[];
  /** 2번째 물결부터 types에 섞이는 센 적 */
  laterTypes: readonly MonsterId[];
}

export const RAID: RaidConfig = {
  // 낮에 접속하는 사람도 만날 수 있게 하루 여러 번 연다 (정해진 시각에 여는 행사의 통례)
  // 밤늦게 놓치면 다음 날 낮까지 13시간을 기다리던 것(후반부 검토)을 3시간 아래로: 새벽과 아침에도 3시간마다
  hours: [0, 3, 6, 9, 12, 15, 18, 20, 21, 22, 23],
  everyMin: 0,
  warnS: 60,
  durationS: 150,
  waveAtS: [0, 30, 60],
  base: 4, perPlayer: 3, max: 40,
  joinRadius: 45,
  activeS: 30, // 물결 간격(30초)과 같다: 지난 물결을 함께 막은 사람이 다음 물결의 인원이 된다
  abandonS: 30,
  spawnRadius: [24, 30],
  towerHpBase: 240, towerHpPerGlow: 3, // 밝기가 바닥이어도 혼자 막아 볼 시간이 있게 넉넉히 잡는다
  drainPerS: 0.6, // 적 6마리가 붙어도 아무도 안 막으면 1분쯤 버틴다
  winGlow: 10, loseGlow: -10, // 한 번 진다고 여러 번 바친 것이 사라지지 않게 한다
  rewardSparks: RAID_REWARD.sparks, rewardExp: RAID_REWARD.exp, rewardExpPerLv2: RAID_REWARD.expPerLv2, // 값은 economy.ts에 있다
  types: ['slime', 'slime', 'wisp', 'wolf'],
  // 약한 적뿐이라 Lv 14가 1분 안에 막던 것(후반부 검토): 뒤 물결에 멧돼지·고블린·길 잃은 병사가 섞인다
  laterTypes: ['boar', 'goblin', 'lost_soldier'],
};

export type RaidPhase = 'idle' | 'soon' | 'active';

// 서버의 games/deungbul/server/systems/raid.ts와 도감이 함께 쓰는 식. 서버는 덮어쓴 설정(시험, RAID_EVERY_MIN)을 넘긴다
/** players명이 맞설 때 한 채널에 오는 적의 수 */
export const raidFoes = (players: number, cfg: Pick<RaidConfig, 'base' | 'perPlayer' | 'max'> = RAID): number => Math.min(cfg.max, cfg.base + cfg.perPlayer * players);
/** 그 밝기에서 시작할 때의 등탑 내구 (싸우는 채널 하나당) */
export const raidTowerHp = (glow: number, cfg: Pick<RaidConfig, 'towerHpBase' | 'towerHpPerGlow'> = RAID): number => cfg.towerHpBase + glow * cfg.towerHpPerGlow;

/** 막아 낸 사람 하나가 받는 경험치 (그 사람의 레벨로) */
export const raidExp = (lv: number, cfg: Pick<RaidConfig, 'rewardExp' | 'rewardExpPerLv2'> = RAID): number => cfg.rewardExp + cfg.rewardExpPerLv2 * lv * lv;

/** 다음 습격 시작 시각(ms)을 구한다. now 이후의 가장 가까운 정해진 시각이다. */
export function nextRaidAt(now: number, cfg: Pick<RaidConfig, 'hours' | 'everyMin'>): number {
  if (cfg.everyMin > 0) {
    const step = cfg.everyMin * 60000;
    return Math.floor(now / step) * step + step;
  }
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  for (let i = 0; i < 49; i++) {
    d.setHours(d.getHours() + 1);
    if (cfg.hours.includes(d.getHours())) return d.getTime();
  }
  return now + 3600000; // 시각표가 비어 있을 때
}
