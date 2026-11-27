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

/** 메아리의 이름·소개는 정의의 글(한국어)이고, 영어는 정의의 text.en이다 (틀의 CharDef.text: server/echoes.ts) */

export const koGame = {
  ui: {
    title: '메아리 계약',
    intro: '계약자가 되어 두 곳을 오갑니다. 계약의 탑에서 옛 영웅의 메아리를 불러 모으고 편성해 단계를 깨고, 울림골 들판에서는 모은 메아리의 모습으로 변신해 사냥합니다.',
    classHint: '직업은 나중에 울림 샘 곁에서 바꿀 수 있습니다. 탑에서도 계약자가 앞에 서서 함께 싸웁니다.',
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
    // 탑의 첫 화면 (client/tower.ts)
    towerSub: '메아리를 불러 모으고, 편성해 단계를 깨는 곳',
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
    // 다른 쪽의 작은 표시와 바로 가기
    sideGoVale: '울림골로',
    sideGoTower: '탑으로',
    sideStopTower: '탑 멈추기',
    sideHunt: '사냥 중', sideRest: '쉬는 중', sideRetreat: '물러남', sideStop: '멈춤', sideDown: '쓰러짐',
    sideFight: '싸우는 중', sideGap: '다음 물결', sideClear: '깸', sideFail: '실패', sideLobby: '쉬는 중',
    alertGo: '바로 가기',
    // 튜토리얼과 설정 칸 (client/tutorial.ts)
    tutPact: '계약의 첫걸음',
    tutStage: '계약의 탑입니다. 1-1을 눌러 도전해 보세요. 편성한 메아리가 함께 싸우고, 처음 깨면 울림 조각을 받습니다.',
    tutPull: '울림 조각 100개가 모이면 뽑기에서 메아리를 불러 보세요. 확률은 \'확률 보기\'에 모두 공개됩니다.',
    tutSwitch: '위의 \'울림골로\' 단추를 눌러 다른 게임(들판)으로 가 보세요. 싸우는 중이어도 바로 바뀌고, 탑의 단계는 끝까지 이어집니다.',
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
    potions: (n: number) => `샘물 약 ${n}`,
    /** 탑의 첫 화면: 가진 것과 편성의 전투력 */
    towerHave: (sparks: number, gold: number, power: number) => `울림 조각 ${sparks.toLocaleString('ko-KR')} · 골드 ${gold.toLocaleString('ko-KR')} · 편성 전투력 ${power.toLocaleString('ko-KR')}`,
    towerRec: (rec: number) => `권장 ${rec.toLocaleString('ko-KR')}`,
    towerBest: (id: string) => (id ? `가장 멀리 깬 단계 ${id}` : '아직 깬 단계가 없습니다'),
    /** 보고 있지 않은 들판·탑의 작은 표시 */
    sideVale: (state: string, hp: number, max: number, kills: number, sparks: number) => `울림골: ${state} · 체력 ${hp}/${max} · ${kills}마리 · 조각 +${sparks}`,
    sideTower: (id: string, state: string, cleared: number, sparks: number, auto: boolean) => `탑: ${id} ${state} · 깬 수 ${cleared} · 조각 +${sparks}${auto ? ' · 자동 진행' : ''}`,
    pct: (v: number) => `${Math.round(v * 100)}%`,
    /** 게임 바꾸기 단추: 틀의 '(으)로' 대신 */
    modeTo: (name: string) => `${name} 가기`,
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
