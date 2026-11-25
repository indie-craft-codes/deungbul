// 한국어, 이 게임(등불지기)의 몫: 등탑·불씨 바치기·주민·습격·퀘스트·등탑지기·휴식의 문장, 이 게임의 안내문, 그리고 내용의 이름(몬스터, 아이템, 직업, 기술, 던전, 구역, 주민).
// 틀의 문장(engine/client/i18n/ko.ts의 koBase)과 합쳐 한 언어 묶음이 된다 (index.ts). 같은 키가 양쪽에 있으면 여기 것이 이긴다:
// 틀의 기본 문장을 이 게임의 말로 덮어쓴 것이고, 그 목록은 games/deungbul/test/guide.test.ts에 고정해 두었다 (뜻하지 않은 겹침을 잡는다).
// 기준 언어다: en.ts는 이 파일과 같은 모양을 갖춰야 컴파일된다.
import type { ClassId, DailyId, DungeonId, ItemId, MonsterId, QuestId, ResidentId, SkillId } from '../../shared/defs';
import type { MsgMap } from '@engine/shared/ext';
import type { MsgArg, MsgKey } from '@engine/shared';
import { josa, keyHints, num, signed } from '@engine/client/i18n/ko';
import { itemNameOf, type ContentNames } from '@engine/client/i18n/names';

const monsters: Record<MonsterId, string> = { slime: '슬라임', wisp: '위습', wolf: '늑대', shade_bram: '브람의 그림자', shade_mira: '미라의 그림자', boar: '멧돼지', goblin: '고블린', lost_soldier: '잊힌 병사', ash_troll: '잿빛 트롤', crypt_lord: '지하묘의 주인', grave_hound: '무덤 사냥개', crypt_knight: '지하묘 기사', crypt_lord_deep: '깨어난 지하묘의 주인' };
const residents: Record<ResidentId, { name: string; bonus: string }> = {
  bram: { name: '대장장이 브람', bonus: '상점에 등불검이 들어오고, 대장간이 열립니다' },
  mira: { name: '약초꾼 미라', bonus: '상점에 진한 물약이 들어옵니다' },
  halmeom: { name: '등탑지기 할멈', bonus: '등탑에 오늘의 등탑지기 명단이 걸리고, 기여 단계마다 보상을 받습니다' },
};
const classes: Record<ClassId, { name: string; info: string }> = {
  warrior: { name: '전사', info: '가까이 붙어 싸웁니다. 체력이 많습니다.' },
  archer: { name: '궁수', info: '멀리서 활을 쏩니다. 체력이 적습니다.' },
  mage: { name: '마법사', info: '멀리서 마법을 씁니다. 적을 느리게 하고 곁의 사람을 치유합니다. 체력이 가장 적습니다.' },
};
// bow, staff: 궁수와 마법사에게 보이는 이름 (같은 등급의 활, 지팡이)
// info: 수치로 된 효과(공격 피해, 받는 피해, 회복량)는 여기 적지 않는다. 아이템 정의의 값으로 문장을 만든다 (틀의 언어 파일에 있는 itemInfo, fmt.itemDamage 등)
const items: Record<ItemId, { name: string; info?: string; bow?: string; staff?: string }> = {
  sword1: { name: '낡은 검', bow: '낡은 활', staff: '낡은 지팡이', info: '기본 무기' },
  sword2: { name: '철검', bow: '단단한 활', staff: '단단한 지팡이' },
  sword3: { name: '등불검', bow: '등불활', staff: '등불 지팡이' },
  sword4: { name: '잿불검', bow: '잿불활', staff: '잿불 지팡이' },
  armor1: { name: '가죽 갑옷' },
  armor2: { name: '쇠 갑옷' },
  hide: { name: '질긴 가죽', info: '멧돼지가 떨어뜨리는 재료' },
  iron: { name: '쇳조각', info: '고블린과 잊힌 병사가 떨어뜨리는 재료' },
  ashcore: { name: '잿빛 핵', info: '잿빛 트롤이 떨어뜨리는 재료' },
  potion: { name: '물약' },
  tonic: { name: '진한 물약' },
  dust: { name: '장비 가루', info: '장비를 분해하면 나오는 재료' },
  ward: { name: '강화 보호석', info: '+7 이상에서 강화에 실패해도 단계가 내려가지 않습니다 (시도마다 한 개). 출석 7일째, 강화 일일 임무, 지하묘 깊은 곳에서 받습니다' },
};
const itemName = itemNameOf(items);
const towers: Record<string, string> = { first: '첫불 마을 등탑', ash: '잿빛 숲 등탑', crypt: '지하묘 입구' };
const dungeons: Record<DungeonId, { name: string; info: string }> = {
  crypt: { name: '잿빛 지하묘', info: '고블린과 잊힌 병사를 뚫고 지하묘의 주인을 쓰러뜨리세요. 여럿이 가는 편이 좋습니다.' },
  crypt_deep: { name: '지하묘 깊은 곳', info: '무덤 사냥개와 지하묘 기사를 뚫고 깨어난 주인을 쓰러뜨리세요. 레벨 7 장비가 나옵니다. 파티로 가세요.' },
};
const towerName = (id: MsgArg) => towers[String(id)] ?? String(id);
const questTitles: Record<QuestId, string> = { bram: '1장 · 망치 소리', mira: '2장 · 마른 약초밭', ashwood: '3장 · 잿빛 숲의 등불', halmeom: '4장 · 등탑지기의 밤' };
const zones: readonly string[] = ['등불 들판', '잿빛 숲'];
const stages: readonly [string, string, string] = ['어스름', '보통', '환함'];
const dailies: Record<DailyId, string> = { kill30: '몬스터 30마리 잡기', offer10: '불씨 10개 바치기', enhance1: '장비 강화 1번 하기' };

