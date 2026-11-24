// 채널: 같은 들판을 여러 벌(층)로 돌린다. 채널이 다르면 서로 보이지 않고 몬스터도 따로다 (층 번호의 뜻은 ../layers.ts).
// 접속하면 붐비지 않는 채널 가운데 번호가 가장 낮은 곳에 세우고, 명령으로 다른 채널로 옮긴다.
// 등탑·주민·길드·순위·우편은 서버 전체의 것이라 채널로 나누지 않는다. 수치는 shared/content/social.ts의 CHANNEL.
import { CHANNEL } from '../../../shared/defs';
import { AOI_LEAVE } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { channelOf, fieldLayer, isField } from '../layers';

export class Channels {
  /** 마지막으로 채널을 바꾼 시각 (게임 시계) */
  private moved = new Map<number, number>();
  /** 마지막으로 몬스터를 쓰러뜨린 시각 (게임 시계). 쓰러진 몬스터는 때린 사람을 잊으므로 따로 적어 둔다 */
  private killed = new Map<number, number>();
  /** 층별로 지금 그 들판에 서 있는 캐릭터의 수와, 그것을 센 시각. 틱마다 한 번만 센다 */
  private here: number[] = [];
  private hereAt = -1;
  private t = 0;

  constructor(private g: Game) {
    // 1채널의 몬스터는 몬스터 시스템이 이미 놓았다. 나머지 채널에도 같은 무리를 놓는다
    for (let ch = 2; ch <= CHANNEL.count; ch++) g.monsters.populate(fieldLayer(ch));
    // 아무도 없는 채널의 몬스터는 쉰다: 채널 수만큼 몬스터가 늘어도 틱 비용은 사람이 있는 채널만큼만 든다
    g.monsters.asleep = (layer) => isField(layer) && this.present(layer) === 0;

    g.commands.set('channel', (p, m) => { if (typeof m.n === 'number') this.move(p, m.n); });
    g.on('playerJoined', (p) => this.seat(p));
    g.on('playerLeft', (id) => { this.moved.delete(id); this.killed.delete(id); this.hereAt = -1; });
    g.on('monsterKilled', (_m, hitters) => { for (const p of hitters) this.killed.set(p.id, g.clock); });
    g.ticks.push((dt) => this.tick(dt));
  }

  /** 그 캐릭터의 들판 층. 던전 안에 있으면 나와서 돌아갈 층이다 */
  private home(p: Ent): number { return isField(p.layer) ? p.layer : this.g.dungeon.homeOf(p) ?? fieldLayer(1); }

  /** 그 캐릭터의 채널 번호 (1부터) */
  of(p: Ent): number { return channelOf(this.home(p)); }

  /** 채널별 인원 (봇과 자리 비움 사냥 중인 캐릭터도 화면에 보이는 사람이므로 센다. 던전 안의 사람은 돌아갈 채널에 센다) */
  counts(except?: Ent): number[] {
    const n = Array.from({ length: CHANNEL.count }, () => 0);
    for (const e of this.g.ents.values()) {
      if (e.kind !== 'p' || e === except) continue;
      const i = this.home(e);
      if (i < n.length) n[i]++;
    }
    return n;
  }

  /** 그 층의 들판에 지금 서 있는 캐릭터의 수 (던전에 들어간 사람은 빼고) */
  private present(layer: number): number {
    const g = this.g;
    if (this.hereAt !== g.clock) {
      this.hereAt = g.clock;
      this.here = [];
      for (const e of g.ents.values()) if (e.kind === 'p' && isField(e.layer)) this.here[e.layer] = (this.here[e.layer] ?? 0) + 1;
    }
    return this.here[layer] ?? 0;
  }

  /**
   * 접속한 사람이 설 채널을 고른다.
   * 인원이 가장 적은 곳이 아니라, 붐비지 않는(soft 미만) 채널 가운데 번호가 가장 낮은 곳이다: 사람이 적을 때 흩어지지 않고 1채널에 모인다.
   * 모두 붐비면 가장 적은 곳. 파티원이 접속해 있으면 그 사람의 채널이 먼저다.
   */
  pick(p: Ent): number {
    const mate = this.g.party.mates(p)[0];
    if (mate) return this.of(mate);
    const n = this.counts(p);
    const open = n.findIndex((c) => c < CHANNEL.soft);
    return open >= 0 ? open + 1 : n.indexOf(Math.min(...n)) + 1;
  }

