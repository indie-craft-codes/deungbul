// 저장 계층의 약속. 게임 규칙은 이 인터페이스만 알고, 실제 저장소는 갈아 끼운다.
// 실시간 상태(체력, 몬스터)는 저장하지 않는다. 재시작을 넘어 남아야 하는 것만 적는다.
import type { Reward } from '../../shared/defs/growth';
import type { DrawRow, OddsHistoryRow, OddsPlanRow, OddsTableDef } from '../../shared/defs/odds';

/**
 * 캐릭터 저장의 틀의 칸. 핵심의 칸은 v·gv·name·seen·ext·at이고, 나머지는 [ ]의 모듈을 고른 게임만 적는다 (engine/server/game/systems/players.ts의 export). 게임의 시스템은 자기 몫을 ext의 자기 이름 칸에 적는다 (engine/server/game/game.ts의 Saver).
 * 옛 형식의 저장에는 게임의 칸이 최상위에 있을 수 있다: 그것은 이 타입에 없고, 읽는 길(Saver.legacy)이 저장 전체를 이름-값 묶음으로 받아 스스로 찾는다.
 * (interface가 아니라 type인 까닭: 이름-값 묶음(Record<string, unknown>)으로 넘길 수 있게)
 */
export type PlayerSave = {
  /** 저장 형식의 버전: v는 틀의 것, gv는 게임의 것 (engine/server/game/migrate.ts). 없으면 0(버전 칸이 생기기 전의 저장) */
  v?: number; gv?: number;
  name: string;
  /** 레벨, 경험치, 다음 레벨까지 [growth] */
  lv?: number; exp?: number; need?: number;
  /** 최대 체력 [combat] (읽을 때는 쓰지 않는다: 직업과 레벨로 다시 구한다) */
  maxHp?: number;
  /** 두 번째 재화 [economy] */
  sparks?: number;
  /** 마지막으로 저장된 시각(ms). 접속하지 않은 시간을 계산할 때 쓴다 */
  seen?: number;
  /** 직업. 아직 고르지 않았으면 빈 문자열 [classes] */
  cls?: string;
  /** [economy] */
  gold?: number;
  /** 든 무기, 입은 갑옷, 소지품 [items] */
  weapon?: string;
  armor?: string;
  items?: Record<string, number>;
  /** 시스템마다 자기 이름의 칸에 저장하는 것 (장비, 우편, 일일 임무). engine/server/game/game.ts의 Saver */
  ext?: Record<string, unknown>;
  /** 마지막으로 있던 자리 [x, z]. 다시 접속하면 여기서 시작한다 */
  at?: [number, number];
  /** 자동 사냥을 켠 채로 나갔다. 다시 접속하면 켜진 채로 시작한다 [away] */
  auto?: boolean;
};

/** 신고에 붙는 대화의 앞뒤 한 줄 (engine/server/net/social.ts): 시각, 채널(없으면 전체), 말한 사람의 이름, 원문(가리기 전), 신고당한 사람의 말이면 t, 신고한 줄이면 hit */
export interface ReportLine { at: number; ch?: string; name: string; text: string; t?: true; hit?: true }
/** 신고 한 건 (engine/server/net/moderation.ts의 Report와 같은 모양). ctx·ch는 대화 줄을 신고했을 때(또는 그 둘레의 대화가 있을 때)만 */
export interface ReportSave { at: number; by: string; byKey: string | null; target: string; targetKey: string | null; lines: string[]; ctx?: ReportLine[]; ch?: string }

/**
 * 재화 흐름 지표의 한 줄 (engine/server/game/systems/ledger.ts): 그날, 그 재화가, 그 원인으로, 생겼거나(+) 사라진(-) 양과 건수.
 * 재화는 gold, sparks, exp, gear:등급, item:아이템 id. 같은 (day, cur, why, dir)은 한 줄로 합쳐진다
 */
export interface EconRow { day: string; cur: string; why: string; dir: '+' | '-'; amount: number; n: number }

/** 시스템마다 자기 이름의 칸에 저장할 것을 넣는다 (예: { tower: {...} }). 칸 v·gv는 저장 형식의 버전이다 (engine/server/game/migrate.ts): 시스템의 이름으로 쓰지 않는다 */
export type WorldSave = Record<string, unknown>;

