// 몬스터 정의. 이름은 여기 없다: 클라이언트의 언어 파일이 id로 찾아 붙인다.
// 틀의 것(타입과 도우미 함수)과 이 게임의 것(표와 수치)이 한 파일에 있어 [틀] / [이 게임] 구역 주석으로 갈라 둔다 (파일은 9단계에서 갈린다).
import { CLEARINGS } from '../world';

// ===== [틀] 몬스터의 모양 =====

export interface MonsterDef {
  hp: number;
  dmg: readonly [number, number];
  speed: number;
  exp: number;
  /** 처치 시 주는 불씨(두 번째 재화) 범위. 피해를 준 사람 각자가 받는다. 없으면 주지 않는다: 불씨가 없는 게임도 몬스터를 정의할 수 있다 */
  sparks?: readonly [number, number];
  /** 처치 시 주는 골드 범위 */
  gold: readonly [number, number];
  /** 먼저 덤비는 거리. 0이면 맞기 전에는 덤비지 않는다. */
  aggro: number;
  /** 이름표 높이 */
  h: number;
  /** 필드 보스: 맞서는 사람이 늘수록 체력이 늘고, 예고 뒤에 주변을 내려친다 (server/game/systems/boss.ts) */
  boss?: boolean;
  /** 쓰러진 뒤 다시 나타나기까지(초). 없으면 RESPAWN_S */
  respawn?: number;
}

// ===== [이 게임] 몬스터 =====
export const MONSTERS = {
  slime: { hp: 60, dmg: [3, 6], speed: 3.0, exp: 12, sparks: [1, 1], gold: [2, 4], aggro: 0, h: 1.7 },
  wisp: { hp: 40, dmg: [2, 5], speed: 4.2, exp: 10, sparks: [1, 2], gold: [2, 5], aggro: 0, h: 2.3 },
  wolf: { hp: 110, dmg: [6, 10], speed: 5.0, exp: 25, sparks: [2, 3], gold: [5, 9], aggro: 7, h: 1.9 },
  // 안개에 삼켜진 브람의 그림자 (메인 퀘스트 1장)
  shade_bram: { hp: 200, dmg: [5, 9], speed: 3.6, exp: 60, sparks: [3, 4], gold: [15, 20], aggro: 0, h: 2.6 },
  // 안개에 삼켜진 미라의 그림자 (메인 퀘스트 2장)
  shade_mira: { hp: 260, dmg: [6, 10], speed: 4.0, exp: 90, sparks: [4, 5], gold: [20, 28], aggro: 0, h: 2.6 },
  // 잿빛 숲
  boar: { hp: 150, dmg: [7, 11], speed: 4.6, exp: 32, sparks: [2, 3], gold: [6, 10], aggro: 6, h: 1.9 },
  goblin: { hp: 95, dmg: [5, 8], speed: 4.4, exp: 22, sparks: [1, 3], gold: [6, 12], aggro: 8, h: 2.0 },
  lost_soldier: { hp: 190, dmg: [9, 13], speed: 3.8, exp: 45, sparks: [3, 4], gold: [10, 16], aggro: 7, h: 2.7 },
  // 잿빛 숲의 필드 보스. hp는 한 명이 맞설 때의 체력이다.
  // 필드 보스의 통례에 맞춘다: 혼자서는 물약을 써 가며 몇 분 걸리고, 여럿이면 금방 잡는다 (실제 플레이로 재 보지는 않은 값)
  ash_troll: { hp: 1600, dmg: [14, 20], speed: 3.4, exp: 300, sparks: [10, 14], gold: [80, 120], aggro: 9, h: 5.0, boss: true, respawn: 300 },
  // 잿빛 지하묘(던전)의 우두머리. 인스턴스 안에만 나온다. 파티로 잡는 것을 기준으로 잡은 값이다
  crypt_lord: { hp: 2600, dmg: [16, 24], speed: 3.6, exp: 500, sparks: [12, 16], gold: [120, 160], aggro: 10, h: 4.2 },
} as const satisfies Record<string, MonsterDef>;
// ===== [틀] 몬스터 도우미 =====
export type MonsterId = keyof typeof MONSTERS;
export const isMonsterId = (v: string): v is MonsterId => Object.hasOwn(MONSTERS, v);
export const monsterDef = (id: MonsterId): MonsterDef => MONSTERS[id];

// ===== [이 게임] 보스 수치, 빈터의 몬스터, 몬스터 공통 수치 =====
/** 필드 보스의 규칙 (수치는 잠정값) */
export const BOSS = {
  /** 맞서는 사람이 한 명 늘 때마다 늘어나는 체력 (기본 체력에 대한 비율) */
  hpPerPlayer: 0.6,
  /** 이 인원까지만 체력에 반영한다 */
  maxScale: 10,
  /** 맞서는 사람으로 세는 조건: 보스에게서 이 거리(m) 안에 있고, 마지막으로 때린 지 이 시간(초)이 지나지 않았다 (보스가 지금 노리는 사람은 때리지 않아도 센다) */
  countRange: 36,
  countS: 20,
  /** 내려치기: 몇 초마다, 예고 시간, 범위, 피해 */
  slamEveryS: 8,
  slamWarnS: 1.2,
  slamRadius: 5,
  slamDmg: [28, 38] as readonly [number, number],
};

/** 빈터마다 사는 몬스터 */
export const CAMPS: readonly { x: number; z: number; types: readonly MonsterId[] }[] = [
  { ...CLEARINGS[0], types: ['slime', 'slime', 'slime', 'slime', 'slime'] },
  { ...CLEARINGS[1], types: ['wisp', 'wisp', 'wisp', 'wisp'] },
  { ...CLEARINGS[2], types: ['wolf', 'wolf', 'wolf'] },
  { ...CLEARINGS[3], types: ['wisp', 'wisp', 'wisp', 'wolf'] },
  { ...CLEARINGS[4], types: ['shade_bram'] },
  { ...CLEARINGS[5], types: ['shade_mira'] },
  // 잿빛 숲
  { ...CLEARINGS[6], types: ['boar', 'boar', 'boar', 'boar'] },
  { ...CLEARINGS[7], types: ['goblin', 'goblin', 'goblin', 'goblin', 'goblin'] },
  { ...CLEARINGS[8], types: ['lost_soldier', 'lost_soldier', 'lost_soldier', 'lost_soldier'] },
  { ...CLEARINGS[9], types: ['goblin', 'goblin', 'goblin', 'lost_soldier', 'lost_soldier'] },
  { ...CLEARINGS[10], types: ['boar', 'boar', 'boar', 'goblin', 'goblin'] },
  { ...CLEARINGS[11], types: ['ash_troll'] },
];

export const MONSTER_ATTACK_RANGE = 1.9;
export const MONSTER_ATTACK_CD = 1.6;
export const LEASH = 18; // 몬스터가 집에서 이만큼 멀어지면 돌아간다
export const RESPAWN_S = 8;
