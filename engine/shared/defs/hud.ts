// 화면의 틀 요소 끄기 (내용의 HUD): 모듈의 의존 때문에 딸려 오는 단추(던전 → 장비 → 아이템의 가방 단추, 전투의 '가까운 대상 공격')처럼
// 게임이 쓰지 않는 틀의 요소를 감춘다. 감출 뿐이라 그 모듈의 기능과 단축키(B, Tab …)는 그대로 돈다: 기능까지 빼려면 MODULES에서 그 모듈을 뺀다.
// 화면(engine/client/hud/shell.ts의 mountShell)만 읽는다. 적지 않으면 아무것도 감추지 않는다 (예전과 같다).
import { HUD } from '../content';

/** 감출 수 있는 틀의 요소: 이름 → 뼈대(engine/client/hud/skeleton.ts)의 요소 id들 */
export const HUD_PARTS = {
  /** 내 정보 창의 가방 단추 (items) */
  bag: ['bagBtn'],
  /** 기술 위의 '가까운 대상 공격' 단추 (combat) */
  attackNearest: ['tabBtn'],
  /** 자동 사냥 단추 (away) */
  auto: ['autoBtn'],
  /** 전체 지도 단추 (지도는 N 키와 미니맵으로 그대로 열린다) */
  worldMap: ['mapBtn'],
  /** 미니맵과 그 아래의 표식 설명 */
  minimap: ['mapBox'],
  /** 조작 안내 한 줄 */
  hint: ['hint'],
  /** 기술·물약 단추 줄 (combat, items) */
  skills: ['skills'],
  /** 채널 고르기 */
  channel: ['channel'],
} as const satisfies Record<string, readonly string[]>;
export type HudPart = keyof typeof HUD_PARTS;

/** 화면의 틀 요소 설정: hide는 감출 요소들 */
export interface HudRules { hide?: readonly HudPart[] }

/** 내용의 HUD를 넓은 타입으로 본 것 (게임이 hide를 적지 않아도 읽힌다) */
export const HUD_VIEW: HudRules = HUD;
/** 감출 요소의 id들 (모르는 이름은 건너뛴다) */
export const hiddenHudIds = (rules: HudRules = HUD_VIEW): string[] => (rules.hide ?? []).flatMap((k) => (Object.hasOwn(HUD_PARTS, k) ? [...HUD_PARTS[k]] : []));
