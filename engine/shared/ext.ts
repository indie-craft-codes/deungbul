// 확장 지점 (공용): 게임이 선언 병합으로 넓히는 자리만 모아 둔다. 틀은 여기를 비워 두고, 이 파일은 아무것도 import하지 않는다.
// 병합은 인터페이스가 선언된 바로 그 파일을 가리켜야 하므로(다시 내보낸 곳을 가리키면 안 된다) 넓힐 것을 한 파일에 모았다.
// 게임은 자기 선언 파일에서 이렇게 넓힌다 (이 게임의 것은 games/deungbul/shared/deungbul.ts):
//   declare module './ext' {
//     interface MsgMap { bonfireLit: [name: string] }
//     interface ClientMsgs { feed: { n: number } }
//     interface WorldState { bonfire: { heat: number } }
//   }
// 그 선언 파일이 컴파일 대상(tsconfig의 include)에 들어 있어야 효력이 있다. 서버 쪽의 짝은 engine/server/game/ext.ts.

/** 게임의 안내문: 종류 → a에 들어가는 값. MsgKey(engine/shared/messages.ts)에 더해지고, 언어 파일이 그 문장을 갖춰야 컴파일된다 */
export interface MsgMap {}

/** 게임이 더하는 서버 → 클라이언트 메시지: 종류(t) → 나머지 칸. ServerMsg(engine/shared/protocol.ts)에 { t: 종류 } & 칸 으로 더해진다 */
export interface ServerMsgs {}

/** 게임이 더하는 클라이언트 → 서버 메시지: 종류(t) → 나머지 칸. 서버에서는 g.commands에 같은 이름으로 처리기를 건다 */
export interface ClientMsgs {}

/** 서버 전체가 공유하는 상태. 시스템마다 한 칸씩 갖는다 (g.shared에 같은 이름으로 등록한다). 틀의 시스템은 칸을 갖지 않는다 */
export interface WorldState {}