/**
 * 경제 장부의 저장 (economy 모듈의 재화 흐름 지표: engine/server/game/systems/ledger.ts). 틀의 저장소 둘(SqliteStore, MemoryStore)은 이것도 갖는다.
 * 이것이 없는 저장소를 넘기면 서버는 장부를 적지 않는다 (economy를 고르지 않은 게임은 쓰지 않는다)
 */
export interface EconStore {
  /** 재화 흐름 지표의 줄을 얹는다: 같은 (day, cur, why, dir)이 이미 있으면 양과 건수를 더한다 */
  addEcon(rows: EconRow[]): void;
  /** 그 날짜(YYYY-MM-DD)부터의 지표 줄 */
  econ(fromDay: string): EconRow[];
  /** 그날의 분포 스냅샷을 적는다 (하루에 하나. 다시 적으면 덮어쓴다) */
  saveEconSnapshot(day: string, data: unknown): void;
  /** 그날의 분포 스냅샷. 날짜를 주지 않으면 가장 최근 것. 없으면 null */
  econSnapshot(day?: string): { day: string; data: unknown } | null;
}
/** 그 저장소가 경제 장부도 적는가 */
export const hasEcon = (s: Store): s is Store & EconStore => typeof (s as Partial<EconStore>).addEcon === 'function';

/** 핵심의 저장소: 캐릭터, 월드, 신고, 한 묶음 쓰기, 백업 */
export interface Store {
  loadWorld(): WorldSave | null;
  saveWorld(w: WorldSave): void;
  /** key는 접속 토큰의 해시다. 토큰 원문은 저장하지 않는다. */
  loadPlayer(key: string): PlayerSave | null;
  /** 그 이름을 쓰는 저장된 캐릭터의 키 (대소문자 무시, 없으면 null). 남의 이름을 차지하지 못하게 하는 데 쓴다 */
  keyOfName(name: string): string | null;
  savePlayer(key: string, p: PlayerSave): void;
  /** 신고를 적는다. 운영자가 나중에 읽는다 */
  saveReport(r: ReportSave): void;
  /** 최근 신고부터 limit건 */
  reports(limit: number): ReportSave[];
  /** 저장된 모든 캐릭터를 훑는다 (지표의 분포 스냅샷용). 저장 키는 넘기지 않는다 */
  eachPlayer(fn: (p: PlayerSave) => void): void;
  /** 저장된 모든 캐릭터를 저장 키와 함께 훑는다 (관리자의 일괄 우편: 점검 보상). 없는 저장소는 일괄 우편을 할 수 없다 */
  eachPlayerKey?(fn: (key: string, p: PlayerSave) => void): void;
  /**
   * fn 안의 쓰기를 한 묶음으로: fn이 끝까지 돌면 모두 적히고, 예외를 던지면 하나도 적히지 않은 채 그 예외를 다시 던진다.
   * 안에서 다시 불러도 된다(안쪽 묶음은 바깥 묶음의 일부가 된다). fn은 동기 함수여야 한다(await 사이에 다른 쓰기가 끼면 묶음이 깨진다)
   */
  transaction<T>(fn: () => T): T;
  /** 저장 파일 하나를 통째로 복사한다 (자동 백업: ./backup.ts). 파일로 저장하지 않는 저장소에는 없다 */
  backup?(file: string): void;
  /** 저장 파일의 경로. 파일로 저장하지 않는 저장소에는 없다 */
  readonly file?: string;
  close(): void;
}

/** 원격 설정 저장소의 한 칸 (engine/server/game/systems/live.ts): 열쇠(cfg:이름, flag:이름, notice:id, maint, admins), 값, 그 칸의 버전, 마지막으로 바꾼 때와 사람 */
export interface LiveRow { key: string; value: unknown; ver: number; at: number; by: string }
/** 원격 설정의 변경 이력 한 줄: 누가, 언제, 전, 후 (before·after가 null이면 없던 칸·지운 칸) */
export interface LiveLogRow { id: number; key: string; ver: number; before: unknown; after: unknown; at: number; by: string; note: string }
/**
 * 원격 설정의 저장 (버전 있는 키-값과 변경 이력, 시계의 마지막 경계). 틀의 저장소 둘(SqliteStore, MemoryStore)은 이것도 갖는다.
 * 이것이 없는 저장소를 넘기면 원격 설정·공지·점검은 서버가 켜져 있는 동안만 남는다
 */
