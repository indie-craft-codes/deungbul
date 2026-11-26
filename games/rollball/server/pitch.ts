// 굴림공의 경기: 공(게임이 등록한 엔티티 종류)과 그 물리, 팀, 점수, 판의 시간. 화면의 짝은 client/pitch.ts.
// 공의 물리는 틀에 없다(틀은 사람이 장애물만 피해 걷는다): 공의 tick이 빠르기·마찰·벽 튕김·사람과의 부딪힘을 셈한다.
import { dist, type Ent, type Game } from '@engine/server';
import { goalX, PITCH, type Side } from '../shared/content/pitch';
import type { MeState, Phase, PitchState } from '../shared/rollball';

const { halfW: W, halfH: H, goalHalf: GH, ballR: R } = PITCH;

/** 공의 빠르기 (e.data에 둔다) */
interface Spin { vx: number; vz: number }

export class Pitch {
  a = 0; b = 0;
  left: number = PITCH.roundS;
  phase: Phase = 'play';
  /** 골 뒤·판이 끝난 뒤 남은 멈춤 시간(초) */
  pause = 0;
  round = 1;
  /** 사람(엔티티 id) → 팀 */
  readonly side = new Map<number, Side>();
  /** 사람 → 이번 접속에서 넣은 골 */
  readonly goals = new Map<number, number>();
  /** 사람 → 다시 찰 수 있는 시각(게임 시계, ms) */
  private readonly kickAt = new Map<number, number>();
  /** 사람 → 지난 틱의 자리 (걸음의 빠르기를 셈한다) */
  private readonly last = new Map<number, { x: number; z: number }>();
  /** 마지막으로 공을 건드린 사람 */
  lastTouch = 0;
  readonly ball: Ent;
  private shownLeft: number = PITCH.roundS;

  constructor(private g: Game) {
    g.defineKind('ball', {
      tick: (e, dt) => this.roll(e, dt),
      // 화면에 실어 보내는 값: 골 뒤 멈춤이면 1 (공이 반짝인다)
      sync: () => [this.phase === 'goal' ? 1 : 0],
    });
    this.ball = g.place('ball', { x: 0, z: 0, type: 'ball' });
    this.ball.data.spin = { vx: 0, vz: 0 } satisfies Spin;
    g.shared.push({ name: 'pitch', state: (): PitchState => this.state() });
    g.personal.push({ name: 'side', state: (p): MeState['side'] => this.side.get(p.id) ?? -1 });
    g.personal.push({ name: 'goals', state: (p): MeState['goals'] => this.goals.get(p.id) ?? 0 });
    // 사람마다의 팀(-1: 아직 없음)을 그 사람의 엔티티에 실어 보낸다: 화면이 옷을 팀 색으로 칠한다 (client/pitch.ts의 setPlayerLook)
    g.playerSync((p) => [this.side.get(p.id) ?? -1]);
    g.commands.set('team', (p, m) => this.join(p, m.side));
    g.commands.set('kick', (p) => this.kick(p));
    g.ticks.push((dt) => this.clock(dt));
    g.on('playerLeft', (id) => this.leave(id));
  }

  state(): PitchState {
    const teams: Record<number, number> = {};
    for (const [id, s] of this.side) teams[id] = s;
    return { a: this.a, b: this.b, left: Math.ceil(this.left), phase: this.phase, round: this.round, teams };
  }

  spin(): Spin { return this.ball.data.spin as Spin; }

  /** 그 팀의 사람 수 (but: 이 사람은 빼고 센다) */
  count(s: Side, but = 0): number { let n = 0; for (const [id, v] of this.side) if (v === s && id !== but) n++; return n; }

  /** 팀 고르기: 사람이 더 많은 팀으로는 갈 수 없다 (같으면 된다) */
  join(p: Ent, raw: unknown): void {
    if (raw !== 0 && raw !== 1) return;
    const s: Side = raw;
    if (this.side.get(p.id) === s) return;
    const other: Side = s === 0 ? 1 : 0;
    if (this.count(s, p.id) > this.count(other, p.id)) { this.g.notify(p, 'teamFull', s); return; }
    this.side.set(p.id, s);
    this.g.notify(p, 'teamJoined', s);
    this.g.stateDirty = true;
  }

  leave(id: number): void {
    if (this.side.delete(id)) this.g.stateDirty = true;
    this.goals.delete(id); this.kickAt.delete(id); this.last.delete(id);
    if (this.lastTouch === id) this.lastTouch = 0;
  }

  /** 팀이 있는 사람들 (같은 층, 살아 있는) */
  *players(): Generator<[Ent, Side]> {
    for (const [id, s] of this.side) {
      const p = this.g.ents.get(id);
      if (p && p.kind === 'p' && !p.dead && p.layer === this.ball.layer) yield [p, s];
    }
  }

  /** 차기: 공 가까이에서 사람 → 공 쪽으로 세게 */
  kick(p: Ent): void {
    if (this.phase !== 'play' || !this.side.has(p.id)) return;
    const now = this.g.now();
    if ((this.kickAt.get(p.id) ?? 0) > now) return;
    const b = this.ball, d = dist(p, b);
    if (d > PITCH.kickReach) return;
    const [nx, nz] = d > 1e-6 ? [(b.x - p.x) / d, (b.z - p.z) / d] : [this.side.get(p.id) === 0 ? 1 : -1, 0];
    const v = this.spin();
    v.vx = nx * PITCH.kickSpeed; v.vz = nz * PITCH.kickSpeed;
    this.kickAt.set(p.id, now + PITCH.kickCdS * 1000);
    this.lastTouch = p.id;
  }

