// 안개 습격: 정해진 시각에 적이 물결로 나타나 등탑으로 몰려온다.
// 제한 시간 안에 다 막으면 밝기가 오르고, 등탑 내구가 다하거나 시간이 끝나면 밝기가 내려간다.
// 미리 불씨를 바쳐 밝기를 올려 두면 등탑 내구가 커져서 오래 버틴다.
// 채널이 여럿이면 등탑(내구와 밝기)은 하나이고 적은 채널마다 따로 온다: 등탑 근처에 사람이 있는 채널마다
// 그 인원에 맞는 적이 나오고, 어느 채널의 적이든 같은 내구를 깎으며, 모든 채널의 적을 다 쓰러뜨려야 막아 낸 것이다.
import { RAID, nextRaidAt, type RaidConfig, type RaidPhase } from '../../../shared/defs';
import type { WorldState } from '../../../shared/protocol';
import { TOWER } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { channelOf, isField, notifyLayer } from '../layers';

/** 한 층(채널)의 싸움: 올 적의 수, 나올 때가 된 수, 실제로 나온 수 */
interface Front {
  total: number; due: number; spawned: number;
  /** 이 층의 적을 다 쓰러뜨렸고, 다른 층에 적이 남았다고 알렸다 */
  told: boolean;
}

export class Raid {
  readonly cfg: RaidConfig;
  phase: RaidPhase = 'idle';
  /** 다음 습격 시작 시각(ms) */
  private startAt: number;
  /** 진행 중인 습격이 시작된 뒤 흐른 시간(초) */
  private t = 0;
  private wave = 0;
  /** 적이 오는 층(채널)마다의 싸움. 시작할 때 등탑 근처에 사람이 있던 층만 든다 */
  private fronts = new Map<number, Front>();
  /** 모든 층을 합친 수 */
  private total = 0;
  private spawned = 0;
  private towerHp = 0;
  private towerMaxHp = 0;
  /** 습격 적에게 피해를 준 사람들: 막아 내면 보상을 받는다 */
  private fighters = new Set<number>();
  private lastSecond = -1;

  constructor(private g: Game, override: Partial<RaidConfig> = {}) {
    g.rules.siege = TOWER; // 습격으로 온 적은 첫불 마을의 등탑으로 향한다
    g.ticks.push((dt) => this.tick(dt));
    g.shared.push({ name: 'raid', state: () => this.state() });
    this.cfg = { ...RAID, ...override };
    this.startAt = nextRaidAt(g.now(), this.cfg);
    g.on('monsterKilled', (m, hitters) => { if (m.raid) for (const p of hitters) this.fighters.add(p.id); });
    g.on('playerLeft', (id) => this.fighters.delete(id));
  }

  private foes(): Ent[] {
    const list: Ent[] = [];
    for (const e of this.g.ents.values()) if (e.raid && !e.dead) list.push(e);
    return list;
  }

  /**
   * 지금 바로 시작한다 (시각표와 무관). 개발과 시험용으로도 쓴다.
   * 등탑 근처에 사람이 아무도 없으면 열지 않는다: 막을 사람이 없는 습격으로 밝기를 깎지 않는다.
   */
  start(): void {
    if (this.phase === 'active') return;
    const g = this.g, c = this.cfg;
    // 봇은 세지 않는다: 적의 수는 실제로 맞설 사람의 수를 따른다. 채널마다 따로 센다 (던전 안의 사람은 세지 않는다)
    const people = new Map<number, number>();
    for (const e of g.ents.values()) if (e.kind === 'p' && !e.bot && isField(e.layer) && dist(e, TOWER) <= c.joinRadius) people.set(e.layer, (people.get(e.layer) ?? 0) + 1);
    if (people.size === 0) {
      this.phase = 'idle';
      this.startAt = nextRaidAt(g.now(), c);
      g.stateDirty = true;
      return;
    }
    // 막을 사람이 없는 채널에는 적을 만들지 않는다: 아무도 못 막는 적이 내구를 깎으면 안 된다
    this.fronts.clear(); this.total = 0;
    for (const [layer, n] of [...people].sort((a, b) => a[0] - b[0])) {
      const total = Math.min(c.max, c.base + c.perPlayer * n);
      this.fronts.set(layer, { total, due: 0, spawned: 0, told: false });
      this.total += total;
    }
    this.phase = 'active'; this.t = 0; this.wave = 0; this.spawned = 0; this.lastSecond = -1;
    // 내구는 하나지만 여러 채널의 적이 함께 깎으므로, 싸우는 채널 수만큼 키워서 채널이 하나일 때와 같은 시간을 버티게 한다
    this.towerMaxHp = this.towerHp = (c.towerHpBase + g.tower.glow * c.towerHpPerGlow) * this.fronts.size;
    this.fighters.clear();
    // 적의 수는 내 채널에 오는 수로 알린다. 적이 오지 않는 채널에 있으면 어느 채널로 가야 하는지 함께 알린다
    const first = channelOf(Math.min(...this.fronts.keys()));
    for (const p of g.ents.values()) {
      if (p.kind !== 'p') continue;
      const front = this.fronts.get(p.layer);
      g.notify(p, 'raidStart', front ? front.total : this.total);
      if (!front && isField(p.layer)) g.notify(p, 'raidElsewhere', first);
    }
    g.stateDirty = true;
  }

