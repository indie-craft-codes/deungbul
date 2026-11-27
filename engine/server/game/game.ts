// 게임의 중심. 상태(엔티티, 시계)와 시스템들을 묶고, 시스템끼리 쓰는 공용 통로를 제공한다.
// 통신은 모른다: 밖으로 나갈 것은 outbox에 쌓아 두고 net 계층이 가져간다.
//
// 틀의 핵심(이동, 플레이어, 채널, 제재, 봇)은 늘 만들어진다. 장르에 매인 시스템(전투, 직업, 아이템, 장비, 재화 …)은 선택 모듈이다
// (engine/shared/modules.ts): 게임이 내용의 MODULES에 적은 모듈의 시스템만 만들고, 적지 않은 모듈의 칸(g.wallet 같은 것)은
// 건드리면 '그 모듈을 고르지 않았다'는 오류를 던지는 자리표다. 그 모듈의 명령·틱·저장 칸·개인 상태도 등록되지 않는다.
// 핵심의 코드와 다른 모듈은 고르지 않았을 수 있는 모듈을 g.has('이름')으로 물은 뒤에 쓴다.
// 엔티티도 같다: 핵심의 칸(./entity.ts)은 늘 있고, 모듈의 칸(./parts.ts)은 고른 모듈의 것만 만든다. 고르지 않았을 수 있는 모듈의 칸은 g.has로 묻고 쓰거나 g.field로 읽는다.
//
// 게임의 규칙은 틀을 고치지 않고 규칙 플러그인(GameOptions.plugins)으로 깐다: 게임의 서버 폴더에 시스템을 만들고 플러그인에서 g.이름 = new 시스템(g)으로 단다
// (등불지기는 games/deungbul/server/deungbul.ts, 예제는 games/sample/server/sample.ts). 시스템은 생성자에서 필요한 것을 등록한다:
//   commands(플레이어 명령), on(사건 구독), mods(수치 보정), ticks(주기 처리), saves(캐릭터 저장), worldSaves(월드 저장),
//   shared(모두에게 보내는 공유 상태), personal(본인에게만 보내는 상태), defineKind(게임의 엔티티 종류).
// 틀 자체에 어느 게임에나 쓸 새 모듈을 더할 때만 engine/server/game/systems/에 파일을 만들고 engine/shared/modules.ts의 표와 아래 생성자에 한 줄씩 더한다.
import { MONSTERS, SPAWN, type CharDef, type MonsterDef } from '../../shared/defs';
import type { MsgArg, MsgKey } from '../../shared/messages';
import { NavGrid } from '../../shared/nav';
import type { Ev, Kind, WorldState, ServerMsg } from '../../shared/protocol';
import { resolve } from '../../shared/sim';
import { MODULES } from '../../shared/defs';
import { ALL_MODULES, MODULE_SAVES, checkModules, type ModuleId } from '../../shared/modules';
import { PLAYER_SPEED, buildWorld } from '../../shared/world';
import type { PlayerSave, WorldSave } from '../store';
import type { CoreEnt, Ent } from './entity';
import type { GameSystems, HooksExt, ModsExt, RulesExt } from './ext';
import { fieldLayer } from './layers';
import { checkList, latest, PLAYER_UP, upgrade, WORLD_UP, type Migrations } from './migrate';
import { blankOf, PARTS, partOwner, type Part, type PartKey } from './parts';
import { Boss } from './systems/boss';
import { Away } from './systems/away';
import { Bag } from './systems/bag';
import { Bots } from './systems/bots';
import { Build } from './systems/build';
import { Channels } from './systems/channels';
import { Classes } from './systems/classes';
import { Combat } from './systems/combat';
import { Craft } from './systems/craft';
import { Daily } from './systems/daily';
import { Dungeon } from './systems/dungeon';
import { GearSys } from './systems/gear';
import { Guild } from './systems/guild';
import { Idle } from './systems/idle';
import { Ledger } from './systems/ledger';
import { MailSys } from './systems/mail';
import { Market } from './systems/market';
import { Rank } from './systems/rank';
import { Salvage } from './systems/salvage';
import { Sanctions } from './systems/sanctions';
import { Monsters } from './systems/monsters';
import { Party } from './systems/party';
import { Movement } from './systems/movement';
import { Players } from './systems/players';
import { Shop } from './systems/shop';
import { Status } from './systems/status';
import { Teams } from './systems/teams';
import { Roster } from './systems/roster';
import { Rooms } from './systems/rooms';
import { Gacha } from './systems/gacha';
import { Squad } from './systems/squad';
import { Stages } from './systems/stages';
import { HeroGear } from './systems/herogear';
import { Wallet } from './systems/wallet';
import { Chars } from './systems/chars';
import { Morph } from './systems/morph';
import { Clock } from './systems/clock';
import { Live } from './systems/live';

/** 한 틱에 길찾기가 살펴볼 수 있는 칸의 수. 넘으면 그 틱의 나머지 길찾기는 곧장 가는 길로 대신한다 (길 없는 곳을 찍어 서버를 멈추지 못하게) */
const NAV_VISITS_PER_TICK = 12000;

/** 플레이어 명령 처리기. msg는 검증되지 않은 입력이므로 처리기가 직접 확인한다. */
export type Command = (p: Ent, msg: Record<string, unknown>) => void;

