// 틀의 선택 모듈: 장르에 매인 기능(전투, 직업, 아이템, 장비, 재화 …)의 묶음과 그 사이의 의존.
// 틀의 핵심(게임 루프, 접속과 세션, 이동, 맵·지역·길찾기, 엔티티와 시야 동기화, 채널, 대화·이름·신고·제재·관리자 통로·기기 옮기기,
// 저장과 이전·백업, 언어, 입력, 카메라, 장면)은 늘 돈다. 아래 모듈은 게임이 내용의 MODULES에 적은 것만 돈다:
//   서버  그 모듈의 시스템을 만들고 명령·틱·저장 칸·개인 상태를 등록한다. 적지 않은 모듈의 명령은 등록되지 않아 웹소켓으로 보내도 무시된다
//   화면  그 모듈의 창·단추·메뉴 탭·단축키를 붙인다 (engine/client/modules.ts)
// 의존: 모듈은 needs의 모듈 없이는 돌지 않는다. 빠진 것이 있으면 서버와 화면이 시작할 때 무엇이 빠졌는지 오류로 알린다 (checkModules).
// 이 파일은 아무것도 import하지 않는다 (서버·화면·내용 파일 어디서나 읽는다).

/** 모듈마다: 무엇인가(한 줄), 없으면 돌지 않는 모듈 */
export const MODULE_TABLE = {
  /** 재화: 지갑(골드, 두 번째 재화)과 경제 장부. 재화를 내고 받는 모든 모듈의 바탕 */
  economy: { needs: [] },
  /** 성장: 레벨과 경험치 (경험치는 지갑을 지나는 재화다) */
  growth: { needs: ['economy'] },
  /** 직업: 고르기와 바꾸기, 직업마다의 체력과 기술 */
  classes: { needs: [] },
  /** 전투: 체력·피해·기술·몬스터·리스폰·필드 보스, 쓰러짐과 부활, 처치 보상 */
  combat: { needs: ['classes'] },
  /** 능력치와 기술 강화: 레벨마다 받는 점수를 찍고 기술을 올린다 */
  build: { needs: ['growth', 'combat', 'economy'] },
  /** 아이템: 가방(재료·물약), 상점, 물약 마시기, 대장간 제작, 처치의 재료 드롭 */
  items: { needs: ['economy'] },
  /** 장비: 드롭 장비, 끼기·팔기·비교, 강화·재련·분해, 장비 가방과 넓히기 */
  gear: { needs: ['items', 'economy'] },
  /** 우편: 보상을 맡아 두었다가 받는다 */
  mail: { needs: ['items', 'economy'] },
  /** 일일 임무와 출석 (보상은 우편으로) */
  daily: { needs: ['mail'] },
  /** 접속하지 않은 동안의 보상 (우편으로) */
  idle: { needs: ['mail'] },
  /** 파티: 초대, 함께 받는 처치 보상, 파티원 표시 */
  party: { needs: [] },
  /** 길드: 만들기, 초대, 기부, 공지, 길드 대화 */
  guild: { needs: ['economy'] },
  /** 거래소: 장비와 재료를 사고판다 (판 돈은 우편으로) */
  market: { needs: ['items', 'gear', 'mail', 'economy'] },
  /** 던전: 인스턴스, 하루 횟수, 끝낸 보상 */
  dungeon: { needs: ['combat', 'mail', 'daily', 'gear'] },
  /** 순위: 전투력 순위표 */
  rank: { needs: ['growth'] },
  /** 자동 사냥과 자리 비움 사냥 (접속이 끊겨도 서버가 이어서 싸운다) */
  away: { needs: ['combat'] },
  /** 팀: 고르기·바꾸기(사람 수 균형), 팀과 사람마다의 점수, 점수판, 팀 색 옷. 기본은 저장하지 않는다 (TEAM_RULES.persist) */
  teams: { needs: [] },
  /** 동료(영웅): 가진 영웅의 레벨·별·조각, 레벨 업(재화)과 별 올리기(조각). 수집형 RPG의 바탕 */
  roster: { needs: ['economy'] },
  /** 뽑기: 배너, 1번·10번 뽑기(게임 안의 재화만), 천장, 공개 확률표, 뽑기 기록 */
  gacha: { needs: ['roster', 'economy'] },
  /** 편성: 가진 영웅 몇을 골라 함께 싸운다 (주인을 따라다니며 몬스터를 친다) */
  squad: { needs: ['roster', 'combat'] },
  /** 단계: 장과 단계(1-1, 1-2 …), 물결과 우두머리, 깨면 다음 단계로, 실패하면 깬 단계로. 방치 보상이 깬 단계로 커진다 */
  stages: { needs: ['combat'] },
  /** 영웅 장비: 영웅마다의 장비 칸, 끼기·빼기·강화(재화와 재료)·분해, 세트, 단계·던전에서 떨어지는 장비 (표는 HERO_RULES.gear) */
  herogear: { needs: ['roster', 'items', 'economy'] },
  /** 판: 사람(과 컴퓨터) 몇이 따로 된 층에서 차례대로 두는 판. 대기실·짝짓기, 차례와 기한, 끊긴 사람의 자리, 판의 저장. 턴제·보드·카드 게임의 바탕 */
  rooms: { needs: [] },
  /** 캐릭터 정의: 바깥(AI·사람)이 만든 정의를 검증해 서버에 두고(월드 저장, 바꿔 끼울 수 있는 저장소) 화면에 보낸다. roster를 함께 고르면 정의가 영웅이 된다 */
  chars: { needs: [] },
  /** 변신: 가진 캐릭터 정의의 겉모습(남에게도 보인다)과 게임이 정한 보정으로 바뀐다. 지속 시간·재사용 대기·전투 중 금지 (MORPH_RULES) */
  morph: { needs: ['chars'] },
  /** 대화 채널: 귓말(이름으로), 파티(party를 고른 게임)·근처 채널, 화면의 채널 탭·거르기, 모든 채널을 합친 도배 막기 (규칙은 CHAT_RULES). 고르지 않으면 대화는 전체와 길드뿐(예전과 같다) */
  chat: { needs: [] },
  /** 친구: 요청·수락·거절·삭제, 목록(접속 여부·마지막 접속·있는 곳), 상한(FRIENDS). 저장 키 단위로 저장한다 (DB의 friends 표) */
  friends: { needs: [] },
  /** 문의·제재 이의: 게임 안 문의 → 티켓(열림·답변·닫힘) → 관리자의 답(알림·우편), 접속 차단·말 막기의 사유·기간과 이의 신청. 저장 키 단위로 저장한다 (DB의 tickets 표: engine/server/net/support.ts) */
  support: { needs: [] },
  /** 게임 안의 모드: 한 캐릭터로 오가는 '두 게임'(들판의 MMORPG와 단계의 수집형). 화면의 '게임 바꾸기' 단추, 모드마다 메뉴의 탭·감출 요소 (MODE_RULES) */
  modes: { needs: ['stages'] },
} as const satisfies Record<string, { needs: readonly string[] }>;