  /** 물결 하나의 때가 됐다: 층마다 남은 적을 남은 물결 수로 나눠 '나올 때가 된 수'에 더한다. 실제로 내보내는 것은 spawnDue다 */
  private spawnWave(): void {
    const wavesLeft = this.cfg.waveAtS.length - this.wave;
    for (const f of this.fronts.values()) f.due += wavesLeft <= 1 ? f.total - f.due : Math.ceil((f.total - f.due) / wavesLeft);
    this.wave++;
  }

  /**
   * 나올 때가 된 적을 내보낸다. 그 층에 지금 아무도 없으면 미뤄 둔다 (없애지는 않는다):
   * 물결이 올 때 채널을 비워서 적을 줄이는 수를 막고, 누군가 돌아오면 그때 나온다.
   */
  private spawnDue(): void {
    const g = this.g, c = this.cfg;
    for (const [layer, f] of this.fronts) {
      if (f.spawned >= f.due || g.monsters.asleep(layer)) continue;
      for (; f.spawned < f.due; f.spawned++, this.spawned++) {
        const a = Math.random() * Math.PI * 2, r = c.spawnRadius[0] + Math.random() * (c.spawnRadius[1] - c.spawnRadius[0]);
        const type = c.types[Math.floor(Math.random() * c.types.length)];
        g.monsters.spawn(type, TOWER.x + Math.cos(a) * r, TOWER.z + Math.sin(a) * r, true).layer = layer;
      }
    }
  }

  /** 그 층(채널)에 남은 적의 수: 살아 있는 적과 아직 나오지 않은 적. 습격 중이 아니거나 적이 오지 않는 층이면 0 */
  foesAt(layer: number): number {
    const f = this.phase === 'active' ? this.fronts.get(layer) : undefined;
    if (!f) return 0;
    let n = f.total - f.spawned;
    for (const e of this.g.ents.values()) if (e.raid && !e.dead && e.layer === layer) n++;
    return n;
  }

  private finish(won: boolean): void {
    const g = this.g, c = this.cfg;
    for (const m of this.foes()) g.remove(m.id); // 남은 적은 안개로 돌아간다
    const delta = g.tower.changeGlow(won ? c.winGlow : c.loseGlow);
    g.announce(won ? 'raidWon' : 'raidLost', delta);
    if (won) {
      const fighters: Ent[] = [];
      for (const id of this.fighters) {
        const p = g.ents.get(id);
        if (!p) continue;
        fighters.push(p);
        g.notify(p, 'raidReward', c.rewardSparks, c.rewardExp);
        g.players.grant(p, c.rewardExp, c.rewardSparks);
      }
      g.fire('raidWon', fighters);
    }
    this.fighters.clear();
    this.fronts.clear();
    this.phase = 'idle';
    this.startAt = nextRaidAt(g.now(), c);
    g.stateDirty = true;
  }

  tick(dt: number): void {
    const g = this.g, c = this.cfg;
    if (this.phase !== 'active') {
      const left = (this.startAt - g.now()) / 1000;
      if (left <= 0) { this.start(); return; }
      if (this.phase === 'idle' && left <= c.warnS) { this.phase = 'soon'; g.announce('raidSoon', Math.ceil(left)); g.stateDirty = true; }
      return;
    }
    this.t += dt;
    while (this.wave < c.waveAtS.length && this.t >= c.waveAtS[this.wave]) this.spawnWave();
    this.spawnDue();

    // 어느 층의 적이든 같은 내구를 깎는다. 아무도 없는 층의 적은 멈춰 있으므로 깎지 못한다
    const foes = this.foes(), alive = new Map<number, number>();
    for (const m of foes) {
      alive.set(m.layer, (alive.get(m.layer) ?? 0) + 1);
      if (!g.monsters.asleep(m.layer) && g.monsters.atTower(m)) this.towerHp -= c.drainPerS * dt;
    }
    if (this.towerHp <= 0) { this.towerHp = 0; this.finish(false); return; }
    // 모든 층의 적이 다 나왔고 다 쓰러져야 막아 낸 것이다
    if (this.spawned >= this.total && foes.length === 0) { this.finish(true); return; }
    if (this.t >= c.durationS) { this.finish(false); return; }
    // 내 채널의 적을 다 쓰러뜨렸는데 다른 채널에 남아 있으면, 어디로 가야 하는지 한 번 알린다
    for (const [layer, f] of this.fronts) {
      if (f.told || f.spawned < f.total || alive.has(layer)) continue;
      f.told = true;
      const other = [...this.fronts].find(([l, o]) => l !== layer && (o.spawned < o.total || alive.has(l)));
      if (other) notifyLayer(g, layer, 'raidElsewhere', channelOf(other[0]));
    }
    // 남은 시간과 적의 수를 1초마다 알린다
    const second = Math.floor(this.t);
    if (second !== this.lastSecond) { this.lastSecond = second; g.stateDirty = true; }
  }

  state(): WorldState['raid'] {
    const active = this.phase === 'active';
    const left = active ? this.cfg.durationS - this.t : (this.startAt - this.g.now()) / 1000;
    return {
      phase: this.phase, left: Math.max(0, Math.ceil(left)),
      foes: active ? this.foes().length + (this.total - this.spawned) : 0,
      towerHp: Math.ceil(this.towerHp), towerMaxHp: this.towerMaxHp,
    };
  }
}