/** 시스템끼리 주고받는 사건. 게임에만 있는 사건은 HooksExt(./ext.ts)에 게임이 더한다 */
export interface Hooks extends HooksExt {
  monsterKilled: (m: Ent, hitters: Ent[]) => void;
  playerDied: (p: Ent) => void;
  playerLeft: (id: number) => void;
  /** 상점에서 물건을 샀다 */
  bought: (p: Ent, item: string) => void;
  /** 사람이 접속했다 (봇은 제외) */
  playerJoined: (p: Ent) => void;
  /** 이름을 바꿨다: 이름을 적어 둔 곳(명단 같은 것)이 따라 고친다 */
  playerRenamed: (p: Ent) => void;
  /** 접속이 끊겼다: 저장하기 전에 불린다 (인스턴스에서 내보내는 데 쓴다) */
  playerDropped: (p: Ent) => void;
  /** 던전을 끝냈다: 던전 id와 안에 있던 사람들 */
  dungeonCleared: (id: string, players: Ent[]) => void;
  /** 던전에서 나왔다: 던전 id와 까닭 (self 스스로 나옴, end 끝냈거나 시간이 다 되어 회차가 닫힘, drop 접속이 끊김) */
  dungeonExited: (p: Ent, id: string, why: 'self' | 'end' | 'drop') => void;
  /** 장비 강화를 시도했다 (성공이든 실패든) */
  enhanced: (p: Ent) => void;
  /** 사람이 몬스터를 때렸다: 실제로 깎인 체력 (쓰러뜨렸으면 monsterKilled보다 먼저 불린다). 사람 편의 종류(편성의 영웅)가 때린 것은 그 주인이 때린 것으로 불린다 */
  hit: (p: Ent, m: Ent, amount: number) => void;
  /** [roster] 영웅을 얻었거나 레벨·별이 바뀌었다 */
  heroChanged: (p: Ent, id: string) => void;
  /** [stages] 단계를 깼다: 단계 id와 처음 깼는가 */
  stageCleared: (p: Ent, id: string, first: boolean) => void;
  /** [stages, dungeon] 깬 단계나 열쇠 던전을 n번 소탕했다 */
  swept: (p: Ent, kind: 'stage' | 'dungeon', id: string, n: number) => void;
  /** [chars] 캐릭터 정의가 더해졌거나 바뀌었다 / 빠졌다 */
  charAdded: (def: CharDef) => void;
  charRemoved: (id: string) => void;
  /** [morph] 변신했다 (id) / 풀렸다 (id는 ''): 까닭 on, off 스스로, end 시간이 다 됨, gone 정의가 빠짐 */
  morphed: (p: Ent, id: string, why: 'on' | 'off' | 'end' | 'gone') => void;
  /** [핵심: 시계] 날·주·달이 바뀌었다 (내용의 RESET): 새 열쇠, 옛 열쇠, 지난 경계의 수(서버가 꺼져 있던 동안 여럿이 지났어도 사건은 한 번) */
  dayReset: (day: string, prev: string, missed: number) => void;
  weekReset: (week: string, prev: string, missed: number) => void;
  monthReset: (month: string, prev: string, missed: number) => void;
  /** [핵심: 원격 설정] 칸이 바뀌었다 (cfg:이름, flag:이름, notice:id, maint, admins) */
  liveChanged: (key: string) => void;
  /** [핵심: 점검] 점검이 시작됐다 (통신 계층이 모두 저장하고 관리자 말고 내보낸다) / 끝났다 */
  maintStarted: () => void;
  maintEnded: () => void;
  /** 탭·앱을 숨겼다(false) / 다시 보였다(true) (engine/server/net/web.ts). 실시간 판의 '숨긴 사람' 처리 같은 것을 게임이 건다 */
  playerVisible: (p: Ent, on: boolean) => void;
}

/**
 * 게임마다 다른 규칙이 끼어드는 자리. 기본값은 '그런 규칙이 없다'이고, 그 규칙을 가진 시스템이 덮어쓴다
 * (등불지기에서는 등탑과 습격). 이동·전투·상점 같은 틀은 게임의 시스템을 직접 알지 않고 여기만 본다.
 */
export interface Rules extends RulesExt {
  /** 쓰러진 사람이 다시 일어날 자리. id는 안내문에 넣을 장소의 이름표 */
  respawn: (p: Ent) => { x: number; z: number; id: string };
  /** 그 사람의 이동 속도 */
  speed: (p: Ent) => number;
  /** 지금 그 자리에서 직업을 바꿀 수 있는가 */
  canChangeClass: (p: Ent) => boolean;
  /** 조건(key)이 풀렸는가: 상점 물건과 제작의 잠금 */
  unlocked: (key: string) => boolean;
  /** 몰려온 적(Ent.swarm)이 향하는 곳. 없으면 평소의 몬스터처럼 군다 */
  siege: { x: number; z: number } | null;
  /** 이 캐릭터에게 게임의 진행(틀이 모르는 칸)이 있는가. 아무것도 하지 않은 새 캐릭터를 저장하지 않는 규칙이 틀의 칸(직업, 레벨, 골드 등)에 더해 묻는다. 없으면 '없다' */
  touched?: (p: Ent) => boolean;
}

/**
 * 캐릭터 저장의 한 칸. 시스템이 자기 몫을 직접 쓰고 읽는다 (PlayerSave.ext[name])
 * legacy: 자기 칸이 없는 저장(그 값이 저장의 최상위 칸에 있던 옛 형식: 이름-값 묶음으로 받는다. 그 칸은 PlayerSave의 타입에 없다)에서 자기 몫을 찾아 load가 읽는 모양으로 돌려준다. 없으면 undefined (월드 저장의 legacy와 같다). 버전 칸이 없는 저장(v0)을 v1로 올리는 틀의 이전(./migrate.ts의 PLAYER_UP)이 부른다. 옛 저장이 남아 있는 한 지우지 않는다. 새로 모양을 바꿀 때는 legacy 대신 g.migrations에 이전을 더한다
 */
export interface Saver { name: string; save: (p: Ent) => unknown; load: (p: Ent, raw: unknown) => void; legacy?: (whole: Readonly<Record<string, unknown>>) => unknown }

