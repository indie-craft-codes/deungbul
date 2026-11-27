// 던전: 문에서 들어가면 그 사람(과 파티)만의 인스턴스가 생긴다. 같은 지형을 여러 무리가 동시에 쓰지만
// 층(Ent.layer)이 달라 서로 보이지 않고 싸우지 않는다. 우두머리를 잡으면 보상을 받고 밖으로 나온다.
// 제한 시간을 넘기거나 모두 나가면 인스턴스는 사라진다. 내용과 수치는 games/deungbul/shared/content/dungeons.ts에 있다.
import { DUNGEON_TABLE, ECON_HUNT, PORTAL_REACH, clearRar, dungeonDef, dungeonSweepable, hasDungeonKeys, isDungeonId, menuDungeons, runKey, sweepMax, type DungeonDef, type DungeonId, type KeysMe } from '../../../shared/defs';
import { resolve } from '../../../shared/sim';
import { AREAS, areaAt } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { fieldLayer, instanceLayer, isField } from '../layers';
import { leaderFight } from './leader';
import { SWEEP_WHY, costCheck, costPay, costProblem, giveInto, sweepGot } from './sweep';

interface Run {
  id: DungeonId; def: DungeonDef; layer: number;
  members: Set<number>;
  mobs: Set<number>; boss: number;
  /** 남은 제한 시간(초) */
  left: number;
  cleared: boolean;
  /** 끝낸 뒤 밖으로 나가기까지 남은 시간(초) */
  exit: number;
  /** 상태를 마지막으로 알린 뒤 흐른 시간 */
  told: number;
  /** 자동 전투(DungeonDef.auto)의 생각 간격 */
  think: number;
}

/** 던전 안에서 접속이 끊긴 사람의 회차를 남겨 두는 시간(초) */
export const DUNGEON_HOLD_S = 120;

export class Dungeon {
  private runs = new Map<number, Run>();
  private of = new Map<number, Run>();
  /** 접속이 끊긴 사람(pid)이 돌아갈 회차. DUNGEON_HOLD_S 안에 다시 접속하면 같은 회차로 */
  private held = new Map<string, { run: Run; home: number; until: number }>();
  /** 안에 있는 사람이 들어오기 전에 있던 들판의 층(채널). 나갈 때 그곳으로 돌려보낸다 */
  private back = new Map<number, number>();

