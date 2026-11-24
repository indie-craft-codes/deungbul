// 안개 습격: 정해진 시각에 적이 물결로 나타나 등탑으로 몰려온다.
// 제한 시간 안에 다 막으면 밝기가 오르고, 등탑 내구가 다하거나 시간이 끝나면 밝기가 내려간다.
// 미리 불씨를 바쳐 밝기를 올려 두면 등탑 내구가 커져서 오래 버틴다.
// 채널이 여럿이면 등탑(내구와 밝기)은 하나이고 적은 채널마다 따로 온다: 등탑 근처에 사람이 있는 채널마다
// 그 인원에 맞는 적이 나오고, 어느 채널의 적이든 같은 내구를 깎으며, 모든 채널의 적을 다 쓰러뜨려야 막아 낸 것이다.
//
// 인원은 '등탑 근처에 서 있는 사람'이 아니라 '최근에 스스로 움직인 사람'(Ent.lastAct, RAID.activeS)으로 센다:
//   - 시작할 때: 움직인 사람이 있는 채널에만 적이 온다. 아무도 움직이지 않았으면(혼자 기다리던 사람) 사람이 가장 많은 채널 하나에 1명 몫으로 연다.
//   - 물결마다: 그 채널의 인원을 다시 세어, 늘었으면 적도 늘린다. 줄이지는 않는다 (물결 직전에 가만히 서거나 자리를 떠서 적을 줄이는 수를 막는다).
//   - 버려진 채널: 막아야 할 적이 있는데 RAID.abandonS 동안 아무도 움직이지 않은 채널은 싸움을 끝낸다. 남은 적은 등탑을 한 번 치고 사라진다.
//     그 피해는 그 채널이 보탠 내구(전체 내구 ÷ 채널 수)를 넘지 않는다: 남이 방치한 채널 때문에, 자기 채널을 다 막은 사람들이 지지 않는다.
//     거저 사라지지도 않는다: 채널을 비워 적을 줄이면 그만큼 내구를 잃는다. 모든 채널이 버려졌으면 막아 낸 것이 아니다.
import { CHANNEL, RAID, nextRaidAt, raidFoes, raidTowerHp, type RaidConfig, type RaidPhase } from '@engine/shared/defs';
import type { WorldState } from '@engine/shared/protocol';
import { TOWER } from '@engine/shared/world';
import { dist, type Ent } from '@engine/server/game/entity';
import type { Game } from '@engine/server/game/game';
import { channelOf, isField, notifyLayer } from '@engine/server/game/layers';