  /** 공의 한 틱: 사람과 부딪힘 → 마찰 → 움직임 → 벽과 골 */
  roll(e: Ent, dt: number): void {
    if (dt <= 0) return;
    const v = this.spin();
    if (this.phase !== 'play') { v.vx = 0; v.vz = 0; this.remember(); return; }
    for (const [p] of this.players()) this.bump(e, p, v, dt);
    this.remember();
    const f = Math.exp(-PITCH.friction * dt);
    v.vx *= f; v.vz *= f;
    const sp = Math.hypot(v.vx, v.vz);
    if (sp > PITCH.maxSpeed) { v.vx *= PITCH.maxSpeed / sp; v.vz *= PITCH.maxSpeed / sp; }
    if (sp < 0.05) { v.vx = 0; v.vz = 0; }
    e.x += v.vx * dt; e.z += v.vz * dt;
    this.walls(e, v);
  }

  /** 사람 p가 공 e에 닿았으면 공을 밀어낸다: 자리를 몸 밖으로, 빠르기는 걸음의 빠르기를 따라 */
  private bump(e: Ent, p: Ent, v: Spin, dt: number): void {
    const reach = R + PITCH.bodyR, dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
    if (d >= reach) return;
    const [nx, nz] = d > 1e-6 ? [dx / d, dz / d] : [this.side.get(p.id) === 0 ? 1 : -1, 0];
    e.x = p.x + nx * reach; e.z = p.z + nz * reach;
    const was = this.last.get(p.id);
    const along = was ? Math.max(0, ((p.x - was.x) * nx + (p.z - was.z) * nz) / dt) : 0;
    const want = Math.max(PITCH.pushMin, along * PITCH.pushMul), now = v.vx * nx + v.vz * nz;
    if (now < want) { v.vx += (want - now) * nx; v.vz += (want - now) * nz; }
    this.lastTouch = p.id;
  }

  private remember(): void {
    for (const [p] of this.players()) this.last.set(p.id, { x: p.x, z: p.z });
  }

  /** 옆줄에서 튕긴다. 골라인은 골문 밖이면 튕기고, 골문 안에서 공의 가운데가 줄을 넘으면 골 */
  private walls(e: Ent, v: Spin): void {
    if (e.z > H - R) { e.z = H - R; v.vz = -Math.abs(v.vz) * PITCH.bounce; }
    if (e.z < -H + R) { e.z = -H + R; v.vz = Math.abs(v.vz) * PITCH.bounce; }
    const mouth = Math.abs(e.z) < GH - R * 0.5;
    if (!mouth) {
      if (e.x > W - R) { e.x = W - R; v.vx = -Math.abs(v.vx) * PITCH.bounce; }
      if (e.x < -W + R) { e.x = -W + R; v.vx = Math.abs(v.vx) * PITCH.bounce; }
      return;
    }
    if (e.x > W) this.score(0);
    else if (e.x < -W) this.score(1);
  }

  /** 골: s 팀이 넣었다 */
  score(s: Side): void {
    if (s === 0) this.a++; else this.b++;
    const by = this.lastTouch ? this.g.ents.get(this.lastTouch) : undefined;
    const mine = by && this.side.get(by.id) === s;
    if (by && mine) this.goals.set(by.id, (this.goals.get(by.id) ?? 0) + 1);
    // 공을 골문 안쪽에 둔 채 멈춘다 (화면에 골이 들어간 자리가 보이게)
    this.ball.x = Math.sign(goalX(s)) * (W + Math.min(PITCH.netDepth, 0.8));
    this.phase = 'goal'; this.pause = PITCH.goalPauseS;
    const v = this.spin(); v.vx = 0; v.vz = 0;
    this.g.announce('goal', s, mine ? by.name : '', this.a, this.b);
    this.g.stateDirty = true;
  }

  /** 공을 가운데로 */
  resetBall(): void {
    this.ball.x = 0; this.ball.z = 0;
    const v = this.spin(); v.vx = 0; v.vz = 0;
    this.lastTouch = 0;
  }

  /** 판의 시계: 팀이 있는 사람이 하나라도 있어야 흐른다 */
  clock(dt: number): void {
    if (this.phase === 'play') {
      if (this.side.size === 0) return;
      this.left = Math.max(0, this.left - dt);
      if (Math.ceil(this.left) !== this.shownLeft) { this.shownLeft = Math.ceil(this.left); this.g.stateDirty = true; }
      if (this.left <= 0) this.end();
      return;
    }
    this.pause -= dt;
    if (this.pause > 0) return;
    if (this.phase === 'goal') { this.resetBall(); this.phase = 'play'; this.g.stateDirty = true; return; }
    this.a = 0; this.b = 0; this.round++; this.left = PITCH.roundS; this.shownLeft = PITCH.roundS;
    this.resetBall(); this.phase = 'play'; this.g.stateDirty = true;
    this.g.announce('roundStart', this.round);
  }

  /** 판이 끝났다: 점수가 많은 팀이 이긴다 */
  end(): void {
    const winner = this.a === this.b ? -1 : this.a > this.b ? 0 : 1;
    this.phase = 'over'; this.pause = PITCH.endPauseS;
    const v = this.spin(); v.vx = 0; v.vz = 0;
    this.g.announce('roundOver', winner, this.a, this.b);
    this.g.stateDirty = true;
  }
}
