// 안개 균열: 5분짜리 인스턴스 생존전. 사방에서 몰려오는 떼를 범위 기술로 쓸어 담고, 30초마다 셋 중 하나를 골라 그 판에서만 강해진다.
// 규칙은 games/deungbul/server/systems/rift.ts, 화면은 games/deungbul/client/hud/rift.ts가 맡는다. 수치는 모두 잠정값이다 (시제품: 재미를 확인하려는 값).
// 보상의 수치(하루 횟수를 함께 쓰는 던전, 우편의 크기, 처음 완주 덤)는 economy.ts의 RIFT_ECON에 있다.
// 이 게임에만 있는 내용이라 내용 계약에는 없다: 이 게임의 통로(games/deungbul/shared/defs.ts)가 내보낸다.
import type { MonsterId } from '@engine/shared/defs/monsters';
import { DUNGEONS } from './dungeons';
import { RIFT_ECON } from './economy';
import { MAP, RIFT_AREA } from './map';
import { PARTY } from './party';

/**
 * 물결 하나(30초). 그 시간 동안 every초마다 n마리씩(혼자일 때) 나타난다.
 * keep: 살아 있는 적이 이보다 적으면 간격을 기다리지 않고 곧바로(RIFT.refillS마다) 다음 무리를 부른다.
 * 빨리 잡는 사람에게는 그만큼 더 몰려온다: 강한 캐릭터도 화면이 비지 않고, 처치 수가 실력과 힘의 기록이 된다
 */
export interface RiftWave {
  every: number; n: number; keep: number;
  /** 나타나는 종류. 여러 번 적으면 그만큼 자주 나온다 */
  types: readonly MonsterId[];
  /** 그 몬스터의 평소 체력·피해에 곱하는 값 (약하고 많게) */
  hp: number; dmg: number;
}

export const RIFT = {
  /** 들판에 있는 문의 자리와, 안에서 서는 자리(전장의 한가운데) */
  portal: MAP.portals.rift,
  area: RIFT_AREA,
  entry: { x: (RIFT_AREA.x0 + RIFT_AREA.x1) / 2, z: (RIFT_AREA.z0 + RIFT_AREA.z1) / 2 },
  /** 이 레벨부터 들어갈 수 있다 (던전과 같다) */
  minLv: DUNGEONS[RIFT_ECON.sharesRunsWith].minLv,
  /** 하루에 들어갈 수 있는 횟수: 던전의 횟수를 함께 쓴다 */
  perDay: DUNGEONS[RIFT_ECON.sharesRunsWith].perDay,
  /** 한 판에 들어갈 수 있는 사람 수 (파티의 한도와 같다) */
  maxPlayers: PARTY.max,
  /** 한 판의 길이(초). 끝까지 버티면 완주다 */
  timeS: 300,
  /** 끝난 뒤 결과를 보다가 밖으로 나가기까지의 시간(초) */
  exitS: 30,

  // ---------- 떼 ----------
  /** 한 판에 동시에 살아 있을 수 있는 몬스터의 수. 서버 부담의 한도다 (docs/modes.md 3-6: 판당 60 아래) */
  maxFoes: 56,
  /** 나타나는 거리: 사람에게서 이만큼 떨어진 곳 (화면 밖) */
  spawnRadius: [15, 19] as readonly [number, number],
  /** 한 번에 나타나는 무리가 퍼지는 각도(라디안): 한쪽에서 뭉쳐 온다. 방향은 무리마다 새로 고른다 */
  spawnSpread: 0.9,
  /** 쫓던 사람에게서 이만큼 멀어진 몬스터는 그 사람 둘레로 다시 불러온다 (달아나서 떼를 떼어 내지 못하게. 몬스터가 대상을 놓는 거리 MONSTER_AI.loseRange보다 짧아야 한다) */
  regroupAt: 22,
  /** 사람이 한 명 늘 때마다 무리의 크기가 이만큼(비율) 는다 */
  perPlayer: 0.7,
  /** 적이 물결의 keep보다 적을 때 무리를 다시 부르는 가장 짧은 간격(초) */
  refillS: 1,
  /** 물결의 길이(초)와 물결들. 시간이 갈수록 수와 종류가 세진다 */
  waveS: 30,
  waves: [
    { every: 3.5, n: 6, keep: 12, types: ['slime'], hp: 0.25, dmg: 0.3 },
    { every: 3.5, n: 7, keep: 14, types: ['slime', 'slime', 'wisp'], hp: 0.25, dmg: 0.28 },
    { every: 3.5, n: 7, keep: 16, types: ['slime', 'wisp', 'wolf'], hp: 0.26, dmg: 0.25 },
    { every: 3, n: 8, keep: 18, types: ['wisp', 'wolf', 'wolf'], hp: 0.28, dmg: 0.24 },
    { every: 3, n: 8, keep: 21, types: ['wolf', 'goblin', 'goblin'], hp: 0.3, dmg: 0.25 },
    { every: 3, n: 8, keep: 24, types: ['goblin', 'goblin', 'lost_soldier'], hp: 0.34, dmg: 0.27 },
    { every: 2.5, n: 9, keep: 30, types: ['goblin', 'wolf', 'lost_soldier'], hp: 0.45, dmg: 0.38 },
    { every: 2.5, n: 9, keep: 38, types: ['goblin', 'lost_soldier', 'shade_bram'], hp: 0.6, dmg: 0.52 },
    { every: 2.5, n: 9, keep: 44, types: ['lost_soldier', 'shade_bram', 'shade_mira'], hp: 0.8, dmg: 0.7 },
    { every: 2, n: 10, keep: 48, types: ['wolf', 'goblin', 'lost_soldier', 'shade_mira'], hp: 1.0, dmg: 1.0 },
  ] as readonly RiftWave[],
  /** 우두머리: 이 시각(초)에 하나 나타난다. 필드 보스의 규칙(인원 비례 체력, 예고 뒤 내려치기)을 그대로 따른다. 잡지 않아도 완주는 된다 */
  boss: { atS: 240, type: 'ash_troll' as MonsterId, hp: 0.55, dmg: 0.6 },

  // ---------- 강화 고르기 ----------
  /** 처음 고르는 시각(초)과 그 뒤의 간격(초), 한 번에 보여 주는 수, 고르지 않으면 첫째 것이 골라지기까지의 시간(초) */
  firstPickS: 3,
  pickEveryS: 30,
  choices: 3,
  pickTimeoutS: 15,

  // ---------- 쓰러짐 ----------
  /** 한 판에서 제자리에서 다시 일어날 수 있는 횟수. 그다음에 쓰러지면 그 사람의 판은 끝난다 */
  revives: 1,
  /** 다시 일어난 뒤 피해를 받지 않는 시간(초) */
  reviveSafeS: 3,
  /** 다시 일어날 때 둘레 이 거리(m) 안의 떼가 흩어진다 (우두머리는 남는다) */
  reviveClear: 7,
} as const;

