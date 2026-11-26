import type { Point } from '../../shared/nav';
import type { Kind } from '../../shared/protocol';
import type { EntExt } from './ext';
import type { EntParts } from './parts';

/**
 * 월드에 있는 것 하나: 플레이어('p'), 몬스터('m', 전투 모듈), 게임이 등록한 종류(g.defineKind).
 * 여기에 적은 칸이 틀의 핵심(위치·이동·길·층·방향·이름·게임의 값·사람의 표시)이고 어느 게임의 엔티티에나 있다.
 * 모듈의 칸(골드, 레벨, 체력, 장비 …)은 여기 적지 않는다: 모듈마다 ./parts.ts에 있고(EntParts), 그 모듈을 고른 게임의 엔티티에만 값이 있다 (Game.create가 고른 모듈의 PARTS만 채운다).
 * 고르지 않았을 수 있는 모듈의 칸은 g.has(모듈)로 묻고 쓰거나 g.field(e, 칸)으로 읽는다. 게임에만 있는 칸은 EntExt(./ext.ts, 처음 값은 g.entInit)에 있거나 data에 넣는다
 */
export interface Ent extends EntExt, EntParts {
  id: number; kind: Kind; type: string; name: string;
  x: number; z: number; face: number;
  tx: number; tz: number; moving: boolean; stuck: number;
  /** 마지막으로 이동 명령을 받은 시각(게임 시계) */
  lastMove: number;
  /** 마지막으로 스스로 무언가를 한 시각(게임 시계): 명령을 냈거나 몬스터를 때렸다. 서 있기만 한 사람을 게임의 규칙(등불지기의 습격)이 인원에서 빼는 데 쓴다 */
  lastAct: number;
  /** 목표로 가려고 세운 길과, 세울 때의 목표·시각 (engine/shared/nav.ts) */
  path: Point[] | null; pgx: number; pgz: number; pat: number;
  /** 월드에서 빠져 있다(쓰러졌거나 다시 나오기를 기다린다): 시야에 보내지 않고, 종류의 월드 저장에 적지 않는다. 전투 모듈이 쓰러뜨리고, 게임의 종류도 쓴다 */
  dead: boolean;
  /** 층: 들판의 채널이거나 던전 인스턴스다 (번호의 뜻은 layers.ts). 층이 다르면 서로 보이지 않고 싸우지 않는다 */
  layer: number;
  /** 다음에 무엇을 할 때까지 기다리는 시간(초): 봇(systems/bots.ts)과 몬스터의 배회가 쓴다 */
  wait: number;
  /** 게임이 마음대로 쓰는 값 (게임이 등록한 종류의 상태 같은 것). 틀은 읽지 않고 저장하지도 보내지도 않는다: 보낼 값은 종류의 sync가, 저장할 값은 save가 고른다 */
  data: Record<string, unknown>;
  /** 저장에서 읽었지만 이 게임이 고르지 않은 모듈의 칸: 다시 저장할 때 그대로 적는다 (players.ts. engine/shared/modules.ts의 MODULE_SAVES) */
  kept?: { top: Record<string, unknown>; ext: Record<string, unknown> };

  // ---- 플레이어 ----
  bot: boolean;
  /** 사람을 가리키는 변하지 않는 값(저장 키). 손님과 봇, 몬스터는 빈 문자열. 길드처럼 접속과 무관하게 사람을 기억해야 하는 곳에 쓴다 */
  pid: string;
  /** 본인에게 알릴 수치(stat)가 바뀌었다 (systems/status.ts) */
  dirty: boolean;
  /** 저장할 것이 생겼다 */
  unsaved: boolean;
  /** 본인에게 알릴 장비·우편·일일 임무(meta)가 바뀌었다 (systems/status.ts) */
  metaDirty: boolean;
  /** 이번 접속 전에 비운 시간(ms). 방치 보상과 게임의 규칙(휴식)이 쓴다 */
  offMs: number;
  /** 부품으로 된 겉모습의 글자 (engine/shared/defs/look.ts). 바꾸는 것은 g.setLook 하나다 (변신 모듈). 없으면 화면의 예전 그림 */
  look?: string;
}

/** 틀의 핵심 칸만 (Game.create가 채우는 것): 모듈의 칸과 게임의 칸을 뺀 Ent */
export type CoreEnt = Omit<Ent, keyof EntExt | keyof EntParts>;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** 저장에서 읽은 값을 정수로 다듬는다: 수가 아니면 def, 수이면 반올림해 min~max로 자른다 (깨진 값이 섞여도 서버가 죽지 않게) */
export const readInt = (v: unknown, min: number, max: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), min, max) : def);
/** a 이상 b 이하의 정수 */
export const ri = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** 그 시각의 날짜 'YYYY-MM-DD' (서버 현지 시간, 자정에 바뀐다). 하루 단위로 세는 시스템(일일 임무, 자리 비움 사냥의 하루 몫, 경제 장부)이 함께 쓴다 */
export function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