export interface LiveStore {
  /** 지금의 모든 칸 */
  liveRows(): LiveRow[];
  /** 칸을 적는다 (value가 null이면 지운다). 이력에 한 줄(전·후)을 함께 적는다: 한 묶음. 그 칸의 새 버전을 돌려준다 */
  liveWrite(key: string, value: unknown, by: string, at: number, note?: string): number;
  /** 이력: 최근 것부터 limit줄. key를 주면 그 칸의 것만 */
  liveLog(key: string | null, limit: number): LiveLogRow[];
  /** 이력이 없는 운영 값 (시계가 마지막으로 처리한 경계 같은 것). 없으면 null */
  liveMeta(key: string): unknown;
  setLiveMeta(key: string, value: unknown): void;
}
/** 그 저장소가 원격 설정도 적는가 */
export const hasLive = (s: Store): s is Store & LiveStore => typeof (s as Partial<LiveStore>).liveWrite === 'function';
// ---------- 웹 출시의 바탕: 약관 동의, 내 데이터 삭제, 화면 오류 (engine/server/net/web.ts) ----------
/** 삭제 요청 한 건. 실행하면 state가 done이 되고 이름은 지운다 (저장 키의 해시와 시각만 남는 기록) */
export interface EraseRow { key: string; name: string; asked: number; due: number; state: 'wait' | 'done' | 'cancel'; done: number }
/** 화면 오류 한 묶음: 같은 서명(sig)의 오류를 모아 센다 */
export interface ClientErrorRow {
  sig: string;
  /** error(처리되지 않은 오류), rejection(처리되지 않은 Promise 거절), webgl(그리기 장치 잃음), report(게임이 알린 것) */
  kind: string;
  msg: string; stack: string;
  /** 페이지(주소의 경로만), 빌드(진입 스크립트의 파일 이름), 브라우저(이름과 큰 버전, 기기 종류) */
  where: string; build: string; ua: string;
  n: number; first: number; last: number;
}
/**
 * 웹 출시의 바탕이 쓰는 저장 (틀의 저장소 둘이 갖는다). 이것이 없는 저장소면 동의는 기록되지 않고(화면은 그래도 동의를 받는다), 삭제와 오류 수집은 꺼진다
 */
export interface WebStore {
  /** 그 저장 키가 동의한 약관 버전 (없으면 null) */
  consent(key: string): { v: string; at: number } | null;
  setConsent(key: string, v: string, at: number): void;
  /** 캐릭터 저장 한 줄을 지운다 (사회와 안전의 줄도: 차단한 것·당한 것, 친구, 대화 설정) */
  deletePlayer(key: string): void;
  /** 신고 기록에서 그 저장 키의 이름과 키를 지운다 (신고한 사람이든 당한 사람이든). 줄(대화)은 제재 근거로 남는다 */
  anonymizeReports(key: string): number;
  /** 그 저장 키가 한 신고와 당한 신고 (내보내기: 남의 대화 줄은 빼고) */
  reportsOf(key: string): ReportSave[];
  /** 삭제 요청: 그 키의 마지막 요청, 기다리는 요청 모두, 한 줄 적기(같은 키는 덮어쓴다), 기록(최근부터) */
  eraseOf(key: string): EraseRow | null;
  erasePending(): EraseRow[];
  putErase(r: EraseRow): void;
  eraseLog(limit: number): EraseRow[];
  /** 화면 오류: 같은 서명이면 수와 마지막 시각을 올리고 아니면 새 줄. 줄이 max를 넘으면 마지막 시각이 가장 오래된 것부터 지운다 */
  addClientError(r: ClientErrorRow, max: number): void;
  clientErrors(limit: number): ClientErrorRow[];
  /** 그 서명(앞부분이어도 된다)의 묶음을 지운다. 'all'이면 모두. 지운 수 */
  clearClientErrors(sig: string): number;
}
/** 그 저장소가 웹 출시의 바탕의 저장도 갖는가 */
export const hasWeb = (s: Store): s is Store & WebStore => typeof (s as Partial<WebStore>).setConsent === 'function';

// ---------- 사회와 안전: 차단, 친구, 대화 설정과 연령 (engine/server/net/social.ts) ----------
/**
 * 차단 한 건: 누가(owner: 사람의 열쇠 — 지금은 저장 키, 계정이 생기면 계정 id) 어느 캐릭터를(char: 캐릭터의 저장 키), 그때의 이름, 시각.
 * 주인과 대상을 나눠 두어, 계정이 생기면 주인 칸만 계정으로 옮기면 계정의 모든 캐릭터에 걸린다
 */
