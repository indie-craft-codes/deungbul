// 틀의 서버 입구: 게임의 규칙 플러그인·서버 진입점·시험이 읽는 것. 여기 없는 것은 틀의 내부다 (입구의 목록은 engine/shared/index.ts).
// 게임이 틀의 시스템에 붙는 접점(g.commands, g.on, g.mods, g.saves, g.wallet …)은 Game의 칸으로 닿는다.
export { Game, Modifiers, type GameOptions, type ModName, type Plugin, type Saver } from './game/game';
export { clamp, dist, readInt, type Ent } from './game/entity';
export { channelOf, fieldLayer, isField, notifyLayer } from './game/layers';
export { startServer, type Options, type Running } from './net/server';
export { runServer, type RunOptions } from './run';
export { WHY, mailWhy, type Cur } from './game/systems/wallet';
export type { EconSnapshot } from './game/systems/ledger';
export { MemoryStore, SqliteStore, type EconRow, type PlayerSave, type Store, type WorldSave } from './store';
export { addBannedWords, isClean, mask } from './text';
