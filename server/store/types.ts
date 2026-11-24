// 저장 계층의 약속. 게임 규칙은 이 인터페이스만 알고, 실제 저장소는 갈아 끼운다.
// 실시간 상태(체력, 몬스터)는 저장하지 않는다. 재시작을 넘어 남아야 하는 것만 적는다.

export interface PlayerSave {
  name: string; lv: number; exp: number; need: number; maxHp: number; sparks: number; contrib: number;
  /** 마지막으로 저장된 시각(ms). 접속하지 않은 시간을 계산할 때 쓴다 */
  seen?: number;
  /** 메인 퀘스트 진행: [장, 단계, 진행 수치] */
  quest?: [number, number, number];
  /** 직업. 아직 고르지 않았으면 빈 문자열 */
  cls?: string;
  gold?: number;
  weapon?: string;
  armor?: string;
  items?: Record<string, number>;
  /** 남은 휴식 보너스 */
  rested?: number;
  /** 받은 기여 단계 보상의 수 */
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
  close(): void;
}