export type ModuleId = keyof typeof MODULE_TABLE;

/**
 * 모듈의 저장 칸: 캐릭터 저장의 ext 칸·최상위 칸과 월드 저장의 칸이 어느 모듈의 것인가.
 * 고르지 않은 모듈의 칸은 읽은 그대로 두었다가 다시 적는다 (engine/server/game/game.ts): 모듈을 꺼도 사람과 월드의 것(골드, 우편, 거래소에 맡긴 물건)이 사라지지 않고, 다시 켜면 이어진다.
 * 틀에 저장 칸을 가진 모듈을 더하면 여기에도 적는다 (engine/test/fx/modules.test.ts가 등록된 칸과 견준다)
 */
export const MODULE_SAVES: { player: Readonly<Record<string, ModuleId>>; top: Readonly<Record<string, ModuleId>>; world: Readonly<Record<string, ModuleId>> } = {
  player: { bag: 'gear', vitals: 'combat', away: 'away', gear: 'gear', salvage: 'gear', mail: 'mail', stats: 'economy', daily: 'daily', build: 'build', teams: 'teams', keys: 'dungeon', roster: 'roster', gacha: 'gacha', squad: 'squad', stages: 'stages', formation: 'squad', herogear: 'herogear', morph: 'morph', mode: 'modes', autosafe: 'away' },
  top: { lv: 'growth', exp: 'growth', need: 'growth', maxHp: 'combat', sparks: 'economy', gold: 'economy', weapon: 'items', armor: 'items', items: 'items', cls: 'classes', auto: 'away' },
  world: { mailbox: 'mail', guilds: 'guild', market: 'market', rank: 'rank', teams: 'teams', chars: 'chars' },
};
/** 모든 모듈 (표의 차례) */
export const ALL_MODULES = Object.keys(MODULE_TABLE) as ModuleId[];
/** 수집형·방치형 RPG의 모듈 넷 (영웅, 뽑기, 편성, 단계). 고르는 게임은 그 의존(재화, 전투 …)과 함께 적는다 */
export const COLLECT_MODULES: readonly ModuleId[] = ['roster', 'gacha', 'squad', 'stages'];
/**
 * 전통적인 탭 타깃 MMORPG가 쓰는 모듈 전부. 등불지기처럼 다 쓰는 게임은 `MODULES = RPG_MODULES`로 적어도 된다.
 * 팀(teams)은 들지 않는다: RPG가 아닌 놀이(공놀이, 깃발 뺏기)의 모듈이고, 이 목록을 쓰는 게임이 저절로 팀을 갖지 않게 한다.
 * 수집형의 넷(COLLECT_MODULES)과 영웅 장비(herogear)도 들지 않는다: 이 목록을 쓰는 게임(등불지기)이 저절로 뽑기와 단계를 갖지 않게 한다.
 * 게임 안의 모드(modes)도 들지 않는다: 한 게임인 게임은 모드가 없다.
 * herogear는 COLLECT_MODULES에도 들지 않는다: 그 목록을 쓰는 게임이 저절로 영웅 장비(아이템 모듈에 기댄다)를 갖지 않게, 고르는 게임이 따로 적는다.
 * 판(rooms)도 들지 않는다: 턴제·보드 게임의 모듈이고, 이 목록을 쓰는 게임이 저절로 대기실을 갖지 않게 한다.
 * 캐릭터 정의(chars)와 변신(morph)도 들지 않는다: 이 목록을 쓰는 게임(등불지기)이 저절로 변신을 갖지 않게, 고르는 게임이 따로 적는다.
 * 대화 채널(chat)과 친구(friends)도 들지 않는다: 귓말·친구를 켤지는 게임이 정한다 (등불지기는 아직 켜지 않았다)
 * 문의(support)도 들지 않는다: 고르는 게임이 따로 적는다 (등불지기는 적었다)
 */
