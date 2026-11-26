// 메뉴 탭의 목록을 정하는 셈 (화면 요소를 읽지 않는다: 시험이 node에서 부른다. engine/test/fx/client.test.ts).
// 틀의 탭은 저마다 선택 모듈에 속하고(그 모듈을 고른 게임에만 있다), 게임은 보일 탭과 차례를 고르고(setMenuTabs) 자기 탭을 더한다(addMenuTab).
import type { ModuleId } from '../../../shared/modules';

/** 메뉴의 탭 하나: 틀의 탭 일곱과 게임이 더한 탭(addMenuTab) */
export interface MenuTab {
  /** 탭의 이름표. 틀의 탭은 MENU_TABS의 id다 */
  id: string;
  /** 탭 단추에 적는 글 (언어가 바뀌면 다시 읽는다) */
  label: () => string;
  /** 탭의 내용을 list에 붙인다. 창이 열려 있는 동안 상태가 바뀔 때마다 비운 뒤 다시 불린다 */
  draw: (list: HTMLElement) => void;
  /** 탭 이름에 점(•)을 찍는가: 볼 것이 있다 (받을 우편, 찍을 점수 …) */
  dot?: () => boolean;
  /** 탭을 열 때 한 번 (서버에 목록을 달라고 하는 따위) */
  open?: () => void;
  /** 다시 그릴지 가르는 값: 이 값이 바뀌면 다시 그린다 (게임 탭이 보여 주는 상태) */
  sig?: () => unknown;
  /** 게임이 고른 탭 목록(setMenuTabs)에 없어도 늘 맨 뒤에 보인다: 어느 게임에나 있어야 하는 틀의 탭 (기기 옮기기: hud/device.ts) */
  always?: boolean;
  /** 이 탭이 속한 선택 모듈 (틀의 탭). 그 모듈을 고르지 않은 게임에서는 탭이 없다 */
  mod?: ModuleId;
}
/** 틀의 탭의 id */
export const MENU_TABS = ['gear', 'build', 'mail', 'daily', 'market', 'guild', 'rank'] as const;
export type EngineMenuTab = (typeof MENU_TABS)[number];
/** 틀의 탭이 속한 선택 모듈 (engine/shared/modules.ts) */
export const ENGINE_TAB_MODS: Readonly<Record<EngineMenuTab, ModuleId>> = { gear: 'gear', build: 'build', mail: 'mail', daily: 'daily', market: 'market', guild: 'guild', rank: 'rank' };

/** 고른 모듈의 탭만 남긴다 (mod가 없는 탭은 늘 남는다) */
export const tabsForModules = <T extends Pick<MenuTab, 'mod'>>(list: readonly T[], has: (m: ModuleId) => boolean): T[] => list.filter((x) => !x.mod || has(x.mod));

/**
 * 지금 보이는 탭들: 게임이 고른 차례(order. null이면 모두, 더한 차례대로)에서 hideDaily면 일일 탭을 빼고, 늘 보이는 탭(always)은 고른 목록에 없어도 맨 뒤에 둔다.
 * 고른 목록의 id 가운데 all에 없는 것(그 모듈을 고르지 않았거나 더하지 않은 탭)은 건너뛴다
 */
export function visibleTabs<T extends Pick<MenuTab, 'id' | 'always'>>(all: readonly T[], order: readonly string[] | null, hideDaily: boolean): T[] {
  const picked = (order ? order.map((id) => all.find((x) => x.id === id)).filter((x): x is T => !!x) : [...all]).filter((x) => !(x.id === 'daily' && hideDaily));
  return [...picked, ...all.filter((x) => x.always && !picked.includes(x))];
}
