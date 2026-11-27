// 서버와 클라이언트가 주고받는 메시지. 지금은 JSON이고, 트래픽이 문제가 되면 이진 형식으로 바꾼다.
// 화면에 보일 문장은 싣지 않는다: 종류와 값만 보내고 문장은 클라이언트가 언어에 맞게 만든다.
import type { IdleBack, PullGot, SweepGot } from './defs/collect';
import type { ModeBack } from './defs/modes';
import type { Gear, Mail, RankRow } from './defs/growth';
import type { GuildView, MarketItem } from './defs/social';
import type { RoomLobby, RoomStatsView } from './defs/rooms';
import type { BoardTab, BoardView, ReplayView } from './defs/compete';
import type { TeamBoard } from './defs/teams';
import type { MaintView, NoticeView } from './defs/live';
import type { BlockView, ChatCh, FriendView, TalkState } from './defs/talk';
import type { DrawRow, OddsPublic } from './defs/odds';
import type { ClientMsgs, ServerMsgs, WorldState as GameWorldState } from './ext';
import type { MsgArg, MsgKey } from './messages';
import type { AutoPrefs, AwaySafety } from './auto';

/** 판의 명령 (rooms 모듈: { t: 'room', a }) */
export type RoomCmd = 'quick' | 'host' | 'cpu' | 'join' | 'leave' | 'pass' | 'resign' | 'again' | 'start' | 'code' | 'watch' | 'privacy' | 'kick' | 'give' | 'ready' | 'opt' | 'vote' | 'ballot' | 'regroup' | 'stats';

/**
 * 프로토콜 번호. 서버가 welcome에 실어 보내고, 클라이언트는 자기 빌드의 번호와 맞지 않으면(protocolFits) 업데이트를 권한다
 * (서버만 새로 올라가고 화면은 옛 빌드가 남아 있는 때: 웹은 새로고침, 앱은 스토어). 메시지의 모양이나 뜻을 바꾸면 올린다. 칸을 덧붙이기만 한 것은 올리지 않는다.
 */
export const PROTOCOL = 3;

/**
 * 이 화면(mine)이 그 서버(서버의 번호 serverV, 서버가 받는 가장 낮은 번호 min)와 함께 돌 수 있는가.
 * 서버가 호환 범위를 알리지 않으면(min 없음: 기본) 같은 번호만 맞다 (예전과 같다). 알리면 min ~ serverV 안의 옛 화면도 맞다:
 * 앱은 업데이트가 며칠~몇 주 늦게 퍼지므로 서버가 옛 화면을 얼마 동안 받아 준다 (docs/platforms.md 3.2-4. 서버의 설정 protocolMin)
 */
export function protocolFits(mine: number, serverV: number, min?: number): boolean {
  if (mine === serverV) return true;
  return min !== undefined && min <= mine && mine <= serverV;
}

/**
 * 엔티티의 종류: 'p' 플레이어(핵심), 'm' 몬스터(전투 모듈), 그 밖의 것은 게임이 등록한 종류 (서버 g.defineKind, 화면 registerKind):
 * 구조물, 떨어진 물건, 공, 탈것 같은 것. 이름은 영문 소문자로 시작하는 16자 이내
 */
export type Kind = string;

/**
 * [id, x, z, 바라보는 방향, 이동 중(1) 여부, 체력, …게임의 값]. 게임의 값은 그 종류가 등록한 sync가 돌려준 수들이다 (없으면 칸이 없다).
 * 체력 칸은 체력이 없는 종류에서 0이다
 */
/**
 * 시야 안 엔티티의 상태 한 줄: [id, x, z, 방향, 이동 중, 체력, …게임의 값]. 체력 칸은 전투(combat)를 고른 게임에만 있다:
 * 전투가 없는 게임은 [id, x, z, 방향, 이동 중, …게임의 값]이다 (화면은 같은 내용의 MODULES로 안다: engine/client/entities.ts).
 * 게임의 값은 종류의 KindDef.sync, 플레이어는 g.playerSync
 */
export type EntState = [id: number, x: number, z: number, face: number, moving: 0 | 1, ...rest: number[]];

