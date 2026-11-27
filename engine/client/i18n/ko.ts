// 한국어, 틀의 몫: 어느 게임에서나 쓰는 화면의 문장이다 (접속, 내 정보, 전투, 상점·제작·장비·우편·일일·순위·길드·거래소·채널·던전·자동 사냥, 틀의 안내문).
// 기준 언어다: 다른 언어의 틀 파일(en.ts)은 이 파일과 같은 모양을 갖춰야 컴파일된다.
// 이 게임의 문장(등탑, 퀘스트 등)과 내용의 이름(몬스터, 아이템, 직업 …)은 여기 없다: 게임의 언어 파일(games/deungbul/client/i18n/)에 있고 mergeLocale로 합친다.
// 틀의 문장이 내용의 이름을 넣어야 할 때(처치 안내의 몬스터 이름, 두 번째 재화의 이름)는 게임이 넘긴 이름표(ContentNames)에서 읽는다. 그래서 koBase는 이름표를 받는 함수다.
// 이 파일은 게임의 파일을 import하지 않고, 게임의 낱말을 적지 않는다 (games/deungbul/test/split.test.ts가 검사한다).
import type { BuildStat, ClassId, DailyId, GearSlot, HeroBonus, ItemDef, ItemId, MonsterId, Stat, StatMod } from '../../shared/defs';
import { BANNER_TABLE, BUILD, BUILD_STAT_IDS, CHAPTERS, pctText, ENHANCE, GUILD, heroDef, heroGearDef, HOME_KEY, ITEMS, MARKET, PARTY, SALVAGE, STAT_IDS, TEAMS, buildStatDef, isStat, rarityDef, statMod } from '../../shared/defs';
import { AWAY } from '../../shared/auto';
import type { MsgMap } from '../../shared/ext';
import type { MsgArg, MsgKey } from '../../shared/messages';
import type { LocaleExt } from './ext';
import { dungeonLabel, itemNameOf, uiText, type ContentNames } from './names';
import { anyModule } from '../../shared/picked';
import { charName, type CharErr } from '../../shared/defs/chardef';
import type { MorphMods } from '../../shared/defs/morph';

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

