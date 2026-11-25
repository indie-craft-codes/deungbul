// 한국어: 이 게임의 내용의 이름(koNames)과 이 게임의 문장(koGame). 틀의 문장(koBase)과 합쳐 한 언어 묶음이 된다 (index.ts).
// 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다.
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';

export const koNames: ContentNames = {
  monsters: { snail: '수정 달팽이', bat: '굴박쥐', pebble: '조약돌 정령', golem: '바위 골렘' },
  // staff: 지팡이를 드는 직업(별점술사)에게 보이는 이름
  items: {
    pick1: { name: '낡은 곡괭이', staff: '자작나무 지팡이', info: '기본 무기' },
    pick2: { name: '별철 곡괭이', staff: '별철 지팡이' },
    apron: { name: '가죽 앞치마' },
    tea: { name: '이끼차' },
  },
  classes: {
    miner: { name: '광부', info: '곡괭이로 가까이 붙어 싸웁니다. 체력이 많고 단단해집니다.' },
    seer: { name: '별점술사', info: '멀리서 별빛을 떨어뜨립니다. 지속 피해와 회복을 씁니다.' },
  },
  skills: {
    smash: { name: '곡괭이 내려치기', info: '대상에게 큰 피해를 주고 1초 기절시킨다' },
    tunnel: { name: '굴 파고 돌진', info: '대상 앞까지 단숨에 파고들어 피해' },
    stoneskin: { name: '돌 피부', info: '8초 동안 받는 피해 35% 감소' },
    starfall: { name: '별똥 떨구기', info: '대상 둘레 모두에게 피해를 주고 느리게 함' },
    dust: { name: '별가루 독', info: '대상 둘레 모두에게 5초 동안 지속 피해' },
    mend: { name: '별빛 치유', info: '체력 회복' },
  },
  gearSlots: { weapon: '무기', armor: '갑옷', ring: '반지', amulet: '목걸이', charm: '부적' },
  rarities: { common: '평범한', uncommon: '쓸 만한', rare: '희귀한', epic: '빛나는' },
  buildStats: { pow: '힘', vit: '체력', luck: '행운' },
  dungeons: {},
  dailies: { kill20: '몬스터 20마리 잡기', collect3: '채굴기에서 별가루 3번 거두기' },
  places: { mine: '광산 입구' },
  currency2: { name: '별가루', one: 'stardust' },
  nameA: ['반짝이는', '졸린', '튼튼한', '꼼꼼한', '느긋한', '용감한'],
  nameB: ['두더지', '광부', '박새', '오소리', '수달', '길잡이'],
};

export const koGame = {
  ui: {
    title: '별가루 광산',
    intro: '밤하늘에서 떨어진 별가루가 묻힌 골짜기. 캐릭터는 알아서 사냥하고, 당신은 채굴기와 각인을 올려 더 빨리 강해지세요.',
    classHint: '직업은 나중에 바꿀 수 있습니다. 자동 사냥은 처음부터 켜져 있습니다.',
    hint: keyHints(['땅 클릭/WASD: 이동', '몬스터 클릭: 공격', '1–3: 기술', 'Q: 이끼차', 'G: 별가루 거두기', 'R: 자동 사냥', 'H: 광산 입구로', 'B: 가방', 'M: 메뉴', 'N: 지도', 'Tab: 대상', 'Enter: 대화']),
    mapLegend: '■ 광산 입구 · 초록 상인',
    goingTown: '광산 입구로 걸어갑니다.',
    bagPotions: '마실 것',
    // 이 게임의 창
    drill: '별빛 채굴기',
    drillNone: '아직 채굴기가 없습니다. 골드로 지으면 별가루가 저절로 쌓입니다.',
    drillTake: '거두기[[ (G)|]]',
    drillMaxed: '채굴기가 가장 높은 레벨입니다',
    engraveMaxed: '각인이 가장 높은 레벨입니다',
    mine: '광산 입구',
    mineInfo: '별빛 채굴기가 서 있는 곳. 쓰러지면 여기서 일어납니다.',
    deepVein: '깊은 광맥',
  },
  fmt: {
    drillLv: (lv: number) => (lv > 0 ? `Lv ${lv}` : '없음'),
    drillRate: (rate: number) => `별가루 ${rate}/분 · 자리를 비워도`,
    drillStash: (n: number, cap: number) => `저장고 ${n} / ${cap}`,
    drillBuild: (cost: number) => `짓기 · ${cost}골드`,
    drillUpBtn: (cost: number, next: number) => `올리기 ${cost}골드 → ${next}/분`,
    engraveBtn: (lv: number, cost: number) => `각인 Lv ${lv} → ${lv + 1} · 별가루 ${cost}`,
    engraveNote: (pct: number) => `별빛 각인: 주는 피해 +${pct}%`,
    potions: (n: number) => `이끼차 ${n}`,
  },
  msg: {
    drillUp: (a) => (a[0] === 1 ? '별빛 채굴기를 지었습니다. 이제 별가루가 저절로 쌓입니다.' : `채굴기가 Lv ${a[0]}이 되었습니다.`),
    drillPoor: (a) => `골드가 모자랍니다 (${a[0]}골드 필요).`,
    drillMax: () => '채굴기가 이미 가장 높은 레벨입니다.',
    drillTook: (a) => `별가루 ${a[0]}을 거뒀습니다.`,
    drillEmpty: () => '저장고가 비어 있습니다.',
    drillAway: (a) => `나가 있던 ${a[1]}분 동안 채굴기가 별가루 ${a[0]}을 캤습니다.`,
    engraveUp: (a) => `별빛 각인 Lv ${a[0]}: 주는 피해가 올랐습니다.`,
    engravePoor: (a) => `별가루가 모자랍니다 (${a[0]} 필요).`,
    engraveMax: () => '각인이 이미 가장 높은 레벨입니다.',
    noPotion: () => '이끼차가 없습니다. 상인에게서 살 수 있습니다.',
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
