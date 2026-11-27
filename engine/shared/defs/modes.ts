// 게임 안의 모드 (선택 모듈 modes): 한 서버·한 캐릭터 안에 '두 게임'을 두고 화면의 단추로 오간다.
// 모드마다 자리의 종류(kind)가 있다: 'field' 들판(모두가 오가는 월드: MMORPG), 'stage' 단계(그 사람만의 층의 대기실과 회차: 수집형).
// 소유(영웅·재화·장비·변신)는 한 캐릭터의 것이라 저절로 하나다. 모드마다 다른 것은 서 있는 곳과 화면(메뉴의 탭, 감출 틀 요소, 게임의 장면·창)이다.
// 서버는 engine/server/game/systems/modes.ts, 화면은 engine/client/hud/modes.ts. 규칙은 게임의 내용 MODE_RULES (적지 않으면 모드가 없다).
import { MODE_RULES } from '../content';
import type { HudPart } from './hud';

/** 모드의 자리: 들판 또는 단계 (단계 모듈의 대기실과 회차) */
export type ModeKind = 'field' | 'stage';
/** 모드 하나 */
export interface ModeDef {
  /** 영문 소문자 id (저장과 줄 위, 화면의 body[data-mode]) */
  id: string;
  /** 이름의 문장 키 (게임의 언어 파일 ui에). '게임 바꾸기' 단추가 건너갈 모드의 이름을 보인다 */
  name: string;
  kind: ModeKind;
  /** 이 모드에서 보일 메뉴의 탭과 차례 (setMenuTabs와 같은 id). 없으면 게임이 setMenuTabs로 고른 것 그대로 */
  tabs?: readonly string[];
  /** 이 모드에서 감출 틀의 요소 (engine/shared/defs/hud.ts의 HUD_PARTS: 내용의 HUD.hide와 같은 이름). 기능과 단축키는 그대로다 */
  hide?: readonly HudPart[];
}
/** 모드의 규칙 (내용의 MODE_RULES) */
export interface ModeRules {
  /** 모드들 (차례가 화면의 차례). 비어 있으면 모드가 없다 */
  list: readonly ModeDef[];
  /** 처음 온 사람의 모드 (없으면 list의 첫째) */
  start?: string;
  /** 모드를 바꾼 뒤 다시 바꿀 수 있을 때까지(초). 기본 1 */
  switchCdS?: number;
  /**
   * 들판을 떠날 때 자동 사냥(R)이 켜져 있으면 그 자리에 '대역'(엔티티 종류 stand: 같은 이름·직업·겉모습)이 남아 자동 사냥을 이어 간다.
   * 남에게도 사냥하는 모습이 보이고, 처치 보상·일일 임무는 그 사람의 것이다. 자리 비움 사냥과 같은 하루 한도(AWAY.maxS)와 안전장치(g.away.safety)를 쓴다.
   * 돌아오면 그 사람이 대역의 자리·체력으로 이어받는다. 기본 false (떠나면 들판에서 사라진다)
   */
  fieldStay?: boolean;
  /**
   * 단계를 떠날 때 싸우는 중이면 회차가 뒤에서 이어 간다 (g.stages.detach: 편성의 영웅만으로 지금 싸움을 끝까지, 자동 진행이 켜져 있으면 다음 단계로).
   * 기본 false (떠나면 회차를 닫는다)
   */
  stageStay?: boolean;
}
export const MODE_RULE_VIEW: ModeRules = MODE_RULES;
export const modeList = (): readonly ModeDef[] => MODE_RULE_VIEW.list;
export const modeDef = (id: string): ModeDef | undefined => MODE_RULE_VIEW.list.find((m) => m.id === id);
/** 처음 모드의 id (모드가 없으면 '') */
export const startMode = (): string => (MODE_RULE_VIEW.start && modeDef(MODE_RULE_VIEW.start) ? MODE_RULE_VIEW.start : MODE_RULE_VIEW.list[0]?.id ?? '');
/** 둘인 게임의 '다른 모드' (셋 이상이면 차례로 다음) */
export function otherMode(id: string): ModeDef | undefined {
  const list = MODE_RULE_VIEW.list, i = list.findIndex((m) => m.id === id);
  return list.length < 2 ? undefined : list[(i + 1) % list.length];
}

/** 개인 상태 'mode': 지금 모드, 다시 바꿀 수 있을 때까지(초), 서버가 아는 자동 사냥의 켜짐(away 모듈: 안전장치 등으로 서버가 끄면 화면도 끈다) */
export interface ModeMe { id: string; cd: number; auto?: boolean }

/** 다른 쪽에서 얻은 것의 합 (그쪽으로 떠난 뒤로) */
export interface SideGot { gold: number; sparks: number; exp: number }
/**
 * 보고 있지 않은 들판의 상황 (단계 모드에 있는 동안 들판의 대역이 사냥할 때): 사냥 중인가, 체력, 상태, 얻은 것, 잡은 수.
 * state: hunt 사냥 중, resting 쉬는 중, retreat 물러남(안전장치), stop 멈춤(물약 없음·시간 다 씀·자동 사냥 끔), down 쓰러짐
 */
export interface FieldSide { hp: number; max: number; state: 'hunt' | 'resting' | 'retreat' | 'stop' | 'down'; got: SideGot; kills: number }
/** 보고 있지 않은 단계의 상황 (들판 모드에 있는 동안 단계가 뒤에서 이어 갈 때): 지금 단계, 회차의 상태, 그동안 깬 수, 얻은 것, 자동 진행 */
export interface StageSide { id: string; state: 'fight' | 'gap' | 'clear' | 'fail' | 'lobby'; cleared: number; got: SideGot; auto: boolean }
/** 개인 상태 'modeSide': 다른 쪽의 상황 (그쪽이 돌고 있지 않으면 null) */
export interface ModeSideMe { field: FieldSide | null; stage: StageSide | null }