/** 수치 보정. 여러 시스템이 같은 수치에 보정을 걸 수 있다 (장비, 기술의 강화, 게임의 규칙). */
export type ModName = 'damage' | 'guard' | 'regen' | 'sparkBonus' | 'crit' | 'hp' | 'exp' | keyof ModsExt;
export class Modifiers {
  private list = new Map<ModName, ((p?: Ent) => number)[]>();
  /**
   * damage, guard, regen은 곱하는 값(1이 기본), sparkBonus, crit(치명타 확률), hp(최대 체력), exp(처치 경험치를 더 받는 비율)는 더하는 값(0이 기본)을 돌려주는 함수를 등록한다.
   * 함수는 대상 플레이어를 받는다: 모두에게 같은 보정이면 무시하고, 사람마다 다르면(장비) 보고 정한다.
   */
  provide(name: ModName, fn: (p?: Ent) => number): void {
    const l = this.list.get(name);
    if (l) l.push(fn); else this.list.set(name, [fn]);
  }
  product(name: ModName, p?: Ent): number { return (this.list.get(name) ?? []).reduce((v, fn) => v * fn(p), 1); }
  sum(name: ModName, p?: Ent): number { return (this.list.get(name) ?? []).reduce((v, fn) => v + fn(p), 0); }
}

/**
 * 규칙 플러그인: 그 게임에만 있는 시스템을 만들어 Game에 단다 (예: g.tower = new Tower(g)).
 * 바탕 시스템(이동, 플레이어, 전투, 몬스터, 봇, 자리 비움)이 만들어진 뒤, 나머지 표준 시스템(상점부터 길드까지)이 만들어지기 전에 불린다:
 * 게임의 규칙(g.rules)이 먼저 자리를 잡고, 뒤의 시스템(던전)이 그것을 감싼다. 그래서 여기서는 등록만 하고, 뒤에 만들어지는 시스템을 써야 하는 일은 g.ready에 맡긴다.
 */
export type Plugin = (g: Game) => void;

/**
 * 게임이 등록하는 엔티티 종류 (g.defineKind): 구조물, 떨어진 물건, 발사체, 탈것, 공 같은 것. 놓는 것은 g.place.
 * 위치·이동·층·이름은 틀이 다루고(시야에 들어오면 화면에 보낸다), 그 밖의 값은 아래 함수로 게임이 정한다
 */
export interface KindDef {
  /** 틱마다 그 종류의 엔티티 하나마다 (움직이게 하려면 g.movement.goTo와 g.movement.walk를 쓰거나 x, z를 직접 바꾼다) */
  tick?: (e: Ent, dt: number) => void;
  /** 시야 안의 화면에 실어 보낼 값: 수 몇 개 (소수 둘째 자리까지). 바뀌면 다시 간다. 화면은 registerKind의 update로 받는다 */
  sync?: (e: Ent) => readonly number[];
  /** 월드와 함께 저장한다: 하나를 저장할 값으로. 주면 월드 저장의 'kind.<종류>' 칸에 그 종류의 엔티티가 모두 적힌다 */
  save?: (e: Ent) => unknown;
  /** 저장한 값 하나로 엔티티를 되살린다 (g.place를 부른다). 저장에 그 칸이 있으면 먼저 지금 있는 그 종류의 엔티티를 모두 지운 뒤 하나씩 부른다 */
  load?: (raw: unknown) => void;
}

export interface GameOptions {
  /** 쓸 모듈. 주지 않으면 내용의 MODULES (시험이 같은 내용으로 모듈을 줄여 보려고 준다) */
  modules?: readonly ModuleId[];
  /** 규칙 플러그인들. 주지 않으면 틀만으로 만들어진다: 게임을 만드는 쪽이 자기 규칙을 적어 넘긴다 (이 게임은 games/deungbul/server/main.ts와 games/deungbul/test/game.ts) */
  plugins?: Plugin[];
  /** 현재 시각(ms). 시험에서 시간을 다루려고 바꿀 수 있다 */
  now?: () => number;
}

/** 게임의 규칙 시스템이 다는 칸(g.tower 같은 것)을 Game의 타입에 잇는다: GameSystems(./ext.ts)에 게임이 더한다 */
export interface Game extends GameSystems {}

/**
 * 고르지 않은 모듈의 시스템 자리: 무엇을 건드리든 '그 모듈을 고르지 않았다'는 오류를 던진다.
 * 핵심과 다른 모듈은 g.has(모듈)로 먼저 묻고 쓰므로, 이 오류는 묻지 않고 쓴 곳(게임의 규칙이나 틀의 빠진 확인)을 바로 가리킨다
 */
function off<T extends object>(module: ModuleId, name: string): T {
  const fail = (): never => { throw new Error(`g.${name}: 모듈 '${module}'를 고르지 않았습니다. 내용의 MODULES에 '${module}'를 더하거나, 쓰기 전에 g.has('${module}')로 확인하세요`); };
  return new Proxy({} as T, { get: fail, set: fail, has: fail });
}

/** 빈 목록 (monstersIn) */
const NONE: readonly Ent[] = [];

/** 등록되지 않은 싸우는 법을 이미 알린 몬스터 (한 프로세스에 한 번만 알린다: 시험은 게임을 여러 번 만든다) */
const warnedBehavior = new Set<string>();

export class Game {
  readonly world = buildWorld();
  /** 길찾기용 격자 */
  readonly nav = new NavGrid(this.world.obstacles);
  readonly ents = new Map<number, Ent>();
  /** 서버가 켜진 뒤 흐른 게임 시간(초) */
  clock = 0;
  readonly now: () => number;
  /** 이 게임이 고른 모듈 (내용의 MODULES 또는 GameOptions.modules) */
  readonly modules: ReadonlySet<ModuleId>;

