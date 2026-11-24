// 이 게임(등불지기)의 경제 수치: 재화가 생기는 곳(수도꼭지)과 사라지는 곳(배수구)의 크기, 재화의 표와 한도를 한 파일에서 보고 고친다.
// 균형을 조정할 때 여는 파일이 이것 하나가 되게 한다 (설계: docs/economy.md 4-6의 (7)). 수치는 모두 잠정값이다.
//
// 예전 자리의 이름은 그대로 살아 있다: 통째로 옮긴 표(ENHANCE, IDLE, ATTEND, DAILIES, RECIPES, REST, CONTRIB_TIERS 등)는 옛 파일이 여기서 다시 내보내고,
// 다른 수치와 한 묶음에 섞여 있던 것(GEAR의 파는 값, BUILD의 골드, GUILD와 MARKET의 골드, ITEMS의 값, 던전과 습격의 보상)은
// 여기에 경제 쪽 조각을 두고 옛 묶음이 그 값을 읽는다. 그래서 틀과 화면, 도감, 시험은 전과 같은 이름으로 읽는다.
// 이 파일은 틀에서 타입만 가져오고, 내용의 다른 파일에서는 아무것도 가져오지 않는다 (다른 내용 파일이 이 파일의 값을 읽는다: 초기화 순서).
// 모양(CurrencyDef, EconCur)과 셈(marketFee, sellPrice, guildLevel, isEconMove 등)은 틀에 있다: engine/shared/defs/의 economy.ts, growth.ts, social.ts
//
// ---- 색인: 여기로 옮기지 않은 경제 수치가 있는 곳 ----
// 정의의 표에 한 줄씩 박혀 있는 편이 읽기 좋은 것은 옮기지 않았다. 수급의 크기를 바꾸려면 아래도 본다.
//   몬스터별 처치 보상 (골드·불씨의 범위, 경험치)    content/monsters.ts의 MONSTERS (gold, sparks, exp). 되살아나는 시간 RESPAWN_S와 보스의 respawn도 시간당 수급을 정한다
//   몬스터별 재료 드롭 확률                          content/craft.ts의 DROPS
//   떨어지는 장비의 등급 비중과 옵션 값               content/growth.ts의 RARITIES (weight, opts, mult), GEAR (optMin, optSpan, optPerLevel, levelOf)
//   던전이 끝날 때 주는 장비의 등급·레벨, 입장 레벨    content/dungeons.ts의 DUNGEONS (dropRar, dropLv, minLv)
//   메인 퀘스트의 단계별 보상 (경험치, 불씨)          content/quests.ts의 QUESTS (reward)
//   주민을 되돌리는 데 드는 불씨                      content/residents.ts의 RESIDENTS (need)
//   등탑 밝기의 상한 (불씨를 받아 주는 한도)           content/tower.ts의 GLOW_MAX
//   레벨 업에 필요한 경험치                           content/growth.ts의 LEVEL (firstNeed, growth)
//   길드와 거래소의 골드가 아닌 규칙 (인원, 올려 두는 수와 기간, 쓸 수 있는 레벨)   content/social.ts의 GUILD, MARKET
//   자리 비움 사냥의 하루 한도 (8시간)                 틀의 engine/shared/auto.ts의 AWAY.maxS (아직 틀에 있는 수치다)
//   저장을 읽을 때의 안전 범위 (레벨 999, 필요 경험치 1e9, 우편 한 통의 보상 1e7, 길드 기부 누계 1e12)   틀의 engine/server/game/systems/의 players.ts, mail.ts, guild.ts. 균형의 손잡이가 아니라 깨진 저장을 막는 값이다
import type { Recipe } from '@engine/shared/defs/craft';
import type { CurrencyDef } from '@engine/shared/defs/economy';
import type { DailyDef, Reward } from '@engine/shared/defs/growth';

// ====================================================================================================
// 1. 재화의 표와 한도
// ====================================================================================================
/**
 * 재화: 캐릭터가 수로 가지는 것. 장비(낱개)와 아이템(재료, 물약)은 재화가 아니다.
 * 틀의 지갑(engine/server/game/systems/wallet.ts)과 장부가 이 표를 읽는다. 틀이 아는 칸은 골드(첫 번째 재화), 불씨(두 번째 재화), 경험치 셋이다.
 * label: 언어 파일에서 이 재화의 이름이 있는 칸 (ContentNames). 골드와 경험치의 이름은 아직 틀의 문장에 낱말로 박혀 있어 칸이 없다.
 * tradable: 사람 사이를 건너갈 수 있는가. 골드는 거래소의 값으로 건너가고, 불씨와 경험치는 번 사람에게 묶인다.
 * max: 가질 수 있는 상한. 저장을 읽을 때의 범위(engine/server/game/systems/players.ts의 spawn)와 같은 값이다. 없으면 한도가 없다
 */
