// 물결 막기: 이 게임의 규칙. 정해진 간격마다 적이 물결로 나타나 마을 우물로 몰려온다 (틀의 '몰려온 적': g.rules.siege, monsters.spawn(…, true)).
// 우물에 붙은 적은 내구를 깎는다. 다 쓰러뜨리면 싸운 사람이 보상을 나누고 다음 물결은 더 커진다.
// 내구가 다하면 그 물결은 진 것이다: 우물이 무너지고, 시간이 지나면 절반으로 되살아나거나 누군가 골드를 내어 바로 되살린다.
// 물결 사이에는 우물 곁에서 골드를 내고 내구를 채운다.
import { WAVE, WELL, waveReward, waveSize, waveTypes } from '../shared/content/waves';
import type { MeState, WavePhase } from '../shared/bastion';
import type { WorldState } from '@engine/shared';
import type { MonsterId } from '@engine/shared/defs';
import { dist, type Ent, type Game, isField, readInt } from '@engine/server';

export interface WaveOptions {
  /** 물결 사이의 시간(초). 없으면 WAVE.intervalS */
  intervalS?: number;
  /** 첫 물결까지(초). 없으면 WAVE.firstS (intervalS를 주었으면 그것과 WAVE.firstS 가운데 짧은 쪽) */
  firstS?: number;
}

export class Waves {
  phase: WavePhase = 'idle';
  /** 지금(또는 다음) 물결의 번호. 막아 내면 하나 오른다 */
  wave = 1;
  hp: number = WAVE.gateHp;
  readonly maxHp: number = WAVE.gateHp;
  readonly intervalS: number;
  /** 다음 물결 시작 시각(ms), 무너진 우물이 저절로 되살아나는 시각(ms) */
  private startAt: number;
  private restoreAt = 0;
  /** 진행 중인 물결의 흐른 시간(초), 적의 수, 나온 수 */
  private t = 0;
  total = 0;
  spawned = 0;
  /** 이번 물결의 적에게 피해를 준 사람들 */
  readonly fighters = new Set<number>();
  /** 마지막으로 모두에게 알린 상태 (바뀌었을 때만 다시 보낸다) */
  private lastSent = '';

  constructor(private g: Game, opts: WaveOptions = {}) {
    this.intervalS = opts.intervalS && opts.intervalS > 0 ? opts.intervalS : WAVE.intervalS;
    const first = opts.firstS ?? (opts.intervalS ? Math.min(opts.intervalS, WAVE.firstS) : WAVE.firstS);
    this.startAt = g.now() + first * 1000;
    // 몰려온 적은 우물로 간다. 쓰러지면 우물 곁에서 일어나고, 직업도 우물 곁에서 바꾼다
    g.rules.siege = { x: WELL.x, z: WELL.z };
    g.rules.respawn = () => ({ x: WELL.x, z: WELL.z + 4, id: 'well' });
    g.rules.canChangeClass = (p) => dist(p, WELL) <= WELL.reach;
    g.rules.touched = (p) => p.held > 0;
    g.entInit.push((e) => { e.held = 0; });
    g.saves.push({ name: 'waves', save: (p) => ({ held: p.held }), load: (p, raw) => { p.held = readInt((raw as { held?: unknown } | null)?.held, 0, 1e9, 0); } });
    g.personal.push({ name: 'held', state: (p): MeState['held'] => p.held });
    g.shared.push({ name: 'defense', state: () => this.state() });
    g.worldSaves.push({
      name: 'waves',
      save: () => ({ wave: this.wave, hp: Math.ceil(this.hp), broken: this.phase === 'broken' }),
      load: (raw) => {
        const r = (raw ?? {}) as { wave?: unknown; hp?: unknown; broken?: unknown };
        this.wave = readInt(r.wave, 1, 9999, 1);
        this.hp = readInt(r.hp, 0, this.maxHp, this.maxHp);
        // 무너진 채 꺼졌으면 다시 켠 때부터 되살아나는 시간을 센다. 싸우던 중에 꺼졌으면 그 물결은 처음부터 다시
        if (r.broken === true || this.hp <= 0) { this.hp = 0; this.phase = 'broken'; this.restoreAt = g.now() + WAVE.restoreS * 1000; }
      },
    });
    g.on('hit', (p, m) => { if (m.swarm && this.phase === 'active') this.fighters.add(p.id); });
    g.on('monsterKilled', (m, hitters) => { if (m.swarm && this.phase === 'active') for (const p of hitters) this.fighters.add(p.id); });
    g.on('playerLeft', (id) => this.fighters.delete(id));
    g.commands.set('repair', (p, m) => { if (typeof m.n === 'number') this.repair(p, m.n); });
    g.commands.set('restore', (p) => this.restore(p));
    g.ticks.push((dt) => this.tick(dt));
  }