/** 영웅의 성장의 덤 한 칸의 문장 (engine/shared/defs/herogrow.ts의 HeroBonus) */
const pct100 = (v: number) => Math.round(v * 100);
const bonusKo: Record<keyof HeroBonus, (v: number) => string> = {
  atk: (v) => `공격 +${v}`, hp: (v) => `체력 +${v}`, atkPct: (v) => `공격 +${pct100(v)}%`, hpPct: (v) => `체력 +${pct100(v)}%`, dmg: (v) => `주는 피해 +${pct100(v)}%`, guard: (v) => `받는 피해 −${pct100(v)}%`,
};
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
/** 캐릭터 정의의 칸 이름 (거절 까닭의 자리: 'stats.atk' → '능력치 atk') */
const charField = (path: string): string => {
  const [a, b, c] = path.split('.');
  const top: Record<string, string> = { id: 'id', name: '이름', bio: '소개', look: '겉모습', role: '역할', rarity: '등급', stats: '능력치', skills: '기술', v: '버전' };
  return [top[a] ?? a, b, c].filter(Boolean).join(' ');
};
/** 캐릭터 정의의 거절 까닭 (engine/shared/defs/chardef.ts의 CharErr): 자리와 값을 받아 문장으로 */
const charErrKo: Record<CharErr, (f: string, a: string) => string> = {
  shape: () => '정의의 모양이 틀렸습니다.', extra: (f) => `모르는 칸이 있습니다: ${f}`, missing: (f) => `빠진 칸이 있습니다: ${f}`, type: (f) => `${f}의 값의 종류가 틀렸습니다.`,
  version: (_f, a) => `형식의 버전이 다릅니다 (${a}이어야 합니다).`, id: () => 'id는 영문 소문자로 시작하는 3~32자여야 합니다.', idTaken: () => '이미 있는 id입니다.',
  length: (f, a) => `${f}의 글자 수가 맞지 않습니다 (${a}자).`, control: (f) => `${f}에 보이지 않는 글자가 있습니다.`, charset: (f) => `${f}에 쓸 수 없는 글자가 있습니다.`,
  space: (f) => `${f}의 앞뒤나 사이에 빈칸이 너무 많습니다.`, banned: (f) => `${f}에 쓸 수 없는 말이 있습니다.`, role: (_f, a) => `없는 역할입니다: ${a}`, rarity: () => '없는 등급입니다.',
  stat: (f) => `모르는 능력치입니다: ${f}`, statMin: (f, a) => `${f}가 너무 작습니다 (${a} 이상).`, statCap: (f, a) => `${f}가 이 등급의 상한 ${a}를 넘습니다.`,
  budget: (_f, a) => `능력치의 합이 이 등급의 예산 ${a}를 넘습니다.`, skill: (_f, a) => `고를 수 없는 기술입니다: ${a}`, skillCount: (_f, a) => `기술은 ${a}개까지입니다.`, skillDup: (_f, a) => `같은 기술이 두 번 있습니다: ${a}`,
  part: (f, a) => `없는 부품입니다: ${f} ${a}`.trim(), slotOff: (f) => `이 게임에서 쓰지 않는 칸입니다: ${f}`, color: (f) => `색이 틀렸습니다: ${f}`, pattern: (_f, a) => `없는 무늬입니다: ${a}`, size: (f) => `크기 배율이 범위 밖입니다: ${f}`,
};
/** 변신의 보정을 한 줄로 */
const morphModsKo = (m: MorphMods): string => [m.damage ? `주는 피해 +${pct100(m.damage)}%` : '', m.guard ? `받는 피해 −${pct100(m.guard)}%` : '', m.crit ? `치명타 +${pct100(m.crit)}%p` : '', m.regen ? `회복 +${pct100(m.regen)}%` : ''].filter(Boolean).join(', ');
/** 조작 안내의 항목들을 한 줄로 잇는다. 항목 안의 빈칸은 줄이 바뀌지 않는 빈칸으로 바꿔서, 줄이 넘어갈 때 항목 사이에서만 끊기게 한다 */
export const keyHints = (items: string[]) => items.map((s) => s.replace(/ /g, ' ')).join(' · ');
/** 틀의 기본 조작 안내: [글, 모듈] 짝은 그 모듈을 고른 게임에만 넣는다 (그 키를 그 모듈이 달기 때문이다: engine/client/bus.ts의 bindKey) */
/** [글, true/false] 짝은 그 값이 참일 때만 넣는다 (내용의 HOME_KEY처럼 모듈이 아닌 켜고 끄기) */
export const moduleHints = (items: (string | [string, string | boolean])[]): string => keyHints(items.filter((x) => typeof x === 'string' || (typeof x[1] === 'boolean' ? x[1] : anyModule(x[1]))).map((x) => (typeof x === 'string' ? x : x[0])));
export const signed = (n: MsgArg) => (Number(n) > 0 ? `+${n}` : String(n));
/** 팀의 이름 (teams 모듈): 팀 번호 → 게임이 언어 파일의 ui에 적은 이름 (TEAMS의 name 키). 없는 번호는 빈 문자열 */
export const teamName = (i: MsgArg): string => { const d = TEAMS[Number(i)]; return d ? uiText.get(d.name) : ''; };
/** 영웅의 이름 (roster 모듈): 영웅 id → 게임이 언어 파일의 ui에 적은 이름 (HeroDef.name 키). 없는 영웅은 id 그대로 */
export const heroName = (id: MsgArg): string => { const d = heroDef(String(id)); return d ? d.label ?? uiText.get(d.name) : String(id); };
/** 영웅 장비의 이름 (herogear 모듈: HeroGearDef.name 키). 없는 장비는 id 그대로 */
export const heroGearName = (id: MsgArg): string => { const d = heroGearDef(String(id)); return d ? uiText.get(d.name) : String(id); };
/** 등급의 이름 (HeroRarityDef.name 키: 틀의 기본 등급은 heroRarity0~2) */
export const rarityName = (r: MsgArg): string => uiText.get(rarityDef(Number(r)).name);
/** 배너의 이름 (BannerDef.name 키). 없는 배너는 id 그대로 */
export const bannerName = (id: MsgArg): string => { const b = BANNER_TABLE[String(id)]; return b ? uiText.get(b.name) : String(id); };
/** 장의 이름 (ChapterDef.name 키). 없는 장은 빈 문자열 */
export const chapterName = (ch: number): string => { const c = CHAPTERS[ch]; return c ? uiText.get(c.name) : ''; };
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
  /** 치르는 재화의 이름 (뽑기·영웅·열쇠): 'gold'면 첫 재화, 그 밖에는 두 번째 재화 */
  const curName = (c: MsgArg) => (c === 'gold' ? G.name : coin?.name ?? '재화');
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
      // 수집형·방치형 (roster, gacha, squad, stages 모듈: hud/collect.ts, hud/stagebar.ts). 영웅·배너·장·역할의 이름은 게임이 그 name 키로 적는다
      tabHeroes: '영웅',
      tabGacha: '뽑기',
      tabSquad: '편성',
      tabStages: '단계',
      heroRarity0: '일반',
      heroRarity1: '희귀',
      heroRarity2: '전설',
      heroNone: '아직 영웅이 없습니다. 뽑기에서 영웅을 얻으세요.',
      heroLevelBtn: '레벨 업',
      heroStarBtn: '별 올리기',
      heroMax: '최대',
      heroNotOwned: '아직 없음',
      gachaOne: '1번 뽑기',
      gachaTen: '10번 뽑기',
      gachaRates: '확률 보기',
      gachaRatesHide: '확률 닫기',
      gachaRatesHead: '확률 공개',
      gachaRatesRarity: '등급별 확률',
      gachaRatesHero: '영웅별 확률',
      gachaRatesPity: '천장에 닿은 뽑기의 확률',
      gachaRatesTen: '10번 뽑기의 열째(보장)의 확률',
      gachaNoCash: '모든 뽑기는 게임 안에서 얻는 재화로만 합니다. 현금 결제는 없습니다.',
      gachaHistory: '최근 뽑기 기록',
      gachaNoHistory: '아직 뽑은 적이 없습니다.',
      gachaResult: '뽑기 결과',
      gachaPityMark: '천장',
      squadHead: '함께 싸울 영웅',
      squadEmpty: '빈 자리',
      squadAdd: '넣기',
      squadRemove: '빼기',
      squadNone: '편성할 영웅이 없습니다. 뽑기에서 영웅을 얻으세요.',
      // 영웅의 성장 (기술 레벨·각성·영웅 장비·시너지·진형: hud/herogrow.ts). 장비·세트·칸·시너지·패시브의 이름은 게임이 그 name 키로 적는다
      heroDetail: '자세히',
      heroBack: '← 영웅 목록',
      htLevel: '레벨',
      htStar: '별',
      htAwaken: '각성',
      htSkill: '기술',
      htGear: '장비',
      heroAwakenBtn: '각성하기',
      heroAwakenDone: '모든 각성을 마쳤습니다.',
      heroSkillBtn: '기술 올리기',
      heroSkillDone: '기술 레벨이 최대입니다.',
      heroNoSkill: '이 영웅의 역할에는 기술이 없습니다.',
      heroPassives: '열린 패시브',
      heroNext: '다음 단계',
      tabHGear: '영웅 장비',
      hgEquip: '끼기',
      hgUnequip: '빼기',
      hgEnhance: '강화',
      hgSalvage: '분해',
      hgEmptySlot: '비어 있음',
      hgNone: '영웅 장비가 없습니다. 단계와 던전을 깨면 얻습니다.',
      hgPick: '이 칸에 낄 수 있는 장비',
      hgPickNone: '이 칸에 낄 장비가 없습니다.',
      hgSets: '세트',
      hgClose: '닫기',
      hgMaxed: '최대 강화',
      rowFront: '앞줄',
      rowBack: '뒷줄',
      rowToFront: '앞으로',
      rowToBack: '뒤로',
      rowFrontInfo: '앞줄은 주인 앞에 서서 몬스터의 공격을 먼저 받습니다.',
      rowBackInfo: '뒷줄은 주인 뒤에서 안전하게 싸웁니다.',
      synHead: '시너지',
      synNone: '같은 진영의 영웅을 함께 넣으면 시너지가 켜집니다.',
      stageAuto: '자동 진행',
      stageStart: '도전',
      stageLeave: '나가기',
      stageBoss: '우두머리',
      stageGo: '가기',
      stageNow: '지금',
      stageCleared: '깸',
      stageLockedMark: '잠김',
      stageWaveClear: '물결을 막았습니다',
      stageClearBig: '단계 깸!',
      stageFailBig: '실패: 깬 단계로 돌아갑니다',
      dungeonKeyBuy: '열쇠 사기',
      // 소탕·오프라인 진행·픽업 배너·선택권 (hud/sweep.ts, hud/stagebar.ts, hud/dungeon.ts, hud/collect.ts)
      sweepHead: '소탕',
      sweepInfo: '이미 깬 곳을 싸우지 않고 바로 끝내 보통 보상을 받습니다 (처음 깬 보상은 없습니다).',
      sweepResult: '소탕 결과',
      sweepDungeons: '던전 소탕',
      // 단계 밖: 메뉴에서 던전 들어가기, 돌아왔을 때의 창 (hud/stagebar.ts, hud/idleback.ts)
      dungeonGoHead: '던전',
      dungeonGoInfo: '문까지 가지 않고 바로 들어갑니다. 단계 안이면 단계에서 나와 들어갑니다.',
      dungeonGoBtn: '들어가기',
      idleBackTitle: '쉬는 동안 모인 것',
      idleBackClaim: '받기',
      idleBackLater: '나중에 (우편에 남김)',
      gachaPickup: '픽업',
      gachaRatesPickup: '픽업과 반반',
      gachaRatesSure: '확정일 때의 확률 (반반에서 진 다음)',
      gachaRatesEffective: '실효 확률 (1번 뽑기를 오래 되풀이할 때의 평균: 천장과 반반을 넣은 것)',
      gachaAlways: '상시',
      gachaSelectHead: '영웅 선택권',
      gachaSelectBtn: '고르기',
      gachaNoOpen: '지금 열린 배너가 없습니다.',
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
      block: '차단',
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
      // 판 (rooms 모듈: hud/rooms.ts). 게임은 같은 키로 덮어쓴다 (대기실의 설명 roomLobbyInfo, 컴퓨터의 이름 roomCpu …)
      roomLobby: '대기실',
      roomLobbyInfo: '다른 사람과 한 판을 둡니다. 혼자면 컴퓨터와 둘 수 있습니다.',
      roomQuick: '빠른 대국',
      roomWithCpu: '컴퓨터와 두기',
      roomHost: '판 만들기',
      roomOpen: '사람을 기다리는 판',
      roomNone: '기다리는 판이 없습니다. 판을 만들어 기다리세요.',
      roomNoneCpu: '기다리는 판이 없습니다. 판을 만들거나 컴퓨터와 두세요.',
      roomJoin: '들어가기',
      roomCancel: '그만두기',
      roomCpu: '컴퓨터',
      roomEmpty: '빈 자리',
      roomAway: '끊김',
      roomLeft: '떠남',
      roomMyTurn: '내 차례',
      roomCpuTurn: '컴퓨터가 두는 중',
      roomPass: '차례 넘기기',
      roomResign: '기권',
      roomWin: '이겼습니다!',
      roomLose: '졌습니다',
      roomDraw: '비겼습니다',
      roomAgain: '다시 하기',
      roomToLobby: '대기실로',
      roomAgainWaitNote: '다른 사람이 다시 하기를 누르면 시작합니다.',
      roomFoeGoneNote: '함께 두던 사람이 판을 떠났습니다.',
      /** 기권 단추를 한 번 누른 뒤 (3초 안에 다시 누르면 기권) */
      roomResignSure: '한 번 더 누르면 기권',
      // 캐릭터 정의와 변신 (chars, morph 모듈)
      tabMorph: '변신',
      morphNone: '가진 캐릭터가 없습니다.',
      morphOnBtn: '변신',
      morphOffBtn: '변신 풀기',
      morphNow: '변신 중',
      morphLookOnly: '겉모습만 바뀝니다',
      charAtk: '공격',
      charHp: '체력',
      // 운영의 바탕: 공지, 점검, 기능 깃발, 주간·월간 임무 (hud/ops.ts, hud/menu/daily.ts). 게임의 깃발 이름은 게임이 flag<이름>으로 더한다
      noticeTitle: '공지',
      noticeClose: '닫기',
      gateMaint: '서버 점검 중입니다.',
      gateJoinClosed: '지금은 새로 접속할 수 없습니다. 잠시 뒤에 다시 시도해 주세요.',
      dailyDay: '일일 임무',
      dailyWeek: '주간 임무',
      dailyMonth: '월간 임무',
      flagJoin: '새 접속',
      flagChat: '대화',
      flagMarket: '거래소',
      flagMail: '우편 받기',
      flagGacha: '뽑기',
      flagOther: '이 기능',
      // 웹 출시의 바탕: 설정 창 (hud/settings.ts)
      tabSettings: '설정',
      setSound: '소리',
      setGraphics: '그래픽',
      setQuality: '품질',
      qHigh: '높음',
      qMid: '보통',
      qLow: '낮음',
      qCustom: '직접 고름',
      setShadows: '음영(빛의 가림)',
      setPixel: '해상도 상한',
      setFar: '그리는 거리',
      farNear: '가까이',
      farMid: '보통',
      farFar: '멀리',
      setScreen: '화면',
      setCalm: '화면 흔들림 끄기',
      setUi: '글자·창 크기',
      setFullscreen: '전체 화면',
      on: '켬',
      off: '끔',
      setKeys: '단축키',
      setKeysHint: '바꿀 기능의 키를 누른 뒤 새 키를 누르세요. Esc는 그만두기. 이동(WASD·방향키)·Enter는 바꿀 수 없습니다.',
      setKeyWait: '키를 누르세요…',
      setKeysReset: '단축키를 처음대로',
      setGame: '게임',
      setHelp: '도움말',
      keyMenu: '메뉴',
      keyMap: '지도',
      keyHome: '집으로',
      keyTarget: '가까운 대상',
      keyPotion: '물약',
      keyBag: '가방',
      keyAuto: '자동 사냥',
      // 튜토리얼 (hud/tutorial.ts)
      tutName: '튜토리얼',
      tutReplay: '다시 보기',
      tutNext: '다음',
      tutSkip: '건너뛰기',
      // 약관·처리방침·동의 (hud/legal.ts)
      legalHead: '약관과 개인정보',
      legalTerms: '이용약관',
      legalPrivacy: '개인정보 처리방침',
      legalAsk: '게임을 계속하려면 이용약관과 개인정보 처리방침을 읽고 동의해 주세요.',
      legalAgree: '동의하고 계속',
      legalNo: '동의하지 않음',
      legalNeed: '동의해야 게임을 이용할 수 있습니다.',
      // 내 데이터 (hud/legal.ts)
      myDataHead: '내 데이터',
      myDataExportHead: '내 데이터 내려받기 (JSON 파일)',
      myDataExport: '내려받기',
      myDataEraseHead: '이 캐릭터의 데이터 삭제 요청',
      myDataErase: '삭제 요청',
      myDataEraseSure: '정말 지울까요? 한 번 더 누르세요',
      myDataErasing: '삭제를 요청했습니다',
      myDataCancel: '요청 거두기',
      gateErased: '요청한 대로 캐릭터의 데이터를 지웠습니다. 다시 접속하면 새 캐릭터로 시작합니다.',
      // 탭 숨김: 자리 비움 (lifecycle.ts)
      afkTag: '자리 비움',
      // 손님 진행 보호 (hud/keepsafe.ts)
      keepSafe: '이 캐릭터는 이 브라우저에만 저장되어 있습니다. 브라우저 데이터를 지우거나 오래 들어오지 않으면 잃을 수 있습니다. 메뉴의 기기 탭에서 옮기기 코드를 받아 두면 다른 기기에서도 이어 할 수 있습니다.',
      keepOpen: '기기 탭 열기',
      keepLater: '알겠어요',
      // 버전 불일치: 앱·데스크톱 (웹은 stale·reload. main.ts의 outdated)
      staleApp: '새 버전이 필요합니다. 게임을 업데이트해 주세요.',
      updateApp: '업데이트',
      // 사회와 안전: 대화 채널·귓말 (hud/chat.ts), 정해진 문장, 사람 카드, 설정의 대화 칸, 연령 창, 친구 탭 (hud/social.ts)
      chatTabAll: '전체',
      chatTabNear: '근처',
      chatTabParty: '파티',
      chatTabGuild: '길드',
      chatTabWhisper: '귓말',
      chatTagNear: '[근처]',
      chatTagParty: '[파티]',
      chatTagWhisper: '[귓말]',
      chatWhisperHow: '귓말은 "/w 이름 내용"으로 보냅니다. 사람이나 대화의 이름을 눌러도 됩니다.',
      chatLimited: '정해진 문장만 쓸 수 있습니다',
      qcOpen: '문장',
      qcHello: '안녕하세요!',
      qcThanks: '고마워요!',
      qcSorry: '미안해요.',
      qcGood: '잘했어요!',
      qcHelp: '도와주세요!',
      qcWait: '잠깐만요.',
      qcGo: '가요!',
      qcBye: '또 봐요!',
      whisper: '귓말',
      friendAsk: '친구 요청',
      setTalk: '대화',
      setChatShow: '대화 보이기',
      setChatShowNote: '끄면 대화창과 말풍선이 보이지 않습니다.',
      setWhisperIn: '귓말 받기',
      setFriendIn: '친구 요청 받기',
      blockHead: '차단한 사람',
      blockNone: '차단한 사람이 없습니다. 차단하면 그 사람의 대화·귓말·친구 요청·초대가 오지 않습니다.',
      talkLimitedNote: '제한 모드입니다: 정해진 문장만 쓸 수 있고, 귓말과 친구 요청을 받지 않습니다.',
      ageHead: '나이 확인',
      ageAskYear: '태어난 해를 골라 주세요.',
      ageAskBand: '나이를 골라 주세요.',
      ageYear: '태어난 해',
      agePick: '고르기',
      ageNote: '한 번 고르면 바꿀 수 없습니다. 잘못 골랐으면 운영자에게 문의해 주세요.',
      ageOk: '확인',
      tabFriends: '친구',
      friendIn: '친구 요청을 보냈습니다',
      friendOut: '수락을 기다리는 중',
      friendAccept: '수락',
      friendDecline: '거절',
      friendCancel: '요청 취소',
      friendOn: '접속 중',
      friendInst: '던전 안',
      friendOff: '접속하지 않음',
      friendDel: '끊기',
      friendDelSure: '정말 끊을까요?',
      friendAddHint: '이름으로 친구 요청',
      friendAdd: '요청',
      friendInOff: '지금은 친구 요청을 받지 않습니다 (설정 또는 제한 모드).',
      friendsIn: '받은 요청',
      friendsOut: '보낸 요청',
      friendsEmpty: '아직 친구가 없습니다. 사람을 누르거나 이름을 적어 요청해 보세요.',
      // 확률과 재화의 투명성 (odds 모듈의 확률표 창·내 기록, 귀한 재화의 확인 단계)
      tabOdds: '확률',
      oddsTables: '확률표',
      oddsMine: '내 추첨 기록',
      oddsMineNone: '아직 추첨 기록이 없습니다.',
      oddsLoading: '불러오는 중…',
      oddsPageLink: '게임 밖에서 보기 (공개 페이지)',
      oddsHistory: '변경 이력',
      oddsPlans: '예정된 변경',
      confirmTitle: '확인',
      confirmNext: '계속',
      confirmYes: '쓰기',
      confirmNo: '그만두기',
      confirmAgain: '한 번 더 확인합니다. 정말 쓸까요?',
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
      mailTitle: (k: string, a: (string | number)[]) => (k === 'idle' ? `쉬는 동안 모인 것 (${a[0]}분)${a[2] ? ` · ${a[1]} → ${a[2]}까지 진행` : ''}` : k === 'attend' ? `출석 ${a[0]}일째 보상` : k === 'dungeon' ? `${dungeonName(a[0])} 완료 보상` : k === 'daily' ? `일일 임무 완료: ${dailies[a[0] as DailyId] ?? a[0]}` : k === 'marketSold' ? `거래소 판매 대금: ${tradeWhat(a)} (값 ${num(a[2])}, 수수료 ${num(a[3])})` : k === 'marketExpired' ? `거래소에서 기간이 지나 돌아온 물건: ${tradeWhat(a)}` : k === 'marketBought' ? `거래소에서 산 물건: ${tradeWhat(a)} (자리가 없어 우편으로 보관)` : k === 'marketBack' ? `거래소에서 내린 물건: ${tradeWhat(a)} (자리가 없어 우편으로 보관)` : k === 'maint' ? '점검 보상' : String(k)),
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
      heroLv: (lv: number, max: number) => `Lv ${lv}/${max}`,
      heroStats: (atk: number, hp: number, power: number) => `공격 ${num(atk)} · 체력 ${num(hp)} · 전투력 ${num(power)}`,
      heroShards: (have: number, need: number) => `조각 ${num(have)}/${num(need)}`,
      heroCost: (n: number, cur: string) => `${curName(cur)} ${num(n)}`,
      heroRole: (role: string, rarity: string) => `${rarity} · ${role}`,
      gachaCost: (n: number, cur: string) => `${curName(cur)} ${num(n)}`,
      gachaPity: (rarity: string, after: number, now: number) => `천장: ${rarity} 이상이 ${after - 1}번 이어서 나오지 않으면 ${after}번째 뽑기는 ${rarity} 이상에서만 나옵니다. 지금 ${now}번 이어서 나오지 않음 (천장까지 ${Math.max(1, after - now)}번).`,
      gachaTenRule: (rarity: string) => `10번 뽑기: 앞의 아홉에 ${rarity} 이상이 없으면 열째는 ${rarity} 이상에서만 나옵니다.`,
      gachaSameRatio: (rarity: string) => `${rarity} 이상의 영웅끼리의 비율은 평소와 같습니다.`,
      ratePct: (p: number) => pctText(p),
      gachaDup: (n: number) => `조각 +${num(n)}`,
      gachaNew: () => '새 영웅!',
      squadCount: (n: number, max: number) => `${n} / ${max}`,
      squadPower: (n: number) => `편성 전투력 ${num(n)}`,
      heroPower: (n: number) => `전투력 ${num(n)}`,
      heroAwakenStep: (n: number, max: number) => `각성 ${n}/${max}`,
      heroAwakenNeed: (stars: number) => `별 ${stars}개가 되어야 각성할 수 있습니다.`,
      heroAwakenMul: (mul: number) => `공격·체력 ×${Math.round(mul * 100) / 100}`,
      heroSkillLv: (lv: number, max: number) => `기술 Lv ${lv}/${max}`,
      heroSkillEffect: (pct: number) => `기술의 피해·회복 +${pct}%`,
      heroCostLine: (parts: string[]) => `값: ${parts.join(' · ')}`,
      heroHave: (name: string, have: number, need: number) => `${name} ${num(have)}/${num(need)}`,
      heroBonus: (k: keyof HeroBonus, v: number) => bonusKo[k](v),
      hgName: (name: string, lv: number) => (lv > 0 ? `${name} +${lv}` : name),
      hgStats: (atk: number, hp: number) => [atk ? `공격 +${num(atk)}` : '', hp ? `체력 +${num(hp)}` : ''].filter(Boolean).join(' · '),
      hgCount: (n: number, cap: number) => `${num(n)} / ${num(cap)}`,
      hgOn: (hero: string) => `${hero} 착용`,
      hgChance: (p: number) => `성공 ${Math.round(p * 100)}%`,
      hgNext: (stats: string) => `강화하면 ${stats}`,
      hgSetTier: (n: number, on: boolean) => `${n}세트${on ? ' ✓' : ''}`,
      hgSetCount: (name: string, n: number) => `${name} (${n})`,
      synTier: (n: number) => `${n}명`,
      synCount: (name: string, n: number) => `${name} ${n}`,
      rowCount: (n: number, max: number) => `${n}/${max}`,
      stageTitle: (id: string, chapter: string) => (chapter ? `${id} ${chapter}` : id),
      stageWave: (wave: number, waves: number) => `물결 ${wave}/${waves}`,
      stageFoes: (n: number, total: number) => `남은 적 ${n}/${total}`,
      stageLeft: (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`,
      stageRec: (rec: number, mine: number) => `권장 전투력 ${num(rec)} · 내 편성 ${num(mine)}`,
      stageBest: (id: string) => (id ? `가장 멀리 깬 단계 ${id}` : '아직 깬 단계가 없습니다'),
      stageNext: (s: number) => `${s}초 뒤 다음 단계`,
      stageRetry: (s: number) => `${s}초 뒤 다시`,
      dungeonKeys: (n: number, cap: number) => `열쇠 ${n} / ${cap}`,
      dungeonKeyInfo: (refill: number, cap: number) => `열쇠 하나로 한 번 들어갑니다. 날마다 ${refill}개씩 채워집니다 (${cap}개까지).`,
      dungeonKeyPrice: (cost: number, cur: string, left: number) => `${curName(cur)} ${num(cost)} · 오늘 ${left}번 더`,
      sweepTimes: (n: number) => `소탕 ×${n}`,
      sweepCost: (what: string, need: number, have: number) => (need > 0 ? `한 번에 ${grantWhat(what)} ${num(need)} · 가진 것 ${num(have)}` : '값 없음'),
      sweepTitle: (kind: string, id: string, n: number) => `${kind === 'stage' ? id : dungeonName(id)} 소탕 ×${n}`,
      sweepGot: (what: string, n: number) => `${grantWhat(what)} +${num(n)}`,
      sweepGear: (n: number) => `장비 ${num(n)}점`,
      sweepKeyCost: () => '한 번에 열쇠 하나',
      gachaLeft: (min: number) => (min < 0 ? '상시' : `남은 시간 ${min >= 1440 ? `${Math.floor(min / 1440)}일 ` : ''}${min >= 60 ? `${Math.floor((min % 1440) / 60)}시간 ` : ''}${min % 60}분`),
      gachaPickupRule: (hero: string, rarity: string, share: string) => `픽업: ${rarity} 영웅이 나오면 ${share}의 확률로 ${hero}입니다 (${rarity}의 확률은 그대로).`,
      gachaFiftyRule: (hero: string, rarity: string) => `반반: ${rarity} 영웅이 나왔는데 ${josa(hero, '이', '가')} 아니면, 다음에 나오는 ${rarity} 영웅은 ${hero} 확정입니다. ${josa(hero, '이', '가')} 나오면 확정은 다시 꺼집니다.`,
      gachaSureNow: (on: boolean, hero: string) => (on ? `지금: 확정 켜짐 (다음 픽업 등급은 ${hero})` : '지금: 확정 꺼짐 (반반)'),
      gachaGroup: (names: string) => `천장 공유: ${josa(names, '과', '와')} 천장의 셈과 확정을 함께 씁니다.`,
      gachaEffective: (hero: string, pct: string) => `${hero}의 실효 확률 ${pct}`,
      gachaSelectHave: (item: string, n: number) => `${grantWhat(item)} ${num(n)}개 · 하나를 쓰고 아래 영웅 가운데 하나를 얻습니다 (가진 영웅이면 조각).`,
      // 단계 밖: 돌아왔을 때의 창, 재료로 영웅 키우기
      idleBackBody: (min: number) => `자리를 비운 ${min >= 60 ? `${Math.floor(min / 60)}시간 ` : ''}${min % 60}분 동안 모인 것입니다.`,
      idleBackStage: (from: string, to: string, n: number) => `단계 ${from} → ${to}까지 진행 (${n}단계 깸)`,
      idleBackLine: (what: string, n: number) => (what === 'gear' ? `장비 ${num(n)}점` : `${grantWhat(what)} +${num(n)}`),
      heroTradeBtn: (item: string, cost: number, shards: number) => `${grantWhat(item)} ${num(cost)} → 조각 +${num(shards)}`,
      heroTradeHave: (items: readonly (readonly [string, number])[]) => `재료로 조각 얻기 · 가진 것: ${items.map(([id, n]) => `${grantWhat(id)} ${num(n)}`).join(', ')}`,
      // 판 (rooms 모듈)
      roomClock: (s: number) => `${s}초`,
      roomRound: (n: number, max: number) => `${n} / ${max} 바퀴`,
      roomPlaying: (n: number) => (n ? `두는 중인 판 ${n}` : ''),
      roomHostWaits: (name: string, seated: number, size: number) => (size > 2 ? `${name} 님의 판 (${seated}/${size})` : `${name} 님이 기다립니다`),
      roomWaiting: (seated: number, size: number, cpuIn: number, min: number = size, startIn: number = 0) =>
        `사람을 기다리는 중… (${seated}/${size})${min < size ? ` ${min}명부터 시작할 수 있습니다.` : ''}${startIn > 0 && seated >= min ? ` ${startIn}초 뒤에 모인 만큼으로 시작합니다.` : ''}${cpuIn > 0 ? ` ${cpuIn}초 뒤에는 컴퓨터가 앉습니다.` : ''}`,
      roomTheirTurn: (name: string) => `${name}의 차례`,
      /** 판이 끝난 까닭 (게임이 finish에 준 것은 게임의 언어 파일이 덮어써 문장으로) */
      roomWhy: (why: string) => ({ resign: '기권으로 끝났습니다.', left: '연결이 끊긴 채 돌아오지 않았습니다.', rounds: '바퀴를 다 썼습니다.' } as Record<string, string>)[why] ?? '',
      /** 자리 수가 범위인 판의 '지금 시작' 단추 (앉은 사람 수) */
      roomStartNow: (n: number) => `지금 시작 (${n}명)`,
      /** 컴퓨터가 둘 이상인 판의 컴퓨터 이름 (컴퓨터 가운데 몇째: 1부터). 게임은 RoomDef.cpuName이나 setRoomLook의 seatName으로 바꾼다 */
      roomCpuN: (n: number) => `컴퓨터 ${n}`,
      /** 등수로 끝낸 판: 결과 창의 큰 글 (1등 하나는 ui.roomWin), 등수 줄, 점수 */
      roomRankTitle: (rank: number, tied: boolean) => `${tied ? '함께 ' : ''}${rank}등`,
      roomRankRow: (rank: number, name: string, score: string) => `${rank}등 ${name}${score ? ` · ${score}` : ''}`,
      roomScore: (n: number) => `${num(n)}점`,
      // 캐릭터 정의와 변신
      charErr: (code: string, path: string, arg?: MsgArg) => (charErrKo[code as CharErr] ?? charErrKo.shape)(charField(String(path ?? '')), arg === undefined ? '' : String(arg)),
      morphLeft: (s: number) => (s < 0 ? '스스로 풀 때까지' : `남은 시간 ${s >= 60 ? `${Math.floor(s / 60)}분 ` : ''}${s % 60}초`),
      morphCd: (s: number) => `다시 변신까지 ${s}초`,
      morphBonus: (m: MorphMods) => morphModsKo(m ?? {}),
      // 운영의 바탕 (hud/ops.ts, hud/menu/daily.ts)
      /** 임무가 다시 시작하기까지 (남은 ms) */
      resetIn: (ms: number) => `초기화까지 ${spanMs(ms, 'ko')}`,
      /** 점검 예고의 띠: 남은 초, 예정 끝 시각 (UTC ms, 0이면 정하지 않음) */
      maintCountdown: (sec: number, until: number) => `${clockText(sec)} 뒤 서버 점검이 시작됩니다${until ? ` · 예정 끝 ${whenText(until, 'ko-KR')}` : ''}`,
      /** 점검 중 접속 화면의 덧붙는 줄: 예정 끝 시각, 운영자의 안내 글 */
      maintGate: (until: number, text: string) => `${text ? `${text} · ` : ''}${until ? `예정 끝 ${whenText(until, 'ko-KR')}. ` : ''}끝나면 저절로 다시 접속합니다.`,
      // 웹 출시의 바탕
      keySkill: (n: number) => `기술 ${n}`,
      keyGame: (k: string) => `게임 키 ${k}`,
      keyWas: (k: string) => `처음 키 ${k}`,
      pixelNow: (dpr: number) => `이 기기 ×${Math.round(dpr * 100) / 100}`,
      tutStep: (i: number, n: number) => `${i} / ${n}`,
      legalChanged: (v: string) => `약관이 바뀌었습니다 (${v}). 계속하려면 바뀐 이용약관과 개인정보 처리방침을 읽고 동의해 주세요.`,
      legalAgreed: (v: string) => `동의한 버전: ${v}`,
      myDataInfo: (days: number) => `이 캐릭터의 저장 내용을 파일로 받거나 지워 달라고 요청할 수 있습니다. 삭제는 요청하고 ${days}일 뒤에 실행되고, 그동안은 거둘 수 있습니다.`,
      myDataDue: (days: number) => (days > 0 ? `${days}일 뒤에 지웁니다` : '곧 지웁니다'),
      // 사회와 안전
      /** 내가 보낸 귓말 줄의 머리 (받는 사람) */
      chatToTag: (name: string) => `[→ ${name}]`,
      /** 귓말 탭의 입력 칸 안내 */
      chatTo: (name: string) => `${name} 님에게 귓말`,
      ageUnder: (n: number) => `만 ${n}세 미만`,
      ageOver: (n: number) => `만 ${n}세 이상`,
      /** 친구의 마지막 접속 (지난 ms) */
      friendSeen: (ms: number) => `마지막 접속 ${ms < 3_600_000 ? `${Math.max(1, Math.floor(ms / 60_000))}분` : ms < 86_400_000 ? `${Math.floor(ms / 3_600_000)}시간` : `${Math.floor(ms / 86_400_000)}일`} 전`,
      friendsHead: (n: number) => `친구 ${n}명`,
      /** 귀한 재화의 확인 단계: 쓰려는 양과 재화 */
      confirmSpend: (n: number, cur: string) => `${curName(cur)} ${num(n)}만큼 씁니다.`,
      /** 실제 가격을 함께 적는 칸 (결제가 생긴 뒤에 채운다) */
      confirmPrice: (price: string) => `실제 가격: ${price}`,
      /** 내 추첨 기록의 한 줄: 시각, 종류, 표의 버전 */
      oddsDrawHead: (at: number, kind: string, ver: number) => `${whenText(at, 'ko-KR')} · ${kind === 'gacha' ? '뽑기' : kind === 'enhance' ? '강화' : kind} · 표 v${ver}`,
      oddsVersion: (v: number) => `버전 ${v}`,
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
      // 능력치 점수는 능력치 모듈(build)을 고른 게임에만 있다
      levelUp: (a) => (anyModule('build') ? `레벨이 올랐습니다. Lv ${a[0]} · 능력치 ${BUILD.pointsPerLevel}점 (메뉴의 성장)` : `레벨이 올랐습니다. Lv ${a[0]}`),
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
      costShort: (a) => `${josa(curName(a[0]), '이', '가')} 모자랍니다.`,
      heroUp: (a) => `${heroName(a[0])} 레벨 ${a[1]}!`,
      heroStar: (a) => `${heroName(a[0])} 별 ${a[1]}개!`,
      heroMaxLv: (a) => `${heroName(a[0])}: 별을 올려야 레벨이 더 오릅니다.`,
      heroShards: (a) => `${heroName(a[0])}: 조각이 ${a[1]}개 모자랍니다.`,
      heroNew: (a) => `새 영웅 ${heroName(a[0])}!`,
      heroSkillUp: (a) => `${heroName(a[0])} 기술 레벨 ${a[1]}!`,
      heroSkillMax: (a) => `${heroName(a[0])}: 별이나 각성을 올려야 기술 레벨이 더 오릅니다.`,
      heroAwaken: (a) => `${heroName(a[0])} 각성 ${a[1]}단계!`,
      heroAwakenMax: (a) => `${heroName(a[0])}: 더 각성할 수 없습니다.`,
      heroAwakenStars: (a) => `${heroName(a[0])}: 별 ${a[1]}개가 되어야 각성합니다.`,
      hgDrop: (a) => `영웅 장비 ${josa(heroGearName(a[0]), '을', '를')} 얻었습니다.`,
      hgFull: (a) => `영웅 장비가 가득 차 ${josa(heroGearName(a[0]), '을', '를')} 줍지 못했습니다. 분해해서 자리를 비우세요.`,
      hgEnhance: (a) => (Number(a[2]) ? `${heroGearName(a[0])} +${a[1]} 강화 성공!` : `${heroGearName(a[0])} 강화 실패 (+${a[1]} 그대로)`),
      hgEnhanceMax: (a) => `${heroGearName(a[0])}: 더 강화할 수 없습니다.`,
      hgSalvaged: (a) => `영웅 장비 ${a[0]}점을 분해했습니다.`,
      stageClear: (a) => `${a[0]} 깸!${Number(a[1]) ? ' 처음 깬 보상을 받았습니다.' : ''}`,
      stageFail: (a) => `${a[0]}을(를) 깨지 못했습니다 (${Number(a[1]) ? '시간 초과' : '쓰러짐'}). 깬 단계로 돌아가고 자동 진행을 끕니다.`,
      stageLocked: (a) => `${a[0]}은(는) 아직 갈 수 없습니다. 앞 단계를 먼저 깨세요.`,
      stageLast: () => '마지막 단계까지 깼습니다. 같은 단계를 되풀이합니다.',
      dungeonNoKeys: (a) => `${dungeonName(a[0])}의 열쇠가 없습니다. 날이 바뀌면 채워집니다.`,
      dungeonKeyBought: (a) => `${dungeonName(a[0])}의 열쇠를 샀습니다 (${a[1]}개).`,
      dungeonKeyLimit: (a) => `${dungeonName(a[0])}의 열쇠는 오늘 더 살 수 없습니다.`,
      swept: (a) => `${a[0] === 'stage' ? a[1] : dungeonName(a[1])} 소탕 ×${a[2]} 완료`,
      sweepLocked: (a) => `${a[0] === 'stage' ? a[1] : dungeonName(a[1])}은(는) 아직 소탕할 수 없습니다. 먼저 깨세요.`,
      itemShort: (a) => `${josa(grantWhat(a[0]), '이', '가')} 모자랍니다 (필요 ${num(a[1])}, 가진 것 ${num(a[2])}).`,
      stageAway: (a) => `자리를 비운 동안 ${a[0]} → ${a[1]}까지 진행 (${a[2]}단계 깸)`,
      bannerClosed: (a) => `${josa(bannerName(a[0]), '은', '는')} 지금 열려 있지 않습니다.`,
      heroPicked: (a) => (Number(a[1]) ? `${heroName(a[0])}: 이미 있어 조각 +${num(a[2])}` : `${josa(heroName(a[0]), '을', '를')} 얻었습니다!`),
      heroTraded: (a) => `${heroName(a[0])}: 조각 +${num(a[1])} (남은 ${grantWhat(a[2])} ${num(a[3])})`,
      roomWait: () => '판을 열었습니다. 다른 사람을 기다립니다.',
      roomStart: (a) => (Number(a[2] ?? 2) > 2 ? `판이 시작됐습니다. ${a[2]}명이 둡니다.${Number(a[0]) ? ' 먼저 둡니다.' : ''}` : `판이 시작됐습니다. 상대: ${a[1] || '컴퓨터'}. ${Number(a[0]) ? '먼저 둡니다.' : '상대가 먼저 둡니다.'}`),
      roomFull: () => '지금은 판을 더 열 수 없습니다. 잠시 뒤에 다시 해 보세요.',
      roomBusy: () => '이미 판에 앉아 있습니다.',
      roomGone: () => '그 판에는 들어갈 수 없습니다.',
      roomNotTurn: () => '내 차례가 아닙니다.',
      roomTimeout: (a) => `시간이 다 되어 ${a[0] || '컴퓨터'}의 차례가 넘어갔습니다.`,
      roomFoeLeft: (a) => `${a[0]} 님의 연결이 끊겼습니다. ${a[1]}초 동안 기다립니다.`,
      roomFoeBack: (a) => `${a[0]} 님이 돌아왔습니다.`,
      roomBack: () => '두던 판으로 돌아왔습니다.',
      roomResult: (a) => (Number(a[2] ?? 0) > 0 && Number(a[3]) > 2
        ? `${Number(a[0]) === 0 ? '이겼습니다! ' : ''}${a[3]}명 가운데 ${Number(a[4]) ? '함께 ' : ''}${a[2]}등입니다.`
        : `${Number(a[0]) === 0 ? '이겼습니다!' : Number(a[0]) === 1 ? '졌습니다.' : '비겼습니다.'}`),
      roomAgainWait: () => '다른 사람이 다시 하기를 누르기를 기다립니다.',
      roomFoeGone: (a) => `${a[0]} 님이 판을 떠났습니다.`,
      roomFewer: (a) => `${a[0]}명이 모여야 시작할 수 있습니다.`,
      charBad: (a) => `캐릭터를 만들 수 없습니다: ${(charErrKo[a[0] as CharErr] ?? charErrKo.shape)(charField(String(a[1] ?? '')), a[2] === undefined ? '' : String(a[2]))}`,
      charNew: (a) => `새 캐릭터 ${josa(charName(a[0]), '을', '를')} 얻었습니다!`,
      morphOn: (a) => `${ro(charName(a[0]))} 변신했습니다.`,
      morphOff: () => '변신을 풀었습니다.',
      morphEnd: () => '변신의 시간이 다 되어 풀렸습니다.',
      morphGone: () => '캐릭터가 사라져 변신이 풀렸습니다.',
      morphWait: (a) => `${a[0]}초 뒤에 다시 변신할 수 있습니다.`,
      morphFight: () => '싸우는 중에는 변신할 수 없습니다.',
      morphNone: () => '가지지 않은 캐릭터입니다.',
      // ---- 운영의 바탕 ----
      featureOff: (a) => `${josa(flagLabel(a[0]), '이', '가')} 잠시 꺼져 있습니다. 공지를 확인해 주세요.`,
      joinClosed: () => '지금은 새로 접속할 수 없습니다. 잠시 뒤에 다시 시도해 주세요.',
      maintSoon: (a) => `${a[0]}분 뒤에 서버 점검이 시작됩니다.${Number(a[1]) ? ` 예정 끝: ${whenText(Number(a[1]), 'ko-KR')}.` : ''} 하던 것은 저절로 저장됩니다.`,
      maintStart: (a) => `서버 점검이 시작되어 접속을 끊습니다.${Number(a[0]) ? ` 예정 끝: ${whenText(Number(a[0]), 'ko-KR')}.` : ''}`,
      maintEnd: () => '서버 점검이 끝났습니다.',
      // 웹 출시의 바탕: 내 데이터
      eraseAsked: (a) => `삭제를 요청했습니다. ${a[0]}일 뒤에 이 캐릭터의 데이터를 지웁니다. 그동안은 설정에서 거둘 수 있습니다.`,
      eraseCanceled: () => '삭제 요청을 거뒀습니다.',
      erased: () => '요청한 대로 이 캐릭터의 데이터를 지웠습니다.',
      mydataGuest: () => '저장되지 않는 손님이라 내려받거나 지울 데이터가 없습니다.',
      mydataWait: (a) => `잠시 뒤에 다시 해 주세요 (${a[0]}초).`,
      // 사회와 안전
      blockedOn: (a) => `${a[0]} 님을 차단했습니다. 그 사람의 대화·귓말·친구 요청·초대가 오지 않습니다.`,
      blockedOff: (a) => `${a[0]} 님의 차단을 풀었습니다.`,
      blockFull: (a) => `더 차단할 수 없습니다 (최대 ${a[0]}명).`,
      chatSame: () => '같은 말을 방금 했습니다. 잠시 뒤에 다시 보내 주세요.',
      chatQuickOnly: () => '정해진 문장만 쓸 수 있습니다.',
      chatNoParty: () => '파티가 없어 파티 대화를 보낼 수 없습니다.',
      whisperOffline: (a) => `${a[0]} 님은 지금 접속해 있지 않습니다.`,
      whisperNoOne: (a) => `${josa(String(a[0]), '이라는', '라는')} 이름의 사람이 없습니다.`,
      whisperNo: (a) => `${a[0]} 님은 귓말을 받지 않습니다.`,
      limitedCant: () => '제한 모드에서는 쓸 수 없는 기능입니다.',
      friendGuest: () => '저장되지 않는 손님은 친구를 맺을 수 없습니다.',
      friendWait: (a) => `친구 요청은 ${a[0]}초 뒤에 보낼 수 있습니다.`,
      friendNoOne: (a) => `${josa(String(a[0]), '이라는', '라는')} 이름의 사람이 없습니다.`,
      friendAlready: (a) => `${a[0]} 님과는 이미 친구입니다.`,
      friendAsked: (a) => `${a[0]} 님에게 친구 요청을 보냈습니다.`,
      friendAskIn: (a) => `${a[0]} 님이 친구 요청을 보냈습니다. 메뉴의 친구 탭에서 받을 수 있습니다.`,
      friendNew: (a) => `${a[0]} 님과 친구가 되었습니다.`,
      friendNo: (a) => `${a[0]} 님에게는 지금 친구 요청을 보낼 수 없습니다.`,
      friendFull: (a) => `친구가 가득 찼습니다 (최대 ${a[0]}명).`,
      friendRemoved: (a) => `${a[0]} 님과 친구를 끊었습니다.`,
      friendOffline: (a) => `${a[0]} 님은 지금 접속해 있지 않습니다.`,
    } satisfies Record<EngineMsgKey, (a: MsgArg[]) => string>,
    /** 처음 접속할 때 붙이는 무작위 이름의 재료 */
    nameA: n.nameA,
    nameB: n.nameB,
    /** 확률표의 문장 (공개 페이지와 같은 것: 아래 koOddsPage) */
    oddsPage: koOddsPage,
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

// ---------- 운영의 바탕의 도우미 (en.ts도 쓴다) ----------
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** 기능 깃발의 이름: 화면 문장 flag<이름>(flagMarket …). 게임의 깃발은 게임이 ui에 flag<이름>을 더한다. 없으면 flagOther */
export const flagLabel = (f: MsgArg): string => { const k = 'flag' + cap(String(f)); const v = uiText.get(k); return v === k ? uiText.get('flagOther') : v; };
/** 초를 m:ss로 (한 시간이 넘으면 h:mm:ss) */
export const clockText = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
/** UTC ms를 보는 사람의 시각(월·일 시:분)으로 */
export const whenText = (ms: number, locale: string): string => new Date(ms).toLocaleString(locale, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
/** 남은 ms를 읽기 좋게: 일·시간, 시간·분, 분 */
export const spanMs = (ms: number, lang: 'ko' | 'en'): string => {
  const all = Math.max(1, Math.ceil(ms / 60000)), d = Math.floor(all / 1440), h = Math.floor((all % 1440) / 60), m = all % 60;
  if (lang === 'ko') return d ? `${d}일${h ? ` ${h}시간` : ''}` : h ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`;
  return d ? `${d}d${h ? ` ${h}h` : ''}` : h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
};
/**
 * 상태 페이지(status.html)의 문장: 서버가 정적 폴더에 페이지를 쓸 때 넣는다 (engine/server/net/status.ts). 페이지는 브라우저의 언어로 고른다.
 * {n}은 수가 들어갈 자리
 */