export const CURRENCIES = {
  gold: { tradable: true, max: 1e9 },
  sparks: { label: 'currency2', tradable: false, max: 1e9 },
  // 경험치는 레벨이 오를 때마다 덜어 내므로 쌓이는 상한이 없다
  exp: { tradable: false },
} as const satisfies Record<string, CurrencyDef>;

/** 물약은 종류마다 이만큼까지 들 수 있다 */
export const POTION_MAX = 10;
/** 재료는 종류마다 이만큼까지 들 수 있다. 넘는 드롭은 버려지고, 우편과 거래소에서 받는 것은 넘는 만큼 우편에 남는다 */
export const MAT_MAX = 99;

// ====================================================================================================
// 2. 수도꼭지: 재화와 물건이 생기는 곳
// ====================================================================================================
// 가장 큰 수도꼭지는 사냥이다: 몬스터별 처치 보상은 content/monsters.ts의 MONSTERS에 있다 (위 색인).

/** 장비: 떨어지는 확률, 가방의 크기, 상점에 파는 값. content/growth.ts의 GEAR가 이 값을 읽는다 */
export const GEAR_ECON = {
  /** 몬스터 한 마리가 장비를 떨어뜨릴 확률 (보스는 반드시) */
  dropChance: 0.06,
  /** 가방에 넣어 둘 수 있는 수 (낀 것 포함). 가득 차면 떨어진 장비가 버려진다 */
  bagMax: 30,
  /** 파는 값 = sellBase + 값어치(gearScore) + 바탕의 등급 × sellPerTier. 셈은 틀의 sellPrice */
  sellBase: 5,
  sellPerTier: 10,
};

/** 방치 보상: 접속하지 않은 시간만큼 쌓여 돌아오면 우편으로 온다 (engine/server/game/systems/idle.ts) */
export const IDLE = {
  /** 이보다 짧게 비웠으면 보상이 없다(분) */
  minMin: 10,
  /** 이보다 오래 비워도 더 쌓이지 않는다(분) */
  maxMin: 480,
  reward: (minutes: number, lv: number): Reward => ({
    gold: Math.round(minutes * (1 + lv * 0.2)),
    exp: Math.round(minutes * (2 + lv)),
    sparks: Math.floor(minutes / 20),
  }),
};

/** 일일 임무: 종류(kind), 채울 수(n), 채우면 우편으로 오는 보상(r) */
export const DAILIES = {
  kill30: { kind: 'kill', n: 30, r: { gold: 60, exp: 150 } },
  offer10: { kind: 'offer', n: 10, r: { gold: 40, exp: 100 } },
  enhance1: { kind: 'enhance', n: 1, r: { gold: 50 } },
} as const satisfies Record<string, DailyDef>;

/** 출석 보상: 이어서 접속한 날 수(1~7)마다. 7일을 채우면 다시 1일째부터 */
export const ATTEND: readonly Reward[] = [
  { gold: 30 }, { gold: 40 }, { gold: 50, sparks: 5 }, { gold: 60 }, { gold: 80 }, { gold: 100, sparks: 10 }, { gold: 200, sparks: 20 },
];

/**
 * 등불 맡기기: 접속을 끊으면 등불이 등탑에 걸리고, 쉬는 동안 휴식 보너스가 쌓인다.
 * 다음에 몬스터를 잡을 때 쌓인 만큼 경험치를 더 받는다 (한 마리당 그 몬스터의 경험치만큼, 즉 2배). 쌓이는 식은 content/items.ts의 restGain
 */
export const REST = {
  /** 이보다 짧게 쉬면 쌓이지 않는다(분) */
  minMin: 10,
  /** 시간당 쌓이는 보너스 경험치 */
  expPerHour: 40,
  /** 쌓이는 한도 (8시간분) */
  cap: 320,
};

/** 던전: 끝냈을 때 각자 우편으로 받는 보상과 하루에 들어갈 수 있는 횟수. content/dungeons.ts의 DUNGEONS가 이 값을 읽는다 */
export const DUNGEON_ECON = {
  crypt: { reward: { gold: 300, exp: 600, sparks: 15 }, perDay: 3 },
} as const;

/** 습격을 막아 냈을 때 맞서 싸운 사람 각자가 받는 보상. content/raid.ts의 RAID가 이 값을 읽는다 (하루에 열리는 횟수는 RAID.hours) */
export const RAID_REWARD = { sparks: 5, exp: 40 };

/**
 * 기여 단계: 지금까지 바친 불씨가 need에 닿으면 한 번씩 보상을 받는다.
 * 등탑지기 할멈이 돌아온 뒤에 열리고, 그 전에 바친 것도 인정된다.
 */
