// 이 게임이 고른 모듈 (내용의 MODULES: ./modules.ts). 화면과 언어 파일이 읽는다 (서버는 Game.modules: 시험이 GameOptions.modules로 바꿀 수 있다).
// 공용 코드만 읽는다 (화면 요소도 three.js도 읽지 않는다): 뼈대를 붙이는 hud/shell.ts, 언어 파일, 도감이 읽는 때에 쓴다.
import { MODULES } from './defs';
import { checkModules, type ModuleId } from './modules';

/** 이 게임이 고른 모듈. 모르는 이름이나 빠진 의존이 있으면 읽는 때에 오류를 던진다 (서버와 같은 검사) */
export const MODS: ReadonlySet<ModuleId> = checkModules(MODULES, '내용의 MODULES');
/** 그 모듈을 골랐는가 */
export const hasModule = (m: ModuleId): boolean => MODS.has(m);
/** 그 가운데 하나라도 골랐는가 ('combat economy'처럼 빈칸으로 나눈 글도 받는다: 뼈대의 data-mod) */
export const anyModule = (list: readonly string[] | string): boolean => (typeof list === 'string' ? list.split(/\s+/).filter(Boolean) : list).some((m) => MODS.has(m as ModuleId));
