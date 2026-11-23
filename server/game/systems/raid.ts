// 안개 습격: 정해진 시각에 적이 물결로 나타나 등탑으로 몰려온다.
// 제한 시간 안에 다 막으면 밝기가 오르고, 등탑 내구가 다하거나 시간이 끝나면 밝기가 내려간다.
// 미리 불씨를 바쳐 밝기를 올려 두면 등탑 내구가 커져서 오래 버틴다.
import { RAID, nextRaidAt, type RaidConfig, type RaidPhase } from '../../../shared/defs';
import type { WorldState } from '../../../shared/protocol';
import { TOWER } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';

export class Raid {
  readonly cfg: RaidConfig;
  phase: RaidPhase = 'idle';
  /** 다음 습격 시작 시각(ms) */
  private startAt: number;
  /** 진행 중인 습격이 시작된 뒤 흐른 시간(초) */
  private t = 0;
  private wave = 0;
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
    // 봇은 세지 않는다: 적의 수는 실제로 맞설 사람의 수를 따른다
    let people = 0;
    for (const e of g.ents.values()) if (e.kind === 'p' && !e.bot && dist(e, TOWER) <= c.joinRadius) people++;
    if (people === 0) {
      this.phase = 'idle';
      this.startAt = nextRaidAt(g.now(), c);
      g.stateDirty = true;
      return;
    }
    this.total = Math.min(c.max, c.base + c.perPlayer * people);
    this.phase = 'active'; this.t = 0; this.wave = 0; this.spawned = 0; this.lastSecond = -1;
    this.towerMaxHp = this.towerHp = c.towerHpBase + g.tower.glow * c.towerHpPerGlow;
    this.fighters.clear();
    g.announce('raidStart', this.total);
    g.stateDirty = true;
  }

  private spawnWave(): void {
    const c = this.cfg, wavesLeft = c.waveAtS.length - this.wave;
    const count = wavesLeft <= 1 ? this.total - this.spawned : Math.ceil((this.total - this.spawned) / wavesLeft);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = c.spawnRadius[0] + Math.random() * (c.spawnRadius[1] - c.spawnRadius[0]);
      const type = c.types[Math.floor(Math.random() * c.types.length)];
      this.g.monsters.spawn(type, TOWER.x + Math.cos(a) * r, TOWER.z + Math.sin(a) * r, true);
    }
    this.spawned += count;
    this.wave++;
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

    const foes = this.foes();
    for (const m of foes) if (g.monsters.atTower(m)) this.towerHp -= c.drainPerS * dt;
    if (this.towerHp <= 0) { this.towerHp = 0; this.finish(false); return; }
    if (this.spawned >= this.total && foes.length === 0) { this.finish(true); return; }
    if (this.t >= c.durationS) { this.finish(false); return; }
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