export const RPG_MODULES: readonly ModuleId[] = ALL_MODULES.filter((m) => m !== 'teams' && !COLLECT_MODULES.includes(m) && m !== 'herogear' && m !== 'rooms' && m !== 'chars' && m !== 'morph' && m !== 'chat' && m !== 'friends' && m !== 'support' && m !== 'modes');

/**
 * 게임이 고른 모듈을 확인한다: 모르는 이름이나 빠진 의존이 있으면 무엇이 문제인지 적은 오류를 던진다 (서버와 화면이 시작할 때 부른다).
 * 고른 모듈의 집합을 돌려준다.
 */
export function checkModules(list: readonly string[], where = 'MODULES'): ReadonlySet<ModuleId> {
  if (!Array.isArray(list)) throw new Error(`${where}가 목록이 아닙니다: 내용(shared/content)에서 export const MODULES = [...]로 쓸 모듈을 고른다 (빈 목록이면 핵심만)`);
  const known = new Set<string>(ALL_MODULES);
  const bad = list.filter((m) => !known.has(m));
  if (bad.length) throw new Error(`${where}에 모르는 모듈이 있습니다: ${bad.join(', ')} (있는 모듈: ${ALL_MODULES.join(', ')})`);
  const on = new Set(list as ModuleId[]);
  const missing: string[] = [];
  for (const m of on) for (const need of MODULE_TABLE[m].needs as readonly ModuleId[]) if (!on.has(need)) missing.push(`${m} → ${need}`);
  if (missing.length) throw new Error(`${where}에서 고른 모듈이 의존하는 모듈이 빠졌습니다: ${missing.join(', ')}. 빠진 모듈을 함께 고르거나 그 모듈을 뺀다`);
  return on;
}