export interface BlockRow { owner: string; char: string; name: string; at: number }
/** 친구 한 건: 캐릭터 a(저장 키)가 캐릭터 b에게 요청했다(ask) 또는 친구다(ok). 한 쌍에 한 줄. 친구는 캐릭터 사이의 관계다 */
export interface FriendRow { a: string; b: string; state: 'ask' | 'ok'; at: number }
/**
 * 사회와 안전의 저장 (틀의 저장소 둘이 갖는다). 이것이 없는 저장소면 차단·친구·대화 설정은 서버가 켜져 있는 동안만 남는다.
 * 캐릭터를 지우면(WebStore.deletePlayer) 그 저장 키의 줄도 모두 지운다 (차단한 것과 당한 것, 친구, 설정)
 */
export interface SocialStore {
  /** 그 주인(owner)의 차단 목록 */
  blocksOf(owner: string): BlockRow[];
  putBlock(r: BlockRow): void;
  delBlock(owner: string, char: string): void;
  /** 그 저장 키가 낀 친구 줄 모두 (요청한 것, 받은 것, 친구) */
  friendsOf(key: string): FriendRow[];
  /** 한 쌍의 줄을 적는다 (같은 쌍은 방향과 상관없이 하나: 반대 방향의 줄은 지운다) */
  putFriend(r: FriendRow): void;
  /** 한 쌍의 줄을 지운다 (방향과 상관없이) */
  delFriend(a: string, b: string): void;
  /** 사람(owner)의 대화 설정과 연령 (JSON). 없으면 null */
  socialPrefs(owner: string): Record<string, unknown> | null;
  setSocialPrefs(owner: string, data: Record<string, unknown>, at: number): void;
}
/** 그 저장소가 사회와 안전의 저장도 갖는가 */
export const hasSocial = (s: Store): s is Store & SocialStore => typeof (s as Partial<SocialStore>).putBlock === 'function';

// ---------- 확률과 재화의 투명성: 확률표의 버전·이력·사전 공지, 추첨 기록 (engine/server/game/systems/odds.ts) ----------
/** 표 하나의 지금 버전: 표 id, 버전, 내용의 서명, 그 내용, 그 버전이 된 때 */
export interface OddsVersionRow { table: string; ver: number; sig: string; data: OddsTableDef; at: number }
/** 추첨 기록을 고르는 조건: 사람(owner), 표, 그 시각 이후, 최근부터 limit줄 */
export interface DrawQuery { owner?: string; table?: string; since?: number; limit: number }
/**
 * 확률 공개의 저장 (틀의 저장소 둘이 갖는다). 이것이 없는 저장소면 버전·이력·추첨 기록은 서버가 켜져 있는 동안만 남는다.
 * 추첨 기록은 '사업자가 과실 없음을 입증'할 자료다 (docs/genre-features.md 7절 5번): 보관 기간(ODDS.keepDays)이 지난 줄만 지운다
 */
export interface OddsStore {
  oddsVersions(): OddsVersionRow[];
  /** 표의 새 버전과 이력 한 줄을 한 묶음으로 적는다 (row가 null이면 표가 없어졌다: 지운다) */
  putOddsVersion(table: string, row: OddsVersionRow | null, h: OddsHistoryRow): void;
  /** 변경 이력: 최근부터 limit줄 (표를 주면 그 표의 것만) */
  oddsHistory(table: string | null, limit: number): OddsHistoryRow[];
  oddsPlans(): OddsPlanRow[];
  /** 사전 공지를 적는다 (n이 있으면 그 줄을 고친다). 그 줄의 번호 */
  putOddsPlan(r: OddsPlanRow): number;
  addDraw(r: DrawRow): void;
  draws(q: DrawQuery): DrawRow[];
  /** 그 시각보다 오래된 추첨 기록을 지운다. 지운 수 */
  pruneDraws(before: number): number;
  /** 그 사람의 추첨 기록에서 사람을 지운다 (줄은 남는다: 내 데이터 삭제). 고친 수 */
  forgetDraws(owner: string): number;
}
/** 그 저장소가 확률 공개의 저장도 갖는가 */
export const hasOdds = (s: Store): s is Store & OddsStore => typeof (s as Partial<OddsStore>).addDraw === 'function';
// ---------- 운영 도구와 고객지원: 분석 사건, 문의, 롤백 보관 (docs/genre-features.md 5.5) ----------
/**
 * 분석 사건 한 줄 (engine/server/game/systems/analytics.ts의 g.track이 쌓고 통신 계층이 저장 주기에 얹는다).
 * key: 저장 키(손님·서버의 사건이면 빈 글), sess: 접속 한 번의 표(무작위, 저장 키를 가리키지 않는다), at: UTC ms, name: 사건 이름, props: 속성(짧은 값만: 자유 문장은 받지 않는다)
 */
