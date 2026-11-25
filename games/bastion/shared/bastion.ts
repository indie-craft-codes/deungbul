// 이 게임(돌담 마을)이 공용 확장 지점(engine/shared/ext.ts)에 더하는 것: 물결의 안내문, 메시지, 공유 상태.
// 타입 선언만 있다. 서버 쪽의 짝은 ../server/bastion.ts.

/** 물결의 단계: 기다림, 곧 온다, 싸우는 중, 우물이 무너짐 */
export type WavePhase = 'idle' | 'soon' | 'active' | 'broken';

declare module '@engine/shared/ext' {
  interface MsgMap {
    waveSoon: [wave: number, s: number];
    waveStart: [wave: number, foes: number];
    waveWon: [wave: number, fighters: number];
    waveReward: [gold: number, exp: number];
    waveLost: [wave: number];
    gateRestored: [name: string];
    repaired: [hp: number, gold: number];
    repairFar: [];
    repairBusy: [];
    repairFull: [];
    repairPoor: [gold: number];
    gateBroken: [];
  }
  /** 화면 → 서버: 우물을 n번 고친다(한 번에 골드 WAVE.repairGold), 무너진 우물을 바로 되살린다 */
  interface ClientMsgs { repair: { n: number }; restore: Record<never, never> }
  /** 모두가 함께 보는 상태: 물결과 우물 */
  interface WorldState {
    defense: { phase: WavePhase; wave: number; left: number; foes: number; hp: number; maxHp: number };
  }
}

/** 개인 상태 (me 메시지): 칸의 이름 → 값 */
export interface MeState {
  /** 지금까지 막아 낸 물결의 수 */
  held: number;
}
