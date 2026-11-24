// 게임의 중심. 상태(엔티티, 시계)와 시스템들을 묶고, 시스템끼리 쓰는 공용 통로를 제공한다.
// 통신은 모른다: 밖으로 나갈 것은 outbox에 쌓아 두고 net 계층이 가져간다.
//
// 새 기능을 더하는 방법:
//   1. engine/server/game/systems/에 시스템 파일을 만든다.
//   2. 생성자에서 필요한 것을 등록한다: commands(플레이어 명령), on(사건 구독), mods(수치 보정),
//      ticks(주기 처리), saves(캐릭터 저장), worldSaves(월드 저장), shared(모두에게 보내는 공유 상태).
//   3. 아래 Game 생성자에 한 줄 추가한다.
// 이 게임에만 있는 규칙(등탑, 습격, 등탑지기, 퀘스트)은 생성자에 적지 않고 규칙 플러그인(GameOptions.plugins)으로 깐다: ./deungbul.ts
import { SPAWN } from '../../shared/defs';
import type { MsgArg, MsgKey } from '../../shared/messages';
import { NavGrid } from '../../shared/nav';
import type { Ev, Kind, WorldState, ServerMsg } from '../../shared/protocol';
import { resolve } from '../../shared/sim';
import { LEVEL } from '../../shared/defs';
import { PLAYER_SPEED, buildWorld } from '../../shared/world';
import type { PlayerSave, WorldSave } from '../store';
import type { Ent } from './entity';
import type { EntExt, GameSystems, HooksExt, ModsExt, RulesExt } from './ext';
import { fieldLayer } from './layers';
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
import { Monsters } from './systems/monsters';
import { Party } from './systems/party';
import { Movement } from './systems/movement';
import { Players } from './systems/players';
import { Shop } from './systems/shop';
import { Wallet } from './systems/wallet';

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
  /** 장비 강화를 시도했다 (성공이든 실패든) */
  enhanced: (p: Ent) => void;
  /** 사람이 몬스터를 때렸다: 실제로 깎인 체력 (쓰러뜨렸으면 monsterKilled보다 먼저 불린다) */
  hit: (p: Ent, m: Ent, amount: number) => void;
}

/**
 * 게임마다 다른 규칙이 끼어드는 자리. 기본값은 '그런 규칙이 없다'이고, 그 규칙을 가진 시스템이 덮어쓴다
 * (이 게임에서는 등탑과 습격). 이동·전투·상점 같은 틀은 등탑을 직접 알지 않고 여기만 본다.
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
  /** 습격으로 온 적이 향하는 곳. 없으면 평소의 몬스터처럼 군다 */
  siege: { x: number; z: number } | null;
  /** 이 캐릭터에게 게임의 진행(틀이 모르는 칸)이 있는가. 아무것도 하지 않은 새 캐릭터를 저장하지 않는 규칙이 틀의 칸(직업, 레벨, 골드 등)에 더해 묻는다. 없으면 '없다' */
  touched?: (p: Ent) => boolean;
}

/**
 * 캐릭터 저장의 한 칸. 시스템이 자기 몫을 직접 쓰고 읽는다 (PlayerSave.ext[name])
 * legacy: 자기 칸이 없는 저장(그 값이 PlayerSave의 최상위 칸에 있던 옛 형식)에서 자기 몫을 찾아 load가 읽는 모양으로 돌려준다. 없으면 undefined (월드 저장의 legacy와 같다). 옛 저장이 남아 있는 한 지우지 않는다
 * legacySave: 호환: 다음 배포에서 뺀다. 칸을 옮긴 배포 한 번 동안 옛 최상위 칸에도 함께 적을 값 (쓰는 곳은 players.ts의 export 한 곳)
 */
export interface Saver { name: string; save: (p: Ent) => unknown; load: (p: Ent, raw: unknown) => void; legacy?: (whole: PlayerSave) => unknown; legacySave?: (p: Ent) => Partial<PlayerSave> }