export interface EventRow { at: number; key: string; sess: string; name: string; props: Record<string, string | number | boolean> }
/** 문의 한 건 (선택 모듈 support: engine/server/net/support.ts). kind: ask 질문, bug 오류, appeal 제재 이의. state: open 열림, answered 답변함, closed 닫힘 */
export interface TicketRow {
  id: number; key: string; name: string; kind: 'ask' | 'bug' | 'appeal'; state: 'open' | 'answered' | 'closed';
  /** 보낸 글(금칙어를 가린 뒤), 관리자의 답(없으면 빈 글), 답한 사람 */
  text: string; answer: string; by: string;
  /** 접수 시각, 마지막으로 바뀐 시각 */
  at: number; upd: number;
  /** 이의라면 그때의 제재 (ban 차단 | mute 말 막기, 끝 시각(0 영구), 사유) */
  sanction?: { kind: 'ban' | 'mute'; until: number; why: string };
}
/** 롤백 전에 따로 둔 캐릭터 저장 (engine/server/net/rollback.ts): 되돌리기를 되돌릴 수 있게 */
export interface StashRow { id: number; key: string; at: number; by: string; note: string; save: PlayerSave }
/**
 * 운영 도구의 저장 (틀의 저장소 둘이 갖는다). 이것이 없는 저장소면 분석 사건을 적지 않고, 문의(support)와 롤백은 꺼진다
 */
export interface OpsStore {
  /** 분석 사건을 얹는다 (한 묶음) */
  addEvents(rows: EventRow[]): void;
  /** [from, to) 시각의 사건 (시각 순). names를 주면 그 이름만 */
  events(from: number, to: number, names?: readonly string[]): EventRow[];
  /** 그 저장 키의 그 이름의 사건이 하나라도 있는가 (처음 온 사람 first_join을 한 번만 적는다) */
  hasEvent(key: string, name: string): boolean;
  /** 그 시각보다 오래된 사건을 지운다 (보관 기간). 지운 수 */
  pruneEvents(before: number): number;
  /** 문의: 새로 적고 번호를 받는다 / 한 건 / 고친다 / 목록(최근부터: state·key로 거른다) */
  addTicket(t: Omit<TicketRow, 'id'>): number;
  ticket(id: number): TicketRow | null;
  putTicket(t: TicketRow): void;
  tickets(q: { state?: TicketRow['state'] | 'live'; key?: string; limit: number }): TicketRow[];
  /** 롤백 보관: 적고 번호를 받는다 / 그 키의 것(최근부터) */
  addStash(r: Omit<StashRow, 'id'>): number;
  stashes(key: string, limit: number): StashRow[];
}
/** 그 저장소가 운영 도구의 저장도 갖는가 */
export const hasOps = (s: Store): s is Store & OpsStore => typeof (s as Partial<OpsStore>).addEvents === 'function';

// ---------- 라이브 콘텐츠: 쿠폰 (묶음 6, coupon 모듈: engine/server/game/systems/coupon.ts) ----------
/** 쿠폰 하나: 코드, 보상, 전체 쓰임 수의 한도(0이면 없음)와 지금 쓰인 수, 기간(UTC ms, 0이면 열림), 만든 때·사람, 메모 */
export interface CouponRow { code: string; r: Reward; uses: number; used: number; from: number; to: number; at: number; by: string; note: string }
export interface CouponStore {
  coupons(): CouponRow[];
  /** 쿠폰을 적는다 (row가 null이면 지운다. 쓴 기록은 남는다) */
  putCoupon(code: string, row: CouponRow | null): void;
  /** 그 사람이 그 쿠폰을 쓴 것으로 적는다. 이미 썼으면 false (코드와 사람이 짝으로 한 번) */
  useCoupon(code: string, owner: string, at: number): boolean;
  /** 그 사람이 쓴 코드들 (내 데이터) */
  couponUsesOf(owner: string): string[];
  /** 그 사람의 쓴 기록을 지운다 (내 데이터 삭제) */
  forgetCouponUses(owner: string): number;
}
export const hasCoupons = (s: Store): s is Store & CouponStore => typeof (s as Partial<CouponStore>).useCoupon === 'function';