/** 강화 하나. per: 한 단계마다 늘거나 주는 양 (뜻은 강화마다 다르다: 아래 표의 주석), max: 가장 높은 단계 */
export interface RiftUpDef { per: number; max: number; [extra: string]: number }

/**
 * 그 판에서만 듣는 강화들. 같은 것을 다시 고르면 단계가 오른다. 이름과 설명은 언어 파일에 있다 (riftUps).
 * 직업 셋 모두에게 쓸모가 있게 골랐다: 범위 기술은 직업마다 하나씩 있고(회오리, 화살비, 서리), 고리와 번짐은 직업을 가리지 않는다
 */
export const RIFT_UPS = {
  /** 공격 피해 +per (비율) */
  might: { per: 0.2, max: 5 },
  /** 범위 기술과 고리·번짐의 반경 +per (비율) */
  reach: { per: 0.2, max: 4 },
  /** 기술 대기 시간 −per (비율, 단계마다 곱한다) */
  haste: { per: 0.15, max: 4 },
  /** 이동 속도 +per (비율) */
  swift: { per: 0.08, max: 3 },
  /** 최대 체력 +per (직업·레벨의 기본 체력에 대한 비율). 고를 때 heal(최대 체력에 대한 비율)만큼 회복한다 */
  vigor: { per: 0.2, max: 5, heal: 0.5 },
  /** 몬스터를 쓰러뜨릴 때마다 체력 +per */
  leech: { per: 1, max: 4 },
  /** 기본 공격의 치명타 확률 +per */
  keen: { per: 0.12, max: 4 },
  /** 받는 피해 −per (비율, 단계마다 곱한다) */
  ward: { per: 0.12, max: 5 },
  /** 안개 고리: everyS초마다 radius 안의 적 모두에게 피해 base + per × (단계 − 1) */
  ring: { per: 8, max: 5, base: 12, radius: 4.5, everyS: 2 },
  /** 번지는 일격: 기본 공격과 대상 하나를 치는 기술이 맞으면, 그 피해의 per × 단계만큼이 radius 안의 다른 적에게 번진다 */
  chain: { per: 0.35, max: 4, radius: 3 },
} as const satisfies Record<string, RiftUpDef>;
export type RiftUpId = keyof typeof RIFT_UPS;
export const RIFT_UP_IDS = Object.keys(RIFT_UPS) as RiftUpId[];
export const isRiftUp = (v: unknown): v is RiftUpId => typeof v === 'string' && Object.hasOwn(RIFT_UPS, v);

/** 한 판에서 강화를 고르는 횟수 (처음 한 번 + 간격마다) */
export const RIFT_PICKS = 1 + Math.floor((RIFT.timeS - 1) / RIFT.pickEveryS);
/** 지금(t초)까지 고를 차례가 몇 번 왔는가 */
export const riftPicksBy = (t: number): number => (t < RIFT.firstPickS ? 0 : Math.min(RIFT_PICKS, 1 + Math.floor(t / RIFT.pickEveryS)));
/** 그 시각(초)의 물결 번호 (0부터) */
export const riftWaveAt = (t: number): number => Math.max(0, Math.min(RIFT.waves.length - 1, Math.floor(t / RIFT.waveS)));
/** 사람 수에 맞춘 무리의 크기 */
export const riftPack = (n: number, players: number): number => Math.max(1, Math.round(n * (1 + RIFT.perPlayer * Math.max(0, players - 1))));
/** 사람 수에 맞춘 '이보다 적으면 곧바로 더 부른다'의 기준 (한도를 넘지 않는다) */
export const riftKeep = (keep: number, players: number): number => Math.min(RIFT.maxFoes - 8, riftPack(keep, players));