/** 틀의 문장이 쓰는 내용의 이름표 (koBase에 넘긴다). 틀의 안내문이 몬스터·아이템의 이름과 두 번째 재화(불씨)의 이름을 여기서 읽는다 */
export const koNames: ContentNames = {
  gearSlots: { weapon: '무기', armor: '갑옷', ring: '반지', amulet: '목걸이', charm: '부적' },
  rarities: { common: '평범한', uncommon: '쓸 만한', rare: '희귀한', epic: '빛나는' },
  buildStats: { pow: '힘', vit: '체력', luck: '행운' },
  monsters,
  items,
  classes,
  skills: {
    smash: { name: '강타', info: '대상에게 큰 피해' },
    whirl: { name: '회오리', info: '주변 모두에게 피해' },
    breath: { name: '숨 고르기', info: '체력 회복' },
    aimed: { name: '조준 사격', info: '멀리 있는 대상에게 큰 피해' },
    volley: { name: '화살비', info: '대상 주변 모두에게 피해' },
    bolt: { name: '불꽃 화살', info: '멀리 있는 대상에게 큰 피해' },
    frost: { name: '서리', info: '대상 주변 모두에게 피해를 주고 느리게 함' },
    mend: { name: '치유의 빛', info: '나와 주변 사람들의 체력 회복' },
  } satisfies Record<SkillId, { name: string; info: string }>,
  dungeons,
  dailies,
  /** 쓰러진 뒤 다시 일어나는 곳: 등탑 */
  places: towers,
  currency2: { name: '불씨', one: '불씨' },
  /** 처음 접속할 때 붙이는 무작위 이름의 재료 */
  nameA: ['졸린', '용감한', '느긋한', '수줍은', '씩씩한', '배고픈', '반짝이는', '조용한', '엉뚱한', '다정한'],
  nameB: ['등불', '부엉이', '여우', '도토리', '고슴도치', '나그네', '솔방울', '개구리', '반딧불', '다람쥐'],
};

