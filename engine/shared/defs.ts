// 틀의 내용 통로: 틀의 코드는 내용을 여기서 읽는다.
//   - 틀의 타입과 도우미 (defs/*.ts): 아이템·몬스터·직업·장비의 모양, 게임의 표에서 값을 꺼내는 함수
//   - 내용 계약(contract.ts)의 이름: content.ts가 게임의 내용(@game/shared/content)에서 꺼내고, 게임이 적지 않은 이름은 기본값(defaults.ts)으로 채운 것
// 계약에 없는 이름은 여기로 나오지 않으므로 틀의 코드가 쓸 수 없다 (그 게임에만 있는 것은 그 게임의 통로가 따로 내보낸다: games/deungbul/shared/defs.ts).
// 틀이 게임의 내용을 새로 읽어야 하면 계약에 이름과 모양을, defaults.ts에 기본값을, content.ts와 아래 목록에 이름을 더한다 (목록들이 같은지 engine/test/boundary.test.ts가 견준다).
export * from './defs/collect';
export * from './defs/combat';
export * from './defs/craft';
export * from './defs/dungeons';
export * from './defs/economy';
export * from './defs/growth';
export * from './defs/herogrow';
export * from './defs/hud';
export * from './defs/items';
export * from './defs/monsters';
export * from './defs/social';
export * from './defs/teams';
export * from './defs/rooms';
export * from './defs/look';
export * from './defs/chardef';
export * from './defs/morph';
export * from './defs/live';
export * from './defs/legal';
export * from './defs/talk';
export * from './defs/odds';
export * from './defs/modes';
export * from './defs/livecontent';
// 맵 정의의 모양과 MAP에서 꺼낸 것(AREAS, GRID 등)은 world.ts가 다시 내보낸다. 여기서는 MAP만 내보낸다

export {
  // 핵심
  MAP, MODULES, NET, CAMERA, HOME_KEY, HUD,
  // 직업과 기술
  CLASSES, DEFAULT_CLASS, SKILL_DEFS, SKILL_SLOTS, HP_PER_LEVEL, ATTACK_CD, COMBAT, SLOW_FACTOR, REJOIN_KEEP_S, GUEST_NAME,
  // 몬스터
  MONSTERS, CAMPS, MONSTER_ATTACK_RANGE, MONSTER_ATTACK_CD, LEASH, RESPAWN_S, MONSTER_AI, BOSS,
  // 아이템, 상점, 제작
  ITEMS, START_WEAPON, SHOPS, SHOP_STOCK, SHOP_REACH, POTION_MAX, POTION_CD, MAT_MAX, FORGES, SMITHY_REACH, RECIPES, DROPS,
  // 장비와 성장
  STATS, GEAR_SLOTS, RARITIES, GEAR, ENHANCE, REFORGE, SALVAGE, BAG_UP, BUILD_STATS, BUILD, LEVEL, POWER, MAIL_MAX, IDLE, DAILIES, ATTEND, RANK,
  // 던전
  DUNGEONS, PORTAL_REACH,
  // 사람들 사이의 것
  PARTY, CHANNEL, GUILD, MARKET,
  // 팀
  TEAMS, TEAM_RULES,
  // 수집형·방치형
  HEROES, HERO_RARITIES, HERO_ROLES, HERO_RULES, BANNERS, GACHA_RULES, SQUAD_RULES, CHAPTERS, STAGE_RULES,
  // 재화
  CURRENCIES,
  // 겉모습의 부품, 캐릭터 정의, 변신
  LOOK_RULES, CHAR_RULES, MORPH_RULES,
  // 재화 흐름 지표
  ECON_CURS, ECON_MOVES, ECON_MOVE_PREFIXES, ECON_UNKNOWN, ECON_LOST_FULL, ECON_HUNT, ECON_LEVEL_MARKS, ECON_FRESH_DAYS, ECON_WATCH,
  // 운영의 바탕
  RESET, LIVE_KEYS, FLAGS,
  // 웹 출시의 바탕: 약관·처리방침, 개인정보 권리
  LEGAL, PRIVACY,
  // 사회와 안전: 대화 채널, 친구, 정해진 문장, 연령과 제한 모드
  CHAT_RULES, FRIENDS, QUICK_CHAT, AGE,
  // 확률과 재화의 투명성 (odds 모듈)
  ODDS,
  // 게임 안의 모드
  MODE_RULES,
  // 라이브 콘텐츠 (묶음 6)
  GOODS, EVENTS, SEASON, ACHIEVES, CODEX, COUPON, COMEBACK, MAIL_RULES,
} from './content';