/** 강화의 수치 (서버의 보정과 화면의 설명, 도감이 같은 함수를 쓴다). lv가 0이면 강화가 없는 값이다 */
export const riftUp = {
  /** 공격 피해에 곱하는 값 */
  might: (lv: number): number => 1 + RIFT_UPS.might.per * lv,
  /** 범위에 곱하는 값 */
  reach: (lv: number): number => 1 + RIFT_UPS.reach.per * lv,
  /** 기술 대기 시간에 곱하는 값 */
  haste: (lv: number): number => Math.pow(1 - RIFT_UPS.haste.per, lv),
  /** 이동 속도에 곱하는 값 */
  swift: (lv: number): number => 1 + RIFT_UPS.swift.per * lv,
  /** 최대 체력에 더하는 값: base는 직업과 레벨의 기본 체력 */
  vigor: (lv: number, base: number): number => Math.round(base * RIFT_UPS.vigor.per * lv),
  /** 처치마다 회복하는 체력 */
  leech: (lv: number): number => RIFT_UPS.leech.per * lv,
  /** 치명타 확률에 더하는 값 */
  keen: (lv: number): number => RIFT_UPS.keen.per * lv,
  /** 받는 피해에 곱하는 값 */
  ward: (lv: number): number => Math.pow(1 - RIFT_UPS.ward.per, lv),
  /** 고리의 피해 (공격 피해 보정이 더 곱해진다) */
  ring: (lv: number): number => (lv > 0 ? RIFT_UPS.ring.base + RIFT_UPS.ring.per * (lv - 1) : 0),
  /** 번지는 피해의 비율 */
  chain: (lv: number): number => RIFT_UPS.chain.per * lv,
};

/**
 * 버틴 시간(초)과 완주 여부로 정하는 보상: 골드·경험치·불씨의 양과, 장비가 붙는가 (none 없음, roll 평소처럼 굴린 등급, clear 던전과 같은 최저 등급).
 * 완주(done)하면 던전 한 번의 완료 보상과 같다. first: 처음 완주라서 덤이 붙는다.
 * 서버(우편을 보낼 때)와 화면·도감(안내)이 함께 쓴다
 */
export function riftReward(timeS: number, done: boolean, first = false): { gold: number; exp: number; sparks: number; gear: 'none' | 'roll' | 'clear'; bonus: number } {
  const e = RIFT_ECON, full = e.reward;
  if (!done && timeS < e.minS) return { gold: 0, exp: 0, sparks: 0, gear: 'none', bonus: 0 };
  const k = done ? 1 : Math.min(1, Math.max(0, timeS / RIFT.timeS));
  const bonus = done && first ? e.firstClearGold : 0;
  return { gold: Math.floor(full.gold * k), exp: Math.floor(full.exp * k), sparks: Math.floor(full.sparks * k), gear: done ? 'clear' : timeS >= e.gearFromS ? 'roll' : 'none', bonus };
}
/** 끝냈을 때 받는 장비의 장비 레벨과 완주했을 때의 최저 등급: 함께 쓰는 던전의 값 그대로다 */
export const RIFT_GEAR = { lv: DUNGEONS[RIFT_ECON.sharesRunsWith].dropLv, rar: DUNGEONS[RIFT_ECON.sharesRunsWith].dropRar };


/**
 * 강화의 설명에 넣는 수 (그 단계에서의 값). 언어 파일의 riftUps[id].info가 이 차례대로 받는다:
 * might·reach·swift·keen 늘어나는 %, haste·ward 줄어드는 %, vigor [최대 체력 %, 고를 때 회복 %], leech 처치마다 회복량,
 * ring [피해, 간격(초), 반경(m)], chain [번지는 %, 반경(m)]
 */
export function riftUpNums(id: RiftUpId, lv: number): number[] {
  const pct = (v: number) => Math.round(v * 100);
  switch (id) {
    case 'might': return [pct(riftUp.might(lv) - 1)];
    case 'reach': return [pct(riftUp.reach(lv) - 1)];
    case 'haste': return [pct(1 - riftUp.haste(lv))];
    case 'swift': return [pct(riftUp.swift(lv) - 1)];
    case 'vigor': return [pct(RIFT_UPS.vigor.per * lv), pct(RIFT_UPS.vigor.heal)];
    case 'leech': return [riftUp.leech(lv)];
    case 'keen': return [pct(riftUp.keen(lv))];
    case 'ward': return [pct(1 - riftUp.ward(lv))];
    case 'ring': return [riftUp.ring(lv), RIFT_UPS.ring.everyS, RIFT_UPS.ring.radius];
    case 'chain': return [pct(riftUp.chain(lv)), RIFT_UPS.chain.radius];
  }
}
