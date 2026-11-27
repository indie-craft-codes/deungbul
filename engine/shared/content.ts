// 틀이 게임의 내용을 읽는 단 하나의 자리: 별칭 @game/shared/content에서 내용 계약(contract.ts)의 이름을 꺼낸다.
// 게임이 적지 않은 이름은 틀의 기본값(defaults.ts)으로 채운다: 핵심 계약(MAP, MODULES)만 적은 게임도 컴파일되고 돈다.
// 이름의 타입은 게임이 적었으면 게임이 적은 그대로(아이템 id 같은 좁은 타입이 살아 있다), 적지 않았으면 기본값의 타입이다.
// 틀의 다른 파일은 이 파일을 직접 읽지 않고 통로(defs.ts, world.ts)를 거친다. 이 파일과 contract.ts 말고는 틀의 어느 파일도 @game을 import하지 않는다 (engine/test/boundary.test.ts).
import * as game from '@game/shared/content';
import * as D from './defaults';

type G = typeof game;
type Defaults = typeof D;
/** 게임이 그 이름을 내보냈으면 게임의 타입, 아니면 기본값의 타입 */
type Of<K extends keyof Defaults> = K extends keyof G ? G[K] : Defaults[K];
// 이름을 글자로 꺼낸다(동적 접근): 번들러가 '없는 export'를 경고하지 않고, 없는 이름은 undefined로 읽힌다
const all: Readonly<Record<string, unknown>> = game;
const defs: Readonly<Record<string, unknown>> = D;
function get<K extends keyof Defaults>(name: K): Of<K> {
  const v = all[name];
  return (v === undefined ? defs[name] : v) as Of<K>;
}

// ---------- 핵심 (게임이 반드시 적는다) ----------
export const MAP = game.MAP;
export const MODULES = game.MODULES;
// ---------- 핵심의 수치 (기본값이 있다) ----------
export const GUEST_NAME = get('GUEST_NAME');
export const NET = get('NET');
export const CHANNEL = get('CHANNEL');
export const REJOIN_KEEP_S = get('REJOIN_KEEP_S');
export const CAMERA = get('CAMERA');
export const HOME_KEY = get('HOME_KEY');
export const HUD = get('HUD');
// ---------- 직업과 전투 ----------
export const CLASSES = get('CLASSES');
export const DEFAULT_CLASS = get('DEFAULT_CLASS');
export const SKILL_DEFS = get('SKILL_DEFS');
export const SKILL_SLOTS = get('SKILL_SLOTS');
export const HP_PER_LEVEL = get('HP_PER_LEVEL');
export const ATTACK_CD = get('ATTACK_CD');
export const COMBAT = get('COMBAT');
export const SLOW_FACTOR = get('SLOW_FACTOR');
// ---------- 몬스터 ----------
export const MONSTERS = get('MONSTERS');
export const CAMPS = get('CAMPS');
export const MONSTER_ATTACK_RANGE = get('MONSTER_ATTACK_RANGE');
export const MONSTER_ATTACK_CD = get('MONSTER_ATTACK_CD');
export const LEASH = get('LEASH');
export const RESPAWN_S = get('RESPAWN_S');
export const MONSTER_AI = get('MONSTER_AI');
export const BOSS = get('BOSS');
// ---------- 아이템, 상점, 제작 ----------
export const ITEMS = get('ITEMS');
export const START_WEAPON = get('START_WEAPON');
export const SHOPS = get('SHOPS');
export const SHOP_STOCK = get('SHOP_STOCK');
export const SHOP_REACH = get('SHOP_REACH');
export const POTION_MAX = get('POTION_MAX');
export const POTION_CD = get('POTION_CD');
export const MAT_MAX = get('MAT_MAX');
export const FORGES = get('FORGES');
export const SMITHY_REACH = get('SMITHY_REACH');
export const RECIPES = get('RECIPES');
export const DROPS = get('DROPS');
// ---------- 장비와 성장 ----------
export const STATS = get('STATS');
export const GEAR_SLOTS = get('GEAR_SLOTS');
export const RARITIES = get('RARITIES');
export const GEAR = get('GEAR');
export const ENHANCE = get('ENHANCE');
export const REFORGE = get('REFORGE');
export const SALVAGE = get('SALVAGE');
export const BAG_UP = get('BAG_UP');
export const BUILD_STATS = get('BUILD_STATS');
export const BUILD = get('BUILD');
export const LEVEL = get('LEVEL');
export const POWER = get('POWER');
export const MAIL_MAX = get('MAIL_MAX');
export const IDLE = get('IDLE');
export const DAILIES = get('DAILIES');
export const ATTEND = get('ATTEND');
export const RANK = get('RANK');
// ---------- 던전 ----------
export const DUNGEONS = get('DUNGEONS');
export const PORTAL_REACH = get('PORTAL_REACH');
// ---------- 사람들 사이의 것 ----------
export const PARTY = get('PARTY');
export const GUILD = get('GUILD');
export const MARKET = get('MARKET');
// ---------- 재화와 경제 장부 ----------
export const CURRENCIES = get('CURRENCIES');
export const ECON_CURS = get('ECON_CURS');
export const ECON_MOVES = get('ECON_MOVES');
export const ECON_MOVE_PREFIXES = get('ECON_MOVE_PREFIXES');
export const ECON_UNKNOWN = get('ECON_UNKNOWN');
export const ECON_LOST_FULL = get('ECON_LOST_FULL');
export const ECON_HUNT = get('ECON_HUNT');
export const ECON_LEVEL_MARKS = get('ECON_LEVEL_MARKS');
export const ECON_FRESH_DAYS = get('ECON_FRESH_DAYS');
export const ECON_WATCH = get('ECON_WATCH');
// ---------- 팀 ----------
export const TEAMS = get('TEAMS');
export const TEAM_RULES = get('TEAM_RULES');
// ---------- 수집형·방치형 ----------
export const HEROES = get('HEROES');
export const HERO_RARITIES = get('HERO_RARITIES');
export const HERO_ROLES = get('HERO_ROLES');
export const HERO_RULES = get('HERO_RULES');
export const BANNERS = get('BANNERS');
export const GACHA_RULES = get('GACHA_RULES');
export const SQUAD_RULES = get('SQUAD_RULES');
export const CHAPTERS = get('CHAPTERS');
export const STAGE_RULES = get('STAGE_RULES');
// ---------- 겉모습의 부품, 캐릭터 정의, 변신 ----------
export const LOOK_RULES = get('LOOK_RULES');
export const CHAR_RULES = get('CHAR_RULES');
export const MORPH_RULES = get('MORPH_RULES');
// ---------- 운영의 바탕 (시계, 원격 설정, 기능 깃발) ----------
export const RESET = get('RESET');
export const LIVE_KEYS = get('LIVE_KEYS');
export const FLAGS = get('FLAGS');