  // ---- 밖으로 나갈 것 (net 계층이 가져가고 비운다) ----
  /** 마지막 스냅샷 뒤에 쌓인 사건 */
  events: Ev[] = [];
  /** 특정 플레이어에게만 보내는 안내문 */
  notices: { id: number; k: MsgKey; a: MsgArg[] }[] = [];
  /** 모두에게 보내는 안내문 */
  announces: { k: MsgKey; a: MsgArg[] }[] = [];
  /** 받아들여진 기술: 쿨다운 시작을 알린다 */
  cdAcks: { id: number; n: number; ms: number }[] = [];
  /** 물약을 마셨다: 다시 마실 수 있을 때까지의 시간을 알린다 */
  itemCds: { id: number; ms: number }[] = [];
  /** 무기나 직업을 바꿨다: 모두에게 알린다 */
  gears: { id: number; weapon: string; armor: string; cls: string }[] = [];
  /** 파티 소식: 특정 플레이어에게만 보내는 메시지 */
  partyOut: { id: number; msg: Extract<ServerMsg, { t: 'party' | 'pinv' }> }[] = [];
  /** 모두에게 보내는 그 밖의 메시지 */
  casts: ServerMsg[] = [];
  /** 그 밖에 특정 플레이어에게만 보내는 메시지 (새 시스템은 이 통로를 쓴다) */
  out: { id: number; msg: ServerMsg }[] = [];
  /** 공유 상태가 바뀌었다: 모두에게 다시 보낸다 */
  stateDirty = true;
  /** 저장할 공유 상태가 바뀌었다 */
  saveDirty = false;

  readonly commands = new Map<string, Command>();
  readonly mods = new Modifiers();
  readonly rules: Rules = {
    respawn: () => ({ x: SPAWN.x, z: SPAWN.z, id: '' }),
    speed: () => PLAYER_SPEED,
    canChangeClass: () => true,
    unlocked: () => true,
    siege: null,
  };
  /** 틱마다 불리는 시스템 처리. 등록한 순서대로 돈다 */
  readonly ticks: ((dt: number) => void)[] = [];
  /** 월드와 함께 저장할 것을 가진 시스템들 (WorldSave[name]) */
  /** legacy: 자기 칸이 없는 저장(칸 이름이 생기기 전의 옛 형식)에서 자기 몫을 찾아 돌려준다. 없으면 undefined. 버전 칸이 없는 월드(v0)를 올리는 틀의 이전(./migrate.ts의 WORLD_UP)이 부른다 */
  readonly worldSaves: { name: string; save: () => unknown; load: (raw: unknown) => void; legacy?: (whole: WorldSave) => unknown }[] = [];
  /** 모두에게 보내는 공유 상태의 한 칸 (WorldState[name]) */
  readonly shared: { name: keyof WorldState; state: () => unknown }[] = [];
  /** 캐릭터와 함께 저장할 것을 가진 시스템들 */
  readonly saves: Saver[] = [];
  /** 게임의 저장 이전 목록 (./migrate.ts): 게임의 칸의 모양을 바꿀 때 끝에 한 단계씩 더한다. 저장의 gv 칸이 이것의 버전이다 */
  readonly migrations: Migrations = { player: [], world: [] };
  /** 모든 시스템이 만들어진 뒤에 한 번 불린다. 자기보다 뒤에 만들어지는 시스템의 접점을 채울 때 쓴다 (예: 게임의 규칙이 채널의 extraFoes를) */
  readonly ready: (() => void)[] = [];
  /** 엔티티가 만들어질 때마다 불린다. 게임이 더한 칸(EntExt)의 처음 값을 채운다 (고른 모듈의 칸이 채워진 뒤에) */
  readonly entInit: ((e: Ent) => void)[] = [];
  /** 고른 모듈이 엔티티에 두는 칸 (./parts.ts의 PARTS 가운데 고른 것, 모듈 표의 차례) */
  private readonly parts: readonly Part[];
  /** 전투 모듈을 골랐는가 (엔티티를 없앨 때 노리던 대상과 피해를 준 사람을 정리한다) */
  private readonly fight: boolean;
  /** 몬스터를 잡은 사람이 덤으로 받는 경험치 (휴식 보너스 같은 것). 등록한 함수들의 값을 더한다 */
  readonly killBonus: ((p: Ent, m: Ent) => number)[] = [];
  /**
   * 전송마다 본인에게 보낼 메시지를 만드는 것들: 사람마다 불려, 보낼 것이 있으면 메시지를, 없으면 null을 돌려준다
   * (모듈의 성장 수치 'stat'과 장비·우편 'meta'가 쓴다: systems/status.ts). 값 하나를 바뀔 때마다 보내는 것이면 personal이 더 쉽다
   */
  readonly perFlush: ((p: Ent) => ServerMsg | null)[] = [];
  /**
   * 개인 상태: 본인에게만 보내는 값의 한 칸 (모두에게 보내는 shared의 짝). 통신 계층이 { t: 'me', k: name, s: state(p) }로 보낸다: 접속 직후에 전부, 그 뒤로는 바뀐 칸만.
   * dirty를 주지 않으면 마지막으로 보낸 값과 달라졌을 때 보낸다 (수 하나처럼 값이 작을 때). dirty를 주면 그것이 참일 때 보내고, 보낸 뒤에 sent가 불린다 (표시를 지우는 자리)
   */
  readonly personal: { name: string; state: (p: Ent) => unknown; dirty?: (p: Ent) => boolean; sent?: (p: Ent) => void }[] = [];
  /** 게임이 등록한 엔티티 종류 (defineKind) */
  readonly kinds = new Map<string, KindDef>();
  /** 플레이어에게 실어 보낼 게임의 값 (playerSync). 없으면 플레이어의 상태 줄에 칸을 더하지 않는다 */
  playerVals: ((p: Ent) => readonly number[]) | null = null;
  /** 월드 저장에서 읽었지만 이 게임이 고르지 않은 모듈의 칸 (거래소, 길드 …): 다시 저장할 때 그대로 적는다 (MODULE_SAVES) */
  private keptWorld: WorldSave = {};
  /** 사건별 처리기. 사건 이름을 미리 적어 두지 않고, 처음 on 할 때 그 칸을 만든다 */
  private hooks: { [K in keyof Hooks]?: Hooks[K][] } = {};
  private nextId = 1;
  /** 층마다의 몬스터 (monstersIn): 엔티티를 만들거나 없앨 때와 틱의 처음에 버리고, 물을 때 다시 만든다 */
  private mobsByLayer: Map<number, Ent[]> | null = null;

