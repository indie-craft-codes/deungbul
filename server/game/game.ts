// 게임의 중심. 상태(엔티티, 시계)와 시스템들을 묶고, 시스템끼리 쓰는 공용 통로를 제공한다.
// 통신은 모른다: 밖으로 나갈 것은 outbox에 쌓아 두고 net 계층이 가져간다.
//
// 새 기능을 더하는 방법:
//   1. server/game/systems/에 시스템 파일을 만든다.
//   2. 생성자에서 필요한 것을 등록한다: commands(플레이어 명령), on(사건 구독), mods(수치 보정),
//      ticks(주기 처리), saves(캐릭터 저장), worldSaves(월드 저장), shared(모두에게 보내는 공유 상태).
//   3. 아래 Game 생성자에 한 줄 추가한다.
import { SPAWN, type RaidConfig } from '../../shared/defs';
import type { MsgArg, MsgKey } from '../../shared/messages';
import { NavGrid } from '../../shared/nav';
import type { Ev, Kind, WorldState, ServerMsg } from '../../shared/protocol';
import { resolve } from '../../shared/sim';
import { PLAYER_SPEED, buildWorld } from '../../shared/world';
import type { WorldSave } from '../store';
import type { Ent } from './entity';
import { Boss } from './systems/boss';
import { Away } from './systems/away';
import { Bots } from './systems/bots';
import { Build } from './systems/build';
import { Classes } from './systems/classes';
import { Combat } from './systems/combat';
import { Craft } from './systems/craft';
import { Daily } from './systems/daily';
import { Dungeon } from './systems/dungeon';
import { GearSys } from './systems/gear';
import { Guild } from './systems/guild';
import { Idle } from './systems/idle';
import { MailSys } from './systems/mail';
import { Market } from './systems/market';
import { Rank } from './systems/rank';
import { Keepers } from './systems/keepers';
import { Monsters } from './systems/monsters';
import { Party } from './systems/party';
import { Movement } from './systems/movement';
import { Players } from './systems/players';
import { Quests } from './systems/quests';
import { Raid } from './systems/raid';
import { Shop } from './systems/shop';
import { Tower } from './systems/tower';

/** 한 틱에 길찾기가 살펴볼 수 있는 칸의 수. 넘으면 그 틱의 나머지 길찾기는 곧장 가는 길로 대신한다 (길 없는 곳을 찍어 서버를 멈추지 못하게) */
const NAV_VISITS_PER_TICK = 12000;

/** 플레이어 명령 처리기. msg는 검증되지 않은 입력이므로 처리기가 직접 확인한다. */
export type Command = (p: Ent, msg: Record<string, unknown>) => void;

/** 시스템끼리 주고받는 사건 */
export interface Hooks {
  monsterKilled: (m: Ent, hitters: Ent[]) => void;
  playerDied: (p: Ent) => void;
  playerLeft: (id: number) => void;
  /** 불씨를 바쳤다 */
  offered: (p: Ent, to: 'tower' | 'resident', n: number, tower: number) => void;
  /** 상점에서 물건을 샀다 */
  bought: (p: Ent, item: string) => void;
  /** 사람이 접속했다 (봇은 제외) */
  playerJoined: (p: Ent) => void;
  /** 주민이 마을로 돌아왔다 */
  residentReturned: (id: string) => void;
  /** 습격을 막아 냈다: 맞서 싸운 사람들 */
  raidWon: (fighters: Ent[]) => void;
  /** 접속이 끊겼다: 저장하기 전에 불린다 (인스턴스에서 내보내는 데 쓴다) */
  playerDropped: (p: Ent) => void;
  /** 던전을 끝냈다: 던전 id와 안에 있던 사람들 */
  dungeonCleared: (id: string, players: Ent[]) => void;
  /** 장비 강화를 시도했다 (성공이든 실패든) */
  enhanced: (p: Ent) => void;
}

/**
 * 게임마다 다른 규칙이 끼어드는 자리. 기본값은 '그런 규칙이 없다'이고, 그 규칙을 가진 시스템이 덮어쓴다
 * (이 게임에서는 등탑과 습격). 이동·전투·상점 같은 틀은 등탑을 직접 알지 않고 여기만 본다.
 */
export interface Rules {
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
}

/** 캐릭터 저장의 한 칸. 시스템이 자기 몫을 직접 쓰고 읽는다 (PlayerSave.ext[name]) */
export interface Saver { name: string; save: (p: Ent) => unknown; load: (p: Ent, raw: unknown) => void }

/** 수치 보정. 여러 시스템이 같은 수치에 보정을 걸 수 있다 (주민 혜택, 나중의 장비와 버프). */
export type ModName = 'damage' | 'guard' | 'regen' | 'sparkBonus' | 'crit' | 'hp' | 'exp';
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

