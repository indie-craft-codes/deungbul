// 서버와 클라이언트가 주고받는 메시지. 지금은 JSON이고, 트래픽이 문제가 되면 이진 형식으로 바꾼다.
// 화면에 보일 문장은 싣지 않는다: 종류와 값만 보내고 문장은 클라이언트가 언어에 맞게 만든다.
import type { Gear, Mail, RankRow } from './defs/growth';
import type { GuildView, MarketItem } from './defs/social';
import type { ClientMsgs, ServerMsgs, WorldState } from './ext';
import type { MsgArg, MsgKey } from './messages';

/**
 * 프로토콜 번호. 서버가 welcome에 실어 보내고, 클라이언트는 자기 빌드의 번호와 다르면 새로고침을 권한다
 * (서버만 새로 올라가고 화면은 옛 빌드가 남아 있는 때). 메시지의 모양이나 뜻을 바꾸면 올린다. 칸을 덧붙이기만 한 것은 올리지 않는다.
 */
export const PROTOCOL = 2;

/** 'p' 플레이어, 'm' 몬스터 */
export type Kind = 'p' | 'm';

/** [id, x, z, 바라보는 방향, 이동 중(1) 여부, 체력] */
export type EntState = [id: number, x: number, z: number, face: number, moving: 0 | 1, hp: number];

export interface EnterInfo {
  id: number; kind: Kind;
  /** 몬스터 종류 (MONSTERS의 키). 플레이어는 빈 문자열 */
  type: string;
  /** 플레이어 이름. 몬스터는 빈 문자열이고 이름은 클라이언트가 type으로 찾는다 */
  name: string;
  /** 플레이어가 든 무기 (ITEMS의 키). 몬스터는 빈 문자열 */
  w: string;
  /** 입은 갑옷 (플레이어만, 없으면 생략) */
  a?: string;
  /** 길드 이름 (플레이어만, 없으면 생략) */
  g?: string;
  /** 플레이어의 직업 (CLASSES의 키). 아직 고르지 않았거나 몬스터면 빈 문자열 */
  c: string;
  x: number; z: number; face: number; hp: number; maxHp: number;
  /** 습격으로 온 적이면 1 */
  r?: 1;
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
  | ['stun', id: number, dur: number]; // 기절했다

/** 서버 전체가 공유하는 상태. 칸은 게임이 더한다 (engine/shared/ext.ts) */
export type { WorldState };

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
   */
  | { t: 'join'; name?: string; token?: string }
  | { t: 'rename'; name: string }
  | { t: 'move'; x: number; z: number }
  | { t: 'stop' }
  /** 드롭 장비: 끼기, 빼기, 팔기, 강화 (uid는 장비 번호) */
  | { t: 'equip'; uid: number }
  | { t: 'unequip'; slot: string }
  | { t: 'sell'; uid: number }
  | { t: 'enhance'; uid: number }
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
  | { t: 'chat'; text: string }
  /** 다른 사람을 신고한다 (id는 상대). 서버는 그 사람의 최근 대화와 함께 기록한다 */
  | { t: 'report'; id: number }
  | { t: 'ping'; c: number }
  /** 장비를 분해해 가루로 바꾼다 (uids: 장비 번호들. 하나라도 안 되면 모두 거절된다) / 장비를 잠그거나 푼다 */
  | { t: 'salvage'; uids: number[] }
  | { t: 'gearLock'; uid: number; on: boolean }
  /** 자동 분해: 주운 장비가 이 등급 이하면 그 자리에서 분해한다 (rar: RARITIES의 번호. -1이면 끈다) */
  | { t: 'autoSalvage'; rar: number }
  /** 골드를 내고 장비 가방을 넓힌다 */
  | { t: 'bagUp' }
  | Added<ClientMsgs>;

export type ServerMsg =
  /** 내 파티의 구성원 (나 포함). 빈 목록이면 파티가 없다 */
  | { t: 'party'; m: PartyMember[] }
  /** 파티 초대를 받았다: 보낸 사람과 유효 시간(초) */
  | { t: 'pinv'; id: number; name: string; s: number }
  /**
   * auto: 자동 사냥을 켠 채로 나갔던 캐릭터다 (자리를 비운 동안 사냥하던 캐릭터를 이어받았거나, 저장에서 읽었다)
   * v: 서버의 프로토콜 번호(PROTOCOL). 이 칸이 생기기 전의 서버는 보내지 않는다
   */
  | { t: 'welcome'; id: number; name: string; x: number; z: number; auto?: boolean; v?: number }
  | {
      t: 'snap';
      /** 접속자 수 */
      n: number;
      /** 내 캐릭터의 서버 상태: [x, z, 이동 중, 체력, 공격 대상 id(없으면 0)] */
      you: [number, number, 0 | 1, number, number];
      /** 시야에 새로 들어온 엔티티 */
      enter?: EnterInfo[];
      /** 시야에서 빠진 엔티티 */
      leave?: number[];
      /** 시야 안 엔티티의 현재 상태 (나는 제외) */
      ents: EntState[];
      ev?: Ev[];
    }
  /** 내 성장 수치. 바뀔 때만 온다 */
  | {
      t: 'stat'; maxHp: number; lv: number; exp: number; need: number; sparks: number;
      gold: number; weapon: string;
      /** 입은 갑옷. 없으면 빈 문자열 */
      armor: string;
      /** 직업. 아직 고르지 않았으면 빈 문자열 */
      cls: string;
      /** 가진 물약: 아이템 id별 개수 */
      items: Record<string, number>;
    }
  /** 내 장비·우편·일일 임무. 바뀔 때만 온다 */
  | { t: 'meta'; gear: Gear[]; worn: Record<string, number>; mail: Mail[]; daily: { prog: Record<string, number>; got: string[]; streak: number }; power: number; build: { stats: Record<string, number>; skillLv: Record<string, number>; left: number } }
  /** 내가 들어가 있는 던전의 상태. id가 빈 문자열이면 밖이다. left는 남은 시간(초, 끝낸 뒤에는 나가기까지), foes는 남은 적 */
  | { t: 'dungeon'; id: string; left: number; foes: number; cleared: boolean }
  /** 채널: me는 내 채널 번호(1부터), list는 채널별 인원. foes는 습격 중일 때만 오는 채널별 남은 적의 수 */
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
  /** ch가 'g'면 길드 대화다 */
  | { t: 'chat'; id: number; name: string; text: string; ch?: 'g' }
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
  | Added<ServerMsgs>;