  // ---- 시스템 ----
  // 모듈의 시스템은 그 모듈을 고르지 않았으면 자리표다(off): 쓰기 전에 g.has(모듈)로 묻는다. 모듈 이름은 칸마다 [ ]에 적었다
  /** [economy] 재화(골드, 두 번째 재화, 경험치)를 더하고 빼는 한 통로. 다른 시스템과 규칙 플러그인이 만들어질 때부터 쓸 수 있게 가장 먼저 만든다 */
  readonly wallet: Wallet;
  /** [items] 아이템(재료, 물약)과 낱개 장비를 넣고 빼는 한 통로. 지갑과 같은 까닭으로 먼저 만든다 */
  readonly bag: Bag;
  readonly movement: Movement;
  readonly players: Players;
  /** [combat] */ readonly combat: Combat;
  /** [combat] */ readonly monsters: Monsters;
  readonly bots: Bots;
  /** [away] */ readonly away: Away;
  /** [teams] 팀과 점수 (규칙 플러그인보다 먼저 만든다: 게임이 플러그인에서 쓴다) */ readonly teams: Teams;
  /** [rooms] 판: 인스턴스 층의 판, 대기실·짝짓기, 차례와 기한, 끊긴 사람의 자리 (규칙 플러그인보다 먼저 만든다: 게임이 플러그인에서 g.rooms.define을 부른다) */ readonly rooms: Rooms;
  /** [items] */ readonly shop: Shop;
  /** [classes] */ readonly classes: Classes;
  /** [combat] */ readonly boss: Boss;
  /** [items] */ readonly craft: Craft;
  /** [party] */ readonly party: Party;
  /** [gear] */ readonly gear: GearSys;
  /** [gear] */ readonly salvage: Salvage;
  /** [mail] */ readonly mail: MailSys;
  /** [idle] */ readonly idle: Idle;
  /** [economy] */ readonly ledger: Ledger;
  /** [daily] */ readonly daily: Daily;
  /** [rank] */ readonly rank: Rank;
  /** [dungeon] */ readonly dungeon: Dungeon;
  readonly channels: Channels;
  /** [build] */ readonly build: Build;
  /** [market] */ readonly market: Market;
  /** [guild] */ readonly guild: Guild;
  /** [roster] 영웅(동료) */ readonly roster: Roster;
  /** [gacha] 뽑기 */ readonly gacha: Gacha;
  /** [squad] 편성: 함께 싸우는 영웅 */ readonly squad: Squad;
  /** [stages] 장과 단계 */ readonly stages: Stages;
  /** [herogear] 영웅 장비 */ readonly herogear: HeroGear;
  /** [chars] 캐릭터 정의: 검증하고 두고 화면에 보낸다 (roster를 함께 고르면 영웅이 된다) */ readonly chars: Chars;
  /** [morph] 변신 */ readonly morph: Morph;
  /** 제재(차단, 말 막기)와 관리자 지급·회수. 관리자 통로(net/admin.ts)가 부른다 */
  readonly sanctions: Sanctions;
  /** [핵심] 시계와 초기화: 날·주·달의 열쇠와 경계 사건 (내용의 RESET). 규칙 플러그인보다 먼저 만든다 */
  readonly time: Clock;
  /** [핵심] 원격 설정·공지·점검 (내용의 LIVE_KEYS). 규칙 플러그인보다 먼저 만든다 */
  readonly live: Live;
  /** [핵심] 기능 깃발: g.flags.on('market'). 깃발이 없으면 켜짐 (g.live의 것) */
  readonly flags: { on: (name: string) => boolean };
  /**
   * [핵심] to가 from을 차단했는가: 파티·길드 초대가 묻는다. 통신 계층의 사회와 안전(engine/server/net/social.ts)이 서버 저장 차단 목록으로 바꿔 건다.
   * 서버 없이 도는 게임(시험, 황금 실행)은 아무도 차단하지 않는다
   */
  blocks: (to: Ent, from: Ent) => boolean = () => false;

