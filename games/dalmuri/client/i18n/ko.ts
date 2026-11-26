// 한국어: 이 게임의 내용의 이름표(koNames)와 문장(koGame). 기준 언어다: en.ts는 같은 모양을 갖춰야 컴파일된다.
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { heroName } from '@engine/client/i18n/ko';
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
    essence: { name: '별정수', info: '별의 샘에서 얻습니다. 원정 탭에서 영웅의 조각으로 바꿉니다' },
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

/** 재화의 짧은 글 */
const rw = (gold: number, sparks: number, ess: number) => [gold ? `금화 ${gold.toLocaleString('ko-KR')}` : '', sparks ? `월석 ${sparks}` : '', ess ? `별정수 ${ess}` : ''].filter(Boolean).join(' · ');

export const koGame = {
  ui: {
    title: '달무리 원정대',
    intro: '떠도는 하늘섬에 흩어진 달 조각을 찾아 영웅들을 이끄세요.',
    classHint: '',
    hint: '자동으로 싸웁니다 · M: 메뉴(영웅·뽑기·편성·단계·원정) · N: 지도 · Enter: 대화',
    mapLegend: '가운데 나 · 붉은 점 몬스터 · 하늘색 영웅',
    // 영웅·역할·배너·장의 이름 (내용의 name 키)
    heroAnvil: '모루', heroReed: '갈대', heroEmber: '불씨', heroDew: '이슬',
    heroStoneheart: '돌심장', heroHawkeye: '매눈', heroFrostshot: '서리살', heroSparkhand: '번개손', heroWillow: '버들',
    heroMoonshield: '달방패', heroStarfall: '별비', heroDawnsaint: '새벽 성녀',
    roleGuardian: '수호', roleRanger: '궁수', roleMystic: '술사', roleHealer: '치유',
    bannerHalo: '달무리 소환', bannerFroststar: '서리별 소환',
    chapterMoss: '이끼 숲', chapterAsh: '잿빛 협곡', chapterFrost: '서리 첨탑',
    // 이 게임의 창
    tabExpedition: '원정',
    expDungeons: '열쇠 던전',
    expDungeonsNote: '열쇠는 날마다 2개씩 찹니다 (2개까지). 월석으로 하루 2개 더 살 수 있습니다. 보상은 우편으로 옵니다.',
    expGo: '들어가기',
    expBuy: '열쇠 사기',
    expEssence: '별정수 → 영웅 조각',
    expEssenceNote: '별정수로 가진 영웅의 조각 한 묶음(일반 5 · 희귀 10 · 전설 25)을 얻습니다. 조각이 모이면 영웅 탭에서 별을 올립니다.',
    expUse: '바꾸기',
    idleTitle: '원정대가 쉬는 동안',
    idleClaim: '받기',
    idleLater: '나중에 (우편에 남김)',
  },
  fmt: {
    expNeedLv: (lv: number) => `대장 레벨 ${lv}부터`,
    keyLine: (n: number, cap: number, bought: number, buyMax: number, cost: number) => `열쇠 ${n} / ${cap} · 사기 ${cost} 월석 (오늘 ${buyMax - bought}번 남음)`,
    essenceHave: (n: number) => `가진 별정수 ${n}`,
    essenceRow: (lv: number, stars: number, shards: number, need: number) => `레벨 ${lv} · 별 ${stars} · 조각 ${shards} — 별정수 ${need}개`,
    idleBody: (min: number) => `${Math.floor(min / 60) ? `${Math.floor(min / 60)}시간 ` : ''}${min % 60}분 동안 원정대가 모은 것`,
    idleReward: rw,
  },
  msg: {
    essenceUsed: (a) => `${heroName(a[0])}: 조각 ${a[1]}개를 얻었습니다. 남은 별정수 ${a[2]}`,
    essenceShort: (a) => `별정수가 모자랍니다 (필요 ${a[0]}, 가진 것 ${a[1]}). 별의 샘에서 얻습니다.`,
    essenceNoHero: () => '가진 영웅에게만 쓸 수 있습니다.',
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};
export type GameLocale = typeof koGame;
