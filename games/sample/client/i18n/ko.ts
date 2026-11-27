// 한국어: 이 게임의 내용의 이름(koNames)과 이 게임의 문장(koGame). 틀의 문장(koBase)과 합쳐 한 언어 묶음이 된다 (index.ts).
// 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다. 내용에 id를 더하고 이름을 빠뜨려도 컴파일되지 않는다.
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';

/** 틀의 문장이 쓰는 내용의 이름표. 두 번째 재화(currency2)는 쓰지 않으므로 적지 않는다 */
export const koNames: ContentNames = {
  monsters: { rabbit: '산토끼', boar: '멧돼지', bear: '불곰' },
  // bow: 활을 드는 직업(사냥꾼)에게 보이는 이름
  items: {
    axe1: { name: '손도끼', bow: '나무 활', info: '기본 무기' },
    axe2: { name: '벌목 도끼', bow: '사냥 활' },
    coat: { name: '털가죽 옷' },
    scale: { name: '쇠비늘 조끼' },
    stew: { name: '고기 스튜' },
    log: { name: '장작', info: '멧돼지와 불곰이 떨어뜨립니다. 모닥불에 넣습니다' },
  },
  classes: {
    woodcutter: { name: '나무꾼', info: '도끼를 들고 가까이 붙어 싸웁니다. 체력이 많습니다.' },
    hunter: { name: '사냥꾼', info: '멀리서 활을 쏩니다. 체력이 적습니다.' },
  },
  skills: {
    chop: { name: '내려찍기', info: '대상에게 큰 피해를 주고 1초 기절시킨다' },
    sweep: { name: '휘두르기', info: '주변 모두에게 피해' },
    aim: { name: '조준 사격', info: '멀리 있는 대상에게 큰 피해' },
    snare: { name: '덫 화살', info: '대상 주변 모두에게 피해를 주고 느리게 함' },
    rest: { name: '숨 고르기', info: '체력 회복' },
  },
  // 장비 칸, 등급, 능력치의 이름 (id는 내용의 GEAR_SLOTS, RARITIES, BUILD_STATS: 이 예제는 틀의 기본값을 그대로 쓴다)
  gearSlots: { weapon: '무기', armor: '갑옷', ring: '반지', amulet: '목걸이', charm: '부적' },
  rarities: { common: '평범한', uncommon: '쓸 만한', rare: '희귀한', epic: '빛나는' },
  buildStats: { pow: '힘', vit: '체력', luck: '행운' },
  dungeons: {},
  dailies: { kill20: '몬스터 20마리 잡기', feed5: '모닥불에 장작 5개 넣기' },
  places: { bonfire: '모닥불 앞' },
  nameA: ['졸린', '용감한', '느긋한', '배고픈', '조용한', '씩씩한'],
  nameB: ['너구리', '올빼미', '여우', '다람쥐', '오소리', '나그네'],
};

export const koGame = {
  ui: {
    // 틀의 뼈대가 쓰는 글 가운데 게임이 채우는 것: 제목, 직업 고르기 창의 소개와 안내, 조작 안내, 미니맵 범례
    title: '모닥불 사냥터',
    intro: '숲속 야영지의 사냥꾼이 됩니다. 짐승을 잡아 장작을 모으고, 모닥불을 지펴 함께 몸을 녹이세요.',
    classHint: '직업은 나중에 모닥불 곁에서 바꿀 수 있습니다.',
    hint: keyHints(['땅 클릭/WASD: 이동', '몬스터 클릭: 공격', '1–3: 기술', 'Q: 스튜', 'F: 장작 넣기', 'R: 자동 사냥', 'H: 모닥불로', 'B: 가방', 'M: 메뉴', 'N: 지도', 'Tab: 대상', 'Enter: 대화']),
    mapLegend: '■ 모닥불 · 초록 상인',
    // 틀의 기본 문장을 이 게임의 말로 덮어쓴 것
    goingTown: '모닥불로 걸어갑니다.',
    bagMats: '재료',
    bagPotions: '먹을 것',
    // 이 게임의 창
    bonfire: '모닥불',
    bonfireCold: '불이 꺼져 있습니다. 장작을 넣어 살리세요.',
    bonfireWarm: '불 곁에 있는 동안 체력이 빨리 찹니다.',
    feedOne: '장작 넣기[[ (F)|]]',
    feedAll: '전부 넣기',
    // 튜토리얼과 설정 칸 (client/tutorial.ts)
    tutBasics: '기본 조작',
    tutMove: '땅을 눌러[[ (또는 WASD로)|]] 걸어 보세요.',
    tutAttack: '짐승을 눌러 공격해 보세요.',
    tutMenu: '메뉴[[ (M)|]]를 열어 보세요. 설정 탭에서 소리와 그래픽을 바꿀 수 있습니다.',
    tutFire: '장작을 모아 모닥불에 넣으면 곁에 있는 모두의 체력이 빨리 찹니다. 즐겁게 사냥하세요!',
    setTags: '이름표 보이기',
    feedKey: '모닥불에 장작 넣기',
    // 약관·처리방침 (shared/content의 LEGAL이 가리키는 문장. 보기일 뿐이다)
    legalTermsText: '이용약관 (예제)\n\n1. 이 게임은 틀의 예제입니다. 진행은 예고 없이 초기화될 수 있습니다.\n2. 다른 사람에게 불쾌감을 주는 이름과 대화는 제한될 수 있습니다.\n3. 자동화 프로그램으로 플레이하지 않습니다.',
    legalPrivacyText: '개인정보 처리방침 (예제)\n\n모으는 것: 이 브라우저의 무작위 토큰의 해시(저장 키), 캐릭터 이름과 진행, 접속 주소(접속 제한과 차단에만, 저장하지 않음), 화면 오류(주소·토큰을 뺀 것).\n쓰는 곳: 게임 진행의 저장, 부정 이용 막기, 오류 고치기.\n권리: 설정 탭의 내 데이터에서 내려받거나 삭제를 요청할 수 있습니다. 삭제는 요청 7일 뒤에 실행됩니다.',
  },
  /** 값이 들어가는 화면 문구 */
  fmt: {
    heat: (heat: number, max: number) => `온기 ${heat} / ${max}`,
    logs: (have: number, fed: number) => `장작 ${have}개 · 지금까지 ${fed}개 넣음`,
    logsMini: (have: number) => `장작 ${have}`,
    // 틀의 문구를 덮어쓴 것: 물약 단추의 글 (이 게임의 물약은 스튜다)
    potions: (n: number) => `스튜 ${n}`,
  },
  /** 이 게임이 더한 안내문(shared/sample.ts의 MsgMap)과, 틀의 안내문 가운데 이 게임의 말로 덮어쓴 것 */
  msg: {
    fed: (a) => `모닥불에 장작 ${a[0]}개를 넣었습니다. 온기 ${a[1]}`,
    noLogs: () => '장작이 없습니다. 멧돼지나 불곰을 잡으면 얻습니다.',
    bonfireFar: () => '모닥불 가까이에서 넣을 수 있습니다.',
    bonfireLit: (a) => `${a[0]} 님이 모닥불을 살렸습니다. 곁에 있으면 체력이 빨리 찹니다.`,
    loot: () => '장작을 주웠습니다. 모닥불에 넣을 수 있습니다.',
    classFar: () => '직업은 모닥불 곁에서 바꿀 수 있습니다.',
    noPotion: () => '스튜가 없습니다. 상인에게서 살 수 있습니다.',
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