  constructor(opts: GameOptions = {}) {
    this.now = opts.now ?? Date.now;
    // 고른 모듈을 확인한다: 모르는 이름이나 빠진 의존이 있으면 여기서 멈춘다 (engine/shared/modules.ts)
    this.modules = checkModules(opts.modules ?? MODULES, opts.modules ? 'GameOptions.modules' : '내용의 MODULES');
    // 만드는 차례가 곧 등록의 차례(저장 칸, 사건 처리기, 틱)다: 저장의 모양과 난수의 차례가 바뀌지 않게 예전 차례를 지킨다
    const has = (m: ModuleId) => this.modules.has(m);
    // 엔티티의 모듈 칸은 어느 시스템보다 먼저 정한다: 시스템이 만들어지며 놓는 엔티티(첫 채널의 몬스터)도 고른 모듈의 칸을 다 갖는다
    this.parts = ALL_MODULES.filter(has).flatMap((m) => PARTS[m] ?? []);
    this.fight = has('combat');
    this.wallet = has('economy') ? new Wallet(this) : off('economy', 'wallet');
    this.bag = has('items') ? new Bag(this) : off('items', 'bag');
    this.movement = new Movement(this);
    this.players = new Players(this);
    this.combat = has('combat') ? new Combat(this) : off('combat', 'combat');
    this.monsters = has('combat') ? new Monsters(this) : off('combat', 'monsters');
    this.bots = new Bots(this);
    // 시계와 원격 설정 (핵심): 규칙 플러그인과 모듈의 시스템이 만들어질 때부터 쓸 수 있게. 틱은 경계·공지의 시각만 견주고 아무것도 바꾸지 않는다
    this.time = new Clock(this);
    this.live = new Live(this);
    this.flags = this.live.flags;
    this.away = has('away') ? new Away(this) : off('away', 'away');
    this.teams = has('teams') ? new Teams(this) : off('teams', 'teams');
    this.rooms = has('rooms') ? new Rooms(this) : off('rooms', 'rooms');
    // 게임의 규칙이 깔리는 자리 (Plugin의 설명)
    for (const install of opts.plugins ?? []) install(this);
    // 몬스터가 적은 싸우는 법이 등록되어 있는가 (없으면 기본대로 싸운다: 이름을 잘못 적은 것을 서버를 띄울 때 알린다)
    if (has('combat')) for (const [type, def] of Object.entries(MONSTERS as Readonly<Record<string, MonsterDef>>)) if (def.behavior && !this.monsters.hasBehavior(def.behavior) && !warnedBehavior.has(type) && warnedBehavior.add(type)) console.warn(`[monsters] ${type}의 behavior '${def.behavior}'가 등록되어 있지 않습니다 (g.monsters.addBehavior). 기본대로 싸웁니다`);
    // 플러그인보다 먼저 만들어진 엔티티(첫 채널의 몬스터)도 게임이 더한 칸을 갖게 한다
    for (const e of this.ents.values()) for (const init of this.entInit) init(e);
    this.shop = has('items') ? new Shop(this) : off('items', 'shop');
    this.classes = has('classes') ? new Classes(this) : off('classes', 'classes');
    this.boss = has('combat') ? new Boss(this) : off('combat', 'boss');
    this.craft = has('items') ? new Craft(this) : off('items', 'craft');
    this.party = has('party') ? new Party(this) : off('party', 'party');
    this.gear = has('gear') ? new GearSys(this) : off('gear', 'gear');
    this.salvage = has('gear') ? new Salvage(this) : off('gear', 'salvage');
    this.mail = has('mail') ? new MailSys(this) : off('mail', 'mail');
    this.idle = has('idle') ? new Idle(this) : off('idle', 'idle');
    this.ledger = has('economy') ? new Ledger(this) : off('economy', 'ledger');
    this.daily = has('daily') ? new Daily(this) : off('daily', 'daily');
    this.rank = has('rank') ? new Rank(this) : off('rank', 'rank');
    this.dungeon = has('dungeon') ? new Dungeon(this) : off('dungeon', 'dungeon');
    this.channels = new Channels(this);
    this.build = has('build') ? new Build(this) : off('build', 'build');
    this.market = has('market') ? new Market(this) : off('market', 'market');
    this.guild = has('guild') ? new Guild(this) : off('guild', 'guild');
    // 수집형·방치형의 넷: 맨 뒤에 만든다 (앞의 시스템의 등록 차례가 이것들을 고르지 않은 게임과 같게)
    this.roster = has('roster') ? new Roster(this) : off('roster', 'roster');
    this.gacha = has('gacha') ? new Gacha(this) : off('gacha', 'gacha');
    this.squad = has('squad') ? new Squad(this) : off('squad', 'squad');
    this.stages = has('stages') ? new Stages(this) : off('stages', 'stages');
    this.herogear = has('herogear') ? new HeroGear(this) : off('herogear', 'herogear');
    // 캐릭터 정의와 변신: 그 뒤에 (앞의 시스템의 등록 차례가 이것들을 고르지 않은 게임과 같게)
    this.chars = has('chars') ? new Chars(this) : off('chars', 'chars');
    this.morph = has('morph') ? new Morph(this) : off('morph', 'morph');
    this.sanctions = new Sanctions(this);
    new Status(this); // 본인에게 보내는 성장 수치(stat)와 장비·우편(meta): 그 칸의 모듈을 고른 게임만
    for (const fn of this.ready) fn();
    // 저장 이전 목록이 1부터 하나씩인가: 틀린 목록은 저장을 잘못 올리므로 서버를 띄울 때 멈춘다
    checkList(PLAYER_UP, '틀의 캐릭터 저장'); checkList(WORLD_UP, '틀의 월드 저장');
    checkList(this.migrations.player, 'g.migrations.player'); checkList(this.migrations.world, 'g.migrations.world');
  }

  // ---- 시스템이 쓰는 공용 통로 ----
  /** 그 모듈을 골랐는가 (engine/shared/modules.ts). 고르지 않았을 수 있는 모듈의 시스템(g.wallet 같은 것)은 이것으로 묻고 쓴다 */
  has(m: ModuleId): boolean { return this.modules.has(m); }
  /**
   * 고르지 않았을 수 있는 모듈의 칸을 읽는다: 그 모듈을 골랐으면 엔티티의 값, 아니면 그 칸의 처음 값(./parts.ts. 체력은 0).
   * 다른 모듈의 칸을 읽기만 하는 곳(길드가 적는 레벨과 직업 같은 것)이 쓴다. 쓰는 곳은 g.has(모듈)로 막는다: 칸이 없는 엔티티에 칸을 만들지 않는다
   */
  field<K extends PartKey>(e: Ent, k: K): Ent[K] {
    const m = partOwner(k);
    return m && this.modules.has(m) ? e[k] : blankOf(k);
  }
  on<K extends keyof Hooks>(name: K, fn: Hooks[K]): void { ((this.hooks[name] ??= []) as Hooks[K][]).push(fn); }
  fire<K extends keyof Hooks>(name: K, ...args: Parameters<Hooks[K]>): void {
    for (const fn of this.hooks[name] ?? []) (fn as (...a: Parameters<Hooks[K]>) => void)(...args);
  }
  emit(ev: Ev): void { this.events.push(ev); }
  /**
   * 게임의 연출 사건: 엔티티 id(그 사건이 일어난 곳: 그것이 보이는 화면에만 간다)와 이름, 수 몇 개를 다음 스냅샷의 사건(ev)에 싣는다.
   * 화면은 onEffect(name, (id, vals) => …)로 받아 그린다 (날아가는 돌, 내딛기, 피해 숫자 …). 상태가 아니라 한 번의 연출이라 늦게 들어온 사람은 받지 않는다.
   * name은 영문 소문자로 시작하는 24자 이내 (틀의 사건 이름과 겹치지 않게 게임이 고른다). 수는 소수 둘째 자리까지
   */
  effect(id: number, name: string, ...vals: number[]): void {
    if (!/^[a-z][a-zA-Z0-9_]{0,23}$/.test(name)) throw new Error(`연출 사건의 이름이 이상합니다: '${name}' (영문 소문자로 시작하는 24자 이내)`);
    this.events.push(['fx', id, name, ...vals.map((v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0))]);
  }
  notify(p: Ent, k: MsgKey, ...a: MsgArg[]): void { if (!p.bot) this.notices.push({ id: p.id, k, a }); }
  announce(k: MsgKey, ...a: MsgArg[]): void { this.announces.push({ k, a }); }

