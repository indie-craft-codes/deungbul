// 한국어: 이 게임의 내용의 이름표(koNames)와 문장(koGame). 기준 언어다: en.ts는 같은 모양을 갖춰야 컴파일된다.
// 틀의 탭(영웅·뽑기·편성·영웅 장비·단계)·소탕·돌아왔을 때의 창·안내문의 문장은 틀의 것이다. 이 게임은 이름 키와 '원정' 탭의 문장만 적는다.
import { withIdNames } from '@engine/client/i18n/names';

/** 틀의 문장이 쓰는 내용의 이름표. 쓰지 않는 모듈의 이름(장비 칸·등급·능력치)은 id 그대로 (withIdNames) */
export const koNames = withIdNames({
  monsters: {
    mossling: '이끼뭉치', thornwolf: '가시늑대', sporecaster: '포자술사', mossking: '이끼왕', elderroot: '늙은 뿌리',
    cinderimp: '잿불 꼬마', ashhound: '재사냥개', slinger: '불씨 투척꾼', magmabrute: '용암 거한', ashwyrm: '잿빛 비룡',
    frostwisp: '서리 도깨비불', icewarden: '얼음 파수꾼', shardarcher: '얼음 궁수', frostgiant: '서리 거인', moonlich: '달그림자 군주',
    goldbeetle: '금딱정벌레', vaultgolem: '금고 골렘', wellsprite: '샘의 정령', wellguardian: '샘지기',
  },
  items: {
    moonblade: { name: '달빛 검', info: '원정대장의 검' },
    essence: { name: '별정수', info: '별의 샘과 방치 보상에서 얻습니다. 영웅 탭에서 가진 영웅의 조각으로 바꿉니다' },
    starchart: { name: '별자리 서책', info: '영웅의 기술 레벨을 올립니다' },
    moonshard: { name: '달 조각', info: '별 6인 영웅을 각성시킵니다' },
    starsteel: { name: '운철', info: '영웅 장비를 강화합니다' },
    sweepticket: { name: '소탕권', info: '깬 단계를 싸우지 않고 한 번 끝냅니다' },
    herochoice: { name: '전설 영웅 선택권', info: '전설 영웅 셋 가운데 하나를 고릅니다' },
  },
  classes: { captain: { name: '원정대장', info: '영웅들을 이끌고 달 조각을 찾아 떠나는 대장입니다.' } },
  skills: {
    cleave: { name: '가르기', info: '앞의 적에게 큰 피해' },
    quake: { name: '땅울림', info: '둘레의 적 모두에게 피해를 주고 느리게 함' },
    banner: { name: '달무리 깃발', info: '둘레의 아군이 7초 동안 30% 더 세게 친다' },
    bulwark: { name: '방패 밀치기', info: '피해를 주고 기절' },
    pierce: { name: '꿰뚫는 화살', info: '멀리 있는 적에게 큰 피해' },
    starfall: { name: '별똥비', info: '대상 둘레의 적 모두에게 피해' },
    moonlight: { name: '달빛 치유', info: '둘레의 아군 회복' },
  },
  dungeons: {
    goldvein: { name: '황금 광맥', info: '금딱정벌레와 금고 골렘을 쓰러뜨리면 금화를 많이 받습니다 (열쇠 하나).' },
    starwell: { name: '별의 샘', info: '샘지기를 쓰러뜨리면 영웅을 키우는 별정수를 받습니다 (열쇠 하나).' },
  },
  dailies: { hunt: '몬스터 120마리 처치', clears: '단계 15번 깨기', keyrun: '열쇠 던전 2번 깨기' },
  places: { stage: '단계의 자리', '': '야영지' },
  currency1: { name: '금화', unit: '금화' },
  currency2: { name: '월석', one: 'moonstone' },
  nameA: ['푸른', '고요한', '날랜', '굳센', '밝은', '먼길의'],
  nameB: ['원정대장', '길잡이', '달지기', '별사냥꾼', '구름발'],
});

export const koGame = {
  ui: {
    title: '달무리 원정대',
    intro: '떠도는 하늘섬에 흩어진 달 조각을 찾아 영웅들을 이끄세요.',
    classHint: '',
    hint: '자동으로 싸웁니다 · M: 메뉴(영웅·뽑기·편성·영웅 장비·단계·원정) · N: 지도 · Enter: 대화',
    mapLegend: '가운데 나 · 붉은 점 몬스터 · 하늘색 영웅',
    // 영웅·역할·배너·장의 이름 (내용의 name 키)
    heroAnvil: '모루', heroReed: '갈대', heroEmber: '불씨', heroDew: '이슬',
    heroStoneheart: '돌심장', heroHawkeye: '매눈', heroFrostshot: '서리살', heroSparkhand: '번개손', heroWillow: '버들',
    heroMoonshield: '달방패', heroStarfall: '별비', heroDawnsaint: '새벽 성녀',
    roleGuardian: '수호', roleRanger: '궁수', roleMystic: '술사', roleHealer: '치유',
    bannerHalo: '달무리 소환', bannerFroststar: '서리별 소환',
    bannerEclipseMoon: '월식 소환: 달방패', bannerEclipseStar: '월식 소환: 별비', bannerEclipseDawn: '월식 소환: 새벽 성녀',
    chapterMoss: '이끼 숲', chapterAsh: '잿빛 협곡', chapterFrost: '서리 첨탑',
    // 영웅의 성장: 장비의 칸·이름·세트, 진영의 시너지, 각성의 패시브
    hgSlotWeapon: '무기', hgSlotArmor: '갑옷', hgSlotCharm: '부적',
    hgIronedge: '무쇠 날', hgQuiltcoat: '누비 외투', hgPebblecharm: '조약돌 부적',
    hgLunarblade: '달빛 검', hgLunarmail: '달빛 사슬옷', hgLunarcharm: '달빛 방울',
    hgAstralstaff: '성휘 지팡이', hgAstralrobe: '성휘 로브', hgAstralcharm: '성휘 별자리판',
    hgEclipseblade: '월식검',
    setLunar: '달빛', setAstral: '성휘',
    synSun: '해의 맹세', synMoon: '달의 가호', synStar: '별의 인도',
    passiveMoonveil: '달빛 장막', passiveFullmoon: '보름달',
    // 이 게임의 창: 메뉴의 '원정' 탭
    tabExpedition: '원정',
    expDungeons: '열쇠 던전',
    expDungeonsNote: '열쇠는 날마다 2개씩 찹니다 (2개까지). 월석으로 하루 2개 더 살 수 있습니다. 들어가면 대장도 저절로 싸우고, 끝나면 단계로 돌아옵니다. 보상은 우편으로, 소탕은 단계 탭에서.',
    expGo: '들어가기',
    expBuy: '열쇠 사기',
  },
  fmt: {
    expNeedLv: (lv: number) => `대장 레벨 ${lv}부터`,
    keyLine: (n: number, cap: number, bought: number, buyMax: number, cost: number) => `열쇠 ${n} / ${cap} · 사기 ${cost} 월석 (오늘 ${buyMax - bought}번 남음)`,
  },
  msg: {},
};
export type GameLocale = typeof koGame;
