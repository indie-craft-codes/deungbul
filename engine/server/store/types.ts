// 저장 계층의 약속. 게임 규칙은 이 인터페이스만 알고, 실제 저장소는 갈아 끼운다.
// 실시간 상태(체력, 몬스터)는 저장하지 않는다. 재시작을 넘어 남아야 하는 것만 적는다.

export interface PlayerSave {
  name: string; lv: number; exp: number; need: number; maxHp: number; sparks: number; /** 옛 칸 (읽기 전용 호환): 지금은 ext.tower.contrib. 옛 저장을 읽는 길(Saver.legacy)이 본다 */ contrib?: number;
  /** 마지막으로 저장된 시각(ms). 접속하지 않은 시간을 계산할 때 쓴다 */
  seen?: number;
  /** 옛 칸 (읽기 전용 호환): 지금은 ext.quest. 메인 퀘스트 진행: [장, 단계, 진행 수치] */
  quest?: [number, number, number];
  /** 직업. 아직 고르지 않았으면 빈 문자열 */
  cls?: string;
  gold?: number;
  weapon?: string;
  armor?: string;
  items?: Record<string, number>;
  /** 옛 칸 (읽기 전용 호환): 지금은 ext.rest.left. 남은 휴식 보너스 */
  rested?: number;
  /** 옛 칸 (읽기 전용 호환): 지금은 ext.keepers.tier. 받은 기여 단계 보상의 수 */
  tier?: number;
  /** 시스템마다 자기 이름의 칸에 저장하는 것 (장비, 우편, 일일 임무). server/game/game.ts의 Saver */
  ext?: Record<string, unknown>;
  /** 마지막으로 있던 자리 [x, z]. 다시 접속하면 여기서 시작한다 */
  at?: [number, number];
  /** 자동 사냥을 켠 채로 나갔다. 다시 접속하면 켜진 채로 시작한다 */
  auto?: boolean;
}

/** 신고 한 건 (server/net/moderation.ts의 Report와 같은 모양) */
export interface ReportSave { at: number; by: string; byKey: string | null; target: string; targetKey: string | null; lines: string[] }

/**
 * 재화 흐름 지표의 한 줄 (server/game/systems/ledger.ts): 그날, 그 재화가, 그 원인으로, 생겼거나(+) 사라진(-) 양과 건수.
 * 재화는 gold, sparks, exp, gear:등급, item:아이템 id. 같은 (day, cur, why, dir)은 한 줄로 합쳐진다
 */
export interface EconRow { day: string; cur: string; why: string; dir: '+' | '-'; amount: number; n: number }

/** 시스템마다 자기 이름의 칸에 저장할 것을 넣는다 (예: { tower: {...} }) */
export type WorldSave = Record<string, unknown>;

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
  /** 재화 흐름 지표의 줄을 얹는다: 같은 (day, cur, why, dir)이 이미 있으면 양과 건수를 더한다 */
  addEcon(rows: EconRow[]): void;
  /** 그 날짜(YYYY-MM-DD)부터의 지표 줄 */
  econ(fromDay: string): EconRow[];
  /** 그날의 분포 스냅샷을 적는다 (하루에 하나. 다시 적으면 덮어쓴다) */
  saveEconSnapshot(day: string, data: unknown): void;
  /** 그날의 분포 스냅샷. 날짜를 주지 않으면 가장 최근 것. 없으면 null */
  econSnapshot(day?: string): { day: string; data: unknown } | null;
  close(): void;
}
