// 한국어: 이 게임의 내용의 이름(koNames)과 이 게임의 문장(koGame). 틀의 문장(koBase)과 합쳐 한 언어 묶음이 된다 (index.ts).
// 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다.
import type { MsgArg, MsgKey } from '@engine/shared';
import { ENHANCE, charName } from '@engine/shared/defs';

/** 강화에 울림 가루가 들기 시작하는 단계 (shared/content/gear.ts의 ENHANCE.dust에서) */
export const DUST_FROM = Array.from({ length: ENHANCE.max }, (_, i) => i).find((n) => ENHANCE.dust(n, 0) > 0) ?? ENHANCE.max;
import { keyHints } from '@engine/client/i18n/ko';
import type { ContentNames } from '@engine/client/i18n/names';

/** 틀의 문장이 쓰는 내용의 이름표 */
export const koNames: ContentNames = {
  monsters: { mossling: '이끼둥이', thornboar: '가시멧돼지', stonehorn: '돌뿔소', wisp: '떠도는 울림', hollowkin: '빈껍데기', shadeshot: '그늘 사수', bellgolem: '종탑 골렘', echowarden: '메아리 수문장', chimeling: '울림쇠', dirgecaster: '만가 술사', mirrorshade: '거울 그림자', knellwraith: '조종 망령', pactsovereign: '계약의 군주' },
  // bow: 활을 드는 직업(추적자)에게 보이는 이름
  items: {
    blade1: { name: '계약자의 검', bow: '계약자의 활', info: '처음 무기' },
    blade2: { name: '울림강 검', bow: '울림강 활' },
    jerkin: { name: '누빈 조끼' },
    chain: { name: '사슬 갑옷' },
    tonic: { name: '샘물 약' },
    // 울림골의 몬스터만 떨어뜨리는 장비와, 분해하면 나오는 가루 (shared/content/gear.ts)
    valeblade: { name: '울림골 검', bow: '울림골 활' },
    hornblade: { name: '돌뿔 검', bow: '돌뿔 활' },
    valecoat: { name: '울림골 외투' },
    hornmail: { name: '돌뿔 갑옷' },
    echodust: { name: '울림 가루', info: '울림골 장비를 분해하면 나옵니다. +5부터의 강화에 씁니다.' },
    echoCrystal: { name: '메아리 결정', info: '다 키운 메아리의 넘친 조각. 결정 상점에서 범용 조각·골드로' },
    wildCommon: { name: '범용 조각(일반)', info: '일반 메아리 아무에게나 조각 하나' },
    wildRare: { name: '범용 조각(희귀)', info: '희귀 메아리 아무에게나 조각 하나' },
    wildLegend: { name: '범용 조각(전설)', info: '전설 메아리 아무에게나 조각 하나' },
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

/** 메아리의 이름·소개는 정의의 글(한국어)이고, 영어는 정의의 text.en이다 (틀의 CharDef.text: server/echoes.ts) */

export const koGame = {
  ui: {
    // 첫 로딩의 팁 (U2: 틀의 setLoadingTips)
    loadTip1: '울림 조각이 모이면 울림 샘에서 메아리를 부릅니다. 조각은 단계와 울림골에서 모입니다.',
    loadTip2: '단계에서 막히면 메아리의 레벨을 올리거나 편성을 바꿔 보세요.',
    loadTip3: '울림골에서 자동 사냥을 켜 두면 탑에 가 있는 동안에도 대역이 사냥을 이어 갑니다.',
    // 틀 문장의 '영웅'을 이 게임의 말 '메아리'로 (뽑기 결과·편성·영웅 목록)
    heroNone: '아직 메아리가 없습니다. 울림 샘에서 메아리를 불러 보세요.',
    gachaRatesHero: '메아리별 확률',
    squadHead: '함께 싸울 메아리',
    squadNone: '편성할 메아리가 없습니다. 울림 샘에서 메아리를 불러 보세요.',
    heroBack: '← 메아리 목록',
    heroNoSkill: '이 메아리의 역할에는 기술이 없습니다.',
    synNone: '같은 진영의 메아리를 함께 넣으면 시너지가 켜집니다.',
    title: '메아리 계약',
    intro: '계약자가 되어 두 곳을 오갑니다. 계약의 탑에서 옛 영웅의 메아리를 불러 모으고 편성해 단계를 깨고, 울림골 들판에서는 모은 메아리의 모습으로 변신해 사냥합니다.',
    classHint: '직업은 울림골(들판)에서 싸우는 계약자의 것입니다. 나중에 울림 샘 곁에서 바꿀 수 있습니다. 탑에서는 편성한 메아리만 싸웁니다.',
    hint: keyHints(['땅 클릭/WASD: 이동', '몬스터 클릭: 공격', '1–3: 기술', 'Q: 샘물 약', 'R: 자동 사냥', 'H: 울림 샘으로', 'B: 가방', 'M: 메뉴(변신·장비)', 'N: 지도', 'Tab: 대상', 'Enter: 대화']),
    mapLegend: '■ 울림 샘 · 초록 상인',
    goingTown: '울림 샘으로 걸어갑니다.',
    // 두 게임의 이름 (모드)
    modeTower: '계약의 탑', modeVale: '울림골',
    // 틀의 '영웅' 탭을 이 게임의 말로, 근처 대화는 '같은 곳'
    tabHeroes: '메아리',
    chatTagNear: '[같은 곳]', chatTabNear: '같은 곳',
    roleVanguard: '선봉', roleRanger: '사수', roleMystic: '비술', roleMender: '치유',
    bannerWell: '울림 샘', chapterPath: '속삭임 길', chapterRuins: '종소리 폐허', chapterSpire: '울림 첨탑',
    chapterGallery: '빈 회랑', chapterBelfry: '깨진 종루', chapterMarsh: '거울 늪', chapterHush: '침묵의 골', chapterCrown: '계약의 정점',
    towerAllDone: '탑을 모두 깼습니다', towerSoon: '다음 장은 곧 열립니다',
    // 라이브 콘텐츠 (묶음 6: shared/content의 EVENTS·GOODS·SEASON·ACHIEVES·CODEX)
    evEchofest: '울림 축제',
    evEchofestNote: '두 주 동안 임무를 채우면 축제 조각을 받습니다. 축제 조각은 축제 상점에서 쓰고, 뽑기에는 일반 조각을 다 쓴 뒤에 쓰입니다.',
    evmHunt: '울림골에서 몬스터 40마리 사냥', evmClimb: '탑에서 단계 10번 깨기', evmCall: '메아리 5번 부르기', evmShift: '변신 3번',
    gFestTonic: '축제 샘물 약 3병', gFestShards: '울림 조각 100', gFestGold: '골드 주머니 300', gDayPack: '오늘의 꾸러미', gWellTonic: '샘물 약 5병 (상인 특가)',
    gShopCrystal: '결정 상점', gWildCommon: '범용 조각(일반)', gWildRare: '범용 조각(희귀)', gWildLegend: '범용 조각(전설)', gCrystalGold: '골드 300',
    cardFuse0: '메아리 합성 (일반 → 희귀)', cardFuse1: '메아리 합성 (희귀 → 전설)',
    seasonEcho: '메아리의 계절',
    achHunter: '사냥꾼: 몬스터 100마리', achClimber: '탑 오르기: 단계 15번', achCaller: '부르는 자: 메아리 30번 부르기', achShifter: '천의 얼굴: 변신 10번',
    titleHunter: '사냥꾼', titleClimber: '탑지기', titleCaller: '메아리를 부르는 자',
    codexEchoes: '메아리', codexBeasts: '울림골의 짐승',
    // 탑의 첫 화면 (client/tower.ts)
    towerAdventure: '모험',
    towerWatch: '전투 보기',
    // 홈(로비): 프로필 창의 줄, 대표 메아리를 눌렀을 때의 짧은 대사 (U3)
    profPower: '편성 전투력', profBest: '가장 멀리 깬 단계', profEchoes: '모은 메아리', profLead: '대표 메아리',
    leadSay1: '오늘도 탑을 오를 건가요? 저는 준비됐어요.', leadSay2: '울림 샘 물소리가 오늘따라 맑네요.', leadSay3: '계약자님, 편성을 한 번 살펴봐요.',
    leadSay4: '울림골에서 조각을 모으면 새 친구를 부를 수 있어요.', leadSay5: '쉬어 가도 괜찮아요. 탑은 어디 가지 않으니까요.',
    towerGrowLv: '메아리 레벨 올리기', towerGrowPull: '울림 샘에서 뽑기', towerGrowSquad: '편성 바꾸기', towerGrowVale: '울림골에서 조각 모으기',
    towerGo: '도전',
    towerPull: '뽑기',
    towerEchoes: '메아리',
    towerSquad: '편성',
    towerAutoOn: '자동 진행 켜짐',
    towerAutoOff: '자동 진행 꺼짐',
    towerCleared: '깸',
    towerLocked: '잠김',
    towerNow: '지금',
    towerBoss: '우두머리',
    towerHint: '단계를 깨면 울림 조각(뽑기의 값)이 나옵니다. 처음 깨면 더 많이.',
    towerWeak: '편성 전투력이 권장보다 낮습니다. 골드로 메아리의 레벨을 올리거나, 뽑아서 편성을 세게 하세요.',
    towerGrow: '메아리 키우기',
    // 다른 쪽의 작은 표시와 바로 가기
    sideStopTower: '탑 멈추기',
    sideHunt: '사냥 중', sideRest: '쉬는 중', sideRetreat: '물러남', sideStop: '멈춤', sideDown: '쓰러짐',
    sideFight: '싸우는 중', sideGap: '다음 물결', sideClear: '깸', sideFail: '실패', sideLobby: '쉬는 중',
    // 튜토리얼과 설정 칸 (client/tutorial.ts)
    tutPact: '계약의 첫걸음',
    echoBreath: '계약의 숨결',
    echoMark: '울림 표식',
    tutName: '계약자의 이름을 지어 주세요. 무작위로 지어도 되고 나중에 설정에서 바꿀 수 있습니다.',
    tutResult: '결과 창입니다. 별 셋은 깸 · 45초 안 · 아무도 쓰러지지 않음입니다. 받은 울림 조각이 아래에 차례로 뒤집힙니다.',
    tutStage2: '울림 조각 100개가 모이면 뽑기가 열립니다. 1-2까지 깨 보세요.',
    tutSquad: '새 메아리는 빈 편성 칸에 저절로 들어갑니다. 아래 띠의 "편성"을 눌러 확인해 보세요.',
    tutStage: '계약의 탑의 홈입니다. 오른쪽 아래 "다음 도전"을 누르고 "출발"로 1-1에 도전해 보세요. 탑에서는 편성한 메아리(카드)만 싸웁니다. 처음 깨면 울림 조각을 받습니다.',
    tutPull: '울림 조각 100개가 모이면 뽑기에서 메아리를 불러 보세요. 확률은 \'확률 보기\'에 모두 공개됩니다.',
    tutSwitch: '홈 아래 띠의 "울림골"(전투 중에는 위의 "울림골 가기")을 눌러 다른 게임(들판)으로 가 보세요. 싸우는 중이어도 바로 바뀌고, 탑의 단계는 끝까지 이어집니다.',
    tutMove: '울림골입니다. 땅을 눌러[[ (또는 WASD로)|]] 걸어 보세요.',
    tutAttack: '들판의 몬스터를 눌러 공격해 보세요. 들판의 몬스터는 울림 조각을 떨어뜨립니다.',
    tutMorph: '메뉴[[ (M)|]]의 변신 탭에서 가진 메아리로 변신해 보세요. 탑에서 키운 카드의 능력치가 곧 변신한 동안의 능력치입니다.',
    tutAuto: '자동 사냥[[ (R)|]]을 켠 채 탑으로 가면 들판의 몸이 남아 사냥을 이어 갑니다.',
    setEchoTags: '이름표 보이기',
    setSafeGroup: '보이지 않을 때의 자동 사냥',
    setSafePotion: '물약을 마실 체력',
    setSafeRetreat: '멈추고 물러날 체력',
    setSafeNoPotion: '물약이 떨어지면 멈추기',
    setSafeDeath: '쓰러지면 끝내기',
    setSafeNote: '탑에 가 있는 동안 들판의 몸, 접속을 끊은 뒤의 자리 비움 사냥에 씁니다.',
  },
  fmt: {
    gachaNew: () => '새 메아리!',
    gachaSameRatio: (rarity: string) => `${rarity} 이상의 메아리끼리의 비율은 평소와 같습니다.`,
    potions: (n: number) => `샘물 약 ${n}`,
    /** 탑의 첫 화면: 가진 것과 편성의 전투력 */
    towerLive: (id: string) => `전투 중: ${id}`,
    towerPullHave: (cost: number, have: number) => `울림 조각 ${cost.toLocaleString('ko-KR')} / 가진 것 ${have.toLocaleString('ko-KR')}`,
    towerNext: (id: string) => `다음 도전 ${id}`,
    towerStarGo: (id: string) => `별 모으기 ${id}`,
    towerPower: (n: number) => `편성 전투력 ${n.toLocaleString('ko-KR')}`,
    towerRec: (rec: number) => `권장 ${rec.toLocaleString('ko-KR')}`,
    towerBest: (id: string) => (id ? `가장 멀리 깬 단계 ${id}` : '아직 깬 단계가 없습니다'),
    /** 보고 있지 않은 들판·탑의 작은 표시 */
    sideVale: (state: string, hp: number, max: number, kills: number, sparks: number) => `울림골: ${state} · 체력 ${hp}/${max} · ${kills}마리 · 조각 +${sparks}`,
    sideStuck: (failed: string, now: string) => `탑: ${failed}에서 막힘 · 편성이 약함 · ${now} 되풀이`,
    sideTower: (id: string, state: string, cleared: number, sparks: number, auto: boolean) => `탑: ${id} ${state} · 깬 수 ${cleared} · 조각 +${sparks}${auto ? ' · 자동 진행' : ''}`,
    pct: (v: number) => `${Math.round(v * 100)}%`,
    /** 게임 바꾸기 단추: 틀의 '(으)로' 대신 */
    modeTo: (name: string) => `${name} 가기`,
    /** 장비 탭의 강화 안내: 이 게임은 +5부터 울림 가루도 든다 (틀의 문장은 '골드만 듭니다') */
    gearHint: (supplyMax: number, max: number) => `강화: 보급형(상점에서 산 것)은 +${supplyMax}까지, 주운 장비는 +${max}까지. 실패해도 장비는 그대로이고 골드와 울림 가루(+${DUST_FROM}부터)만 듭니다.`,
  },
  /** 틀의 안내문 가운데 이 게임의 말로 덮어쓴 것 */
  msg: {
    heroNew: (a) => `새 메아리 ${charName(a[0])}: 탑에서 함께 싸우고, 울림골에서는 이 모습으로 변신할 수 있습니다.`,
    classFar: () => '직업은 울림 샘 곁에서 바꿀 수 있습니다.',
    noPotion: () => '샘물 약이 없습니다. 상인에게서 살 수 있습니다.',
    modeOn: (a): string => (a[0] === 'tower' ? '계약의 탑에 왔습니다.' : '울림골에 왔습니다.'),
    modeStandOn: () => '울림골에 남은 몸이 자동 사냥을 이어 갑니다.',
    modeStandDown: () => '울림골에서 사냥하던 몸이 쓰러졌습니다.',
  } satisfies Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