  /** 살아 있는 몰려온 적 */
  foes(): Ent[] {
    const list: Ent[] = [];
    for (const e of this.g.ents.values()) if (e.swarm && !e.dead) list.push(e);
    return list;
  }

  /** 들판에 있는 사람(봇은 세지 않는다) */
  private people(): Ent[] {
    const list: Ent[] = [];
    for (const e of this.g.ents.values()) if (e.kind === 'p' && !e.bot && isField(e.layer)) list.push(e);
    return list;
  }

  /** 지금 바로 물결을 시작한다 (시각표와 무관: 시험과 개발용). 들판에 아무도 없으면 열지 않고 다음 간격으로 미룬다 */
  start(): void {
    const g = this.g;
    if (this.phase === 'active' || this.phase === 'broken') return;
    const people = this.people();
    if (people.length === 0) { this.phase = 'idle'; this.startAt = g.now() + this.intervalS * 1000; g.stateDirty = true; return; }
    this.phase = 'active'; this.t = 0; this.spawned = 0;
    this.total = waveSize(this.wave, people.length);
    this.queue = waveTypes(this.wave, this.total);
    this.fighters.clear();
    g.announce('waveStart', this.wave, this.total);
    g.stateDirty = true;
  }
  private queue: MonsterId[] = [];

  /** 적 하나를 내보낸다: 네 문(동서남북) 가운데 하나의 바깥에서, 물결이 클수록 체력이 많다 */
  private spawnOne(): void {
    const g = this.g, type = this.queue[this.spawned];
    const gate = Math.floor(Math.random() * 4), a = gate * (Math.PI / 2) + (Math.random() - 0.5) * 0.4;
    const r = WAVE.spawnR[0] + Math.random() * (WAVE.spawnR[1] - WAVE.spawnR[0]);
    const m = g.monsters.spawn(type, WELL.x + Math.cos(a) * r, WELL.z + Math.sin(a) * r, true);
    m.maxHp = m.hp = Math.round(m.maxHp * (1 + WAVE.hpPerWave * (this.wave - 1)));
    this.spawned++;
  }

  private finish(won: boolean): void {
    const g = this.g, wave = this.wave;
    for (const m of this.foes()) g.remove(m.id); // 남은 적은 들로 돌아간다
    this.queue = []; this.total = this.spawned = 0;
    if (won) {
      const here = [...this.fighters].map((id) => g.ents.get(id)).filter((p): p is Ent => !!p && p.kind === 'p');
      const share = waveReward(wave, here.length);
      g.announce('waveWon', wave, here.length);
      for (const p of here) {
        const gold = g.wallet.add(p, 'gold', share.gold, 'wave');
        const exp = g.wallet.amount(p, 'exp', share.exp, 'wave');
        g.players.grant(p, share.exp, 0, 'wave');
        p.held++; p.unsaved = true;
        g.notify(p, 'waveReward', gold, exp);
        g.daily.add(p, 'wave', 1);
      }
      this.wave++;
      this.phase = 'idle';
      this.startAt = g.now() + this.intervalS * 1000;
    } else {
      g.announce('waveLost', wave);
      this.hp = 0;
      this.phase = 'broken';
      this.restoreAt = g.now() + WAVE.restoreS * 1000;
    }
    this.fighters.clear();
    g.stateDirty = true; g.saveDirty = true;
  }

