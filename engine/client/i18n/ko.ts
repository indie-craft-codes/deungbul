// 한국어, 틀의 몫: 어느 게임에서나 쓰는 화면의 문장이다 (접속, 내 정보, 전투, 상점·제작·장비·우편·일일·순위·길드·거래소·채널·던전·자동 사냥, 틀의 안내문).
// 기준 언어다: 다른 언어의 틀 파일(en.ts)은 이 파일과 같은 모양을 갖춰야 컴파일된다.
// 이 게임의 문장(등탑, 퀘스트 등)과 내용의 이름(몬스터, 아이템, 직업 …)은 여기 없다: 게임의 언어 파일(games/deungbul/client/i18n/)에 있고 mergeLocale로 합친다.
// 틀의 문장이 내용의 이름을 넣어야 할 때(처치 안내의 몬스터 이름, 두 번째 재화의 이름)는 게임이 넘긴 이름표(ContentNames)에서 읽는다. 그래서 koBase는 이름표를 받는 함수다.
// 이 파일은 게임의 파일을 import하지 않고, 게임의 낱말을 적지 않는다 (games/deungbul/test/split.test.ts가 검사한다).
import type { BuildStat, ClassId, DailyId, GearSlot, ItemDef, ItemId, MonsterId, Stat, StatMod } from '../../shared/defs';
import { BUILD, BUILD_STAT_IDS, ENHANCE, GUILD, HOME_KEY, ITEMS, MARKET, PARTY, SALVAGE, STAT_IDS, TEAMS, buildStatDef, isStat, statMod } from '../../shared/defs';
import { AWAY } from '../../shared/auto';
import type { MsgMap } from '../../shared/ext';
import type { MsgArg, MsgKey } from '../../shared/messages';
import type { LocaleExt } from './ext';
import { dungeonLabel, itemNameOf, uiText, type ContentNames } from './names';
import { anyModule } from '../../shared/picked';

/** 틀의 안내문 종류: 게임이 확장 지점(engine/shared/ext.ts의 MsgMap)에 더한 것을 뺀 나머지. 게임이 없으면 전부다 */
export type EngineMsgKey = Exclude<MsgKey, keyof MsgMap>;

/** 받침이 있으면 a, 없으면 b를 붙인다 (예: 검이 / 활이, 방패가). 한글이 아니면 둘 다 적는다. */
export function josa(word: string, a: string, b: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${word}${a}(${b})`;
  return word + ((code - 0xac00) % 28 ? a : b);
}

/** '~(으)로': 받침이 없거나 ㄹ받침이면 '로', 아니면 '으로'. 한글이 아니면 둘 다 적는다. */
/** 숫자 뒤의 '(으)로': 끝자리를 읽은 소리로 고른다 (+6으로, +7로, +10으로) */
export const numRo = (n: number): string => `${n}${[0, 3, 6].includes(n % 10) ? '으로' : '로'}`;

export function ro(word: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${word}(으)로`;
  const jong = (code - 0xac00) % 28;
  return word + (jong === 0 || jong === 8 ? '로' : '으로');
}

/** 장비 옵션이 드는 효과마다의 문장 (옵션과 능력치의 id는 게임이 짓고, 문장은 그것이 드는 효과로 정해진다) */
/** 능력치가 주는 것의 문장 (체력은 '최대 체력'으로) */
const buildMod: Record<StatMod, (v: number) => string> = {
  damage: (v) => `공격 피해 +${v}%`,
  guard: (v) => `받는 피해 -${v}%`,
  crit: (v) => `치명타 +${v}%`,
  hp: (v) => `최대 체력 +${v}`,
};
const modText: Record<StatMod, (v: number) => string> = {
  damage: (v) => `공격 피해 +${v}%`,
  guard: (v) => `받는 피해 -${v}%`,
  crit: (v) => `치명타 +${v}%`,
  hp: (v) => `체력 +${v}`,
};
/** 조작 안내의 항목들을 한 줄로 잇는다. 항목 안의 빈칸은 줄이 바뀌지 않는 빈칸으로 바꿔서, 줄이 넘어갈 때 항목 사이에서만 끊기게 한다 */
export const keyHints = (items: string[]) => items.map((s) => s.replace(/ /g, ' ')).join(' · ');
/** 틀의 기본 조작 안내: [글, 모듈] 짝은 그 모듈을 고른 게임에만 넣는다 (그 키를 그 모듈이 달기 때문이다: engine/client/bus.ts의 bindKey) */
/** [글, true/false] 짝은 그 값이 참일 때만 넣는다 (내용의 HOME_KEY처럼 모듈이 아닌 켜고 끄기) */
export const moduleHints = (items: (string | [string, string | boolean])[]): string => keyHints(items.filter((x) => typeof x === 'string' || (typeof x[1] === 'boolean' ? x[1] : anyModule(x[1]))).map((x) => (typeof x === 'string' ? x : x[0])));
export const signed = (n: MsgArg) => (Number(n) > 0 ? `+${n}` : String(n));
/** 팀의 이름 (teams 모듈): 팀 번호 → 게임이 언어 파일의 ui에 적은 이름 (TEAMS의 name 키). 없는 번호는 빈 문자열 */
export const teamName = (i: MsgArg): string => { const d = TEAMS[Number(i)]; return d ? uiText.get(d.name) : ''; };
/** 큰 수에 자릿수 구분을 넣는다 (1,000,000). 골드와 값은 모두 이것을 거친다 */
export const num = (n: MsgArg) => Number(n).toLocaleString('ko-KR');

/**
 * 틀의 문장 묶음. 내용의 이름표(n)를 받아 만든다: 게임마다 몬스터·아이템·직업의 이름이 다르고, 틀의 안내문이 그 이름을 문장에 넣는다.
 * 게임은 mergeLocale(koBase(이름표), 게임의 문장)으로 자기 언어 묶음을 만든다 (이 게임: games/deungbul/client/i18n/index.ts)
 */
