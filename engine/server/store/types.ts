// 저장 계층의 약속. 게임 규칙은 이 인터페이스만 알고, 실제 저장소는 갈아 끼운다.
// 실시간 상태(체력, 몬스터)는 저장하지 않는다. 재시작을 넘어 남아야 하는 것만 적는다.

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

/** 신고 한 건 (engine/server/net/moderation.ts의 Report와 같은 모양) */
export interface ReportSave { at: number; by: string; byKey: string | null; target: string; targetKey: string | null; lines: string[] }

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
  /** 캐릭터 저장 한 줄을 지운다 */
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