export const koGame = {
  ui: {
    title: '등불지기',
    hint: keyHints(['땅 클릭/WASD: 이동', '몬스터 클릭: 공격', '1–3: 기술', 'Q: 물약', 'F: 퀘스트 이동', 'R: 자동 사냥', 'H: 마을로', 'B: 가방', 'M: 메뉴', 'N: 지도', 'Tab: 대상', 'Enter: 대화']),
    toTown: '마을로',
    questGoal: '퀘스트 목적지',
    shop: '길 상인',
    mapLegend: '■ 등탑 · ○ 퀘스트 · 초록 상인',
    goingTown: '첫불 마을로 걸어갑니다.',
    questNeedSparks: '바칠 불씨가 없습니다. 몬스터를 잡아 모으세요.',
    tower: '등탑',
    offerVerb: '바치기',
    helpVerb: '보태기',
    count1: '1개',
    count5: '5개',
    countAll: '전부',
    residents: '주민',
    allReturned: '모두 돌아왔습니다',
    forge: '브람의 대장간',
    towerDark: '불이 꺼져 있습니다. 모두가 불씨를 바쳐 밝히면, 이 숲에서 쓰러져도 여기서 다시 일어납니다.',
    keepersToday: '오늘의 등탑지기',
    keepersEmpty: '아직 아무도 없습니다. 불씨를 바치거나 습격을 막으면 이름이 오릅니다.',
    quest: '퀘스트',
    questGo: '누르면 목적지로 걸어갑니다[[ (F)|]]',
    intro: '안개에 잠긴 땅에서 등탑의 빛을 지키는 등불지기가 됩니다. 몬스터를 잡아 불씨를 모으고, 등탑에 바쳐 마을을 밝히세요.',
    classHint: '직업은 나중에 등탑에서 바꿀 수 있습니다.',
    towerOff: '꺼짐',
    zoneDark: '등탑이 꺼진 곳입니다. 몬스터가 강하고 먼저 덤벼듭니다. 쓰러지면 첫불 마을에서 일어납니다.',
    offerNote: '등탑을 밝힙니다. 밝을수록 습격을 오래 버팁니다.',
    questAllDone: '지금까지의 이야기를 모두 마쳤습니다.',
  },
  residents,
  towers,
  stages,
  /** 구역 이름 (구역 번호 순) */
  zones,
  /** 메인 퀘스트: 장의 제목과 단계별 할 일 */
  quests: {
    bram: {
      title: questTitles.bram,
      steps: [
        '서쪽 들판에서 슬라임을 잡아 불씨를 모으세요',
        '마을의 등탑에 불씨를 바치세요',
        '서쪽 숲 너머, 옛 대장간 터를 찾아가세요',
        '안개에 삼켜진 브람의 그림자를 쓰러뜨리세요',
        '등탑 창의 "보태기"로 불씨를 보태 마을 사람을 되돌리세요 (누가 돌아올 차례인지는 등탑 창에)',
      ],
    },
    mira: {
      title: questTitles.mira,
      steps: [
        '마을의 길 상인에게서 물약을 하나 사세요',
        '남쪽 숲에서 위습을 잡으세요',
        '연못 동쪽, 옛 약초밭을 찾아가세요',
        '안개에 삼켜진 미라의 그림자를 쓰러뜨리세요',
        '등탑 창의 "보태기"로 불씨를 더 보태 마을 사람들을 되돌리세요',
      ],
    },
    ashwood: {
      title: questTitles.ashwood,
      steps: [
        '동쪽 큰길을 따라 잿빛 숲의 꺼진 등탑을 찾아가세요',
        '잿빛 숲 등탑에 불씨를 바쳐 불을 켜세요',
        '잿빛 숲 북쪽에서 멧돼지를 잡으세요',
        '잿빛 숲 남쪽에서 고블린 무리를 물리치세요',
        '숲 동쪽 끝의 잿빛 트롤을 쓰러뜨리세요. 여럿이 함께 가는 편이 좋습니다',
      ],
    },
    halmeom: {
      title: questTitles.halmeom,
      steps: [
        '첫불 마을 등탑에 불씨를 바치세요. 할멈은 평생 이 불을 지켰습니다',
        '잿빛 숲 동쪽에서 잊힌 병사를 쓰러뜨리세요. 안개에 삼켜진 옛 등탑지기들입니다',
        '낮 12시·3시·6시와 저녁 8~11시 정각에 오는 안개 습격을 마을 등탑에서 함께 막아 내세요',
      ],
    },
  } satisfies Record<QuestId, { title: string; steps: string[] }>,
  /** 값이 들어가는 화면 문구 */
  fmt: {
    sparks: (n: number) => `불씨 ${n}`,
    contrib: (n: number) => `기여 ${n}`,
    towerMini: (stage: number, glow: number) => `등탑 ${stages[stage]} ${glow}`,
    glow: (stage: number, glow: number, max: number) => `${stages[stage]} · ${glow} / ${max}`,
    /** bright: 환해지는 밝기, speedPct: 이동 속도가 느는 비율(%), regen: 회복 배율 (games/deungbul/shared/content/tower.ts의 값을 넘긴다) */
    stageNote: (stage: number, bright: number, speedPct: number, regen: number) => ['빛이 약합니다. 혜택이 없습니다.', `${bright} 이상이면 환해집니다: 이동 속도 +${speedPct}%, 회복 ${regen}배`, `환합니다: 이동 속도 +${speedPct}%, 회복 ${regen}배`][stage],
    nextResident: (name: string) => `되돌릴 주민: ${name}`,
    whenBack: (bonus: string) => `돌아오면: ${bonus}`,
    raidNext: (time: string, tomorrow: boolean, perDay: number) => `다음 습격 ${tomorrow ? '내일 ' : ''}${time} · 하루 ${perDay}번`,
    raidSoon: (sec: number) => `첫불 마을에 안개가 몰려옵니다 · ${sec}초 뒤`,
    raidActive: (foes: number, time: string) => `첫불 마을 습격 · 남은 적 ${foes} · ${time}`,
    swarmFoe: (name: string) => `안개 ${name}`,
    towerHp: (hp: number, max: number) => `등탑 내구 ${hp} / ${max}`,
    questProgress: (n: number, of: number) => `${n} / ${of}`,
    rested: (n: number) => `휴식 보너스 ${n}`,
    tier: (tier: number, next: number | null) => (next === null ? `기여 ${tier}단계 (끝)` : `기여 ${tier}단계 · 다음 ${next}`),
    keeper: (name: string, n: number) => `${name} ${n}`,
    residentHint: (name: string, left: number) => `${josa(name, '은', '는')} 아직 돌아오지 못했습니다. 등탑에서 불씨를 보태면 돌아옵니다 (앞으로 ${left}개).`,
    needsResident: (name: string) => `${josa(name, '이', '가')} 돌아오면 들어옵니다`,
  },
  /** 이 게임이 더한 서버 안내문(games/deungbul/shared/deungbul.ts의 MsgMap)과, 틀의 안내문 가운데 이 게임의 말로 덮어쓴 것 */
  msg: {
    shopFar: () => '길 상인 가까이에서 살 수 있습니다.',
    offerFar: () => '등탑 가까이에서 바칠 수 있습니다.',
    noSparks: () => '불씨가 없습니다.',
    towerFull: () => '등탑이 이미 가장 밝습니다.',
    noResident: () => '되돌릴 주민이 더 없습니다.',
    offered: (a) => (a[2] === 'resident' ? `주민을 되돌리는 데 불씨 ${a[0]}개를 보탰습니다.` : `등탑에 불씨 ${a[0]}개를 바쳤습니다.`) + ` (누적 ${a[1]})`,
    stageChanged: (a) => `${towerName(a[1])}의 밝기가 바뀌었습니다: ${stages[Number(a[0])]}`,
    towerLit: (a) => `${towerName(a[0])}에 불이 켜졌습니다. 이제 그곳에서 다시 일어날 수 있습니다.`,
    residentBack: (a) => { const r = residents[a[0] as ResidentId]; return r ? `${josa(r.name, '이', '가')} 마을로 돌아왔습니다. ${r.bonus}` : String(a[0]); },
    raidSoon: (a) => `첫불 마을에 안개가 몰려옵니다. ${a[0]}초 뒤 마을 등탑으로 모이세요.`,
    raidStart: (a) => `첫불 마을 습격이 시작됐습니다. '안개' 이름이 붙은 적 ${a[0]}마리가 등탑으로 옵니다.`,
    raidWon: (a) => `습격을 막아 냈습니다. 마을 등탑 밝기 ${signed(a[0])}`,
    raidLost: (a) => (Number(a[0]) === 0 ? '등탑을 지키지 못했습니다. 밝기는 더 내려가지 않았습니다.' : `등탑을 지키지 못했습니다. 마을 등탑 밝기 ${signed(a[0])}`),
    // 보상 줄의 차례는 처치·퀘스트 단계와 같다: 경험치, 불씨 (값의 차례는 [불씨, 경험치])
    raidReward: (a) => `습격 보상: 경험치 +${a[1]}, 불씨 +${a[0]}`,
    questStep: (a) => `퀘스트 단계 완료. 경험치 +${a[0]}${Number(a[1]) > 0 ? `, 불씨 +${a[1]}` : ''}`,
    classFar: () => '직업은 등탑 가까이에서 바꿀 수 있습니다.',
    bossUp: (a) => `${josa(monsters[a[0] as MonsterId] ?? String(a[0]), '이', '가')} 잿빛 숲 깊은 곳에 나타났습니다.`,
    tierUp: (a) => `기여 ${a[0]}단계에 올랐습니다. 등탑지기 할멈이 골드 ${num(a[1])}을 건넵니다.`,
    loot: (a) => `${josa(itemName(a[0]), '을', '를')} 주웠습니다. 브람의 대장간에서 쓸 수 있습니다.`,
    forgeFar: () => '대장장이 브람 가까이에서 만들 수 있습니다.',
    forgeClosed: () => '대장장이 브람이 아직 돌아오지 않았습니다.',
    raidElsewhere: (a) => `이 채널에는 안개의 적이 없습니다. ${a[0]}채널에 남아 있습니다. 채널을 옮겨 함께 막아 주세요.`,
    raidAbandoned: (a) => `${a[0]}채널을 지키는 사람이 없어, 그곳의 적이 등탑을 치고 안개로 돌아갔습니다.`,
    rested: (a) => `등탑에 맡겨 둔 등불이 쉬는 동안 빛을 모았습니다. 휴식 보너스 ${a[0]} (처치 경험치 2배)`,
    questDone: (a) => { const title = questTitles[a[0] as QuestId] ?? String(a[0]); return `'${title}'${josa(title, '을', '를').slice(title.length)} 마쳤습니다.`; },
  } satisfies Record<keyof MsgMap, (a: MsgArg[]) => string> & Partial<Record<MsgKey, (a: MsgArg[]) => string>>,
};

/** 이 게임이 언어 묶음에 더하는 것의 모양 */
export type GameLocale = typeof koGame;