  /**
   * 게임의 엔티티 종류를 등록한다 (KindDef). id는 영문 소문자로 시작하는 16자 이내이고, 'p'(플레이어)와 'm'(몬스터)는 틀의 것이다.
   * 화면에는 같은 id로 registerKind(engine/client)를 해 둔다: 하지 않으면 작은 상자로 그린다
   */
  defineKind(id: string, def: KindDef): void {
    if (!/^[a-z][a-z0-9_]{0,15}$/.test(id) || id === 'p' || id === 'm') throw new Error(`엔티티 종류의 이름이 이상합니다: '${id}' (영문 소문자로 시작하는 16자 이내, 'p'와 'm'은 틀의 것)`);
    if (this.kinds.has(id)) throw new Error(`엔티티 종류 '${id}'가 이미 등록되어 있습니다`);
    this.kinds.set(id, def);
    const { save, load } = def;
    if (save) {
      this.worldSaves.push({
        name: `kind.${id}`,
        save: () => [...this.ents.values()].filter((e) => e.kind === id && !e.dead).map((e) => save(e)),
        load: (raw) => {
          if (!Array.isArray(raw) || !load) return;
          for (const e of [...this.ents.values()]) if (e.kind === id) this.remove(e.id);
          for (const one of raw) { try { load(one); } catch (err) { console.error(`[game] 저장된 '${id}' 하나를 되살리지 못했습니다:`, err); } }
        },
      });
    }
  }

  /**
   * 플레이어(kind 'p')에게 게임의 값을 실어 보낸다: 종류의 KindDef.sync와 같은 모양(수 몇 개, 소수 둘째 자리까지, 바뀌면 다시 간다).
   * 다른 사람에게는 시야 안 엔티티의 상태 줄 끝에, 본인에게는 스냅샷의 you 끝에 붙는다. 화면은 setPlayerLook의 update로 받는다 (engine/client/entities.ts).
   * 팀, 역할, 들고 있는 것처럼 남이 보아야 하는 사람마다의 값에 쓴다 (본인만 볼 값은 g.personal). 한 게임에 하나: 다시 부르면 새 것이 이긴다
   */
  playerSync(fn: ((p: Ent) => readonly number[]) | null): void { this.playerVals = fn; }

  /**
   * 엔티티의 부품 겉모습을 바꾼다 (engine/shared/defs/look.ts의 encodeLook 글자. 빈 문자열이면 예전 그림으로). 모두에게 { t: 'look' }로 알리고,
   * 나중에 시야에 들어오는 화면에는 EnterInfo.l로 간다. 저장하지 않는다: 겉모습을 정한 시스템(변신)이 자기 저장에서 다시 부른다
   */
  setLook(e: Ent, code: string): void {
    const l = code || undefined;
    if (e.look === l) return;
    if (l) e.look = l; else delete e.look;
    this.casts.push({ t: 'look', id: e.id, l: code });
  }

  /** 게임이 등록한 종류의 엔티티를 놓는다. 층(layer)을 주지 않으면 1채널의 들판이다 (채널이 여럿이면 채널마다 놓는다: layers.ts의 fieldLayer) */
  place(kind: string, at: { x: number; z: number; type?: string; name?: string; hp?: number; layer?: number; face?: number }): Ent {
    if (!this.kinds.has(kind)) throw new Error(`엔티티 종류 '${kind}'가 등록되지 않았습니다: 먼저 g.defineKind('${kind}', …)`);
    const e = this.create(kind, at.type ?? '', at.name ?? '', at.x, at.z, at.hp ?? 0);
    if (at.layer !== undefined) e.layer = at.layer;
    if (at.face !== undefined) e.face = at.face;
    return e;
  }

  /**
   * 그 층의 몬스터(종류 'm')를 엔티티를 만든 차례로 (g.ents를 훑어 고른 것과 같은 차례). 쓰러진 것도 든다: 부른 쪽이 dead 같은 것을 본다.
   * 사람·영웅이 많은 게임에서 '둘레의 몬스터 찾기'가 엔티티 전부를 훑지 않게 한다 (편성의 영웅: systems/squad.ts).
   * 색인은 엔티티를 만들거나 없앨 때와 틱의 처음에 버려진다(돌려준 목록은 그 뒤에도 바뀌지 않는다: 돌면서 몬스터를 없애도 된다).
   * 몬스터의 층은 만든 자리에서 정한다(spawn 바로 뒤): 다른 때에 층을 옮기면 그 틱 안에서는 옛 층으로 보인다
   */
  monstersIn(layer: number): readonly Ent[] {
    let idx = this.mobsByLayer;
    if (!idx) {
      idx = this.mobsByLayer = new Map();
      for (const e of this.ents.values()) {
        if (e.kind !== 'm') continue;
        const l = idx.get(e.layer);
        if (l) l.push(e); else idx.set(e.layer, [e]);
      }
    }
    return idx.get(layer) ?? NONE;
  }