export const koBase = (n: ContentNames) => {
  const { monsters, items, classes, dungeons, dailies, gearSlots } = n;
  /** 등급의 이름: 틀의 둘(보급형, 제작)과 게임의 등급 */
  const rarities: Record<string, string> = { supply: '보급형', made: '제작', ...n.rarities };
  /** 두 번째 재화의 이름 (처치·우편·자리 비움 보상에 적힌다). 그 재화를 쓰지 않는 게임은 이름표에 적지 않고, 그러면 문장에서 그 몫이 빠진다 */
  const coin = n.currency2;
  /** 첫 번째 재화의 이름. 적지 않으면 '골드' */
  const G = n.currency1 ?? { name: '골드', unit: '골드' };
  const itemName = itemNameOf(items);
  /** 던전의 이름 (없는 id는 id 그대로) */
  const dungeonName = (id: MsgArg) => dungeonLabel(n, id).name;
  /** 쓰러진 뒤 다시 일어나는 곳의 이름 */
  /** 다시 일어나는 곳의 이름. 게임이 일어나는 곳을 정하지 않았으면(g.rules.respawn의 기본) id가 빈 문자열이다: 이름표의 places['']나 '처음 자리' */
  const place = (id: MsgArg) => n.places[String(id)] ?? (String(id) || '처음 자리');
  /** 거래소 우편 제목에 넣을 물건의 이름: [아이템 id나 장비 칸, 수량] */
  const tradeWhat = (a: (string | number)[]) => { const name = items[a[0] as ItemId]?.name ?? gearSlots[a[0] as GearSlot] ?? String(a[0]); return Number(a[1]) > 1 ? `${name} ×${a[1]}` : name; };
  /** 운영자가 주거나 거둔 것의 이름: 재화 셋(gold, sparks, exp)이나 아이템 id */
  const grantWhat = (id: MsgArg) => (id === 'gold' ? G.name : id === 'exp' ? '경험치' : items[id as ItemId] ? itemName(id) : coin?.name ?? String(id));
  /** 남은 분을 읽기 좋게: 분, 시간, 일 */
  const span = (m: MsgArg) => { const v = Number(m); return v < 60 ? `${v}분` : v < 1440 ? `${Math.ceil(v / 60)}시간` : `${Math.ceil(v / 1440)}일`; };
  return {
    code: 'ko',
    label: '한국어',
    ui: {
      title: '게임', // 틀의 기본 문장 (이 게임은 자기 말로 덮어쓴다)
      connecting: '접속 중…',
      disconnected: '서버와 연결이 끊어졌습니다.',
      stale: '새 버전이 나왔습니다. 새로고침해 주세요.',
      reload: '새로고침',
      reconnecting: '연결이 끊어져 다시 접속하는 중입니다…',
      channel: '채널',
      soundOn: '소리 켬',
      soundOff: '소리 끔',
      volume: '음량',
      volSfx: '효과음',
      volMusic: '배경음',
      loadingAssets: '모델과 소리를 불러오는 중',
      full: '서버가 가득 찼습니다. 잠시 뒤에 다시 시도해 주세요.',
      reconnect: '다시 접속',
      // ---- 운영: 접속 화면에 남는 까닭 (engine/client/main.ts), 기기 옮기기 (hud/device.ts) ----
      gateBanned: '이 캐릭터나 주소는 접속이 막혀 있습니다.',
      gateKicked: '운영자가 접속을 끊었습니다.',
      gateHandedOff: '이 캐릭터는 다른 기기로 옮겨 갔습니다. 다시 접속하면 이 기기에서는 새 캐릭터로 시작합니다.',
      gateHandoffDone: '캐릭터를 이어받았습니다. 다시 접속하는 중입니다…',
      // 팀 (teams 모듈: hud/teams.ts). 팀의 이름은 게임이 TEAMS의 name 키로 적는다
      teamPickTitle: '팀을 고르세요',
      teamPickInfo: '고른 팀의 색 옷을 입습니다.',
      teamPickBalance: '사람이 더 많은 팀으로는 갈 수 없습니다.',
      teamMore: '사람이 더 많음',
      teamSwitch: '팀 바꾸기',
      teamBoard: '점수판',
      tabDevice: '기기',
      deviceMoveHead: '다른 기기로 옮기기',
      deviceMoveInfo: '코드를 받아 다른 기기의 게임에 넣으면 이 캐릭터가 그 기기로 옮겨 갑니다. 옮긴 뒤에는 이 기기에서 이 캐릭터로 들어올 수 없습니다. 코드는 10분 동안 한 번만 쓸 수 있습니다. 남에게 알려 주면 그 사람이 캐릭터를 가져가니 조심하세요.',
      deviceMake: '코드 받기',
      deviceUseHead: '코드로 이어받기',
      deviceUseInfo: '다른 기기에서 받은 코드를 넣으면 그 캐릭터를 이 기기에서 이어서 합니다. 이 기기에서 지금 하던 캐릭터는 더 이어지지 않습니다.',
      deviceUseHint: '코드 8자',
      deviceUse: '이어받기',
      deviceUseLink: '다른 기기에서 하던 캐릭터가 있나요? 코드로 이어받기',
      renameTitle: '눌러서 이름 바꾸기',
      renameLabel: '새 이름',
      renameSubmit: '변경',
      chatPlaceholder: '[[Enter로 대화|대화 입력]]',
      chatLabel: '대화 입력',
      stickLabel: '이동 조이스틱',
      hint: moduleHints(['땅 클릭/WASD: 이동', ['몬스터 클릭: 공격', 'combat'], ['1–3: 기술', 'combat'], ['Q: 물약', 'items'], ['R: 자동 사냥', 'away'], ['H: 처음 자리로', HOME_KEY], ['B: 가방', 'items'], 'M: 메뉴', 'N: 지도', ['Tab: 대상', 'combat'], 'Enter: 대화']), // 틀의 기본 문장 (이 게임은 자기 말로 덮어쓴다)
      attackNearest: '가까운 대상 공격',
      auto: '자동 사냥',
      bag: '가방',
      minimap: '미니맵',
      worldMap: '지도',
      worldMapHint: '빈 땅을 누르면 그곳으로 걸어가고, 표식을 누르면 자세히 봅니다. [[휠이나 +·−로|두 손가락이나 +·−로]] 확대하고 끌어서 옮깁니다.[[ (N 키, Esc로 닫기)|]]',
      mapList: '장소 목록',
      stunned: '기절',
      buffs: '걸려 있는 강화',
      mapMe: '내 위치',
      mapZoomIn: '확대',
      mapZoomOut: '축소',
      mapGo: '여기로 자동 이동',
      mapHunt: '가서 자동 사냥',
      mapStop: '자동 이동 멈추기',
      mapNone: '이 지역에는 표시할 장소가 없습니다.',
      mapLocked: '아직 열리지 않았습니다.',
      mapBossWarn: '우두머리: 혼자서는 버겁습니다. 여럿이 함께 오세요.',
      mapTraveling: '자동 이동 중',
      kindGoal: '목적지',
      kindTown: '거점',
      kindShop: '상점',
      kindForge: '대장간',
      kindDungeon: '던전',
      kindHunt: '사냥터',
      kindBoss: '우두머리',
      kindOther: '그 밖의 곳',
      // 미니맵 아래의 범례. 틀이 스스로 찍는 점만 적는다 (게임이 addMarks로 찍는 표식이 있으면 게임이 자기 말로 덮어쓴다)
      mapLegend: keyHints(['가운데 나', '흰 점 사람', ...(anyModule('combat') ? ['붉은 점 몬스터'] : []), ...(anyModule('party') ? ['하늘색 파티원'] : [])]),
      mapLegendDungeon: '붉은 ○ 우두머리 · 하늘색 파티원',
      bagPotions: '물약',
      bagMats: '제작 재료',
      dungeonEnter: '들어가기',
      dungeonLeave: '던전 나가기',
      dungeonLeaveConfirm: '한 번 더 누르면 나갑니다 (오늘 횟수는 돌아오지 않습니다)',
      bagToGear: '장비 보기 (메뉴의 장비)',
      bagItems: '아이템',
      bagPick: '칸을 누르면 이름과 설명이 보입니다.',
      dungeonNoRuns: '오늘은 더 들어갈 수 없습니다. 자정에 다시 열립니다.',
      menu: '메뉴',
      tabGear: '장비',
      tabMail: '우편',
      tabDaily: '일일',
      tabRank: '순위',
      tabMarket: '거래소',
      marketBrowse: '둘러보기',
      marketMine: '내 물건',
      marketPost: '올리기',
      marketAll: '전체',
      marketMat: '재료',
      marketSortNew: '최신순',
      marketSortCheap: '싼 순',
      marketSortCostly: '비싼 순',
      marketRefresh: '새로고침',
      marketPrev: '이전',
      marketNext: '다음',
      marketFilter: '종류',
      marketSort: '정렬',
      marketCancel: '내리기',
      marketPick: '고르기',
      marketPriceHint: `묶음 전체의 값 (${G.unit})`,
      marketCountHint: '수량',
      marketEmpty: '올라온 물건이 없습니다.',
      marketMineEmpty: '올려 둔 물건이 없습니다.',
      marketPostEmpty: '올릴 수 있는 물건이 없습니다. 끼고 있는 장비와 보급형, 물약은 올릴 수 없습니다.',
      marketPickHint: '아래에서 올릴 물건을 고르고 값을 적어 주세요.',
      marketGuestNote: '이 브라우저에서는 캐릭터가 저장되지 않아 거래소에서 사고팔 수 없습니다.',
      tabGuild: '길드',
      guildInvite: '길드 초대',
      guildCreate: '만들기',
      guildNameHint: `길드 이름 (${GUILD.nameMin}~${GUILD.nameMax}자)`,
      guildNoticeHint: '길드 공지',
      guildNoticeSet: '공지 올리기',
      guildKick: '추방',
      guildLeader: '길드장',
      guildLeave: '길드 나가기',
      guildMaxLv: '길드가 가장 높은 레벨입니다',
      guildGiveInfo: `${josa(G.name, '을', '를')} 기부하면 길드 레벨이 오르고, 길드원 모두의 경험치가 늘어납니다.`,
      guildChatHint: "대화창에 '/g 내용'이라고 치면 길드원에게만 보입니다. 초대는 길드장이 상대를 눌러서 합니다.",
      guildChatTag: '[길드]',
      tabBuild: '성장',
      skillUpHead: '기술 강화',
      skillUpBtn: '강화',
      equip: '끼기',
      unequip: '빼기',
      enhanceMaxed: '강화 끝',
      enhanceFailed: '강화 실패 · 장비는 그대로입니다',
      bagCharms: '특별한 물건',
      charmOn: '보호석 쓰기: 켬',
      charmOff: '보호석 쓰기: 끔',
      reforgeBtn: '재련',
      reforgeClose: '재련 접기',
      claim: '받기',
      claimAll: '모두 받기',
      gearEmpty: '남는 장비가 없습니다. 몬스터를 잡으면 가끔 떨어집니다.',
      mailEmpty: '받을 우편이 없습니다.',
      rankEmpty: '아직 순위가 없습니다.',
      dailyDone: '완료',
      dailyNote: '임무를 채우면 보상이 우편으로 옵니다. 자정에 새로 시작합니다.',
      none: '없음',
      autoOn: `자동 사냥을 켰습니다. 직접 움직이면 꺼집니다. 켠 채로 창을 닫으면 캐릭터가 남아 계속 사냥합니다${AWAY.maxS < 24 * 3600 ? `(하루 최대 ${AWAY.maxS / 3600}시간)` : ""}.`,
      autoOff: '자동 사냥을 껐습니다.',
      autoRest: '물약이 없어 체력이 찰 때까지 쉬어 갑니다.',
      autoResume: '체력이 찼습니다. 사냥을 이어 갑니다.',
      noTargetNearby: '주변에 대상이 없습니다.',
      // H 키(actions.ts의 goToTown)로 rules.home까지 걸어갈 때. 게임이 그곳의 이름으로 덮어쓴다
      goingTown: '처음 자리로 걸어갑니다.',
      language: '언어',
      chooseClass: '직업을 고르세요',
      changeClass: '직업 바꾸기',
      close: '닫기',
      shop: '상인',
      forge: '대장간', // 틀의 기본 문장 (이 게임은 자기 말로 덮어쓴다)
      party: '파티',
      partyInvite: '파티 초대',
      partyLeave: '나가기',
      partyAccept: '수락',
      partyDecline: '거절',
      report: '신고',
      reportConfirm: '한 번 더 누르면 신고',
      currentClass: '지금 직업',
      block: '대화 차단',
      unblock: '차단 풀기',
      owned: '보유 중',
      chatOpen: '대화하기',
      // ---- 분해, 잠금, 자동 분해, 가방 넓히기, 장비 비교 (경제 2단계) ----
      gearLockOn: '잠그기: 팔기·분해·거래소 올리기를 막습니다',
      gearLockOff: '잠금 풀기',
      gearMore: '강화·팔기·분해와 비교 펼치기',
      gearLess: '접기',
      gearTapHint: '장비를 누르면 강화·팔기·분해와, 지금 낀 장비와의 비교가 펼쳐집니다. 지금 낀 것보다 ▲ 좋음 · ▼ 나쁨 · ◆ 좋은 점과 나쁜 점이 섞임 · = 비슷.',
      bagFull: '장비 가방이 가득 찼습니다. 새로 떨어지는 장비는 버려집니다. 분해하거나 팔고, 가방을 넓히세요.',
      salvageAll: '일괄 분해…',
      salvageCancel: '취소',
      autoSalvageOff: '끔',
      salvageSource: '장비를 분해하면 나옵니다',
      cmpNow: '지금 바꾸면',
      cmpNone: '이 칸이 비어 있음',
      cmpBetter: '더 좋음',
      cmpWorse: '더 나쁨',
      cmpSame: '비슷',
      cmpMixed: '엇갈림',
      cmpThis: '이 장비',
      cmpWorn: '낀 장비',
    },
    monsters,
    dungeons,
    /** 능력치의 이름과 지금 주는 것 */
    build: {
      stats: Object.fromEntries(BUILD_STAT_IDS.map((k) => [k, { name: n.buildStats[k], info: buildMod[buildStatDef(k).mod] }])) as Record<BuildStat, { name: string; info: (v: number) => string }>,
    },
    /** 드롭 장비와 일일 임무의 이름 */
    gear: {
      slots: gearSlots,
      rarities,
      stats: Object.fromEntries(STAT_IDS.map((k) => [k, modText[statMod(k)]])) as Record<Stat, (v: number) => string>,
      dailies,
    },
    skills: n.skills,
    items,
    classes,
    /** 값이 들어가는 화면 문구 */
    fmt: {
      level: (lv: number, cls: string) => `Lv ${lv} ${cls}`.trim(),
      mapDist: (m: number, sec: number) => `${num(Math.round(m))}m · 걸어서 약 ${sec >= 90 ? `${Math.round(sec / 60)}분` : `${Math.max(1, Math.round(sec))}초`}`,
      mapHuntInfo: (mobs: string, exp: number, gold: number) => `${mobs} · 한 마리에 경험치 ${num(exp)}, ${G.name} 약 ${num(gold)}`,
      mapTravel: (name: string) => `${ro(name)} 자동 이동합니다.`,
      bagWorn: (n: number) => `(낀 것 ${n} 포함)`,
      mapOtherArea: (name: string) => `${josa(name, '은', '는')} 다른 지역에 있습니다. 먼저 이곳을 나가세요.`,
      mapAtDoor: (door: string, place: string) => `${door}의 입구에 왔습니다. ${josa(place, '은', '는')} 안에 있습니다: 들어가려면 던전 창의 '들어가기'를 누르세요.`,
      mapArrived: (name: string, hunt: boolean) => `${name}에 도착했습니다.${hunt ? ' 자동 사냥을 시작합니다.' : ''}`,
      mapMobs: (name: string, n: number) => (n > 1 ? `${name} ${n}마리` : name),
      // 기술 효과의 설명 (도감·기술 창이 쓴다). mod는 강화가 바꾸는 것(BuffMod)
      fxBuff: (mod: string, pct: number, sec: number, allies: boolean, radius: number) =>
        `${allies ? `둘레 ${radius}m의 아군과 함께 ` : ''}${sec}초 동안 ${({ damage: '주는 피해', guard: '받는 피해', regen: '체력 회복', crit: '치명타 확률' } as Record<string, string>)[mod] ?? mod} ${mod === 'guard' ? '−' : '+'}${pct}%${mod === 'crit' ? 'p' : ''}`,
      fxDash: (m: number, hit: boolean) => `대상에게 최대 ${m}m 단숨에 돌진${hit ? '해 피해' : ''}`,
      fxDot: (dps: number, sec: number, area: boolean, radius: number) => `${area ? `둘레 ${radius}m의 적 모두에게 ` : ''}${sec}초 동안 1초마다 피해 ${num(dps)}`,
      fxStun: (sec: number) => `${sec}초 기절`,
      buffLeft: (name: string, sec: number) => `${name} ${sec}초`,
      autoOnEarly: (lv: number) => `자동 사냥을 켰습니다. 직접 움직이면 꺼집니다. (창을 닫아도 이어지는 것은 직업을 고르고 레벨 ${lv}부터입니다.)`,
      marketBuy: (gold: number) => `사기 ${num(gold)}${G.unit}`,
      marketConfirm: (gold: number) => `확인 · ${num(gold)}${G.unit}`,
      marketSeller: (name: string) => `판매자 ${name}`,
      marketLeft: (h: number, m: number) => (h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`),
      marketMineHead: (n: number, max: number) => `내 물건 ${n} / ${max}`,
      marketPrice: (gold: number) => `값 ${num(gold)}${G.unit}`,
      marketStack: (name: string, n: number) => (n > 1 ? `${name} ×${n}` : name),
      marketPicked: (name: string) => `올릴 물건: ${name}`,
      marketFeeInfo: (pct: number, hours: number) => `팔리면 수수료 ${pct}%를 뗀 금액이 우편으로 옵니다. ${hours}시간 안에 팔리지 않으면 물건이 우편으로 돌아옵니다.`,
      marketNet: (price: number, fee: number, net: number) => `값 ${num(price)} − 수수료 ${num(fee)} = 받는 금액 ${num(net)}${G.unit}`,
      marketPriceRange: (max: number) => `값은 ${MARKET.minPrice}~${num(max)} 사이의 정수로 적어 주세요. 재료는 낱개 값이 아니라 묶음 전체의 값입니다.`,
      marketCountRange: (max: number) => `수량은 1~${max} 사이로 적어 주세요.`,
      guildCreateInfo: (lv: number, gold: number) => `길드를 만들려면 레벨 ${lv} 이상, ${G.name} ${num(gold)}이 필요합니다. 다른 길드에 들어가려면 그 길드장의 초대를 받으세요.`,
      guildInviteFrom: (guild: string, from: string) => `${from} 님이 '${guild}' 길드에 초대했습니다`,
      guildHead: (name: string, lv: number, pct: number) => `${name} · 길드 Lv ${lv} · 처치 경험치 +${pct}%`,
      guildExp: (exp: number, need: number) => `다음 레벨까지 ${num(exp)} / ${num(need)}`,
      /** 기부 단추. 길드원 줄에 적는 그 사람의 누적 기부(아래 guildGave)와 같은 글자가 되지 않게 한다. 단추 둘이 한 줄에 서야 하므로 짧게 둔다 */
      guildGive: (n: number) => `기부 ${num(n)}`,
      guildMembers: (n: number, max: number) => `길드원 ${n} / ${max}`,
      guildGave: (n: number) => `누적 기부 ${num(n)}`,
      channelShort: (n: number) => `${n}채널`,
      channelOpt: (n: number, people: number, foes: number) => `${n}채널 · ${people}명${foes > 0 ? ` · 적 ${foes}` : ''}`,
      statLeft: (n: number, perLevel: number) => `능력치 · 남은 점수 ${n} (레벨이 오를 때마다 ${perLevel}점)`,
      statResetFor: (gold: number) => `모두 돌려받기 · ${num(gold)}${G.unit}`,
      skillLv: (lv: number, max: number) => `${lv} / ${max}단계`,
      skillBonus: (pct: number) => `피해·회복 +${pct}%`,
      skillNeed: (lv: number) => `레벨 ${lv} 필요`,
      dungeonRuns: (left: number, max: number) => `오늘 남은 횟수 ${left} / ${max}`,
      dungeonNeedLv: (lv: number) => `레벨 ${lv}부터 들어갈 수 있습니다.`,
      dungeonInfo: (minutes: number, info: string) => `${info} 제한 시간 ${minutes}분.`,
      dungeonFoes: (n: number) => `남은 적 ${n}`,
      dungeonExit: (s: number) => `끝냈습니다. ${s}초 뒤에 밖으로 나갑니다.`,
      gearName: (what: string, rarity: string, plus: number, lv: number) => `${rarity ? rarity + ' ' : ''}${what}${plus > 0 ? ` +${plus}` : ''} (Lv ${lv})`,
      enhanceCost: (gold: number, pct: number) => `강화 ${num(gold)}${G.unit} · ${pct}%`,
      enhanceDust: (gold: number, dust: number, pct: number) => `강화 ${num(gold)}${G.unit} · ${itemName(SALVAGE.item)} ${num(dust)} · ${pct}%`,
      enhanceRisk: (from: number, charms: number, bind: number) => `+${from} 이상에서 강화하다 실패하면 한 단계 내려갑니다 (⚠ 표시). ${itemName(ENHANCE.charm)}을 쓰면 내려가지 않고, 쓸 수 있는 시도마다 성공해도 한 개가 듭니다 · ${num(charms)}개 있음 (얻는 곳은 가방의 설명에).${bind > 0 ? ` +${bind} 이상 강화한 장비는 거래소에 올릴 수 없습니다 (🔗 표시).` : ''}`,
      enhanceDownTo: (plus: number) => `강화 실패 · +${numRo(plus)} 내려감`,
      enhanceKept: (plus: number) => `강화 실패 · ${itemName(ENHANCE.charm)} 덕분에 +${plus} 그대로`,
      enhanceWard: (n: number) => ` · ${itemName(ENHANCE.charm)} ${n}개`,
      marketBoundNote: (n: number, bind: number) => `+${bind} 이상 강화한 장비 ${n}개는 귀속되어 올릴 수 없습니다.`,
      reforgeValueOnly: '이 장비는 옵션 종류가 모두 차 있어 값만 다시 뽑힙니다.',
      reforgeNote: (n: number, max: number, gold: number, dust: number) => `재련 ${n} / ${max}번 · 이번 값 ${num(gold)}${G.unit}, ${itemName(SALVAGE.item)} ${num(dust)}. 다시 뽑을 옵션을 두 번 누르세요 (종류와 값이 함께 바뀝니다)`,
      reforgeDone: (n: number, max: number) => `재련 ${n} / ${max}번 · 더 할 수 없습니다`,
      reforgeConfirm: (opt: string) => `확인 · ${opt} 다시 뽑기`,
      sellFor: (gold: number) => `팔기 ${num(gold)}${G.unit}`,
      power: (n: number) => `전투력 ${num(n)}`,
      streak: (n: number) => `출석 ${n}일째`,
      reward: (gold: number, exp: number, second: number) => [gold ? `${G.name} ${num(gold)}` : '', exp ? `경험치 ${num(exp)}` : '', second && coin ? `${coin.name} ${second}` : ''].filter(Boolean).join(' · '),
      mailTitle: (k: string, a: (string | number)[]) => (k === 'idle' ? `쉬는 동안 모인 것 (${a[0]}분)` : k === 'attend' ? `출석 ${a[0]}일째 보상` : k === 'dungeon' ? `${dungeonName(a[0])} 완료 보상` : k === 'daily' ? `일일 임무 완료: ${dailies[a[0] as DailyId] ?? a[0]}` : k === 'marketSold' ? `거래소 판매 대금: ${tradeWhat(a)} (값 ${num(a[2])}, 수수료 ${num(a[3])})` : k === 'marketExpired' ? `거래소에서 기간이 지나 돌아온 물건: ${tradeWhat(a)}` : k === 'marketBought' ? `거래소에서 산 물건: ${tradeWhat(a)} (자리가 없어 우편으로 보관)` : k === 'marketBack' ? `거래소에서 내린 물건: ${tradeWhat(a)} (자리가 없어 우편으로 보관)` : String(k)),
      status: (online: number | string, near: number, ping: string) => `접속자 ${online} · 주변 ${near} · 지연 ${ping}`,
      itemDamage: (pct: number) => `공격 피해 +${pct}%`,
      itemGuard: (pct: number) => `받는 피해 -${pct}%`,
      itemHeal: (n: number) => `체력 ${n} 회복`,
      skillLabel: (name: string, info: string, key: number) => `${name}: ${info} (단축키 ${key})`,
      swarmFoe: (name: string) => name, // 틀의 기본 문장 (이 게임은 자기 말로 덮어쓴다)
      short: (n: number) => `${G.name} ${num(n)} 모자람`,
      mat: (name: string, have: number, need: number) => `${name} ${have}/${need}`,
      blocked: (name: string) => `${name} 님의 대화를 차단했습니다. 내 화면에서만 보이지 않습니다.`,
      unblocked: (name: string) => `${name} 님의 차단을 풀었습니다.`,
      partyInvite: (name: string) => `${name} 님이 파티에 초대했습니다. 함께 잡으면 보상을 같이 받습니다.`,
      gold: (n: number) => `${G.name} ${num(n)}`,
      /** 가진 두 번째 재화 (내 정보 창). 그 재화를 쓰지 않는 게임(이름표에 currency2가 없다)은 빈 문자열: 표시가 숨는다 */
      coinHave: (n: number) => (coin ? `${coin.name} ${num(n)}` : ''),
      price: (n: number) => `${num(n)}${G.unit}`,
      have: (n: number, max: number) => `${n} / ${max}`,
      potions: (n: number) => `물약 ${n}`,
      distance: (m: number) => `${m}m`,
      /** 큰 수의 자릿수 구분 */
      num: (n: number) => num(n),
      sellConfirm: (gold: number) => `확인 · ${num(gold)}${G.unit}`,
      enhanceDone: (plus: number) => `강화 성공 · +${plus}`,
      // shop: 상점에서 장비를 파는 게임인가, craft: 제작이 있는 게임인가 (없는 것은 문장에서 뺀다)
      gearHint: (supplyMax: number, max: number, shop = true, craft = true) => `강화: ${shop ? '보급형(상점에서 산 것)' : '처음 받은 장비(보급형)'}은 +${supplyMax}까지, ${craft ? '만들거나 주운' : '주운'} 장비는 +${max}까지. ${ENHANCE.dropFrom <= max ? '' : `실패해도 장비는 그대로이고 ${G.name}만 듭니다.`}`,
      marketPageShort: (page: number, pages: number, total: number) => `${page}/${pages} · ${num(total)}개`,
      matFrom: (names: string[]) => `얻는 곳: ${names.join(', ')}`,
      matSource: (mat: string, names: string[]) => `${mat} 얻는 곳: ${names.join(', ')}`,
      dungeonMateIn: (names: string) => `파티원(${names})이 안에 있습니다. 들어가면 같은 곳으로 갑니다.`,
      // ---- 분해, 잠금, 자동 분해, 가방 넓히기, 장비 비교 (경제 2단계). 가루의 이름은 게임의 아이템 이름에서 읽는다 ----
      rarAtMost: (rarity: string) => `${rarity} 장비까지`,
      salvageFor: (dust: number) => `분해 · ${itemName(SALVAGE.item)} +${num(dust)}`,
      salvageConfirm: (dust: number) => `확인 · ${itemName(SALVAGE.item)} +${num(dust)}`,
      salvageAllPreview: (upTo: string, n: number, dust: number) => `${upTo} ${n}점 → ${itemName(SALVAGE.item)} +${num(dust)} (낀 장비·보급형·잠근 장비·강화한 장비는 빠집니다)`,
      salvageAllGo: (n: number) => `${n}점 분해`,
      salvageAllNone: (upTo: string) => `${upTo}: 분해할 장비가 없습니다 (낀 장비·보급형·잠근 장비·강화한 장비는 빠집니다)`,
      salvageOver: (room: number) => `${josa(itemName(SALVAGE.item), '을', '를')} 더 들 수 없습니다 (남은 자리 ${num(room)}). 수를 줄여 분해하세요.`,
      autoSalvageOpt: (v: string) => `자동 분해: ${v}`,
      autoSalvageOn: (upTo: string) => `${upTo}는 줍자마자 ${josa(itemName(SALVAGE.item), '이', '가')} 됩니다 (자리를 비운 동안에도). 남기고 싶은 등급이면 한 단계 낮추세요.`,
      dustHave: (n: number, max: number) => `${itemName(SALVAGE.item)} ${num(n)} / ${num(max)}`,
      bagUpFor: (step: number, gold: number) => `넓히기 +${step}칸 · ${num(gold)}${G.unit}`,
      bagLost: (n: number) => `가방이 가득 차 장비 ${num(n)}점을 줍지 못했습니다. 분해하거나 팔고, 가방을 넓히세요.`,
      cmpEven: (plus: number) => `둘 다 +${plus}이면`,
      cmpDmg: (v: number) => `공격 피해 ${signed(v)}%`,
      cmpGuard: (v: number) => `받는 피해 ${signed(v)}%`,
      cmpCrit: (v: number) => `치명타 ${signed(v)}%p`,
      cmpHp: (v: number) => `체력 ${signed(v)}`,
      cmpPower: (v: number) => `전투력 ${signed(v)}`,
      cmpRaise: (who: string, from: number, to: number, gold: number) => `${who} +${from}→+${to}: 기대 약 ${num(gold)}${G.unit}`,
      cmpCapped: (who: string, max: number) => `${josa(who, '은', '는')} +${max}까지만 강화됩니다`,
      cmpArrow: (verdict: string) => `지금 바꾸면: ${verdict}`,
      haveBig: (n: number, max: number) => `${num(n)} / ${num(max)}`,
      deviceCode: (minutes: number) => `${minutes}분 안에 다른 기기에서 이 코드를 넣으세요. 한 번 쓰면 사라집니다.`,
      teamCount: (n: number) => `${n}명`,
      teamMine: (team: string, score: number) => `내 팀 ${team} · 점수 ${num(score)}`,
    },
    /** 서버 안내문 (engine/shared/messages.ts의 종류별 문장). 게임이 더한 종류의 문장은 게임의 언어 파일에 있다 */
    msg: {
      joined: (a) => `${a[0]} 님이 들어왔습니다.`,
      left: (a) => `${a[0]} 님이 나갔습니다.`,
      renamed: (a) => `${a[0]} 님이 이름을 ${ro(String(a[1]))} 바꿨습니다.`,
      renameWait: () => '이름은 잠시 뒤에 다시 바꿀 수 있습니다.',
      replaced: () => '다른 곳에서 접속해 연결을 끊습니다.',
      noTarget: () => '대상이 없습니다.',
      tooFar: () => '대상이 너무 멉니다.',
      kill: (a) => `${monsters[a[0] as MonsterId] ?? a[0]} 처치. 경험치 +${a[1]}${coin && Number(a[2]) > 0 ? `, ${coin.name} +${a[2]}` : ''}, ${G.name} +${num(a[3])}`,
      levelUp: (a) => `레벨이 올랐습니다. Lv ${a[0]} · 능력치 ${BUILD.pointsPerLevel}점 (메뉴의 성장)`,
      died: (a) => `쓰러졌습니다. ${place(a[0])}에서 다시 일어났습니다. 잃은 것은 없습니다.`,
      bought: (a) => `${josa(itemName(a[0], a[1]), '을', '를')} 샀습니다.`,
      classChanged: (a) => `직업이 ${ro(classes[a[0] as ClassId]?.name ?? String(a[0]))} 정해졌습니다.`,
      classFar: () => '여기서는 직업을 바꿀 수 없습니다.', // 틀의 기본 문장 (이 게임은 자기 말로 덮어쓴다)
      bossUp: (a) => `${josa(monsters[a[0] as MonsterId] ?? String(a[0]), '이', '가')} 나타났습니다.`, // 틀의 기본 문장 (이 게임은 자기 말로 덮어쓴다)
      // 혼자 잡았으면 뒤 문장을 붙이지 않는다 (문장 끝에 빈칸도 남기지 않는다)
      bossDown: (a) => `${josa(monsters[a[0] as MonsterId] ?? String(a[0]), '이', '가')} 쓰러졌습니다.${Number(a[1]) > 1 ? ` ${a[1]}명이 함께 싸웠습니다.` : ''}`,
      shopFar: () => '상인 가까이에서 살 수 있습니다.',
      notStocked: () => '아직 상점에 없는 물건입니다.',
      alreadyBest: () => '이미 같거나 더 좋은 장비를 갖추고 있습니다.',
      gearBagFull: () => '장비 가방이 가득 찼습니다. 벗은 장비가 들어갈 자리를 만든 뒤(분해·팔기·가방 넓히기) 다시 하세요.',
      potionFull: () => '더 들 수 없습니다.',
      noGold: () => `${josa(G.name, '이', '가')} 모자랍니다.`,
      noPotion: () => '물약이 없습니다.',
      hpFull: () => '체력이 가득합니다.',
      loot: (a) => `${josa(itemName(a[0]), '을', '를')} 주웠습니다. 대장간에서 쓸 수 있습니다.`, // 틀의 기본 문장 (이 게임은 자기 말로 덮어쓴다)
      crafted: (a) => `${josa(itemName(a[0], a[1]), '을', '를')} 만들었습니다.`,
      forgeFar: () => '대장간 가까이에서 만들 수 있습니다.', // 틀의 기본 문장 (이 게임은 자기 말로 덮어쓴다)
      forgeClosed: () => '대장간이 아직 열리지 않았습니다.', // 틀의 기본 문장 (이 게임은 자기 말로 덮어쓴다)
      noMats: () => '재료가 모자랍니다.',
      nameBad: () => '쓸 수 없는 이름입니다.',
      nameTaken: () => '지금 다른 사람이 쓰고 있는 이름입니다.',
      reported: (a) => `${a[0]} 님을 신고했습니다. 최근 대화와 함께 운영진에게 전달됩니다.`,
      reportWait: () => '같은 사람은 잠시 뒤에 다시 신고할 수 있습니다.',
      partyInvited: (a) => `${a[0]} 님에게 파티 초대를 보냈습니다.`,
      partyBusy: (a) => `${a[0]} 님은 지금 초대할 수 없습니다.`,
      partyFull: () => `파티가 가득 찼습니다. (최대 ${PARTY.max}명)`,
      partyGone: () => '초대가 이미 사라졌습니다.',
      partyDeclined: (a) => `${a[0]} 님이 초대를 거절했습니다.`,
      partyJoined: (a) => `${a[0]} 님이 파티에 들어왔습니다.`,
      partyLeft: (a) => `${a[0]} 님이 파티에서 나갔습니다.`,
      partyYouLeft: () => '파티에서 나왔습니다.',
      partyEnded: () => '혼자 남아 파티가 풀렸습니다.',
      gearDrop: (a) => { const slot = gearSlots[a[0] as GearSlot] ?? String(a[0]); return `${rarities[String(a[1])] ?? a[1]} ${josa(slot, '을', '를')} 주웠습니다. 메뉴[[(M)|]]의 장비에서 낄 수 있습니다.`; },
      gearFull: () => '장비 가방이 가득 차서 줍지 못했습니다. 메뉴에서 안 쓰는 장비를 파세요.',
      gearSold: (a) => `장비를 팔았습니다. ${G.name} +${num(a[0])}`,
      enhanceOk: (a) => `강화에 성공했습니다. +${a[0]}`,
      enhanceFail: () => '강화에 실패했습니다. 장비는 그대로입니다.',
      enhanceDown: (a) => `강화에 실패해 +${numRo(Number(a[0]))} 내려갔습니다.`,
      enhanceSaved: (a) => `강화에 실패했지만 ${itemName(ENHANCE.charm)} 덕분에 +${a[0]} 그대로입니다.`,
      reforged: (a) => `재련했습니다 (${a[1]} / ${a[2]}번): ${statLine(a[3], a[4])} → ${statLine(a[0], a[5])}`,
      reforgeMax: (a) => `이 장비는 더 재련할 수 없습니다 (${a[0]}번까지).`,
      marketBound: (a) => `+${a[0]} 이상 강화한 장비는 거래소에 올릴 수 없습니다.`,
      enhanceMax: () => `더 강화할 수 없습니다. (보급형은 +${ENHANCE.supplyMax}, 만들거나 주운 장비는 +${ENHANCE.max}까지)`,
      mailNew: () => '우편이 왔습니다. 메뉴[[(M)|]]의 우편에서 받으세요.',
      mailGot: (a) => ['우편을 받았습니다.', [Number(a[0]) ? `${G.name} +${num(a[0])}` : '', Number(a[1]) ? `경험치 +${num(a[1])}` : '', Number(a[2]) && coin ? `${coin.name} +${a[2]}` : '', Number(a[3]) ? `장비 +${a[3]}` : '', Number(a[4]) ? `재료 +${a[4]}` : ''].filter(Boolean).join(', ')].filter(Boolean).join(' '),
      dungeonMate: (a) => `${a[0]} 님이 ${dungeonName(a[1])}에 들어갔습니다. 문에서 들어가면 같은 곳으로 갑니다.`,
      dungeonFar: () => '문에 더 가까이 가세요.',
      dungeonLevel: (a) => `레벨 ${a[0]}부터 들어갈 수 있습니다.`,
      dungeonNoRuns: () => '오늘은 더 들어갈 수 없습니다. 자정에 다시 열립니다.',
      dungeonEnter: (a) => `${dungeonName(a[0])}에 들어왔습니다. 우두머리를 쓰러뜨리면 끝납니다.`,
      dungeonClear: (a) => `${dungeonName(a[0])}${josa(dungeonName(a[0]), '을', '를').slice(dungeonName(a[0]).length)} 끝냈습니다. 보상은 우편으로 왔습니다.`,
      dungeonFail: () => '제한 시간이 지나 밖으로 나왔습니다.',
      dungeonLeft: () => '던전에서 나왔습니다.',
      dungeonBack: (a) => `${dungeonName(a[0])}의 하던 회차로 돌아왔습니다.`,
      channelMoved: (a) => `${a[0]}채널로 옮겼습니다.`,
      channelDungeon: () => '던전 안에서는 채널을 바꿀 수 없습니다.',
      channelFight: () => '싸우는 중에는 채널을 바꿀 수 없습니다. 싸움이 멎은 뒤에 다시 골라 주세요.',
      channelWait: (a) => `채널은 ${a[0]}초 뒤에 다시 바꿀 수 있습니다.`,
      channelFull: (a) => `${a[0]}채널이 가득 찼습니다. 다른 채널을 골라 주세요.`,
      statNone: () => `찍을 능력치 점수가 없습니다. 레벨이 오르면 ${BUILD.pointsPerLevel}점씩 받습니다.`,
      statReset: () => '능력치를 모두 돌려받았습니다. 다시 찍을 수 있습니다.',
      skillUp: (a) => `기술을 강화했습니다. ${a[1]}단계`,
      skillMax: () => '더 강화할 수 없는 기술입니다.',
      skillNeedLv: (a) => `레벨 ${a[0]}부터 강화할 수 있습니다.`,
      mailLeft: () => '자리가 모자라 받지 못한 물건은 우편에 남겨 두었습니다. 가방을 비운 뒤 다시 받으세요.',
      marketGuest: () => '이 브라우저에서는 캐릭터가 저장되지 않아 거래소를 쓸 수 없습니다.',
      marketFull: (a) => `거래소에는 한 번에 ${a[0]}개까지만 올릴 수 있습니다. 올려 둔 물건을 내리거나 팔리기를 기다려 주세요.`,
      marketPriceBad: (a) => `값은 ${MARKET.minPrice}${G.unit} 이상 ${a[0]}${G.unit} 이하의 정수여야 합니다.`,
      marketMailFull: (a) => `우편함에 물건이 든 우편이 ${a[0]}통 이상 쌓여 있습니다. 우편을 먼저 받아 주세요. 올려 둔 물건을 내리는 것은 지금도 됩니다.`,
      marketCrowded: () => '거래소가 가득 찼습니다. 잠시 뒤에 다시 올려 주세요.',
      chatWait: () => '대화가 너무 몰려 방금 한 말이 전해지지 않았습니다. 잠시 뒤에 다시 말해 주세요.',
      marketNeedLv: (a) => `거래소에서 사고팔려면 레벨 ${a[0]}이 되어야 합니다. 둘러보기는 지금도 됩니다.`,
      marketCant: () => '거래소에 올릴 수 없는 물건입니다. 끼고 있는 장비와 보급형은 올릴 수 없습니다.',
      marketPosted: (a) => `거래소에 올렸습니다. 값 ${num(a[0])}${G.unit}`,
      marketBought: (a) => `거래소에서 샀습니다. ${G.name} -${num(a[0])}`,
      marketGone: () => '이미 팔렸거나 내려간 물건입니다.',
      marketOwn: () => '자기가 올린 물건은 살 수 없습니다. 내 물건에서 내릴 수 있습니다.',
      marketCanceled: () => '올린 물건을 내렸습니다.',
      guildGuest: () => '이 브라우저에서는 캐릭터가 저장되지 않아 길드에 들 수 없습니다.',
      guildNeedLv: (a) => `길드는 레벨 ${a[0]}부터 만들 수 있습니다.`,
      guildNameBad: () => `쓸 수 없는 길드 이름입니다. ${GUILD.nameMin}~${GUILD.nameMax}자로 지어 주세요.`,
      guildNameTaken: () => '이미 있는 길드 이름입니다.',
      guildCreated: (a) => `'${a[0]}' 길드를 만들었습니다.`,
      guildNotLeader: () => '길드장만 할 수 있습니다.',
      guildBusy: (a) => `${a[0]} 님은 초대할 수 없습니다. 이미 길드가 있거나 손님입니다.`,
      guildFull: () => '길드가 가득 찼습니다.',
      guildInvited: (a) => `${a[0]} 님을 길드에 초대했습니다.`,
      guildJoined: (a) => `${a[0]} 님이 길드에 들어왔습니다.`,
      guildLeft: (a) => `${a[0]} 님이 길드를 떠났습니다.`,
      guildYouLeft: () => '길드에서 나왔습니다.',
      guildKicked: () => '길드에서 추방됐습니다.',
      guildGave: (a) => `길드에 ${G.name} ${num(a[0])}을 기부했습니다.`,
      guildLevelUp: (a) => `길드 레벨이 올랐습니다. Lv ${a[0]}`,
      guildNone: () => '길드가 없습니다. 메뉴의 길드에서 만들거나 초대를 받으세요.',
      awayBack: (a) => `자리를 비운 ${a[0]}분 동안 자동 사냥을 이어 갔습니다. ${coin ? `${coin.name} +${a[1]}, ` : ''}${G.unit} +${num(a[2])}${Number(a[3]) > 0 ? `, 레벨 +${a[3]}` : ''}`,
      // ---- 분해, 잠금, 자동 분해, 가방 넓히기 (경제 2단계). 가루의 이름은 게임의 아이템 이름에서 읽는다 ----
      salvaged: (a) => `장비 ${a[0]}점을 분해했습니다. ${itemName(SALVAGE.item)} +${num(a[1])}`,
      salvageCant: () => '분해할 수 없는 장비가 섞여 있습니다. 낀 장비, 보급형, 잠근 장비는 분해할 수 없습니다.',
      salvageFull: (a) => `${josa(itemName(SALVAGE.item), '을', '를')} 더 들 수 없어 분해하지 않았습니다. 나올 양 ${num(a[0])}, 남은 자리 ${num(a[1])}`,
      gearLocked: () => '잠근 장비입니다. 잠금을 풀어야 팔거나 분해하거나 거래소에 올릴 수 있습니다.',
      autoSalvaged: (a) => `주운 장비 ${a[0]}점을 자동으로 분해했습니다. ${itemName(SALVAGE.item)} +${num(a[1])}`,
      awayLimit: (a) => `오늘의 자리 비움 사냥 시간(${a[0]}시간)을 다 썼습니다. 창을 닫으면 자동 사냥이 멈춥니다. 자정에 다시 채워집니다.`,
      awayGear: (a) => ['자리를 비운 동안:', Number(a[0]) > 0 ? `가방이 가득 차 장비 ${num(a[0])}점을 줍지 못했습니다.` : '', Number(a[1]) > 0 ? `장비 ${num(a[1])}점을 자동으로 분해했습니다. ${itemName(SALVAGE.item)} +${num(a[2])}` : ''].filter(Boolean).join(' '),
      bagUpDone: (a) => `가방을 넓혔습니다. 장비 ${a[0]}칸`,
      bagUpMax: () => '가방을 더 넓힐 수 없습니다.',
      // ---- 운영 ----
      muted: (a) => `대화가 막혀 있어 말을 보낼 수 없습니다.${Number(a[0]) > 0 ? ` ${span(a[0])} 뒤에 풀립니다.` : ''}`,
      kicked: () => '운영자가 접속을 끊었습니다.',
      banned: (a) => `접속이 막혀 있습니다.${Number(a[0]) > 0 ? ` ${span(a[0])} 뒤에 풀립니다.` : ''}`,
      adminNotice: (a) => `[운영] ${a[0]}`,
      adminChat: (a) => `[운영] ${a[0]}`,
      adminGive: (a) => `운영자가 지급했습니다: ${grantWhat(a[0])} ${num(a[1])}`,
      adminTake: (a) => `운영자가 회수했습니다: ${grantWhat(a[0])} ${num(a[1])}`,
      handoffGuest: () => '이 브라우저에서는 캐릭터가 저장되지 않아 다른 기기로 옮길 수 없습니다.',
      handoffBad: (a) => `코드가 맞지 않거나 시간이 지났습니다. ${a[0]}번 더 넣어 볼 수 있습니다.`,
      handoffWait: (a) => `코드를 너무 많이 틀렸습니다. ${a[0]}분 뒤에 다시 해 주세요.`,
      handoffSelf: () => '이 기기에서 하고 있는 캐릭터의 코드입니다. 다른 기기에서 넣어 주세요.',
      handedOff: () => '이 캐릭터를 다른 기기로 옮겼습니다. 이 기기에서는 더 이어지지 않습니다.',
      teamJoined: (a) => `${teamName(a[0])} 팀에 들어갔습니다.`,
      teamFull: (a) => `${teamName(a[0])} 팀에 사람이 더 많습니다. 다른 팀을 고르세요.`,
      teamStay: () => '이 게임에서는 팀을 바꿀 수 없습니다.',
    } satisfies Record<EngineMsgKey, (a: MsgArg[]) => string>,
    /** 처음 접속할 때 붙이는 무작위 이름의 재료 */
    nameA: n.nameA,
    nameB: n.nameB,
  };
};

/** 틀의 언어 묶음의 모양 */
export type EngineLocale = ReturnType<typeof koBase>;
/** 언어 묶음의 모양: 틀의 것에 게임이 더한 것(ext.ts의 LocaleExt)을 묶음별로 합친 것. 게임이 없으면 틀의 모양 그대로다 */
export type Locale = EngineLocale & LocaleExt;

/**
 * 아이템의 한 줄 설명 (상점, 대장간). 수치로 된 효과는 아이템 정의에서 읽어 문장을 만든다: 정의의 값을 바꾸면 설명이 따라 바뀐다.
 * 무기는 공격 피해가 느는 비율, 갑옷은 받는 피해가 주는 비율, 물약은 회복량이고, 그런 효과가 없으면 언어 파일에 적힌 설명이다
 */
export function itemInfo(loc: Pick<EngineLocale, 'items' | 'fmt'>, id: ItemId): string {
  const def: ItemDef = ITEMS[id], text = loc.items[id].info;
  if (text) return text;
  if (def.damage !== undefined && def.damage !== 1) return loc.fmt.itemDamage(Math.round((def.damage - 1) * 100));
  if (def.guard !== undefined) return loc.fmt.itemGuard(Math.round((1 - def.guard) * 100));
  if (def.heal !== undefined) return loc.fmt.itemHeal(def.heal);
  return '';
}
export type UiKey = keyof Locale['ui'];

/** 재련 안내의 옵션 한 줄 (서버가 보여 줄 값을 보낸다) */
const statLine = (id: unknown, v: unknown): string => (isStat(id) ? modText[statMod(id)](Number(v)) : String(id ?? ''));