export const CONTRIB_TIERS: readonly { need: number; gold: number }[] = [
  { need: 10, gold: 30 },
  { need: 30, gold: 60 },
  { need: 60, gold: 120 },
  { need: 100, gold: 200 },
  { need: 200, gold: 400 },
];

// ====================================================================================================
// 3. 배수구: 재화가 사라지는 곳
// ====================================================================================================
/** 장비 강화: 한도, 단계마다 늘어나는 값, 성공 확률, 드는 골드 */
export const ENHANCE = {
  max: 10,
  /** 보급형(상점에서 산 옵션 없는 장비)은 여기까지만 강화된다 */
  supplyMax: 5,
  /** 강화 단계마다 옵션 값이 이만큼 커진다 */
  perPlus: 0.1,
  /** 지금 단계에서 다음으로 갈 때의 성공 확률. 실패해도 잃는 것은 골드뿐이다 */
  rate: (plus: number): number => Math.max(0.2, 1 - plus * 0.1),
  gold: (plus: number, rar: number): number => 30 * (plus + 1) * (rar + 1),
};

/** 능력치와 기술에 드는 골드. content/growth.ts의 BUILD가 이 값을 읽는다 */
export const BUILD_COST = {
  /** 찍은 점수를 모두 돌려받는 값 */
  resetGold: (lv: number): number => 30 * lv,
  /** 기술을 지금 단계(lv)에서 다음으로 올리는 데 드는 골드 */
  skillGold: (lv: number): number => 80 * lv * lv,
};

/** 길드에 드는 골드와 그 대가. content/social.ts의 GUILD가 이 값을 읽는다 */
export const GUILD_ECON = {
  /** 만드는 데 드는 골드 */
  createGold: 500,
  /** 길드 레벨 하나에 필요한 기부(골드)와 가장 높은 레벨 */
  expPerGuildLevel: 2000,
  maxLevel: 10,
  /** 길드 레벨 하나마다 길드원이 더 받는 처치 경험치 (비율) */
  expPerLevel: 0.02,
  /** 한 번에 기부하는 단위 (화면의 단추) */
  gives: [100, 1000] as readonly number[],
};

/** 거래소의 값과 수수료. content/social.ts의 MARKET이 이 값을 읽는다 */
export const MARKET_ECON = {
  /** 값의 한도(골드). 값은 minPrice 이상 이 값 이하의 정수다 */
  maxPrice: 1_000_000,
  /** 가장 싼 값. 수수료가 적어도 1골드라서 1골드짜리는 팔아도 남는 것이 없다 */
  minPrice: 2,
  /** 팔린 값에서 떼는 수수료 (비율, 올림: 틀의 marketFee). 뗀 골드는 사라진다 */
  tax: 0.05,
};

/** 상점의 값(골드). content/items.ts의 ITEMS가 이 값을 읽는다. 여기 없는 아이템(처음 든 무기, 제작으로만 얻는 것, 재료)은 값이 0이고 상점에서 팔지 않는다 */
export const PRICES = {
  sword2: 60,
  sword3: 180,
  armor1: 80,
  armor2: 240,
  potion: 15,
  tonic: 35,
} as const;

/** 제작에 드는 골드와 재료 */
export const RECIPES: readonly Recipe[] = [
  // 등불검은 상점에서 골드로 살 수도 있다. 재료를 모으면 훨씬 싸다
  { id: 'sword3', gold: 40, mats: { iron: 4, hide: 2 } },
  // 쇠 갑옷도 재료를 모으면 싸게 만든다
  { id: 'armor2', gold: 60, mats: { iron: 5, hide: 6 } },
  // 잿불검은 제작으로만 얻는다. 잿빛 핵은 필드 보스가 준다
  { id: 'sword4', gold: 100, mats: { iron: 8, hide: 5, ashcore: 1 } },
];

/** 이미 가장 밝은 등탑이 한 번에 받는 불씨: 밝기는 오르지 않지만 기여와 퀘스트에는 세어진다. '전부'로 불씨를 몽땅 태우지 않게 적게 받는다 */
export const FULL_TOWER_OFFER = 5;

// ====================================================================================================
// 4. 재화 흐름 지표(경제 장부)의 내용: 무엇을 어떤 원인으로 적을지와, 지표를 읽을 때의 판단 기준
// ====================================================================================================
// 장부의 틀(engine/server/game/systems/ledger.ts)은 이 게임의 낱말을 모르고 여기만 본다. 보는 도구는 scripts/econ.ts(npm run econ)다.