  /** 엔티티를 만들어 월드에 넣는다. 세부 값은 부른 쪽이 채운다. 게임의 종류는 place로 놓는다 */
  create(kind: Kind, type: string, name: string, x: number, z: number, hp: number): Ent {
    // 틀은 핵심의 칸만 적는다(./entity.ts). 모듈의 칸(EntParts)은 고른 모듈의 PARTS가(hp는 전투 모듈의 체력), 게임이 더한 칸(EntExt)은 entInit이 채운다:
    // 여기 적으면 컴파일 오류다. 고르지 않은 모듈의 칸은 엔티티에 없다
    const base: CoreEnt = {
      id: this.nextId++, kind, type, name, x, z, face: 0, tx: x, tz: z, moving: false, stuck: 0, lastMove: -99, lastAct: -99, path: null, pgx: x, pgz: z, pat: 0,
      dead: false, layer: fieldLayer(1), wait: 0, data: {}, bot: false, pid: '', dirty: false, unsaved: false, metaDirty: false, offMs: 0,
    };
    const e = base as Ent;
    for (const part of this.parts) part.init(e, hp);
    for (const init of this.entInit) init(e);
    resolve(e, this.world.obstacles);
    for (const part of this.parts) part.placed?.(e);
    this.ents.set(e.id, e);
    this.mobsByLayer = null;
    return e;
  }

  /** 엔티티를 없애고, 다른 엔티티가 붙들고 있던 참조를 정리한다. */
  remove(id: number): void {
    if (!this.ents.delete(id)) return;
    this.mobsByLayer = null;
    if (!this.fight) return;
    for (const e of this.ents.values()) {
      if (e.targetId === id) e.targetId = 0;
      e.hitters.delete(id);
    }
  }

  /** 플레이어 명령을 해당 시스템에 넘긴다. 모르는 명령은 무시한다. */
  command(p: Ent, msg: Record<string, unknown>): void {
    const fn = typeof msg.t === 'string' ? this.commands.get(msg.t) : undefined;
    if (!fn) return;
    p.lastAct = this.clock; // 무엇이든 명령을 냈으면 자리에 있는 사람이다 (게임의 규칙이 인원을 셀 때)
    // 기능 깃발이 꺼진 명령은 처리하지 않고 알린다 (engine/shared/defs/live.ts의 COMMAND_FLAGS, g.live.gate)
    const flag = this.live.gateOf(msg.t as string);
    if (flag !== undefined && !this.flags.on(flag)) { this.notify(p, 'featureOff', flag); return; }
    fn(p, msg);
  }

  tick(dt: number): void {
    this.clock += dt;
    this.mobsByLayer = null;
    this.nav.budget = NAV_VISITS_PER_TICK; // 길찾기가 한 틱에 쓸 수 있는 양 (engine/shared/nav.ts)
    const fight = this.modules.has('combat'), away = this.modules.has('away');
    for (const e of this.ents.values()) {
      if (e.kind === 'p') {
        if (e.bot) this.bots.think(e, dt); else if (away) this.away.think(e, dt);
        if (fight) this.combat.tickPlayer(e, dt); else this.movement.step(e, dt); // 전투가 없으면 걷기만 한다
      } else if (e.kind === 'm') { if (fight) this.monsters.tick(e, dt); }
      else this.kinds.get(e.kind)?.tick?.(e, dt); // 게임이 등록한 종류
      if (fight) this.combat.tickEffects(e, dt); // 강화와 지속 피해의 시간
    }
    for (const fn of this.ticks) fn(dt);
  }

  /** 클라이언트에 보내는 공유 상태 */
  state(): WorldState {
    const out: Record<string, unknown> = {};
    for (const s of this.shared) out[s.name] = s.state();
    return out as unknown as WorldState;
  }

  // ---- 저장 ----
  /** 지금 쓰는 저장의 버전: 틀(v)과 게임(gv). 게임의 이전이 없으면 gv는 적지 않는다 */
  saveVersion(kind: 'player' | 'world'): { v: number; gv?: number } {
    const gv = latest(this.migrations[kind]);
    return { v: latest(kind === 'player' ? PLAYER_UP : WORLD_UP), ...(gv ? { gv } : {}) };
  }
  /** 저장을 지금의 버전으로 올린다 (./migrate.ts). 올릴 것이 없으면 받은 것 그대로 */
  upgradePlayer(save: PlayerSave): PlayerSave { return upgrade(save, this, { own: PLAYER_UP, game: this.migrations.player }, '캐릭터'); }
  upgradeWorld(w: WorldSave): WorldSave { return upgrade(w, this, { own: WORLD_UP, game: this.migrations.world }, '월드'); }
  exportWorld(): WorldSave {
    const out: WorldSave = {};
    for (const s of this.worldSaves) out[s.name] = s.save();
    return { ...out, ...this.keptWorld, ...this.saveVersion('world') };
  }
  importWorld(saved: WorldSave): void {
    // 옛 버전의 저장은 먼저 지금의 모양으로 올린다 (버전 칸이 없던 저장의 '자기 칸이 없으면 legacy로 찾기'도 여기서: migrate.ts의 WORLD_UP)
    const w = this.upgradeWorld(saved);
    // 고르지 않은 모듈의 칸은 읽은 그대로 남긴다 (모듈을 껐다 켜도 맡겨 둔 것이 이어지게)
    this.keptWorld = Object.fromEntries(Object.entries(w).filter(([k, v]) => { const m = MODULE_SAVES.world[k]; return !!m && !this.modules.has(m) && v !== undefined; }));
    for (const s of this.worldSaves) {
      // 한 칸이 깨져 있어도 서버는 떠야 한다: 그 칸만 처음 상태로 둔다
      try { if (s.name in w) s.load(w[s.name]); } catch (err) { console.error(`[game] 월드 저장의 '${s.name}' 칸을 읽지 못했습니다:`, err); }
    }
  }

}