export interface EnterInfo {
  id: number; kind: Kind;
  /** 몬스터 종류 (MONSTERS의 키), 게임의 종류는 놓을 때 준 type. 플레이어는 빈 문자열 */
  type: string;
  /** 플레이어 이름. 몬스터는 빈 문자열이고 이름은 클라이언트가 type으로 찾는다 */
  name: string;
  /** 플레이어가 든 무기 (ITEMS의 키). 몬스터는 빈 문자열. 아이템(items)을 고르지 않은 게임에는 없다 */
  w?: string;
  /** 입은 갑옷 (플레이어만, 없으면 생략) */
  a?: string;
  /** 길드 이름 (플레이어만, 없으면 생략) */
  g?: string;
  /** 단 칭호 (업적 id: achieve 모듈. 플레이어만, 없으면 생략) */
  ti?: string;
  /** 플레이어의 직업 (CLASSES의 키). 아직 고르지 않았거나 몬스터면 빈 문자열. 직업(classes)을 고르지 않은 게임에는 없다 */
  c?: string;
  x: number; z: number; face: number;
  /** 체력과 최대 체력. 전투(combat)를 고르지 않은 게임에는 없다 */
  hp?: number; maxHp?: number;
  /** 몰려온 적(게임의 규칙이 부른 적: Ent.swarm)이면 1 */
  r?: 1;
  /** 부품으로 된 겉모습의 글자 (engine/shared/defs/look.ts의 encodeLook: 변신한 사람 같은 것). 없으면 예전 그림 */
  l?: string;
}

/** 스냅샷 사이에 일어난 일 */
export type Ev =
  | ['h', src: number, dst: number, dmg: number, crit: 0 | 1] // 피해
  | ['d', id: number] // 죽음
  | ['r', id: number] // 부활해서 자리를 옮김
  | ['s', src: number, skill: string, dst: number] // 기술 사용 (이펙트용): 기술 id와 대상(없으면 0). 보스의 내려치기 예고는 'slam'
  | ['mh', id: number, maxHp: number] // 최대 체력이 바뀌었다 (필드 보스)
  | ['heal', id: number, amount: number]
  | ['buff', id: number, skill: string, dur: number] // 강화가 걸렸다 (그 기술로 dur초 동안)
  | ['stun', id: number, dur: number] // 기절했다
  | ['fx', id: number, name: string, ...vals: number[]]; // 게임의 연출 사건 (g.effect): 그 엔티티가 보이는 화면에만. 화면은 onEffect(name)로 받는다

/** 서버 전체가 공유하는 상태. 칸은 게임이 더한다 (engine/shared/ext.ts) */
/** 모두가 보는 공유 상태: 게임이 더한 칸(engine/shared/ext.ts의 WorldState)과 틀의 모듈의 칸 (teams 모듈의 점수판, rooms 모듈의 대기실: 그 모듈을 고른 게임에만 있다) */
export type WorldState = GameWorldState & { teams?: TeamBoard; rooms?: RoomLobby };

/** 게임이 확장 지점(engine/shared/ext.ts의 ServerMsgs, ClientMsgs)에 더한 메시지들: 종류마다 { t: 종류 } & 나머지 칸. 더한 것이 없으면 never */
type Added<M> = { [K in keyof M]: { t: K } & M[K] }[keyof M];

/** 파티원 한 명의 상태 */
export interface PartyMember {
  id: number; name: string; lv: number; cls: string; hp: number; maxHp: number; x: number; z: number;
  /** 있는 채널 (1부터). 채널이 다르면 곁에 있어도 보이지 않으므로 화면이 알려 준다 */
  ch?: number;
}

