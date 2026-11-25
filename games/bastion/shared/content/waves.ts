// 이 게임에만 있는 내용: 마을 우물(지킬 곳)의 자리와 물결(웨이브)의 수치. 계약(index.ts)에 없으므로 틀은 읽지 않고, 이 게임의 서버와 화면만 읽는다.
import type { MonsterId } from '@engine/shared/defs/monsters';

/** 마을 한가운데의 우물: 몰려온 적이 향하는 곳 (g.rules.siege) */
export const WELL = {
  x: 0, z: 0, r: 1.3,
  /** 이 거리 안에 서야 고치거나 되살릴 수 있다. 직업도 여기서 바꾼다 */
  reach: 6,
};

/** 마을을 두른 돌담: 반지름과, 문(동서남북)의 반쯤 너비(라디안) */
export const WALL = { r: 12, post: 0.95, step: Math.PI / 18, gateHalf: 0.3 };

export const WAVE = {
  /** 물결 사이의 시간(초). 서버를 띄울 때 환경 변수 WAVE_S로 바꾼다 */
  intervalS: 180,
  /** 서버가 뜬 뒤 첫 물결까지(초) */
  firstS: 90,
  /** 물결 시작 몇 초 전에 모두에게 알리는가 */
  warnS: 20,
  /** 한 물결의 제한 시간(초): 넘기면 막아 내지 못한 것이다 */
  durationS: 180,
  /** 적이 하나씩 나오는 간격(초) */
  gapS: 0.8,
  /** 적이 나타나는 거리(우물에서) */
  spawnR: [30, 35] as const,
  /** 적의 수: base + perWave × (물결 − 1) + perPlayer × (사람 − 1), 상한 max */
  base: 5, perWave: 2, perPlayer: 2, max: 40,
  /** 물결마다 적의 체력이 이만큼씩 는다 (2번째 물결 +15%) */
  hpPerWave: 0.15,
  /** 우물의 내구 */
  gateHp: 400,
  /** 우물에 붙은 적 하나가 1초에 깎는 내구: 그 적의 평균 피해 × 이 값 */
  drainMul: 0.6,
  /** 고치기: 한 번에 골드 repairGold를 내고 내구 repairHp를 채운다 */
  repairGold: 10, repairHp: 40,
  /** 무너진 우물: restoreS초 뒤 저절로 절반으로 되살아나거나, 누군가 restoreGold를 내면 바로 가득 되살아난다 */
  restoreS: 60, restoreGold: 120, restoreFrac: 0.5,
  /** 막아 낸 보상: 골드 (poolBase + poolPerWave × 물결)를 싸운 사람이 나눠 갖고(한 사람에 shareMin 이상), 경험치는 저마다 */
  poolBase: 60, poolPerWave: 30, shareMin: 10,
  expBase: 40, expPerWave: 20,
};

/** 그 물결의 적의 수 */
export const waveSize = (wave: number, people: number): number =>
  Math.min(WAVE.max, WAVE.base + WAVE.perWave * (wave - 1) + WAVE.perPlayer * Math.max(0, people - 1));

/** 그 물결에 나오는 적의 종류: 1번째는 진흙방울과 굴쥐, 2번째부터 독침두꺼비, 3번째부터 바위등딱지가 섞인다 */
export function waveTypes(wave: number, n: number, rnd: () => number = Math.random): MonsterId[] {
  const pool: MonsterId[] = ['sludge', 'burrower'];
  if (wave >= 2) pool.push('spitter');
  const brutes = wave >= 3 ? Math.min(n, Math.floor((wave - 1) / 2)) : 0;
  const out: MonsterId[] = [];
  for (let i = 0; i < n - brutes; i++) out.push(pool[Math.floor(rnd() * pool.length)]);
  for (let i = 0; i < brutes; i++) out.push('brute');
  return out;
}

/** 막아 낸 물결의 보상: 한 사람의 골드 몫과 경험치 */
export function waveReward(wave: number, fighters: number): { gold: number; exp: number } {
  const pool = WAVE.poolBase + WAVE.poolPerWave * wave;
  return { gold: Math.max(WAVE.shareMin, Math.floor(pool / Math.max(1, fighters))), exp: WAVE.expBase + WAVE.expPerWave * wave };
}