  /** 봇은 시험용이라 채널마다 고르게 나눈다 (봇이 가장 적은 채널) */
  private pickBot(p: Ent): number {
    const n = Array.from({ length: CHANNEL.count }, () => 0);
    for (const e of this.g.ents.values()) if (e.kind === 'p' && e.bot && e !== p && e.layer < n.length) n[e.layer]++;
    return n.indexOf(Math.min(...n)) + 1;
  }

  /** 방금 들어온 캐릭터를 채널에 세운다 (자리는 그대로, 층만 정한다) */
  seat(p: Ent): void {
    p.layer = fieldLayer(p.bot ? this.pickBot(p) : this.pick(p));
    this.hereAt = -1;
    this.tell(p);
  }

  /** 최근에 맞았거나 때렸는가: 싸움에서 도망치는 데 채널을 쓰지 못하게 한다 */
  private fighting(p: Ent): boolean {
    const g = this.g, since = g.clock - CHANNEL.calmS;
    if (p.lastHurt > since || (this.killed.get(p.id) ?? -Infinity) > since) return true;
    // 때린 시각은 따로 적지 않는다: 내가 때린 몬스터가 방금 맞았으면 싸우는 중으로 본다.
    // 멀리 떠나온 싸움은 치지 않는다 (처치 보상을 받는 거리와 같다): 한 대 치고 떠난 보스를 남들이 잡는 동안 묶여 있지 않게
    for (const m of g.ents.values()) if (m.kind === 'm' && !m.dead && m.layer === p.layer && m.lastHurt > since && m.hitters.has(p.id) && dist(p, m) <= AOI_LEAVE) return true;
    return false;
  }

  /** n번 채널로 옮긴다. 자리는 그대로이고 층만 바뀐다. n은 검증되지 않은 입력이다 */
  move(p: Ent, n: number): void {
    const g = this.g;
    if (!Number.isInteger(n) || n < 1 || n > CHANNEL.count) return;
    if (!isField(p.layer)) { g.notify(p, 'channelDungeon'); return; }
    const to = fieldLayer(n);
    if (to === p.layer) { this.tell(p); return; } // 이미 그 채널이다: 화면만 맞춘다
    if (this.fighting(p)) { g.notify(p, 'channelFight'); return; }
    const wait = CHANNEL.switchCdS - (g.clock - (this.moved.get(p.id) ?? -Infinity));
    if (wait > 0) { g.notify(p, 'channelWait', Math.ceil(wait)); return; }
    if (this.counts()[to] >= CHANNEL.hard) { g.notify(p, 'channelFull', n); return; }

    p.layer = to; p.targetId = 0; p.moving = false; p.path = null; p.tx = p.x; p.tz = p.z;
    // 떠난 채널의 몬스터는 나를 잊는다 (쫓던 몬스터가 보이지 않는 사람을 붙들고 있지 않게)
    for (const e of g.ents.values()) {
      if (e.kind === 'm') { e.hitters.delete(p.id); if (e.targetId === p.id) e.targetId = 0; }
    }
    g.emit(['r', p.id]); // 클라이언트가 걷던 것과 노리던 대상을 내려놓는다. 주변은 다음 스냅샷이 새 층의 것으로 바꿔 보낸다
    this.moved.set(p.id, g.clock);
    this.hereAt = -1;
    g.notify(p, 'channelMoved', n);
    this.tell(p);
  }

  /** 습격 중이면 채널별로 남은 적의 수 (아니면 undefined): 어느 채널에 적이 남았는지 화면이 보여 준다 */
  private foes(): number[] | undefined {
    const g = this.g;
    return g.raid.phase === 'active' ? Array.from({ length: CHANNEL.count }, (_, i) => g.raid.foesAt(i)) : undefined;
  }

  /** 그 사람에게 내 채널과 채널별 인원을 알린다 (접속했을 때, 바꿨을 때, 그리고 가끔) */
  tell(p: Ent, list = this.counts(), foes = this.foes()): void {
    if (!p.bot) this.g.out.push({ id: p.id, msg: { t: 'channels', me: this.of(p), list, foes } });
  }

  tick(dt: number): void {
    const g = this.g;
    this.t += dt;
    if (this.t < (g.raid.phase === 'active' ? CHANNEL.tellRaidS : CHANNEL.tellS)) return;
    this.t = 0;
    const list = this.counts(), foes = this.foes();
    for (const p of g.ents.values()) if (p.kind === 'p') this.tell(p, list, foes);
  }
}
