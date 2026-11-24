// 확장 지점 (서버): 게임이 선언 병합으로 넓히는 자리만 모아 둔다. 틀은 여기를 비워 두고, 이 파일은 아무것도 import하지 않는다.
// 틀의 타입(Game, Ent, Hooks, Rules, ModName)이 아래 인터페이스를 이어받으므로, 게임이 여기에 칸을 더하면 g.tower, p.logs, g.on('fed', …)가 그대로 타입이 잡힌다.
// 게임은 자기 플러그인 파일에서 이렇게 넓힌다 (이 게임의 것은 games/deungbul/server/deungbul.ts):
//   declare module './ext' {
//     interface GameSystems { bonfire: Bonfire }
//     interface HooksExt { fed: (p: Ent, n: number) => void }
//     interface EntExt { logs: number }
//   }
// 선언은 타입일 뿐이다: 값은 플러그인이 채운다 (g.bonfire = new Bonfire(g), g.entInit.push((e) => { e.logs = 0; })).
// 공용 쪽의 짝(안내문, 메시지, 공유 상태)은 engine/shared/ext.ts.

/** 게임의 규칙 시스템이 Game에 다는 칸 (g.tower 같은 것). 플러그인이 채운다: 틀만으로 만든 게임(plugins: [])에는 없다 */
export interface GameSystems {}

/** 게임의 엔티티 칸. 처음 값은 g.entInit에 등록한 함수가 채운다 (Game.create는 틀의 칸만 채운다) */
export interface EntExt {}

/** 게임의 사건: 이름 → 처리기의 모양. g.on과 g.fire가 그대로 받는다 */
export interface HooksExt {}

/** 게임이 g.rules에 더하는 칸. 틀이 기본값을 모르므로 선택 칸(?)으로 선언하고 게임의 시스템이 채운다 */
export interface RulesExt {}

/** 게임의 수치 보정 이름 (g.mods). 이름만 쓰이고 값의 타입은 쓰이지 않는다: { glowBonus: true } */
export interface ModsExt {}