  constructor(private g: Game) {
    g.ticks.push((dt) => this.tick(dt));
    g.commands.set('dungeon', (p, m) => { if (isDungeonId(m.id)) this.enter(p, m.id); });
    g.commands.set('dungeonLeave', (p) => this.leave(p, true));

    g.on('monsterKilled', (m) => {
      const run = this.runs.get(m.layer);
      if (!run) return;
      run.mobs.delete(m.id);
      g.remove(m.id); // 던전의 몬스터는 다시 나오지 않는다
      if (m.id === run.boss) this.clear(run);
      else this.tell(run);
    });
    // 접속이 끊기거나 나가면 던전에서도 나온다 (저장되는 자리는 문 앞이다)
    // 접속이 끊기면 문 앞으로 내보내되, 끝나지 않은 회차는 잠시 그 사람의 자리로 남겨 둔다: 곧 다시 접속하면 같은 회차로 돌아간다
    // (끊길 때마다 하루 횟수와 우두머리에게 깎아 둔 진행이 날아갔다: 후반부 검토). 보상은 우두머리를 잡을 때 안에 있는 사람만 받는다
    g.on('playerDropped', (p) => {
      const run = this.of.get(p.id);
      if (run && !run.cleared && p.pid) this.held.set(p.pid, { run, home: this.back.get(p.id) ?? fieldLayer(1), until: g.clock + DUNGEON_HOLD_S });
      this.leave(p, false, 'drop');
    });
    g.on('playerLeft', (id) => { this.back.delete(id); const run = this.of.get(id); if (run) { run.members.delete(id); this.of.delete(id); } });
    // 서버가 꺼졌다 켜진 경우처럼 인스턴스 없이 던전 안에 있으면 문 앞으로 내보낸다
    g.on('playerJoined', (p) => {
      const h = p.pid ? this.held.get(p.pid) : undefined;
      if (h) this.held.delete(p.pid);
      if (h && g.clock <= h.until && this.runs.get(h.run.layer) === h.run && !h.run.cleared) { this.rejoin(p, h.run, h.home); return; }
      if (!this.of.has(p.id)) this.outside(p);
    });

    // 던전 안에서 쓰러지면 던전 입구에서 다시 일어난다
    const respawn = g.rules.respawn;
    g.rules.respawn = (p) => { const run = this.of.get(p.id); return run ? { x: run.def.entry.x, z: run.def.entry.z, id: run.id } : respawn(p); };

    // 입장 열쇠 (DungeonDef.key): 열쇠를 쓰는 던전이 있는 게임에만 저장 칸·개인 상태·명령이 생긴다 (하루 횟수만 쓰는 게임은 예전과 글자까지 같다)
    if (hasDungeonKeys()) {
      g.commands.set('dungeonKey', (p, m) => { if (isDungeonId(m.id)) this.buyKey(p, m.id); });
      g.saves.push({ name: 'keys', save: (p) => this.keysOf(p), load: (p, raw) => this.loadKeys(p, raw) });
      g.personal.push({ name: 'keys', state: (p): KeysMe => { this.refill(p); return Object.fromEntries([...this.keyIds].map((id) => { const k = this.keyState(p, id); return [id, k.won ? { n: k.n, bought: k.bought, won: true } : { n: k.n, bought: k.bought }]; })); } });
      g.on('playerLeft', (id) => { this.keys.delete(id); });
      // 소탕 (DungeonDef.sweep): 소탕할 수 있는 던전이 있는 게임에만 명령이 생긴다
      if (Object.keys(DUNGEON_TABLE).some(dungeonSweepable)) {
        for (const id of Object.keys(DUNGEON_TABLE)) { const bad = costProblem(g, DUNGEON_TABLE[id].sweep?.cost, `[dungeon] DUNGEONS.${id}.sweep`); if (bad) throw new Error(bad); }
        g.commands.set('dungeonSweep', (p, m) => { if (isDungeonId(m.id)) this.sweep(p, m.id, m.n); });
      }
    }
    // 메뉴에서 바로 들어가기 (DungeonDef.fromMenu): 그런 던전이 있는 게임에만 명령이 생긴다
    if (menuDungeons().length) g.commands.set('dungeonGo', (p, m) => { if (isDungeonId(m.id)) this.go(p, m.id); });
  }

  /**
   * 메뉴에서 바로 들어간다 (DungeonDef.fromMenu): 들판이나 단계 안에서. 들어갈 수 있는지(레벨, 열쇠·하루 횟수) 먼저 보고, 안 되면 아무것도 바뀌지 않는다
   * (단계에서도 나오지 않는다). 되면 단계 안이면 단계에서 나와(들어오기 전의 자리), 그 던전의 문 앞으로 옮겨 문에서처럼 들어간다
   */
  go(p: Ent, id: DungeonId): void {
    const g = this.g, def = dungeonDef(id);
    if (p.bot || !def.fromMenu || this.of.has(p.id)) return;
    const staged = g.has('stages') && g.stages.inStage(p);
    if (!staged && !isField(p.layer)) return;
    if (!this.allowed(p, id, def)) return;
    if (staged) g.stages.leave(p, false);
    this.move(p, def.portal.x + 1.5, def.portal.z + 1.5, p.layer);
    this.enter(p, id);
  }

