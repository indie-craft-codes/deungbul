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
