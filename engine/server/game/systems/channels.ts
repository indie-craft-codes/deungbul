// 채널: 같은 들판을 여러 벌(층)로 돌린다. 채널이 다르면 서로 보이지 않고 몬스터도 따로다 (층 번호의 뜻은 ../layers.ts).
// 접속하면 붐비지 않는 채널 가운데 번호가 가장 낮은 곳에 세우고, 명령으로 다른 채널로 옮긴다.
// 길드·순위·우편과 게임의 공유 상태는 서버 전체의 것이라 채널로 나누지 않는다. 수치는 내용의 CHANNEL (기본값 engine/shared/defaults.ts).
import { CHANNEL } from '../../../shared/defs';
import { AOI_LEAVE } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { channelOf, fieldLayer, isField } from '../layers';

export class Channels {
  // 아래 세 기록은 엔티티 번호가 아니라 사람(저장 키)으로 적는다: 다시 접속하면 번호가 바뀌어, 재접속 한 번으로 대기 시간과 싸움 판정이 지워졌다.
  // 손님은 저장 키가 없어 접속마다 따로다. 오래된 기록은 tick에서 지운다.
  /** 마지막으로 채널을 바꾼 시각 (게임 시계) */
  private moved = new Map<string, number>();
  /** 마지막으로 몬스터를 쓰러뜨린 시각 (게임 시계). 쓰러진 몬스터는 때린 사람을 잊으므로 따로 적어 둔다 */
  private killed = new Map<string, number>();
  /** 싸우는 중에 접속이 끊긴 시각 (게임 시계). 다시 접속해도 그때부터 calmS 동안은 싸우는 중이다 */
  private fled = new Map<string, number>();
  /** 층별로 지금 그 들판에 서 있는 캐릭터의 수와, 그것을 센 시각. 틱마다 한 번만 센다 */
  private here: number[] = [];
  private hereAt = -1;
  private t = 0;

  // 게임의 규칙이 채우는 접점. 비워 두면 그런 것이 없는 게임이다 (등불지기에서는 습격이 채운다)
  /** 채널별로 남은, 평소의 몬스터 말고 따로 온 적의 수. 지금 그런 적이 없으면 undefined: 어느 채널에 적이 남았는지 화면이 보여 준다 */
  extraFoes?: () => number[] | undefined;
  /** 바쁜 때인가. 그동안은 채널 소식을 더 자주(CHANNEL.tellBusyS) 알린다 */
  busy?: () => boolean;

  constructor(private g: Game) {
    // 1채널의 몬스터는 몬스터 시스템이 이미 놓았다. 나머지 채널에도 같은 무리를 놓는다
    // 아무도 없는 채널의 몬스터는 쉰다: 채널 수만큼 몬스터가 늘어도 틱 비용은 사람이 있는 채널만큼만 든다 (몬스터는 전투 모듈의 것)
    if (g.has('combat')) {
      for (let ch = 2; ch <= CHANNEL.count; ch++) g.monsters.populate(fieldLayer(ch));
      g.monsters.asleep = (layer) => isField(layer) && this.present(layer) === 0;
    }

    g.commands.set('channel', (p, m) => { if (typeof m.n === 'number') this.move(p, m.n); });
    // 던전의 하던 회차로 돌아간 사람(dungeon.ts의 rejoin)은 그 회차의 층에 둔다: 채널은 나올 때 돌아갈 층으로 이미 정해 두었다
    g.on('playerJoined', (p) => { if (!g.has('dungeon') || !g.dungeon.runOf(p)) this.seat(p); });
    g.on('playerLeft', () => { this.hereAt = -1; });
    g.on('playerDropped', (p) => { if (this.fighting(p)) this.fled.set(Channels.key(p), g.clock); });
    g.on('monsterKilled', (_m, hitters) => { for (const p of hitters) this.killed.set(Channels.key(p), g.clock); });
    g.ticks.push((dt) => this.tick(dt));
  }

  /** 기록의 열쇠: 저장 키가 있으면 그것(재접속해도 같다), 손님은 엔티티 번호 */
  private static key(p: Ent): string { return p.pid || '#' + p.id; }

  /** 그 캐릭터의 들판 층. 던전 안에 있으면 나와서 돌아갈 층이다 */
  private home(p: Ent): number { return isField(p.layer) ? p.layer : (this.g.has('dungeon') ? this.g.dungeon.homeOf(p) : undefined) ?? fieldLayer(1); }

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
   * 접속은 hard(옮겨 올 수 없는 인원)로 막지 않는다: 들어온 사람을 세울 곳은 있어야 하므로, 서버가 가득 차면 채널마다 hard를 넘을 수 있다
   * (서버 전체 인원은 통신 계층의 접속 상한이 따로 막는다).
   */
  pick(p: Ent): number {
    const mate = this.g.has('party') ? this.g.party.mates(p)[0] : undefined;
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
    const key = Channels.key(p);
    if (p.lastHurt > since || (this.killed.get(key) ?? -Infinity) > since || (this.fled.get(key) ?? -Infinity) > since) return true;
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
    const wait = CHANNEL.switchCdS - (g.clock - (this.moved.get(Channels.key(p)) ?? -Infinity));
    if (wait > 0) { g.notify(p, 'channelWait', Math.ceil(wait)); return; }
    // 거절할 때도 최신 인원을 보낸다: 화면의 숫자가 낡아서 빈 줄 알고 누른 것이다
    if (this.counts()[to] >= CHANNEL.hard) { g.notify(p, 'channelFull', n); this.tell(p); return; }

    p.layer = to; p.targetId = 0; p.moving = false; p.path = null; p.tx = p.x; p.tz = p.z;
    // 떠난 채널의 몬스터는 나를 잊는다 (쫓던 몬스터가 보이지 않는 사람을 붙들고 있지 않게)
    for (const e of g.ents.values()) {
      if (e.kind === 'm') { e.hitters.delete(p.id); if (e.targetId === p.id) e.targetId = 0; }
    }
    g.emit(['r', p.id]); // 클라이언트가 걷던 것과 노리던 대상을 내려놓는다. 주변은 다음 스냅샷이 새 층의 것으로 바꿔 보낸다
    this.moved.set(Channels.key(p), g.clock);
    this.hereAt = -1;
    g.notify(p, 'channelMoved', n);
    this.tell(p);
  }

  private foes(): number[] | undefined { return this.extraFoes?.(); }

  /** 그 사람에게 내 채널과 채널별 인원을 알린다 (접속했을 때, 바꿨을 때, 그리고 가끔) */
  tell(p: Ent, list = this.counts(), foes = this.foes()): void {
    if (!p.bot) this.g.out.push({ id: p.id, msg: { t: 'channels', me: this.of(p), list, foes } });
  }

  tick(dt: number): void {
    const g = this.g;
    this.t += dt;
    if (this.t < (this.busy?.() ? CHANNEL.tellBusyS : CHANNEL.tellS)) return;
    this.t = 0;
    // 쓸모가 다한 기록을 지운다 (가장 긴 것이 채널 이동 대기다)
    const old = g.clock - Math.max(CHANNEL.switchCdS, CHANNEL.calmS);
    for (const map of [this.moved, this.killed, this.fled]) for (const [k, at] of map) if (at < old) map.delete(k);
    const list = this.counts(), foes = this.foes();
    for (const p of g.ents.values()) if (p.kind === 'p') this.tell(p, list, foes);
  }
}