/** 수치 보정. 여러 시스템이 같은 수치에 보정을 걸 수 있다 (주민 혜택, 나중의 장비와 버프). */
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

export interface GameOptions {
  /** 규칙 플러그인들. 주지 않으면 틀만으로 만들어진다: 게임을 만드는 쪽이 자기 규칙을 적어 넘긴다 (이 게임은 games/deungbul/server/main.ts와 games/deungbul/test/game.ts) */
  plugins?: Plugin[];
  /** 현재 시각(ms). 시험에서 시간을 다루려고 바꿀 수 있다 */
  now?: () => number;
}

/** 게임의 규칙 시스템이 다는 칸(g.tower 같은 것)을 Game의 타입에 잇는다: GameSystems(./ext.ts)에 게임이 더한다 */
export interface Game extends GameSystems {}

export class Game {
  readonly world = buildWorld();
  /** 길찾기용 격자 */
  readonly nav = new NavGrid(this.world.obstacles);
  readonly ents = new Map<number, Ent>();
  /** 서버가 켜진 뒤 흐른 게임 시간(초) */
  clock = 0;
  readonly now: () => number;

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
  /** legacy: 자기 칸이 없는 저장(칸 이름이 생기기 전의 옛 형식)에서 자기 몫을 찾아 돌려준다. 없으면 undefined */
  readonly worldSaves: { name: string; save: () => unknown; load: (raw: unknown) => void; legacy?: (whole: WorldSave) => unknown }[] = [];
  /** 모두에게 보내는 공유 상태의 한 칸 (WorldState[name]) */
  readonly shared: { name: keyof WorldState; state: () => unknown }[] = [];
  /** 캐릭터와 함께 저장할 것을 가진 시스템들 */
  readonly saves: Saver[] = [];
  /** 모든 시스템이 만들어진 뒤에 한 번 불린다. 자기보다 뒤에 만들어지는 시스템의 접점을 채울 때 쓴다 (예: 습격이 채널의 extraFoes를) */
  readonly ready: (() => void)[] = [];
  /** 엔티티가 만들어질 때마다 불린다. 게임이 더한 칸(EntExt)의 처음 값을 채운다 */
  readonly entInit: ((e: Ent) => void)[] = [];
  /** 몬스터를 잡은 사람이 덤으로 받는 경험치 (휴식 보너스 같은 것). 등록한 함수들의 값을 더한다 */
  readonly killBonus: ((p: Ent, m: Ent) => number)[] = [];
  /**
   * 개인 상태: 본인에게만 보내는 값의 한 칸 (모두에게 보내는 shared의 짝). 통신 계층이 { t: 'me', k: name, s: state(p) }로 보낸다: 접속 직후에 전부, 그 뒤로는 바뀐 칸만.
   * dirty를 주지 않으면 마지막으로 보낸 값과 달라졌을 때 보낸다 (수 하나처럼 값이 작을 때). dirty를 주면 그것이 참일 때 보내고, 보낸 뒤에 sent가 불린다 (표시를 지우는 자리)
   */
  readonly personal: { name: string; state: (p: Ent) => unknown; dirty?: (p: Ent) => boolean; sent?: (p: Ent) => void }[] = [];
  /**
   * 호환: 다음 배포에서 뺀다 (이 칸과, engine/server/net/server.ts의 flush가 이것을 읽는 두 곳). 채우는 쪽은 게임의 플러그인이다 (./deungbul.ts의 SEND_OLD_MSGS).
   * 개인 상태를 me 메시지로 옮긴 배포 한 번 동안, 옛 화면이 읽던 모양으로도 함께 보낸다. 틀은 그 모양을 모르므로 게임이 만든다.
   * stat: stat 메시지가 나갈 때 불린다. 옛 칸을 얹은 것을 돌려준다. msg: 그 이름의 개인 상태가 나갈 때 불린다. 함께 보낼 옛 메시지가 있으면 돌려준다
   */
  oldMsgs: { stat: (p: Ent, stat: Extract<ServerMsg, { t: 'stat' }>) => ServerMsg; msg: (p: Ent, name: string) => ServerMsg | null } | null = null;
  /** 사건별 처리기. 사건 이름을 미리 적어 두지 않고, 처음 on 할 때 그 칸을 만든다 */
  private hooks: { [K in keyof Hooks]?: Hooks[K][] } = {};
  private nextId = 1;