  // ---------- 입장 열쇠 ----------
  /** 열쇠를 쓰는 던전들 */
  private readonly keyIds = new Set(Object.entries(DUNGEON_TABLE).filter(([, d]) => !!d.key).map(([id]) => id));
  /** 사람(엔티티 id) → 던전마다의 열쇠: 가진 수, 오늘 산 수, 마지막으로 채운 날, 끝낸 적이 있는가 (소탕의 조건) */
  private readonly keys = new Map<number, Record<string, { n: number; bought: number; day: string; won?: boolean }>>();
  /** 그 사람의 그 던전의 열쇠 (처음이면 만든다: 그날 처음 채울 때 min(refill, cap)) */
  private keyState(p: Ent, id: string): { n: number; bought: number; day: string; won?: boolean } {
    let all = this.keys.get(p.id);
    if (!all) this.keys.set(p.id, all = {});
    return all[id] ??= { n: 0, bought: 0, day: '' };
  }
  /** 그 열쇠 던전을 끝낸 적이 있는가 (소탕할 수 있는가의 조건) */
  won(p: Ent, id: string): boolean { return this.keyIds.has(id) && !!this.keyState(p, id).won; }

  /**
   * 열쇠 던전을 n번 소탕한다 (DungeonDef.sweep): 끝낸 적이 있어야 하고, 열쇠 n개와 값(cost × n)을 쓴다.
   * 보상은 끝냈을 때의 것(reward와, gear가 false가 아니면 장비)을 n번, 우편이 아니라 지갑·가방으로 바로 준다(원인 sweep). 받은 것의 합을 돌려준다 (안 되면 null)
   */
  sweep(p: Ent, id: DungeonId, n: unknown): ReturnType<typeof sweepGot> | null {
    const g = this.g, def = dungeonDef(id);
    if (p.bot || !dungeonSweepable(id) || typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > sweepMax(def.sweep)) return null;
    if (!this.won(p, id) || g.field(p, 'lv') < def.minLv) { g.notify(p, 'sweepLocked', 'dungeon', id); return null; }
    const k = this.keyState(p, id);
    if (this.keyCount(p, id) < n) { g.notify(p, 'dungeonNoKeys', id); return null; }
    if (!costCheck(g, p, def.sweep!.cost, n) || !costPay(g, p, def.sweep!.cost, n, 'cmd:dungeonSweep')) return null;
    k.n -= n;
    const got = sweepGot('dungeon', id, n);
    for (let i = 0; i < n; i++) {
      giveInto(g, p, def.reward, SWEEP_WHY, got);
      if (def.gear !== false && g.has('gear')) { const rar = clearRar(def, g.gear.roll(def.dropLv).rar); g.gear.give(p, g.gear.roll(def.dropLv, rar), SWEEP_WHY); got.equip++; }
    }
    p.unsaved = true;
    g.notify(p, 'swept', 'dungeon', id, n);
    g.out.push({ id: p.id, msg: { t: 'sweep', got } });
    g.fire('swept', p, 'dungeon', id, n);
    return got;
  }
  /** 날이 바뀌었으면 열쇠를 채운다: 하루가 지날 때마다 refill개, cap을 넘지 않게 (산 것으로 cap 위에 있으면 그대로). 산 수는 새로 센다 */
  private refill(p: Ent): void {
    const today = this.g.time.dayOf(this.g.now());
    for (const id of this.keyIds) {
      const k = this.keyState(p, id), def = dungeonDef(id).key!;
      if (k.day === today) continue;
      const days = k.day ? Math.max(1, Math.round((Date.parse(today) - Date.parse(k.day)) / 86400000)) : 1;
      if (k.n < def.cap) k.n = Math.min(def.cap, k.n + def.refill * days);
      k.day = today; k.bought = 0;
      p.unsaved = true;
    }
  }
  /** 가진 열쇠 (날이 바뀌었으면 채운 뒤) */
  keyCount(p: Ent, id: string): number { if (!this.keyIds.has(id)) return 0; this.refill(p); return this.keyState(p, id).n; }
  /** 열쇠를 더한다 (보상·운영으로 주는 것). cap을 넘어도 된다 */
  giveKeys(p: Ent, id: string, n: number): void {
    if (!this.keyIds.has(id) || !(n > 0)) return;
    this.refill(p);
    this.keyState(p, id).n += Math.floor(n);
    p.unsaved = true;
  }
  /** 재화를 내고 열쇠 하나를 산다 (DungeonDef.key.buy) */
  private buyKey(p: Ent, id: DungeonId): void {
    const g = this.g, def = dungeonDef(id).key, buy = def?.buy;
    if (!def || !buy) return;
    this.refill(p);
    const k = this.keyState(p, id);
    if (k.bought >= buy.perDay) { g.notify(p, 'dungeonKeyLimit', id); return; }
    if (!g.wallet.take(p, buy.cur, buy.cost, 'cmd:dungeonKey')) { g.notify(p, 'costShort', buy.cur); return; }
    k.n++; k.bought++;
    p.unsaved = true;
    g.notify(p, 'dungeonKeyBought', id, k.n);
  }
  private keysOf(p: Ent): Record<string, [number, number, string] | [number, number, string, 1]> | undefined {
    const all = this.keys.get(p.id);
    if (!all) return undefined;
    const out: Record<string, [number, number, string] | [number, number, string, 1]> = {};
    // 끝낸 적이 있으면 넷째 칸 1 (소탕의 조건). 없으면 예전처럼 셋
    for (const [id, k] of Object.entries(all)) if (this.keyIds.has(id)) out[id] = k.won ? [k.n, k.bought, k.day, 1] : [k.n, k.bought, k.day];
    return Object.keys(out).length ? out : undefined;
  }
  private loadKeys(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!this.keyIds.has(id) || !Array.isArray(v)) continue;
      const int = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(9999, Math.floor(x))) : 0);
      const k = this.keyState(p, id);
      k.n = int(v[0]); k.bought = int(v[1]); k.day = typeof v[2] === 'string' ? v[2].slice(0, 10) : '';
      if (v[3] === 1) k.won = true;
    }
  }

  /** 그 사람이 들어가 있는 던전 (없으면 undefined) */
  runOf(p: Ent): { id: DungeonId; left: number; foes: number; cleared: boolean } | undefined {
    const run = this.of.get(p.id);
    return run && { id: run.id, left: run.left, foes: run.mobs.size, cleared: run.cleared };
  }

  /** 던전 안에 있는 사람이 나가면 돌아갈 들판의 층 (밖에 있으면 undefined). 채널의 인원을 셀 때 쓴다 */
  homeOf(p: Ent): number | undefined { return this.back.get(p.id); }

  private move(p: Ent, x: number, z: number, layer: number): void {
    const g = this.g;
    p.layer = layer; p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.path = null; p.targetId = 0;
    resolve(p, g.world.obstacles);
    g.emit(['r', p.id]); // 클라이언트가 새 자리로 바로 옮긴다
    for (const e of g.ents.values()) {
      if (e.kind === 'm') { e.hitters.delete(p.id); if (e.targetId === p.id) e.targetId = 0; }
    }
  }

  /** 던전 지역 안에 있는데 인스턴스가 없으면 그 던전의 문 앞으로 옮긴다 */
  private outside(p: Ent): void {
    const area = AREAS[areaAt(p.x, p.z)];
    if (!area || !isDungeonId(area.id)) return;
    const at = dungeonDef(area.id).portal;
    this.move(p, at.x + 1.5, at.z + 1.5, fieldLayer(1)); // 어느 채널에 설지는 접속 처리(채널 시스템)가 이어서 정한다
  }

  enter(p: Ent, id: DungeonId): void {
    const g = this.g, def = dungeonDef(id);
    if (this.of.has(p.id) || !isField(p.layer)) return;
    if (dist(p, def.portal) > PORTAL_REACH) { g.notify(p, 'dungeonFar'); return; }
    if (!this.allowed(p, id, def)) return;
    if (def.key) {
      // 열쇠를 쓰는 던전: 하루 횟수 대신 열쇠 하나 (DungeonDef.key)
      this.keyState(p, id).n--;
      p.unsaved = true;
    } else {
      const key = runKey(id);
      p.daily.prog[key] = (p.daily.prog[key] ?? 0) + 1;
      p.metaDirty = true; p.unsaved = true;
    }

    // 파티원이 이미 들어가 있는 인스턴스가 있으면 거기로 합류한다
    // (파티 모듈이 없는 게임에는 파티원이 없다)
    const mates = g.has('party') ? g.party.mates(p) : [];
    let run = mates.map((m) => this.of.get(m.id)).find((r) => r && r.id === id && !r.cleared);
    if (!run) run = this.create(id, def);
    run.members.add(p.id);
    this.of.set(p.id, run);
    this.back.set(p.id, p.layer);
    this.move(p, def.entry.x + (Math.random() - 0.5) * 2, def.entry.z + (Math.random() - 0.5) * 2, run.layer);
    g.notify(p, 'dungeonEnter', id);
    // 아직 같은 인스턴스에 없는 파티원에게 알린다: 모르고 밖에 남거나 따로 들어가지 않게 (문에서 들어가면 여기로 합류한다)
    for (const m of mates) if (this.of.get(m.id) !== run) g.notify(m, 'dungeonMate', p.name, id);
    this.tell(run);
  }

  /** 들어갈 수 있는가 (레벨, 열쇠나 오늘의 횟수): 안 되면 까닭을 알리고 false. 아무것도 쓰지 않는다 */
  private allowed(p: Ent, id: DungeonId, def: DungeonDef): boolean {
    const g = this.g;
    if (g.field(p, 'lv') < def.minLv) { g.notify(p, 'dungeonLevel', def.minLv); return false; }
    if (def.key) {
      if (this.keyCount(p, id) <= 0) { g.notify(p, 'dungeonNoKeys', id); return false; }
      return true;
    }
    g.daily.roll(p); // 날이 바뀌었으면 입장 횟수도 새로 센다
    if ((p.daily.prog[runKey(id)] ?? 0) >= def.perDay) { g.notify(p, 'dungeonNoRuns'); return false; }
    return true;
  }

  private create(id: DungeonId, def: DungeonDef): Run {
    const g = this.g, layer = instanceLayer(g);
    const run: Run = { id, def, layer, members: new Set(), mobs: new Set(), boss: 0, left: def.timeS, cleared: false, exit: 0, told: 0, think: 0 };
    const spawn = (type: string, x: number, z: number) => {
      const m = g.monsters.spawn(type as Parameters<typeof g.monsters.spawn>[0], x, z);
      m.layer = layer;
      run.mobs.add(m.id);
      return m;
    };
    for (const pack of def.packs) {
      for (let i = 0; i < pack.n; i++) {
        const a = (i / pack.n) * Math.PI * 2, r = 1.5 + (i % 2) * 1.5;
        spawn(pack.type, pack.x + Math.cos(a) * r, pack.z + Math.sin(a) * r);
      }
    }
    run.boss = spawn(def.boss.type, def.boss.x, def.boss.z).id;
    this.runs.set(layer, run);
    return run;
  }

  private players(run: Run): Ent[] {
    const out: Ent[] = [];
    for (const id of run.members) { const p = this.g.ents.get(id); if (p) out.push(p); }
    return out;
  }

  /** 우두머리를 잡았다: 안에 있는 사람 모두 보상을 받고, 잠시 뒤 밖으로 나간다 */
  private clear(run: Run): void {
    const g = this.g;
    run.cleared = true; run.exit = run.def.exitS;
    for (const p of this.players(run)) {
      if (run.def.key && !this.keyState(p, run.id).won) { this.keyState(p, run.id).won = true; p.unsaved = true; } // 소탕의 조건 (열쇠 던전만)
      g.mail.send(p, 'dungeon', [run.id], run.def.reward);
      if (run.def.gear !== false) {
        const rar = clearRar(run.def, g.gear.roll(run.def.dropLv).rar);
        g.gear.give(p, g.gear.roll(run.def.dropLv, rar), ECON_HUNT.inst);
      }
      g.notify(p, 'dungeonClear', run.id, run.def.exitS);
    }
    g.fire('dungeonCleared', run.id, this.players(run));
    this.tell(run);
  }

  /** 끊겼다 곧 돌아온 사람을 남겨 둔 회차로 들여보낸다 (하루 횟수는 이미 셌다) */
  private rejoin(p: Ent, run: Run, home: number): void {
    run.members.add(p.id);
    this.of.set(p.id, run);
    this.back.set(p.id, home);
    this.move(p, run.def.entry.x + (Math.random() - 0.5) * 2, run.def.entry.z + (Math.random() - 0.5) * 2, run.layer);
    this.g.notify(p, 'dungeonBack', run.id);
    this.tell(run);
  }

  /** 던전에서 나온다. 스스로 나오면(notify) 알려 준다. why는 사건 dungeonExited에 넘기는 까닭 (기본: 알리면 self, 아니면 end) */
  leave(p: Ent, notify: boolean, why: 'self' | 'end' | 'drop' = notify ? 'self' : 'end'): void {
    const run = this.of.get(p.id);
    if (!run) return;
    run.members.delete(p.id);
    this.of.delete(p.id);
    const home = this.back.get(p.id) ?? fieldLayer(1);
    this.back.delete(p.id);
    this.move(p, run.def.portal.x + 1.5 + Math.random(), run.def.portal.z + 1.5 + Math.random(), home);
    this.g.out.push({ id: p.id, msg: { t: 'dungeon', id: '', left: 0, foes: 0, cleared: false } });
    if (notify) this.g.notify(p, 'dungeonLeft');
    this.g.fire('dungeonExited', p, run.id, why);
  }

  private destroy(run: Run): void {
    for (const p of this.players(run)) this.leave(p, false);
    for (const id of run.mobs) this.g.remove(id);
    this.runs.delete(run.layer);
  }

  /** 안에 있는 사람들에게 남은 시간과 적의 수를 알린다 */
  private tell(run: Run): void {
    run.told = 0;
    for (const id of run.members) this.g.out.push({ id, msg: { t: 'dungeon', id: run.id, left: Math.ceil(run.cleared ? run.exit : run.left), foes: run.mobs.size, cleared: run.cleared } });
  }

  tick(dt: number): void {
    for (const run of [...this.runs.values()]) {
      if (run.members.size === 0 && !this.waiting(run)) { this.destroy(run); continue; }
      if (run.cleared) {
        run.exit -= dt;
        if (run.exit <= 0) { this.destroy(run); continue; }
      } else {
        run.left -= dt;
        if (run.left <= 0) {
          for (const p of this.players(run)) this.g.notify(p, 'dungeonFail');
          this.destroy(run);
          continue;
        }
      }
      run.told += dt;
      if (run.told >= 5) this.tell(run); // 시계가 어긋나지 않게 가끔 다시 알린다
      if (run.def.auto && !run.cleared) this.autoFight(run, dt);
    }
  }

  /** 자동 전투 던전(DungeonDef.auto): 안에 있는 사람(봇 말고)을 서버가 대신 싸우게 한다 (단계의 leaderAuto와 같은 셈: systems/leader.ts) */
  private autoFight(run: Run, dt: number): void {
    run.think -= dt;
    if (run.think > 0) return;
    run.think = 0.3;
    for (const p of this.players(run)) if (!p.bot && p.hp > 0) leaderFight(this.g, p, run.mobs);
  }

  /** 끊긴 사람이 돌아오기를 기다리는 회차인가 (기다림이 지난 것은 지운다) */
  private waiting(run: Run): boolean {
    let any = false;
    for (const [pid, h] of this.held) {
      if (h.until < this.g.clock || this.runs.get(h.run.layer) !== h.run) this.held.delete(pid);
      else if (h.run === run) any = true;
    }
    return any;
  }

  /** 열려 있는 인스턴스의 수 (시험과 지표용) */
  get count(): number { return this.runs.size; }
}

/** 던전 목록을 내용 정의에서 읽는다 (다른 시스템이 문 자리를 알아야 할 때) */
export const PORTALS = Object.entries(DUNGEON_TABLE).map(([id, d]) => ({ id, ...d.portal }));
