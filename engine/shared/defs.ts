// 틀의 내용 통로: 틀의 코드는 내용을 여기서 읽는다.
//   - 틀의 타입과 도우미 (defs/*.ts): 아이템·몬스터·직업·장비의 모양, 게임의 표에서 값을 꺼내는 함수
//   - 게임의 내용 가운데 내용 계약(contract.ts)이 요구하는 것: 별칭 @game/shared/content에서 이름을 적어 다시 내보낸다
// 계약에 없는 이름은 여기로 나오지 않으므로 틀의 코드가 쓸 수 없다 (그 게임에만 있는 것은 그 게임의 통로가 따로 내보낸다: games/deungbul/shared/defs.ts).
// 틀이 게임의 내용을 새로 읽어야 하면 계약에 이름과 모양을 더하고 아래 목록에도 더한다 (두 목록이 같은지 engine/test/framework.test.ts가 견준다).
export * from './defs/combat';
export * from './defs/craft';
export * from './defs/dungeons';
export * from './defs/economy';
export * from './defs/growth';
export * from './defs/items';
export * from './defs/monsters';
export * from './defs/social';
// 맵 정의의 모양과 MAP에서 꺼낸 것(AREAS, GRID 등)은 world.ts가 다시 내보낸다. 여기서는 MAP만 내보낸다

export {
  // 맵
  MAP,
  // 직업과 기술
  CLASSES, DEFAULT_CLASS, SKILL_DEFS, SKILL_SLOTS, HP_PER_LEVEL, ATTACK_CD, COMBAT, SLOW_FACTOR, REJOIN_KEEP_S, GUEST_NAME,
  // 몬스터
  MONSTERS, CAMPS, MONSTER_ATTACK_RANGE, MONSTER_ATTACK_CD, LEASH, RESPAWN_S, MONSTER_AI, BOSS,
  // 아이템, 상점, 제작
  ITEMS, START_WEAPON, SHOPS, SHOP_STOCK, SHOP_REACH, POTION_MAX, POTION_CD, MAT_MAX, FORGES, SMITHY_REACH, RECIPES, DROPS,
  // 장비와 성장
  STATS, GEAR_SLOTS, RARITIES, GEAR, ENHANCE, SALVAGE, BAG_UP, BUILD_STATS, BUILD, LEVEL, POWER, MAIL_MAX, IDLE, DAILIES, ATTEND, RANK,
  // 던전
  DUNGEONS, PORTAL_REACH,
  // 사람들 사이의 것
  PARTY, CHANNEL, GUILD, MARKET,
  // 재화
  CURRENCIES,
  // 재화 흐름 지표
  ECON_CURS, ECON_MOVES, ECON_MOVE_PREFIXES, ECON_UNKNOWN, ECON_LOST_FULL, ECON_HUNT, ECON_LEVEL_MARKS, ECON_FRESH_DAYS, ECON_WATCH,
} from '@game/shared/content';