  // ---- 시스템 ----
  /** 재화(골드, 불씨, 경험치)를 더하고 빼는 한 통로. 다른 시스템과 규칙 플러그인이 만들어질 때부터 쓸 수 있게 가장 먼저 만든다 */
  readonly wallet: Wallet;
  /** 아이템(재료, 물약)과 낱개 장비를 넣고 빼는 한 통로. 지갑과 같은 까닭으로 먼저 만든다 */
  readonly bag: Bag;
  readonly movement: Movement;
  readonly players: Players;
  readonly combat: Combat;
  readonly monsters: Monsters;
  readonly bots: Bots;
  readonly away: Away;
  readonly shop: Shop;
  readonly classes: Classes;
  readonly boss: Boss;
  readonly craft: Craft;
  readonly party: Party;
  readonly gear: GearSys;
  readonly salvage: Salvage;
  readonly mail: MailSys;
  readonly idle: Idle;
  readonly ledger: Ledger;
  readonly daily: Daily;
  readonly rank: Rank;
  readonly dungeon: Dungeon;
  readonly channels: Channels;
  readonly build: Build;
  readonly market: Market;
  readonly guild: Guild;

  constructor(opts: GameOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.wallet = new Wallet(this);
    this.bag = new Bag(this);
    this.movement = new Movement(this);
    this.players = new Players(this);
    this.combat = new Combat(this);
    this.monsters = new Monsters(this);
    this.bots = new Bots(this);
    this.away = new Away(this);
    // 게임의 규칙이 깔리는 자리 (Plugin의 설명)
    for (const install of opts.plugins ?? []) install(this);
    // 플러그인보다 먼저 만들어진 엔티티(첫 채널의 몬스터)도 게임이 더한 칸을 갖게 한다
    for (const e of this.ents.values()) for (const init of this.entInit) init(e);
    this.shop = new Shop(this);
    this.classes = new Classes(this);
    this.boss = new Boss(this);
    this.craft = new Craft(this);
    this.party = new Party(this);
    this.gear = new GearSys(this);
    this.salvage = new Salvage(this);
    this.mail = new MailSys(this);
    this.idle = new Idle(this);
    this.ledger = new Ledger(this);
    this.daily = new Daily(this);
    this.rank = new Rank(this);
    this.dungeon = new Dungeon(this);
    this.channels = new Channels(this);
    this.build = new Build(this);
    this.market = new Market(this);
    this.guild = new Guild(this);
    for (const fn of this.ready) fn();
  }

  // ---- 시스템이 쓰는 공용 통로 ----
  on<K extends keyof Hooks>(name: K, fn: Hooks[K]): void { ((this.hooks[name] ??= []) as Hooks[K][]).push(fn); }
  fire<K extends keyof Hooks>(name: K, ...args: Parameters<Hooks[K]>): void {
    for (const fn of this.hooks[name] ?? []) (fn as (...a: Parameters<Hooks[K]>) => void)(...args);
  }
  emit(ev: Ev): void { this.events.push(ev); }
  notify(p: Ent, k: MsgKey, ...a: MsgArg[]): void { if (!p.bot) this.notices.push({ id: p.id, k, a }); }
  announce(k: MsgKey, ...a: MsgArg[]): void { this.announces.push({ k, a }); }

