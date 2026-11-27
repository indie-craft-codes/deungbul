// 틀의 서버 입구: 게임의 규칙 플러그인·서버 진입점·시험이 읽는 것. 여기 없는 것은 틀의 내부다 (입구의 목록은 engine/shared/index.ts).
// 게임이 틀의 시스템에 붙는 접점(g.commands, g.on, g.mods, g.saves, g.wallet …)은 Game의 칸으로 닿는다.
import path from 'node:path';
import { setAdminDir } from './net/admin';
import { runServer as runWith, type RunOptions } from './run';

export { Game, Modifiers, type GameOptions, type KindDef, type ModName, type Plugin, type Saver } from './game/game';
export { clamp, dayOf, dist, readInt, type Ent } from './game/entity';
export type { AwayPart, BuildPart, ClassesPart, CombatPart, DailyPart, EconomyPart, EntParts, GearPart, GrowthPart, GuildPart, ItemsPart, MailPart } from './game/parts';
export type { MonsterAct, MonsterBehavior } from './game/systems/monsters';
export type { Teams } from './game/systems/teams';
export type { Roster } from './game/systems/roster';
export type { Gacha } from './game/systems/gacha';
export type { Squad } from './game/systems/squad';
export type { Stages } from './game/systems/stages';
export type { Room, RoomDef, RoomSeat, Rooms, Spot } from './game/systems/rooms';
export type { AllyKind } from './game/systems/combat';
export { channelOf, fieldLayer, isField, notifyLayer } from './game/layers';
export { leaderFight } from './game/systems/leader';
export { startServer, type Options, type Running } from './net/server';
export { createAdmin, parseSpan, type Admin, type AdminOptions } from './net/admin';
export type { RunOptions };
export { WHY, mailWhy, type Cur } from './game/systems/wallet';
export type { EconSnapshot } from './game/systems/ledger';
export { MemoryStore, SqliteStore, hasEcon, type EconRow, type EconStore, type PlayerSave, type Store, type WorldSave } from './store';
export type { Migration, Migrations } from './game/migrate';
export type { BackupOptions } from './store/backup';
export { log } from './log';
export { addAllowedWords, addBannedWords, addTextFilter, isClean, mask, type TextFilter, type TextWhere } from './text';

/**
 * 서버를 실행하는 흔한 절차 (./run.ts의 runServer). 관리자 통로(net/admin.ts)의 토큰 파일과 기록 파일을 저장 파일과 같은 폴더에 두도록
 * 그 폴더를 먼저 알린다: run.ts와 같은 셈(환경 변수 DB, 없으면 opts.db)이다. 저장하지 않는 서버(DB=memory)는 관리자 통로를 열지 않는다.
 * (run.ts가 startServer에 opts.admin을 직접 넘기게 되면 이 감싸기는 없앤다)
 */
export function runServer(opts: RunOptions): ReturnType<typeof runWith> {
  const db = process.env.DB ?? opts.db;
  setAdminDir(db === 'memory' ? undefined : path.dirname(path.resolve(db)));
  return runWith(opts);
}
// 확률과 재화의 투명성 (odds 모듈): 공개 페이지의 모양을 만드는 것 (게임의 시험·도구가 쓴다), 저장의 접점
export { oddsFile, oddsHtml, type OddsFile } from './net/odds';
export type { OddsSys } from './game/systems/odds';
export { hasOdds, type OddsStore } from './store';
