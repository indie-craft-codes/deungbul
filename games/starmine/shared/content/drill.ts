// 이 게임(별가루 광산)에만 있는 내용: 별빛 채굴기와 별빛 각인의 수치. 계약(index.ts)에 없으므로 틀은 읽지 않고, 이 게임의 서버와 화면만 읽는다.
//   채굴기: 골드로 짓고 올린다. 레벨마다 1분에 별가루를 캐어 저장고에 쌓는다(접속 중이든 자리를 비웠든). 저장고는 가득 차면 더 쌓이지 않는다.
//   각인: 모은 별가루를 써서 주는 피해를 올린다.
export const DRILL = {
  /** 광산 입구(채굴기가 서 있는 곳). 쓰러지면 이 앞에서 일어난다 */
  x: 0, z: -6, r: 1.6,
  /** 채굴기의 가장 높은 레벨 */
  maxLv: 10,
  /** 레벨 lv(1~)의 1분 생산량 (별가루) */
  rate: (lv: number): number => (lv <= 0 ? 0 : 2 * lv + Math.floor(lv * lv / 4)),
  /** 저장고의 크기: 이만큼 분 동안 캔 양까지 쌓인다 */
  capMin: 120,
  /** 레벨 lv → lv + 1에 드는 골드 (0 → 1이 짓기) */
  cost: (lv: number): number => Math.round(40 * Math.pow(1.8, lv)),
};
/** 저장고의 크기 (별가루) */
export const drillCap = (lv: number): number => DRILL.rate(lv) * DRILL.capMin;

export const ENGRAVE = {
  maxLv: 10,
  /** 레벨 하나에 주는 피해 +5% */
  per: 0.05,
  /** 레벨 lv → lv + 1에 드는 별가루 */
  cost: (lv: number): number => 30 + 30 * lv,
};
