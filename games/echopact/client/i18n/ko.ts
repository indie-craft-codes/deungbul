// 한국어: 이 게임의 내용의 이름(koNames)과 이 게임의 문장(koGame). 틀의 문장(koBase)과 합쳐 한 언어 묶음이 된다 (index.ts).
// 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다.
import type { MsgArg, MsgKey } from '@engine/shared';
import { charName } from '@engine/shared/defs';
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';

/** 틀의 문장이 쓰는 내용의 이름표 */
export const koNames: ContentNames = {
  monsters: { mossling: '이끼둥이', thornboar: '가시멧돼지', stonehorn: '돌뿔소', wisp: '떠도는 울림', hollowkin: '빈껍데기', shadeshot: '그늘 사수', bellgolem: '종탑 골렘', echowarden: '메아리 수문장' },
  // bow: 활을 드는 직업(추적자)에게 보이는 이름
  items: {
    blade1: { name: '계약자의 검', bow: '계약자의 활', info: '처음 무기' },
    blade2: { name: '울림강 검', bow: '울림강 활' },
    jerkin: { name: '누빈 조끼' },
    chain: { name: '사슬 갑옷' },
    tonic: { name: '샘물 약' },
  },
  classes: {
    warden: { name: '파수꾼', info: '검을 들고 가까이 붙어 싸웁니다. 체력이 많습니다.' },
    seeker: { name: '추적자', info: '멀리서 활을 쏩니다. 체력이 적습니다.' },
  },
  skills: {
    cleave: { name: '가르기', info: '대상에게 큰 피해' },
    whirl: { name: '회오리 베기', info: '주변 모두에게 피해' },
    brace: { name: '버티기', info: '잠시 받는 피해를 줄인다' },
    pierce: { name: '꿰뚫기', info: '멀리 있는 대상에게 큰 피해' },
    snare: { name: '덫 화살', info: '대상 주변 모두에게 피해를 주고 느리게 함' },
    mend: { name: '숨 고르기', info: '체력 회복' },
    bash: { name: '방패 치기', info: '대상을 치고 1초 기절시킨다' },
    volley: { name: '화살 비', info: '대상 둘레에 화살을 쏟는다' },
    flare: { name: '울림 불꽃', info: '대상 둘레를 태운다' },
    chant: { name: '치유의 노래', info: '둘레의 아군을 회복' },
    rally: { name: '새벽의 외침', info: '둘레의 아군이 주는 피해 +25% (6초)' },
  },
  gearSlots: { weapon: '무기', armor: '갑옷', ring: '반지', amulet: '목걸이', charm: '부적' },
  rarities: { common: '평범한', uncommon: '쓸 만한', rare: '희귀한', epic: '빛나는' },
  buildStats: { pow: '힘', vit: '체력', luck: '행운' },
  dungeons: {},
  dailies: {
    kill30: '들판의 몬스터 30마리 잡기', stage5: '단계 5번 깨기', pull1: '울림 샘에서 1번 뽑기', morph1: '메아리로 1번 변신하기',
    kill2000: '몬스터 2000마리 잡기', stage150: '단계 150번 깨기',
  },
  places: { stage: '단계의 자리', well: '울림 샘 앞' },
  currency2: { name: '울림 조각', one: 'shard' },
  nameA: ['떠도는', '조용한', '씩씩한', '졸린', '반짝이는', '느긋한'],
  nameB: ['계약자', '나그네', '종지기', '길잡이', '사냥꾼', '수호자'],
};

/** 메아리의 이름·소개를 언어마다 (캐릭터 정의의 글은 한국어 하나다: 이 언어는 정의의 글을 그대로 쓰므로 비어 있다. client/echoes.ts) */
const charText: Readonly<Record<string, { name: string; bio: string }>> = {};

export const koGame = {
  /** 메아리(캐릭터 정의)의 이름과 소개: 없는 id는 정의의 글 그대로 */
  charText,
  ui: {
    title: '메아리 계약',
    intro: '울림골의 계약자가 됩니다. 들판에서 사냥하고, 울림 샘에서 옛 영웅의 메아리를 불러 함께 단계를 깨고, 그 메아리의 모습으로 변신하세요.',
    classHint: '직업은 나중에 울림 샘 곁에서 바꿀 수 있습니다.',
    hint: keyHints(['땅 클릭/WASD: 이동', '몬스터 클릭: 공격', '1–3: 기술', 'Q: 샘물 약', 'R: 자동 사냥', 'H: 울림 샘으로', 'B: 가방', 'M: 메뉴(뽑기·편성·단계·변신)', 'N: 지도', 'Tab: 대상', 'Enter: 대화']),
    mapLegend: '■ 울림 샘 · 초록 상인',
    goingTown: '울림 샘으로 걸어갑니다.',
    // 수집형의 이름 키: 역할·배너·장
    // 틀의 '영웅' 탭을 이 게임의 말로
    tabHeroes: '메아리',
    roleVanguard: '선봉', roleRanger: '사수', roleMystic: '비술', roleMender: '치유',
    bannerWell: '울림 샘', chapterPath: '속삭임 길', chapterRuins: '종소리 폐허', chapterSpire: '울림 첨탑',
    // 튜토리얼과 설정 칸 (client/tutorial.ts)
    tutPact: '계약의 첫걸음',
    tutMove: '땅을 눌러[[ (또는 WASD로)|]] 걸어 보세요.',
    tutAttack: '들판의 몬스터를 눌러 공격해 보세요. 들판의 몬스터는 울림 조각을 떨어뜨립니다.',
    tutMenu: '메뉴[[ (M)|]]를 열어 보세요. 뽑기·편성·단계·변신이 모두 여기 있습니다.',
    tutStage: '단계 탭에서 도전해 보세요. 편성한 메아리가 함께 싸우고, 처음 깨면 울림 조각을 많이 받습니다.',
    tutPull: '울림 조각 100개가 모이면 뽑기 탭에서 메아리를 불러 보세요. 확률은 \'확률 보기\'에 모두 공개됩니다.',
    tutMorph: '가진 메아리는 들판에서 변신으로도 쓸 수 있습니다. 변신 탭에서 바꿔 보세요. 다른 사람에게도 그 모습으로 보입니다.',
    setEchoTags: '이름표 보이기',
  },
  fmt: {
    potions: (n: number) => `샘물 약 ${n}`,
  },
  /** 틀의 안내문 가운데 이 게임의 말로 덮어쓴 것: 새 메아리를 얻으면 변신도 함께 얻는다는 것을 알린다 */
  msg: {
    charNew: (a) => `${charName(a[0])}: 들판에서 이 메아리로 변신할 수 있습니다.`,
    classFar: () => '직업은 울림 샘 곁에서 바꿀 수 있습니다.',
    noPotion: () => '샘물 약이 없습니다. 상인에게서 살 수 있습니다.',
  } satisfies Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