  /** 엔티티를 만들어 월드에 넣는다. 세부 값은 부른 쪽이 채운다. */
  create(kind: Kind, type: string, name: string, x: number, z: number, hp: number): Ent {
    // 틀은 자기 칸만 채운다: 게임이 더한 칸(EntExt)은 여기 적을 수 없고(적으면 컴파일 오류), entInit이 채운다
    const base: Omit<Ent, keyof EntExt> = {
      id: this.nextId++, kind, type, name, x, z, face: 0, tx: x, tz: z, moving: false, stuck: 0, lastMove: -99, lastAct: -99, path: null, pgx: x, pgz: z, pat: 0,
      hp, maxHp: hp, dead: false, layer: fieldLayer(1), targetId: 0, atkCd: 0, lastHurt: -99, wait: 0,
      bot: false, pid: '', guild: '', auto: false, lv: 1, exp: 0, need: LEVEL.firstNeed, sparks: 0, cds: [], dirty: false, unsaved: false, cls: '', gold: 0, weapon: '', armor: '', items: {}, itemCd: 0,
      gear: [], worn: {}, gearSeq: 0, bagUp: 0, lostFull: 0, autoSalvage: -1, mail: [], mailSeq: 0, daily: { day: '', prog: {}, got: [], streak: 0, last: '' }, away: { day: '', used: 0 }, offMs: 0, metaDirty: false, stats: {}, skillLv: {},
      def: null, hx: x, hz: z, respawn: 0, hitters: new Set(), raid: false, scale: 0, cast: 0, windup: 0, slowUntil: 0, homing: false,
    };
    const e = base as Ent;
    for (const init of this.entInit) init(e);
    resolve(e, this.world.obstacles);
    e.hx = e.x; e.hz = e.z;
    this.ents.set(e.id, e);
    return e;
  }

  /** 엔티티를 없애고, 다른 엔티티가 붙들고 있던 참조를 정리한다. */
  remove(id: number): void {
    if (!this.ents.delete(id)) return;
    for (const e of this.ents.values()) {
      if (e.targetId === id) e.targetId = 0;
      e.hitters.delete(id);
    }
  }

  /** 플레이어 명령을 해당 시스템에 넘긴다. 모르는 명령은 무시한다. */
  command(p: Ent, msg: Record<string, unknown>): void {
    const fn = typeof msg.t === 'string' ? this.commands.get(msg.t) : undefined;
    if (!fn) return;
    p.lastAct = this.clock; // 무엇이든 명령을 냈으면 자리에 있는 사람이다 (습격의 인원 세기)
    fn(p, msg);
  }

  tick(dt: number): void {
    this.clock += dt;
    this.nav.budget = NAV_VISITS_PER_TICK; // 길찾기가 한 틱에 쓸 수 있는 양 (engine/shared/nav.ts)
    for (const e of this.ents.values()) {
      if (e.kind === 'p') { if (e.bot) this.bots.think(e, dt); else this.away.think(e, dt); this.combat.tickPlayer(e, dt); }
      else this.monsters.tick(e, dt);
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
  exportWorld(): WorldSave {
    const out: WorldSave = {};
    for (const s of this.worldSaves) out[s.name] = s.save();
    return out;
  }
  importWorld(w: WorldSave): void {
    for (const s of this.worldSaves) {
      // 한 칸이 깨져 있어도 서버는 떠야 한다: 그 칸만 처음 상태로 둔다
      try {
        if (s.name in w) s.load(w[s.name]);
        else {
          // 자기 칸이 없다: 칸 이름이 생기기 전의 옛 형식일 수 있으니, 그 시스템이 통째에서 자기 몫을 찾게 한다
          const old = s.legacy?.(w);
          if (old !== undefined) s.load(old);
        }
      } catch (err) { console.error(`[game] 월드 저장의 '${s.name}' 칸을 읽지 못했습니다:`, err); }
    }
  }
}