export type ClientMsg =
  /**
   * token: 브라우저가 간직하는 비밀 값. 같은 값으로 다시 들어오면 캐릭터를 이어받는다.
   * name: 저장된 이름이 없을 때 쓸 이름. 비우면 서버가 중립적인 이름을 붙인다.
   * v: 이 화면의 프로토콜 번호 (앱·데스크톱이 싣는다. 웹은 싣지 않는다: engine/client/net.ts). 서버의 호환 범위 밖이면 서버가 update를 보내고 닫는다
   */
  | { t: 'join'; name?: string; token?: string; v?: number; /** 차단된 사람의 이의 글 (support 모듈: 받아 두고 닫는다. engine/server/net/support.ts) */ appeal?: string }
  | { t: 'rename'; name: string }
  | { t: 'move'; x: number; z: number }
  | { t: 'stop' }
  /** 드롭 장비: 끼기, 빼기, 팔기, 강화 (uid는 장비 번호) */
  | { t: 'equip'; uid: number }
  | { t: 'unequip'; slot: string }
  | { t: 'sell'; uid: number }
  | { t: 'enhance'; uid: number; charm?: boolean } // charm: 내려갈 수 있는 강화에 보호 부적을 쓴다
  | { t: 'reforge'; uid: number; i: number } // 장비의 i번째 옵션을 다시 뽑는다
  /** 우편의 보상을 받는다. id가 0이면 모두 */
  | { t: 'mailClaim'; id: number }
  /** 던전에 들어간다 (문 가까이에서) / 던전에서 나온다 */
  | { t: 'dungeon'; id: string }
  | { t: 'dungeonLeave' }
  /** n번 채널로 옮긴다 (1부터) */
  | { t: 'channel'; n: number }
  /** 능력치 점수 하나를 찍는다 / 모두 돌려받는다 / 기술을 한 단계 강화한다 */
  | { t: 'stat'; k: string; n?: number }
  | { t: 'statReset' }
  | { t: 'skillUp'; id: string }
  /** 길드: a는 create(name), invite(id: 상대 엔티티), accept, decline, leave, kick(pid), give(n: 골드), notice(text) */
  | { t: 'guild'; a: string; name?: string; id?: number; pid?: string; n?: number; text?: string }
  /** 길드 대화 */
  | { t: 'gchat'; text: string }
  /**
   * 거래소: a는 list(f: 거르는 종류, sort: 순서, page: 쪽 번호(0부터)), mine(내가 올린 것),
   * post(uid: 장비 번호 또는 item: 재료 id와 n: 수량, price: 값), buy(id: 물건 번호), cancel(id: 물건 번호)
   */
  | { t: 'market'; a: string; f?: string; sort?: string; page?: number; uid?: number; item?: string; n?: number; price?: number; id?: number }
  /** 순위표를 달라 */
  | { t: 'rank' }
  /** 자동 사냥을 켰다/껐다. 켠 채 접속이 끊기면 서버가 이어서 사냥한다 */
  | { t: 'auto'; on: boolean }
  | { t: 'attack'; id: number }
  | { t: 'skill'; n: number }
  /** 직업을 고르거나 바꾼다 */
  | { t: 'class'; id: string }
  /** 길 상인 가까이에서 물건을 산다 */
  | { t: 'buy'; id: string }
  | { t: 'craft'; id: string }
  /** 파티: 초대(id는 상대), 받은 초대의 수락과 거절, 탈퇴 */
  | { t: 'party'; a: 'invite' | 'accept' | 'decline' | 'leave'; id?: number }
  /** 물약을 마신다 */
  | { t: 'use'; id: string }
  /**
   * 대화. ch(chat 모듈): n 근처, p 파티, w 귓말(to: 받는 사람의 이름). 없으면 전체. q: 정해진 문장의 키(QUICK_CHAT: text는 비운다)
   */
  | { t: 'chat'; text: string; ch?: ChatCh; to?: string; q?: string }
  /** 다른 사람을 신고한다: id는 상대(엔티티), n은 신고할 대화 줄의 번호(줄의 n). 서버는 그 사람의 최근 대화와 줄의 앞뒤를 함께 기록한다 */
  | { t: 'report'; id?: number; n?: number }
  | { t: 'ping'; c: number }
  /** 장비를 분해해 가루로 바꾼다 (uids: 장비 번호들. 하나라도 안 되면 모두 거절된다) / 장비를 잠그거나 푼다 */
  | { t: 'salvage'; uids: number[] }
  | { t: 'gearLock'; uid: number; on: boolean }
  /** 자동 분해: 주운 장비가 이 등급 이하면 그 자리에서 분해한다 (rar: RARITIES의 번호. -1이면 끈다) */
  | { t: 'autoSalvage'; rar: number }
  /** 골드를 내고 장비 가방을 넓힌다 */
  | { t: 'bagUp' }
  /** 기기 옮기기 (engine/server/net/handoff.ts): make는 이 캐릭터를 옮길 일회용 코드를 달라는 것, use는 다른 기기에서 받은 코드로 이어받는 것 */
  | { t: 'handoff'; a: 'make' }
  | { t: 'handoff'; a: 'use'; code: string }
  /** 팀 고르기·옮기기 (teams 모듈): team은 TEAMS의 번호 */
  | { t: 'team'; team: number }
  /** 영웅 (roster 모듈): 레벨 업(재화) / 별 올리기(조각) / 기술 레벨·각성 (HERO_RULES.skill·awaken을 켠 게임) */
  | { t: 'hero'; a: 'level' | 'star' | 'skill' | 'awaken'; id: string }
  /** 재료로 영웅 키우기 (HERO_RULES.trade): 그 아이템을 써서 가진 영웅의 조각을 얻는다. n번 한꺼번에 (기본 1, 99까지) */
  | { t: 'hero'; a: 'trade'; id: string; item: string; n?: number }
  /** 카드의 공통 손질 (HERO_RULES.cards: engine/server/game/systems/cardgrow.ts): 합성(등급), 넘친 조각 바꾸기, 환원, 잠금, 레벨 n번(0이면 최대), 별 모두(id가 없으면 모든 카드) */
  | { t: 'card'; a: 'fuse'; r: number; id?: undefined }
  | { t: 'card'; a: 'convert' | 'reset'; id: string }
  | { t: 'card'; a: 'lock'; id: string; on: boolean }
  | { t: 'card'; a: 'levels'; id: string; n: number }
  | { t: 'card'; a: 'stars'; id?: string }
  /** 뽑기 (gacha 모듈): 배너 id와 횟수(1 또는 10) */
  | { t: 'gacha'; id: string; n: number }
  /** 편성 (squad 모듈): 함께 싸울 영웅 (자리의 차례, SQUAD_RULES.size까지) */
  | { t: 'squad'; ids: string[]; back?: string[]; lead?: undefined }
  /** 홈(로비)의 대표 캐릭터 (squad 모듈): 가진 영웅 id, 빈 글이면 편성의 첫째 */
  | { t: 'squad'; lead: string; ids?: undefined; back?: undefined }
  /** 영웅 장비 (herogear 모듈): 끼기(hero에게), 빼기, 강화, 분해(uids: 끼지 않은 것만) */
  | { t: 'hgear'; a: 'equip' | 'unequip' | 'enhance'; uid: number; hero?: string }
  | { t: 'hgear'; a: 'salvage'; uids: number[] }
  /** 단계 (stages 모듈): start 지금 단계로 들어간다, leave 나온다, auto 자동 진행 켜고 끄기(on), go 그 단계로(id: 깬 단계나 그다음) */
  | { t: 'stage'; a: 'start' | 'leave' | 'auto' | 'go'; on?: boolean; id?: string }
  /** 단계의 소탕 (STAGE_RULES.sweep): 깬 단계 id를 n번 (1~max) */
  | { t: 'stage'; a: 'sweep'; id: string; n: number }
  /** 배속(x: 1~STAGE_RULES.speed.max)·일시정지(on) — 단계의 전투 화면 (hud/battle.ts) */
  | { t: 'stage'; a: 'speed'; x: number }
  | { t: 'stage'; a: 'pause'; on: boolean }
  /** 던전의 열쇠를 산다 (DungeonDef.key.buy가 있는 던전) */
  | { t: 'dungeonKey'; id: string }
  /** 열쇠 던전의 소탕 (DungeonDef.sweep): 끝낸 적이 있는 던전을 n번, 열쇠 n개 */
  | { t: 'dungeonSweep'; id: string; n: number }
  /** 영웅 선택권 (GACHA_RULES.select): 선택권 아이템 하나를 쓰고 그 목록의 영웅 하나를 얻는다 */
  | { t: 'gacha'; a: 'select'; item: string; hero: string }
  /** 교환 상점 (BannerDef.exchange, 묶음 D): 그 배너의 표식으로 영웅 하나 */
  | { t: 'gacha'; a: 'trade'; id: string; hero: string }
  /** 스태미나 (stamina 모듈): 물약 하나를 쓴다 */
  | { t: 'stamina'; a: 'potion' }
  /** 메뉴에서 바로 던전에 들어간다 (DungeonDef.fromMenu인 던전): 들판이나 단계 안에서. 단계 안이면 단계에서 나와 들어간다 */
  | { t: 'dungeonGo'; id: string }
  /**
   * 판 (rooms 모듈): quick 빠른 대국, host 판 만들기(n: 자리 수), cpu 컴퓨터와 두기, join 들어가기(id: 판, pass: 비밀번호), leave 대기실로(두는 중이면 기권), pass 차례 넘기기, resign 기권, again 다시 하기, start 지금 시작.
   * def는 판의 이름(게임에 판이 여럿일 때). 판의 공통화: code 방 코드로 들어가기(code, pass), watch 구경(id 또는 code), privacy 공개 설정(v, pass), kick·give 방장의 내보내기·넘기기(seat),
   * ready 준비(on), opt 규칙 고르기(k, v), vote 투표 내기(kind 'opt'|'again'|'kick', k, v, seat), ballot 표(yes), regroup 같은 무리로 다음 판, stats 전적(seat 또는 id: 없으면 나)
   */
  | { t: 'room'; a: RoomCmd; id?: number; def?: string; n?: number; code?: string; pass?: string; v?: string | number; seat?: number; on?: boolean; k?: string; kind?: 'opt' | 'again' | 'kick'; yes?: boolean }
  // ---- 경쟁 (묶음 8) ----
  /** 순위표 (boards 모듈): 그 순위표(id, 없으면 첫째)와 탭 목록을 달라 */
  | { t: 'board'; id?: string }
  /** 큐 (ranked 모듈): join 그 판(def, 없으면 첫째 랭크 판)의 큐에 서기, leave 나오기 */
  | { t: 'queue'; a: 'join' | 'leave'; def?: string }
  /** 리플레이 (RoomDef.replay): 끝난 판의 번호 (내가 앉았던 판만) */
  | { t: 'replay'; id: number }
  /** 변신 (morph 모듈): on 가진 캐릭터 정의(id)로 변신, off 풀기 */
  | { t: 'morph'; a: 'on' | 'off'; id?: string }
  /** 게임 안의 모드 (modes 모듈): 그 모드로 (MODE_RULES.list의 id). 싸우는 중에도 바로 바뀐다 */
  | { t: 'mode'; id: string }
  /** 자동 사냥의 안전장치 (게임이 g.away.safety를 켰을 때): 물약을 마실 비율, 물러날 비율, 물약이 떨어지면 멈춤, 쓰러지면 끝 */
  | { t: 'autoSafe'; potion?: number; retreat?: number; noPotion?: boolean; death?: boolean }
  /** 자동 사냥 설정 (away 모듈, 묶음 E): 준 칸만 바꾼다(빈 메시지는 지금 값을 묻기만). reset이면 기본값으로. 서버는 같은 이름의 메시지로 지금 값을 돌려준다 */
  | { t: 'autoPrefs'; p?: Partial<AutoPrefs>; reset?: boolean }
  // ---- 웹 출시의 바탕 (engine/server/net/web.ts) ----
  /** 탭·앱이 보이는가 (숨기면 false: 다른 사람에게 자리 비움으로 보인다) */
  | { t: 'vis'; on: boolean }
  /** 약관 동의: ask 내가 동의한 버전을 묻는다, agree 그 버전(LEGAL.version)에 동의한다 */
  | { t: 'consent'; a: 'ask' }
  | { t: 'consent'; a: 'agree'; v: string }
  /** 내 데이터: export 내려받을 JSON을 달라, erase 삭제를 요청한다(유예 뒤 실행), cancel 요청을 거둔다, status 요청 상태를 묻는다 */
  | { t: 'mydata'; a: 'export' | 'erase' | 'cancel' | 'status' }
  // ---- 사회와 안전 (engine/server/net/social.ts) ----
  /** 차단: add 그 사람(id: 엔티티, n: 대화 줄, r: 친구 목록의 표), del 풀기(r), list 목록, import 브라우저에 남은 옛 차단 목록(이름)을 서버로 옮긴다 */
  | { t: 'block'; a: 'add'; id?: number; n?: number; r?: string }
  | { t: 'block'; a: 'del'; r: string }
  | { t: 'block'; a: 'list' }
  | { t: 'block'; a: 'import'; names: string[] }
  /** 친구 (friends 모듈): ask 요청(id: 엔티티 또는 name: 이름), accept·decline 받은 요청, cancel 보낸 요청, del 끊기, invite 파티에 부르기, list 목록 */
  | { t: 'friend'; a: 'ask'; id?: number; name?: string }
  | { t: 'friend'; a: 'accept' | 'decline' | 'cancel' | 'del' | 'invite'; r: string }
  | { t: 'friend'; a: 'list' }
  /** 대화 설정과 연령: state 묻기, age 나이(y: 태어난 해, band: u 기준 미만 / o 이상. 한 번만), prefs 귓말·친구 요청 받기 */
  | { t: 'talk'; a: 'state' }
  | { t: 'talk'; a: 'age'; y?: number; band?: 'u' | 'o' }
  | { t: 'talk'; a: 'prefs'; noWhisper?: boolean; noFriend?: boolean }
  // ---- 확률과 재화의 투명성 (odds 모듈: engine/server/game/systems/odds.ts) ----
  /** 확률표: tables 지금의 표와 이력·사전 공지(공개 페이지와 같은 것), mine 내 최근 추첨 기록 */
  | { t: 'odds'; a: 'tables' | 'mine' }
  // ---- 운영 도구와 고객지원 (support 모듈: engine/server/net/support.ts) ----
  /** 문의: list 내 문의와 지금 걸린 말 막기, new 새 문의 (kind: ask 질문, bug 오류, appeal 말 막기에 대한 이의) */
  | { t: 'support'; a: 'list' }
  | { t: 'support'; a: 'new'; kind: TicketView['kind']; text: string }
  // ---- 라이브 콘텐츠 (묶음 6: engine/server/game/systems/goods.ts·season.ts·achieve.ts·coupon.ts) ----
  /** 상품을 산다 (GOODS의 id) */
  | { t: 'goods'; id: string }
  /** 시즌 트랙의 칸을 받는다 (-1이면 받을 수 있는 칸 모두) */
  | { t: 'season'; i: number }
  /** 칭호를 단다 (업적 id, ''이면 뗀다) */
  | { t: 'title'; id: string }
  /** 쿠폰 코드를 쓴다 */
  | { t: 'coupon'; code: string }
  | Added<ClientMsgs>;