export const koStatusPage = {
  title: '서버 상태',
  ok: '정상',
  maint: '점검 중',
  planned: '점검 예정',
  down: '응답 없음',
  checked: '마지막 확인',
  players: '접속자',
  about: '약 {n}명',
  start: '시작',
  until: '예정 끝',
  stale: '서버가 {n}분째 소식을 보내지 않습니다.',
  missing: '상태를 읽지 못했습니다.',
  note: '이 페이지는 30초마다 새로 읽습니다. 시각은 이 기기의 시각입니다.',
  game: '게임으로',
};

/**
 * 확률 공개 페이지(odds.html)와 게임 안 확률표 창의 문장: 서버가 공개 페이지를 쓸 때 넣고(engine/server/net/odds.ts), 화면의 창(engine/client/hud/odds.ts)도 같은 것으로 그린다.
 * {이름}은 값이 들어갈 자리. words는 표·결과의 이름 키 → 글 (강화의 결과)
 */
export const koOddsPage = {
  title: '확률 정보',
  made: '{at} 기준 (이 기기의 시각으로 {local})',
  lead: '아래의 확률은 게임 서버가 실제로 뽑을 때 쓰는 표와 같은 값입니다. 표가 바뀌면 버전이 오르고 아래 변경 이력에 남습니다. 예정된 변경은 미리 알립니다.',
  missing: '확률 정보를 읽지 못했습니다.',
  none: '공개하는 확률표가 없습니다.',
  kinds: { capsule: '캡슐형 (뽑기)', enhance: '강화형', combine: '합성형', ceiling: '천장형' } as Record<string, string>,
  version: '버전 {v}',
  cost: '1번에 {one} {cur}',
  costTen: '1번에 {one} · 10번에 {ten} {cur}',
  /** 재화의 이름 (게임이 ODDS.names의 'cur:재화'로 주지 않았을 때): 첫 재화만 틀이 이름을 안다 */
  cur: { gold: '골드' } as Record<string, string>,
  curOther: '재화',
  limited: '기간·수량 한정',
  from: '{at}부터',
  to: '{at}까지',
  total: '총 {n}개',
  pityRule: '천장: {r} 등급 이상이 나오지 않은 채 {n}번째 뽑기가 되면, 그 뽑기는 {r} 등급 이상에서만 나옵니다 (아래 천장 단계의 표).',
  tenRule: '10번 뽑기의 보장: 앞의 아홉에 {r} 등급 이상이 없으면 열째는 {r} 등급 이상에서 나옵니다.',
  guard: '보호: {item}을(를) 쓰면 실패해도 단계가 내려가지 않습니다 (성공 확률은 같습니다).',
  base: '평소',
  pity: '천장 ({n}번째 뽑기, {r} 이상)',
  ten: '10번 뽑기의 열째 ({r} 이상 보장)',
  plus: '+{n}에서 강화할 때',
  roll: '단계 {n}',
  sure: '반반의 확정이 켜진 때',
  colOutcome: '결과',
  colRarity: '등급',
  colP: '확률',
  effective: '실효 확률',
  effectiveNote: '1번 뽑기를 오래 되풀이했을 때 실제로 나오는 비율입니다 (천장과 확정을 넣은 평균).',
  plans: '예정된 변경',
  planAt: '{at}부터 적용 (이 기기의 시각으로 {local})',
  history: '변경 이력',
  noHistory: '아직 바뀐 적이 없습니다.',
  colAt: '시각 (UTC)',
  colTable: '표',
  colVer: '버전',
  colWhy: '까닭',
  colChange: '바뀐 확률 (전 → 후)',
  whyBoot: '서버 갱신',
  whyAuto: '내용 변경',
  whyLive: '운영 설정',
  whyAdmin: '관리자 확인',
  gone: '표가 내려갔습니다',
  first: '처음 공개',
  operator: '운영자 정보',
  operatorEmpty: '(운영자 정보와 문의처는 아직 적지 않았습니다.)',
  foot: '이 페이지는 게임 서버가 씁니다. 확률은 소수 넷째 자리에서 반올림해 보입니다.',
  words: { oddsEnhanceName: '장비 강화', oddsUp: '성공 (+1)', oddsKeep: '실패 (그대로)', oddsDown: '실패 (-1)', oddsBreak: '파괴', heroRarity0: '일반', heroRarity1: '희귀', heroRarity2: '전설' } as Record<string, string>,
};
