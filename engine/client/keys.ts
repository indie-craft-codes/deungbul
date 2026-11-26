// 틀의 화면 모듈이 다는 단축키(bus.bindKey)와 그 키를 다는 선택 모듈의 표. 화면 요소를 읽지 않는다 (시험: engine/test/fx/client.test.ts).
// 키를 다는 곳: 핵심은 M(hud/menu.ts), N(hud/worldmap.ts), H(input.ts: 내용의 HOME_KEY가 false면 달지 않는다). combat은 숫자 1~9(기술 칸 수만큼)와 Tab(hud/me.ts),
// items는 Q(hud/shop.ts)와 B(hud/bag.ts), away는 R(auto.ts). 고르지 않은 모듈의 키는 비어 있어 게임이 onKey로 쓸 수 있다.
// startClient(main.ts)가 init을 마친 뒤 실제로 달린 키(bus.boundKeys)와 이 표를 견주어 다르면 콘솔에 경고한다: 틀에 키를 더하거나 옮기면 이 표도 고친다.
import type { ModuleId } from '../shared/modules';

export interface EngineKey {
  /** bindKey에 주는 키 (소문자) */
  key: string;
  /** 그 키를 다는 선택 모듈. null이면 핵심 (어느 게임에나) */
  mod: ModuleId | null;
  /** 키를 다는 파일 (engine/client/ 아래) */
  where: string;
}

/** 틀의 단축키 모두. 숫자 키는 기술 칸 수(SKILL_SLOTS)만큼, 9개까지. home: 내용의 HOME_KEY(false면 H를 달지 않는다) */
export function engineKeys(skillSlots: number, home = true): EngineKey[] {
  return [
    { key: 'm', mod: null, where: 'hud/menu.ts' },
    { key: 'n', mod: null, where: 'hud/worldmap.ts' },
    ...(home ? [{ key: 'h', mod: null, where: 'input.ts' }] : []),
    ...Array.from({ length: Math.max(0, Math.min(skillSlots, 9)) }, (_, i): EngineKey => ({ key: String(i + 1), mod: 'combat', where: 'hud/me.ts' })),
    { key: 'tab', mod: 'combat', where: 'hud/me.ts' },
    { key: 'q', mod: 'items', where: 'hud/shop.ts' },
    { key: 'b', mod: 'items', where: 'hud/bag.ts' },
    { key: 'r', mod: 'away', where: 'auto.ts' },
  ];
}

/** 그 모듈들을 고른 게임에서 틀이 다는 키 (차례는 표의 차례) */
export const keysFor = (has: (m: ModuleId) => boolean, skillSlots: number, home = true): string[] => engineKeys(skillSlots, home).filter((k) => !k.mod || has(k.mod)).map((k) => k.key);

/** 실제로 달린 키와 표가 다른 곳: 표에만 있는 것(missing), 달렸는데 표에 없는 것(extra) */
export function keyDiff(bound: readonly string[], want: readonly string[]): { missing: string[]; extra: string[] } {
  return { missing: want.filter((k) => !bound.includes(k)), extra: bound.filter((k) => !want.includes(k)) };
}