export type ServerMsg =
  /** 내 파티의 구성원 (나 포함). 빈 목록이면 파티가 없다 */
  | { t: 'party'; m: PartyMember[] }
  /** 파티 초대를 받았다: 보낸 사람과 유효 시간(초) */
  | { t: 'pinv'; id: number; name: string; s: number }
  /**
   * auto: 자동 사냥을 켠 채로 나갔던 캐릭터다 (자리를 비운 동안 사냥하던 캐릭터를 이어받았거나, 저장에서 읽었다)
   * v: 서버의 프로토콜 번호(PROTOCOL). 이 칸이 생기기 전의 서버는 보내지 않는다
   * min: 서버가 받는 가장 낮은 프로토콜 번호. 서버가 옛 화면을 받아 주도록 설정했을 때만 싣는다 (기본은 같은 번호만이라 싣지 않는다: protocolFits)
   */
  | { t: 'welcome'; id: number; name: string; x: number; z: number; auto?: boolean; v?: number; min?: number }
  | {
      t: 'snap';
      /** 접속자 수 */
      n: number;
      /** 내 캐릭터의 서버 상태: [x, z, 이동 중, 체력, 공격 대상 id(없으면 0), …게임의 값(g.playerSync)] */
      you: [number, number, 0 | 1, number, number, ...number[]];
      /** 시야에 새로 들어온 엔티티 */
      enter?: EnterInfo[];
      /** 시야에서 빠진 엔티티 */
      leave?: number[];
      /** 시야 안 엔티티의 현재 상태 (나는 제외) */
      ents: EntState[];
      ev?: Ev[];
    }
  /**
   * 내 성장 수치. 바뀔 때만 온다. 칸은 그 모듈을 고른 게임에만 있다 (engine/server/game/systems/status.ts):
   * maxHp[combat], lv·exp·need[growth], sparks·gold[economy], weapon·armor·items[items], cls[classes]. 그 모듈이 하나도 없으면 오지 않는다
   */
  | {
      t: 'stat'; maxHp?: number; lv?: number; exp?: number; need?: number; sparks?: number;
      gold?: number; weapon?: string;
      /** 입은 갑옷. 없으면 빈 문자열 */
      armor?: string;
      /** 직업. 아직 고르지 않았으면 빈 문자열 */
      cls?: string;
      /** 가진 물약: 아이템 id별 개수 */
      items?: Record<string, number>;
    }
  /** 내 장비·우편·일일 임무. 바뀔 때만 온다. 칸은 그 모듈을 고른 게임에만 있다: gear·worn[gear], mail[mail], daily[daily], power[rank], build[build]. daily.next는 주간·월간 임무가 있는 게임만: 다음 초기화 시각 [날, 주, 달] (UTC ms) */
  | { t: 'meta'; gear?: Gear[]; worn?: Record<string, number>; mail?: Mail[]; daily?: { prog: Record<string, number>; got: string[]; streak: number; next?: number[] }; power?: number; build?: { stats: Record<string, number>; skillLv: Record<string, number>; left: number } }
  /** 내가 들어가 있는 던전의 상태. id가 빈 문자열이면 밖이다. left는 남은 시간(초, 끝낸 뒤에는 나가기까지), foes는 남은 적 */
  | { t: 'dungeon'; id: string; left: number; foes: number; cleared: boolean }
  /** 채널: me는 내 채널 번호(1부터), list는 채널별 인원. foes는 게임의 규칙이 '바쁜 때'(Channels.extraFoes)를 알릴 때만 오는 채널별 남은 적의 수 */
  | { t: 'channels'; me: number; list: number[]; foes?: number[] }
  /** 순위표. me는 내 순위(0부터, 없으면 -1) */
  | { t: 'rank'; list: RankRow[]; me: number }
  /** 물약을 마셨다: 다시 마실 수 있을 때까지(ms) */
  | { t: 'icd'; ms: number }
  /** 누군가 무기나 직업을 바꿨다 */
  | { t: 'gear'; id: number; weapon: string; armor: string; cls: string }
  /** 내 개인 상태의 한 칸 (게임의 시스템이 g.personal에 등록한 것). k는 칸의 이름, s는 그 값: 모양은 게임이 정한다. 접속 직후에 전부, 그 뒤로는 바뀐 칸만 온다 */
  | { t: 'me'; k: string; s: unknown }
  /** 공유 상태. 바뀔 때만 온다 */
  | { t: 'world'; s: WorldState }
  /** 기술이 받아들여짐: n번 기술의 쿨다운(ms)이 시작됐다 */
  | { t: 'cd'; n: number; ms: number }
  /** 누군가 이름을 바꿨다 */
  | { t: 'name'; id: number; name: string }
  /**
   * 대화 한 줄. ch: g 길드, n 근처, p 파티, w 귓말 (없으면 전체). n: 줄 번호(신고·차단에 쓴다). q: 정해진 문장의 키(text는 비어 있다: 받는 화면이 자기 언어로 읽는다).
   * to: 내가 보낸 귓말이 돌아온 것이면 받는 사람의 이름
   */
  | { t: 'chat'; id: number; name: string; text: string; ch?: ChatCh; n?: number; q?: string; to?: string; md?: string }
  /** 내 길드(없으면 null)와 받은 초대 */
  | { t: 'guild'; g: GuildView | null; invite?: { name: string; from: string } }
  /** 거래소 목록의 한 쪽. total은 걸러진 물건의 수, guest는 손님이라 사고팔 수 없다는 뜻 */
  | { t: 'market'; v: 'list'; list: MarketItem[]; f: string; sort: string; page: number; pages: number; total: number; guest?: true }
  /** 내가 거래소에 올려 둔 것. 올리거나 내리거나 팔리거나 기간이 지나면 다시 온다 */
  | { t: 'market'; v: 'mine'; list: MarketItem[]; guest?: true }
  /** 누군가의 길드 이름이 바뀌었다 (이름표) */
  | { t: 'gtag'; id: number; g: string }
  /** 안내문: 종류와 값 (engine/shared/messages.ts) */
  | { t: 'sys'; k: MsgKey; a?: MsgArg[] }
  | { t: 'pong'; c: number }
  | { t: 'full' }
  /** 기기 옮기기: 만든 코드와 남은 시간(ms), 또는 이어받은 기기에 주는 새 토큰 (받은 기기는 그것을 간직하고 다시 접속한다) */
  | { t: 'handoff'; code: string; ms: number }
  | { t: 'handoff'; token: string }
  /** 뽑기의 결과 (gacha 모듈): 배너와 나온 것들 (뽑은 차례) */
  | { t: 'gacha'; b: string; got: PullGot[] }
  /** 소탕의 결과 (stages·dungeon 모듈): 단계나 던전, 횟수, 받은 것의 합 */
  | { t: 'sweep'; got: SweepGot }
  /** 자동 사냥 설정 (명령 autoPrefs의 답): 지금 값, 게임의 기본값, 안전장치(게임이 켰을 때만, 아니면 null), 퀘스트 대상을 고를 수 있는 게임인가 */
  | { t: 'autoPrefs'; s: AutoPrefs; base: AutoPrefs; safety: AwaySafety | null; goal: boolean }
  /** 돌아왔을 때 받은 방치 보상 (idle 모듈, IDLE.popup을 켠 게임만): 화면이 창으로 알린다. 받기는 그 우편(mail)으로 */
  | ({ t: 'idleBack' } & IdleBack)
  /** 돌아옴 요약 (modes 모듈, MODE_RULES.backCard를 켠 게임만): 다른 모드에서 돌아왔을 때 그쪽에서 그동안 일어난 일 */
  | ({ t: 'modeBack' } & ModeBack)
  /** 누군가의 부품 겉모습이 바뀌었다 (g.setLook: 변신과 풀기). l이 빈 문자열이면 예전 그림으로 */
  | { t: 'look'; id: number; l: string }
  /** 지금 보이는 공지 (engine/server/game/systems/live.ts): 접속 직후(있을 때만)와 목록이 바뀔 때. 빈 목록이면 공지가 없다 */
  | { t: 'notices'; list: NoticeView[] }
  /** 점검의 예고·시작 (있을 때만). off면 예고가 취소됐거나 점검이 끝났다 */
  | ({ t: 'maint' } & MaintView)
  | { t: 'maint'; off: true }
  /** 원격 설정으로 바뀐 칸 가운데 화면에도 보내는 것 (LIVE_KEYS의 client): set 덮어쓴 값, reset 소스의 값으로 돌아간 칸 */
  | { t: 'live'; set: Record<string, unknown>; reset?: string[] }
  // ---- 웹 출시의 바탕 (engine/server/net/web.ts) ----
  /** 자리 비움(탭을 숨김)이 된 사람(on: true)이나 돌아온 사람(on: false)의 엔티티 번호들 */
  | { t: 'afk'; ids: number[]; on: boolean }
  /** 이 저장 키가 동의한 약관 버전 (없으면 null) */
  | { t: 'consent'; v: string | null }
  /** 내 데이터: 내려받을 JSON / 삭제 요청의 상태 (due: 지우는 시각(ms), 요청이 없으면 null. days: 유예 일수) */
  | { t: 'mydata'; a: 'export'; data: unknown }
  | { t: 'mydata'; a: 'state'; due: number | null; days: number }
  /**
   * 이 화면은 서버와 함께 돌 수 없다 (join.v가 서버의 호환 범위 min ~ max 밖): 화면은 업데이트를 권한다 (platform().app.requireUpdate(store)).
   * 서버는 이것을 보낸 뒤 닫힘 코드 4006으로 닫는다 (engine/server/net/server.ts). store: 업데이트할 곳의 주소 (설정했으면)
   */
  | { t: 'update'; min: number; max: number; store?: string }
  // ---- 사회와 안전 (engine/server/net/social.ts) ----
  /** 내가 차단한 사람들 (접속하면 있을 때만, 바뀌면 다시). imported: 옛 차단 목록을 옮긴 답이면 옮긴 수 (화면은 그때 브라우저의 옛 목록을 지운다) */
  | { t: 'blocks'; list: BlockView[]; imported?: number }
  /** 내 친구와 요청 (friends 모듈) */
  | { t: 'friends'; list: FriendView[] }
  /** 내 대화 상태: 제한 모드, 나이를 물어야 하는가, 귓말·친구 요청 받기 (연령을 묻거나 chat·friends 모듈을 고른 게임만) */
  | { t: 'talk'; s: TalkState }
  // ---- 확률과 재화의 투명성 (odds 모듈) ----
  /** 확률표와 이력·사전 공지 (물었을 때, 그리고 표의 버전이 바뀌면 모두에게) / 내 최근 추첨 기록 (사람 칸은 비운다) */
  | { t: 'odds'; a: 'tables'; pub: OddsPublic }
  | { t: 'odds'; a: 'mine'; rows: DrawRow[] }
  // ---- 판 (rooms 모듈) ----
  /** 전적 (명령 room a:'stats'의 답: RoomDef.record를 켠 판의 기록을 센 것) */
  | { t: 'roomStats'; s: RoomStatsView }
  // ---- 경쟁 (묶음 8) ----
  /** 순위표 (명령 board의 답): 탭 목록과 고른 순위표 */
  | { t: 'board'; tabs: BoardTab[]; s: BoardView | null }
  /** 리플레이 (명령 replay의 답) */
  | { t: 'replay'; s: ReplayView }
  // ---- 운영 도구와 고객지원 (support 모듈: engine/server/net/support.ts) ----
  /** 내 문의 (최근부터)와 지금 걸린 말 막기, 그 말 막기에 열린 이의가 있는가 / 문의를 받았다 (번호) */
  | { t: 'support'; a: 'list'; list: TicketView[]; sanction: SanctionView | null; appealed?: boolean }
  | { t: 'support'; a: 'sent'; id: number }
  /** 접속이 막혀 있다 (닫기 전에): 사유·끝 시각, 이의를 이미 냈는가, 이의에 답이 있으면 그 답 */
  | { t: 'sanction'; s: SanctionView; appealed: boolean; answer?: string }
  /** 누군가 칭호를 바꿨다 (achieve 모듈): 엔티티 id, 업적 id(''이면 뗐다) */
  | { t: 'title'; id: number; ti: string }
  | Added<ServerMsgs>;

/** 문의 한 건의 화면 몫 (support 모듈): 번호, 종류, 상태(open 열림, answered 답변, closed 닫힘), 보낸 글, 답(없으면 빈 글), 접수·마지막으로 바뀐 시각(UTC ms) */
export interface TicketView { id: number; kind: 'ask' | 'bug' | 'appeal'; state: 'open' | 'answered' | 'closed'; text: string; answer: string; at: number; upd: number }
/** 걸린 제재의 화면 몫: 종류(ban 접속 차단, mute 말 막기), 끝 시각(0이면 영구), 사유, 건 시각 */
export interface SanctionView { kind: 'ban' | 'mute'; until: number; why: string; at: number }