/** 장부가 적는 재화. 장비는 `gear:등급`, 재료와 물약은 `item:아이템 id`로 따로 적힌다 */
export const ECON_CURS = ['gold', 'sparks', 'exp'] as const satisfies readonly (keyof typeof CURRENCIES)[];

/**
 * 이 게임의 규칙이 재화를 주고받을 때 지갑(g.wallet)에 넘기는 원인의 이름. 장부에 이 이름으로 적힌다:
 * 퀘스트 단계 보상(quests.ts), 습격을 막은 보상(raid.ts), 기여 단계 보상(keepers.ts), 불씨 바치기(tower.ts의 offer 명령).
 * 틀의 시스템이 넘기는 이름은 틀에 있다 (engine/server/game/systems/wallet.ts의 WHY와 mailWhy: cmd:buy, cmd:enhance, mail:종류 등. 사냥은 아래 ECON_HUNT).
 * 운영에 쌓인 자료(econ_daily의 why)와 이어지도록 한 번 쓴 이름은 바꾸지 않는다. 새 원인은 새 이름으로 더한다
 */
export const ECON_WHY = { quest: 'quest', raid: 'raid', tier: 'tier', offer: 'cmd:offer' } as const;

/**
 * 생성도 소멸도 아닌 이동: 사람 사이를 건너가는 골드는 원인의 이름을 바꿔 적는다.
 * 거래소에서 사는 사람이 낸 값(market:out)과 파는 사람이 우편으로 받은 값(market:in)의 차이가 수수료, 곧 진짜 소멸이다
 * (아직 받지 않은 판 값 우편도 그 차이에 들어 있다).
 */
export const ECON_MOVES: readonly { cur: string; why: string; dir: '+' | '-'; as: string }[] = [
  { cur: 'gold', why: 'cmd:market:buy', dir: '-', as: 'market:out' },
  { cur: 'gold', why: 'mail:marketSold', dir: '+', as: 'market:in' },
];
/** 이 머리말로 시작하는 원인은 이동이다 (거래소에 올리고 사고 돌려받는 물건 포함). 생성·소멸의 합계에서는 빼고 따로 보여 준다 */
export const ECON_MOVE_PREFIXES: readonly string[] = ['market:', 'cmd:market:', 'mail:market'];

/** 원인을 가리지 못한 변화가 적히는 칸: 틱 안에서 생긴 것(tick)과 그 밖(other). 이 칸이 크면 빠뜨린 통로나 재화 복사 버그가 있다는 뜻이다 */
export const ECON_UNKNOWN: readonly string[] = ['other', 'tick'];
/** 가방이 가득 차 버려진 장비가 적히는 원인 */
export const ECON_LOST_FULL = 'lostFull';
/** 사냥으로 번 것의 원인: 접속 중, 자리 비움 사냥 중(서버가 대신 사냥), 던전 인스턴스 안(끝낸 보상으로 받는 장비 포함) */
export const ECON_HUNT = { live: 'hunt', away: 'huntAway', inst: 'huntDungeon' } as const;

/** 캐릭터별 기록에 '처음 닿은 플레이 시간'을 남기는 레벨 */
export const ECON_LEVEL_MARKS: readonly number[] = [5, 10, 20];
/** 분포 스냅샷이 '새로 온 사람'으로 보는 기간(일) */
export const ECON_FRESH_DAYS = 7;

/**
 * 지표를 읽는 판단 기준. 모두 임시값이다: 실제 자료가 쌓이면 여기서 고친다.
 * min/max는 정상 범위의 끝이고, 벗어나면 `npm run econ`이 '주의'로 표시한다.
 */
export const ECON_WATCH = {
  /** 골드 소멸 ÷ 생성 (최근 7일). 1보다 한참 낮으면 골드가 쌓이기만 한다 */
  sinkRatio: { min: 0.7, max: 1.0 },
  /** 보유 일수 = 보유 골드의 중간값 ÷ 하루 수입의 중간값. 길수록 쓸 곳이 없다는 뜻이다 */
  holdDays: { max: 7 },
  /** 상위 10% 경계 ÷ 중간값. 클수록 골드가 한쪽에 몰려 있다 */
  topRatio: { max: 10 },
  /** 생성된 골드 가운데 자리 비움 사냥이 번 몫 */
  awayShare: { max: 0.35 },
  /** 낀 장비 가운데 강화가 끝(+10)인 것의 비율. 높으면 강화가 더는 골드를 태우지 못한다 */
  maxEnhShare: { max: 0.3 },
  /** 원인을 가리지 못한 변화(other, tick)가 전체 흐름에서 차지하는 몫 */
  unknownShare: { max: 0.01 },
  /** 활동 캐릭터가 이보다 적으면 표본이 적어 참고만 한다 */
  minSample: 30,
} as const;