export interface GameOptions {
  /** 습격 설정 덮어쓰기 (시험용) */
  raid?: Partial<RaidConfig>;
  /** 현재 시각(ms). 시험에서 시간을 다루려고 바꿀 수 있다 */
  now?: () => number;
}

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
  readonly worldSaves: { name: string; save: () => unknown; load: (raw: unknown) => void }[] = [];
  /** 모두에게 보내는 공유 상태의 한 칸 (WorldState[name]) */
  readonly shared: { name: keyof WorldState; state: () => unknown }[] = [];
  /** 캐릭터와 함께 저장할 것을 가진 시스템들 */
  readonly saves: Saver[] = [];
  private hooks: { [K in keyof Hooks]: Hooks[K][] } = { monsterKilled: [], playerDied: [], playerLeft: [], offered: [], bought: [], playerJoined: [], residentReturned: [], raidWon: [], enhanced: [], playerDropped: [], dungeonCleared: [] };
  private nextId = 1;

  // ---- 시스템 ----
  readonly movement: Movement;
  readonly players: Players;
  readonly combat: Combat;
  readonly monsters: Monsters;
  readonly bots: Bots;
  readonly away: Away;
  readonly tower: Tower;
  readonly raid: Raid;
  readonly quests: Quests;
  readonly shop: Shop;
  readonly classes: Classes;
  readonly keepers: Keepers;
  readonly boss: Boss;
  readonly craft: Craft;
  readonly party: Party;
  readonly gear: GearSys;
  readonly mail: MailSys;
  readonly idle: Idle;
  readonly daily: Daily;
  readonly rank: Rank;
  readonly dungeon: Dungeon;
  readonly build: Build;
  readonly market: Market;
  readonly guild: Guild;

  constructor(opts: GameOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.movement = new Movement(this);
    this.players = new Players(this);
    this.combat = new Combat(this);
    this.monsters = new Monsters(this);
    this.bots = new Bots(this);
    this.away = new Away(this);
    this.tower = new Tower(this);
    this.raid = new Raid(this, opts.raid);
    this.quests = new Quests(this);
    this.shop = new Shop(this);
    this.classes = new Classes(this);
    this.keepers = new Keepers(this);
    this.boss = new Boss(this);
    this.craft = new Craft(this);
    this.party = new Party(this);
    this.gear = new GearSys(this);
    this.mail = new MailSys(this);
    this.idle = new Idle(this);
    this.daily = new Daily(this);
    this.rank = new Rank(this);
    this.dungeon = new Dungeon(this);
    this.build = new Build(this);
    this.market = new Market(this);
    this.guild = new Guild(this);
  }

  // ---- 시스템이 쓰는 공용 통로 ----
  on<K extends keyof Hooks>(name: K, fn: Hooks[K]): void { (this.hooks[name] as Hooks[K][]).push(fn); }
  fire<K extends keyof Hooks>(name: K, ...args: Parameters<Hooks[K]>): void {
    for (const fn of this.hooks[name]) (fn as (...a: Parameters<Hooks[K]>) => void)(...args);
  }
  emit(ev: Ev): void { this.events.push(ev); }
  notify(p: Ent, k: MsgKey, ...a: MsgArg[]): void { if (!p.bot) this.notices.push({ id: p.id, k, a }); }
  announce(k: MsgKey, ...a: MsgArg[]): void { this.announces.push({ k, a }); }

  /** 엔티티를 만들어 월드에 넣는다. 세부 값은 부른 쪽이 채운다. */
  create(kind: Kind, type: string, name: string, x: number, z: number, hp: number): Ent {
    const e: Ent = {
      id: this.nextId++, kind, type, name, x, z, face: 0, tx: x, tz: z, moving: false, stuck: 0, lastMove: -99, path: null, pgx: x, pgz: z, pat: 0,
      hp, maxHp: hp, dead: false, layer: 0, targetId: 0, atkCd: 0, lastHurt: -99, wait: 0,
      bot: false, pid: '', guild: '', auto: false, lv: 1, exp: 0, need: 60, sparks: 0, cds: [], contrib: 0, dirty: false, unsaved: false, qc: 0, qs: 0, qn: 0, questDirty: false, tier: 0, cls: '', gold: 0, weapon: '', armor: '', items: {}, itemCd: 0, rested: 0,
      gear: [], worn: {}, gearSeq: 0, mail: [], mailSeq: 0, daily: { day: '', prog: {}, got: [], streak: 0, last: '' }, offMs: 0, metaDirty: false, stats: {}, skillLv: {},
      def: null, hx: x, hz: z, respawn: 0, hitters: new Set(), raid: false, scale: 0, cast: 0, windup: 0, slowUntil: 0, homing: false,
    };
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
    if (typeof msg.t === 'string') this.commands.get(msg.t)?.(p, msg);
  }

  tick(dt: number): void {
    this.clock += dt;
    this.nav.budget = NAV_VISITS_PER_TICK; // 길찾기가 한 틱에 쓸 수 있는 양 (shared/nav.ts)
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
    // 예전 형식({ glow, residents })으로 저장된 파일은 통째로 등탑의 몫이다
    const legacy = !('tower' in w);
    for (const s of this.worldSaves) {
      // 한 칸이 깨져 있어도 서버는 떠야 한다: 그 칸만 처음 상태로 둔다
      try {
        if (s.name in w) s.load(w[s.name]);
        else if (legacy && s.name === 'tower') s.load(w);
      } catch (err) { console.error(`[game] 월드 저장의 '${s.name}' 칸을 읽지 못했습니다:`, err); }
    }
  }
}