/** 한 층(채널)의 싸움: 올 적의 수, 나올 때가 된 수, 실제로 나온 수 */
interface Front {
  total: number; due: number; spawned: number;
  /** 이 층의 적을 다 쓰러뜨렸고, 다른 층에 적이 남았다고 알렸다 */
  told: boolean;
  /** 막아야 할 적이 있는데 아무도 움직이지 않은 시간(초)과, 그것을 마지막으로 따진 시각 */
  idle: number; checked: number;
  /** 버려졌다: 남은 적을 거두고 이 층의 싸움을 끝냈다 */
  gone: boolean;
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
    // 채널 화면의 '채널별 남은 적'과 습격 중의 잦은 알림. 채널 시스템은 습격을 모르므로 여기서 채운다 (채널이 더 늦게 만들어져서 ready에 맡긴다)
    g.ready.push(() => {
      g.channels.extraFoes = () => (this.phase === 'active' ? Array.from({ length: CHANNEL.count }, (_, i) => this.foesAt(i)) : undefined);
      g.channels.busy = () => this.phase === 'active';
    });
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
    // 적의 수는 최근에 스스로 움직인 사람만 센다 (서 있기만 한 부계정은 세지 않고, 그런 캐릭터만 있는 채널에는 적을 만들지 않는다)
    let awake = this.awake();
    // 아무도 움직이지 않았어도 사람이 있으면 연다(혼자 기다리던 사람도 습격을 만난다): 사람이 가장 많은 채널 하나에, 1명 몫으로
    if (awake.size === 0 && people.size) awake = new Map([[[...people].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0], 1]]);
    if (people.size === 0) {
      this.phase = 'idle';
      this.startAt = nextRaidAt(g.now(), c);
      g.stateDirty = true;
      return;
    }
    // 막을 사람이 없는 채널에는 적을 만들지 않는다: 아무도 못 막는 적이 내구를 깎으면 안 된다
    this.fronts.clear(); this.total = 0;
    for (const [layer, n] of [...awake].sort((a, b) => a[0] - b[0])) {
      const total = raidFoes(n, c);
      this.fronts.set(layer, { total, due: 0, spawned: 0, told: false, idle: 0, checked: g.clock, gone: false });
      this.total += total;
    }
    this.phase = 'active'; this.t = 0; this.wave = 0; this.spawned = 0; this.lastSecond = -1;
    // 내구는 하나지만 여러 채널의 적이 함께 깎으므로, 싸우는 채널 수만큼 키워서 채널이 하나일 때와 같은 시간을 버티게 한다
    this.towerMaxHp = this.towerHp = raidTowerHp(g.tower.glow, c) * this.fronts.size;
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

  /** 층(채널)별로, 등탑 근처에서 최근에 스스로 움직인 사람의 수 (봇과 던전 안의 사람은 세지 않는다) */
  private awake(): Map<number, number> {
    const g = this.g, c = this.cfg, out = new Map<number, number>();
    for (const e of g.ents.values()) {
      if (e.kind === 'p' && !e.bot && isField(e.layer) && dist(e, TOWER) <= c.joinRadius && g.clock - e.lastAct <= c.activeS) out.set(e.layer, (out.get(e.layer) ?? 0) + 1);
    }
    return out;
  }

  /**
   * 물결이 올 때마다 인원을 다시 센다: 시작할 때는 아직 아무도 싸우지 않았으므로, 뒤늦게 싸우기 시작한 사람만큼 적을 늘린다.
   * 줄이지는 않는다: 줄어들 수 있으면 물결 직전에 다 같이 멈춰 서거나 채널을 옮겨 적을 줄이게 된다.
   */
  private regrow(): void {
    const c = this.cfg, awake = this.awake();
    for (const [layer, f] of this.fronts) {
      const want = raidFoes(awake.get(layer) ?? 0, c);
      if (f.gone || want <= f.total) continue;
      this.total += want - f.total;
      f.total = want;
    }
  }

  /**
   * 버려진 층의 싸움을 끝낸다: 남은 적(살아 있는 것과 아직 나오지 않은 것)은 등탑을 한 번 치고 사라진다.
   * 피해는 적 하나에 '혼자 온 채널의 적 수로 기본 내구를 나눈 값'이고, 그 층이 보탠 내구(전체 ÷ 층 수)를 넘지 않는다.
   * 넘지 않게 하는 이유: 한 사람이 다른 채널에서 습격을 열어 놓고 떠나도, 자기 채널을 지킨 사람들의 몫은 그대로 남는다.
   * 피해를 주는 이유: 거저 사라지면 싸우다 다 같이 다른 채널로 옮겨 적을 줄이는 수가 된다.
   */
  private abandon(layer: number, f: Front): void {
    const g = this.g, c = this.cfg;
    let rest = f.total - f.spawned;
    for (const m of this.foes()) if (m.layer === layer) { g.remove(m.id); rest++; }
    this.total -= f.total - f.spawned;
    f.total = f.due = f.spawned; f.gone = true;
    this.towerHp -= Math.min(this.towerMaxHp / this.fronts.size, rest * c.towerHpBase / (c.base + c.perPlayer));
    g.announce('raidAbandoned', channelOf(layer));
  }

  /** 물결 하나의 때가 됐다: 층마다 남은 적을 남은 물결 수로 나눠 '나올 때가 된 수'에 더한다. 실제로 내보내는 것은 spawnDue다 */
  private spawnWave(): void {
    const wavesLeft = this.cfg.waveAtS.length - this.wave;
    if (this.wave > 0) this.regrow();
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
    // 막아야 할 적이 있는데 아무도 움직이지 않는 층: 시간이 차면 버려진 것으로 본다 (다음 물결을 기다리며 서 있는 것은 세지 않는다)
    const acted = new Map<number, number>();
    for (const e of g.ents.values()) if (e.kind === 'p' && !e.bot && isField(e.layer) && dist(e, TOWER) <= c.joinRadius) acted.set(e.layer, Math.max(acted.get(e.layer) ?? -Infinity, e.lastAct));
    for (const [layer, f] of this.fronts) {
      if (f.gone) continue;
      const waiting = (alive.get(layer) ?? 0) + (f.due - f.spawned);
      if (waiting === 0 || (acted.get(layer) ?? -Infinity) >= f.checked) f.idle = 0; else f.idle += dt;
      f.checked = g.clock;
      if (f.idle >= c.abandonS) { this.abandon(layer, f); alive.delete(layer); }
    }
    if (this.towerHp <= 0) { this.towerHp = 0; this.finish(false); return; }
    // 모든 층의 적이 다 나왔고 다 쓰러져야 막아 낸 것이다. 끝까지 지킨 층이 하나도 없으면(모두 버려짐) 막아 낸 것이 아니다
    if (this.spawned >= this.total && this.foes().length === 0) { this.finish([...this.fronts.values()].some((f) => !f.gone)); return; }
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
