// 던전: 문에서 들어가면 그 사람(과 파티)만의 인스턴스가 생긴다. 같은 지형을 여러 무리가 동시에 쓰지만
// 층(Ent.layer)이 달라 서로 보이지 않고 싸우지 않는다. 우두머리를 잡으면 보상을 받고 밖으로 나온다.
// 제한 시간을 넘기거나 모두 나가면 인스턴스는 사라진다. 내용과 수치는 shared/content/dungeons.ts에 있다.
import { DUNGEONS, PORTAL_REACH, dungeonDef, isDungeonId, runKey, type DungeonDef, type DungeonId } from '../../../shared/defs';
import { resolve } from '../../../shared/sim';
import { AREAS, areaAt } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

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
}

export class Dungeon {
  private runs = new Map<number, Run>();
  private of = new Map<number, Run>();
  private nextLayer = 1;

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
    g.on('playerDropped', (p) => this.leave(p, false));
    g.on('playerLeft', (id) => { const run = this.of.get(id); if (run) { run.members.delete(id); this.of.delete(id); } });
    // 서버가 꺼졌다 켜진 경우처럼 인스턴스 없이 던전 안에 있으면 문 앞으로 내보낸다
    g.on('playerJoined', (p) => { if (!this.of.has(p.id)) this.outside(p); });

    // 던전 안에서 쓰러지면 던전 입구에서 다시 일어난다
    const respawn = g.rules.respawn;
    g.rules.respawn = (p) => { const run = this.of.get(p.id); return run ? { x: run.def.entry.x, z: run.def.entry.z, id: run.id } : respawn(p); };
  }

  /** 그 사람이 들어가 있는 던전 (없으면 undefined) */
  runOf(p: Ent): { id: DungeonId; left: number; foes: number; cleared: boolean } | undefined {
    const run = this.of.get(p.id);
    return run && { id: run.id, left: run.left, foes: run.mobs.size, cleared: run.cleared };
  }

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
    this.move(p, at.x + 1.5, at.z + 1.5, 0);
  }

  enter(p: Ent, id: DungeonId): void {
    const g = this.g, def = dungeonDef(id);
    if (this.of.has(p.id) || p.layer !== 0) return;
    if (dist(p, def.portal) > PORTAL_REACH) { g.notify(p, 'dungeonFar'); return; }
    if (p.lv < def.minLv) { g.notify(p, 'dungeonLevel', def.minLv); return; }
    g.daily.roll(p); // 날이 바뀌었으면 입장 횟수도 새로 센다
    const key = runKey(id), used = p.daily.prog[key] ?? 0;
    if (used >= def.perDay) { g.notify(p, 'dungeonNoRuns'); return; }

    // 파티원이 이미 들어가 있는 인스턴스가 있으면 거기로 합류한다
    let run = g.party.mates(p).map((m) => this.of.get(m.id)).find((r) => r && r.id === id && !r.cleared);
    if (!run) run = this.create(id, def);
    p.daily.prog[key] = used + 1;
    p.metaDirty = true; p.unsaved = true;
    run.members.add(p.id);
    this.of.set(p.id, run);
    this.move(p, def.entry.x + (Math.random() - 0.5) * 2, def.entry.z + (Math.random() - 0.5) * 2, run.layer);
    g.notify(p, 'dungeonEnter', id);
    this.tell(run);
  }

  private create(id: DungeonId, def: DungeonDef): Run {
    const g = this.g, layer = this.nextLayer++;
    const run: Run = { id, def, layer, members: new Set(), mobs: new Set(), boss: 0, left: def.timeS, cleared: false, exit: 0, told: 0 };
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
      g.mail.send(p, 'dungeon', [run.id], run.def.reward);
      const rar = Math.max(run.def.dropRar, g.gear.roll(run.def.dropLv).rar);
      g.gear.give(p, g.gear.roll(run.def.dropLv, rar));
      g.notify(p, 'dungeonClear', run.id, run.def.exitS);
    }
    g.fire('dungeonCleared', run.id, this.players(run));
    this.tell(run);
  }

  /** 던전에서 나온다. 스스로 나오면(notify) 알려 준다 */
  leave(p: Ent, notify: boolean): void {
    const run = this.of.get(p.id);
    if (!run) return;
    run.members.delete(p.id);
    this.of.delete(p.id);
    this.move(p, run.def.portal.x + 1.5 + Math.random(), run.def.portal.z + 1.5 + Math.random(), 0);
    this.g.out.push({ id: p.id, msg: { t: 'dungeon', id: '', left: 0, foes: 0, cleared: false } });
    if (notify) this.g.notify(p, 'dungeonLeft');
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
      if (run.members.size === 0) { this.destroy(run); continue; }
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
    }
  }

  /** 열려 있는 인스턴스의 수 (시험과 지표용) */
  get count(): number { return this.runs.size; }
}

/** 던전 목록을 내용 정의에서 읽는다 (다른 시스템이 문 자리를 알아야 할 때) */
export const PORTALS = Object.entries(DUNGEONS).map(([id, d]) => ({ id, ...d.portal }));