  /** 무너진 우물을 되살린다: p가 있으면 골드를 내고 가득, 없으면(시간이 지나서) 절반 */
  private revive(p: Ent | null): void {
    const g = this.g;
    this.hp = p ? this.maxHp : Math.round(this.maxHp * WAVE.restoreFrac);
    this.phase = 'idle';
    this.startAt = g.now() + this.intervalS * 1000;
    g.announce('gateRestored', p ? p.name : '');
    g.stateDirty = true; g.saveDirty = true;
  }

  /** 우물 곁에서 골드를 내고 무너진 우물을 바로 되살린다 */
  private restore(p: Ent): void {
    const g = this.g;
    if (this.phase !== 'broken') { g.notify(p, 'repairFull'); return; }
    if (dist(p, WELL) > WELL.reach) { g.notify(p, 'repairFar'); return; }
    if (!g.wallet.take(p, 'gold', WAVE.restoreGold, 'restore')) { g.notify(p, 'repairPoor', WAVE.restoreGold); return; }
    this.revive(p);
  }

  /** 물결 사이에 우물 곁에서 골드를 내고 내구를 채운다: 한 번에 WAVE.repairGold → WAVE.repairHp, want번까지 (가득 차거나 골드가 떨어지면 거기까지) */
  private repair(p: Ent, want: number): void {
    const g = this.g;
    if (!Number.isInteger(want) || want < 1) return;
    if (this.phase === 'active') { g.notify(p, 'repairBusy'); return; }
    if (this.phase === 'broken') { g.notify(p, 'gateBroken'); return; }
    if (dist(p, WELL) > WELL.reach) { g.notify(p, 'repairFar'); return; }
    if (this.hp >= this.maxHp) { g.notify(p, 'repairFull'); return; }
    const n = Math.min(want, Math.ceil((this.maxHp - this.hp) / WAVE.repairHp), Math.floor(p.gold / WAVE.repairGold));
    if (n < 1) { g.notify(p, 'repairPoor', WAVE.repairGold); return; }
    const cost = n * WAVE.repairGold;
    if (!g.wallet.take(p, 'gold', cost, 'repair')) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n * WAVE.repairHp);
    g.notify(p, 'repaired', Math.round(this.hp - before), cost);
    g.stateDirty = true; g.saveDirty = true;
  }

  tick(dt: number): void {
    const g = this.g, now = g.now();
    if (this.phase === 'broken') {
      if (now >= this.restoreAt) this.revive(null);
      else this.sync();
      return;
    }
    if (this.phase !== 'active') {
      const left = (this.startAt - now) / 1000;
      if (left <= 0) { this.start(); return; }
      if (this.phase === 'idle' && left <= WAVE.warnS) { this.phase = 'soon'; g.announce('waveSoon', this.wave, Math.ceil(left)); g.stateDirty = true; }
      this.sync();
      return;
    }
    this.t += dt;
    while (this.spawned < this.total && this.t >= this.spawned * WAVE.gapS) this.spawnOne();
    // 우물에 붙은 적(사람과 싸우지 않는 적)이 내구를 깎는다
    const foes = this.foes();
    for (const m of foes) if (g.monsters.atSiege(m)) this.hp -= ((m.def!.dmg[0] + m.def!.dmg[1]) / 2) * WAVE.drainMul * dt;
    if (this.hp <= 0) { this.finish(false); return; }
    if (this.spawned >= this.total && foes.length === 0) { this.finish(true); return; }
    if (this.t >= WAVE.durationS) { this.finish(false); return; }
    this.sync();
  }

  /** 초읽기·내구·남은 적이 바뀌었으면 모두에게 다시 알린다 (화면의 초읽기가 1초마다 바뀐다) */
  private sync(): void {
    const s = JSON.stringify(this.state());
    if (s !== this.lastSent) { this.lastSent = s; this.g.stateDirty = true; }
  }

  state(): WorldState['defense'] {
    const now = this.g.now();
    const left = this.phase === 'active' ? WAVE.durationS - this.t : this.phase === 'broken' ? (this.restoreAt - now) / 1000 : (this.startAt - now) / 1000;
    return {
      phase: this.phase, wave: this.wave, left: Math.max(0, Math.ceil(left)),
      foes: this.phase === 'active' ? this.foes().length + (this.total - this.spawned) : 0,
      hp: Math.max(0, Math.ceil(this.hp)), maxHp: this.maxHp,
    };
  }
}
