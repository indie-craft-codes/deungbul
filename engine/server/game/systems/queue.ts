// [ranked] 큐 (묶음 8): 랭크 판(RoomDef.rated)의 빠른 대국. 대기실의 '빠른 대국'이 이 큐가 된다 (rooms의 hooks.quick), 명령 { t: 'queue', a: 'join' | 'leave', def }.
//   짝짓기  1초마다, 가장 오래 기다린 사람부터: 서로의 범위(기다릴수록 넓어진다: COMPETE.queue의 range·grow·maxRange) 안의 사람을 레이팅이 가까운 차례로 모아 판의 자리(max)가 차면 연다
//   봇      RoomDef.queueBots(초)가 있으면 가장 오래 기다린 사람이 그만큼 기다렸을 때 모인 사람과 봇으로 연다 (봇은 화면에 '봇'으로. 레이팅은 COMPETE.queue.botR가 있을 때만)
//   예상 대기  그 판의 최근 짝지은 대기 시간의 평균 (모르면 -1)
//   막는 것  이탈 제재의 큐 금지(queueBanned), 이미 판에 앉음. 접속이 끊기거나 판에 앉으면 큐에서 빠진다
// 개인 상태 queue(QueueMe 또는 null).
import { queueRange, type QueueMe } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import type { Ranked } from './ranked';
import { Rooms } from './rooms';

interface Entry { key: string; ent: number; def: string; r: number; at: number }
const WAITS_KEEP = 20;

export class Queue {
  private readonly list = new Map<string, Entry>();
  /** 판의 이름 → 최근 짝지은 대기(초) */
  private readonly waits = new Map<string, number[]>();
  private acc = 0;

  constructor(private g: Game, private ranked: Ranked) {
    g.commands.set('queue', (p, m) => { if (m.a === 'join') this.join(p, typeof m.def === 'string' ? m.def : undefined); else if (m.a === 'leave') this.leave(p, true); });
    g.rooms.hooks.quick = (p, def) => { this.join(p, def); return true; };
    g.personal.push({ name: 'queue', state: (p) => this.me(p) });
    g.on('playerLeft', (id) => { for (const [k, e] of this.list) if (e.ent === id) this.list.delete(k); });
    g.ticks.push((dt) => { this.acc += dt; if (this.acc >= 1) { this.acc = 0; this.match(); } });
  }

  /** 큐에 선다: 그 판(없으면 첫째 랭크 판) */
  join(p: Ent, defId?: string): void {
    const def = defId && this.ranked.ladderOf(defId) ? defId : this.g.rooms.defIds().find((id) => !!this.ranked.ladderOf(id));
    if (!def || p.bot) return;
    const key = Rooms.keyOf(p);
    if (this.g.rooms.seatedKey(key)) { this.g.notify(p, 'roomBusy'); return; }
    const ban = p.pid ? this.ranked.banUntil(p.pid) : 0;
    if (ban) { this.g.notify(p, 'queueBanned', Math.ceil((ban - this.g.now()) / 60_000)); return; }
    const was = this.list.get(key);
    const r = p.pid ? this.ranked.rating(this.ranked.ladderOf(def), p.pid).r : 1500;
    this.list.set(key, { key, ent: p.id, def, r, at: was?.def === def ? was.at : this.g.now() });
    if (was?.def !== def) this.g.notify(p, 'queueOn', def);
  }
  leave(p: Ent, tell: boolean): void {
    if (this.list.delete(Rooms.keyOf(p)) && tell) this.g.notify(p, 'queueOff');
  }
  /** 큐에 선 사람 수 (판의 이름마다) */
  count(def?: string): number { return [...this.list.values()].filter((e) => !def || e.def === def).length; }

  private me(p: Ent): QueueMe | null {
    const e = this.list.get(Rooms.keyOf(p));
    if (!e) return null;
    const waited = Math.floor((this.g.now() - e.at) / 1000), w = this.waits.get(e.def);
    return { def: e.def, waited, est: w?.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : -1, range: Math.round(queueRange(waited)), bots: this.g.rooms.defOf(e.def)?.queueBots ? 1 : 0 };
  }

  /** 짝짓기: 판의 이름마다, 오래 기다린 사람부터 */
  private match(): void {
    if (!this.list.size) return;
    const now = this.g.now();
    // 판에 앉았거나 없어진 사람은 뺀다
    for (const [k, e] of this.list) { const p = this.g.ents.get(e.ent); if (!p || this.g.rooms.seatedKey(k)) this.list.delete(k); }
    for (const def of new Set([...this.list.values()].map((e) => e.def))) {
      const size = this.g.rooms.seatsOf(def).max, botsAfter = this.g.rooms.defOf(def)?.queueBots ?? 0, canBot = botsAfter > 0 && !!this.g.rooms.defOf(def)?.cpu;
      let wait = [...this.list.values()].filter((e) => e.def === def).sort((a, b) => a.at - b.at);
      while (wait.length) {
        const a = wait[0], wa = (now - a.at) / 1000;
        const near = wait.slice(1).filter((b) => Math.abs(a.r - b.r) <= Math.min(queueRange(wa), queueRange((now - b.at) / 1000))).sort((x, y) => Math.abs(a.r - x.r) - Math.abs(a.r - y.r));
        let pick: Entry[] | null = null, bots = 0;
        if (near.length + 1 >= size) pick = [a, ...near.slice(0, size - 1)];
        else if (canBot && wa >= botsAfter) { pick = [a, ...near]; bots = size - pick.length; }
        if (!pick) { wait = wait.slice(1); continue; }
        const players = pick.map((e) => this.g.ents.get(e.ent)).filter((p): p is Ent => !!p);
        for (const e of pick) this.list.delete(e.key);
        wait = wait.filter((e) => !pick!.includes(e));
        if (players.length !== pick.length) continue;
        const room = this.g.rooms.openWith(def, players, bots, true);
        if (!room) continue;
        const ws = this.waits.get(def) ?? [];
        for (const e of pick) ws.push(Math.round((now - e.at) / 1000));
        this.waits.set(def, ws.slice(-WAITS_KEEP));
        for (const p of players) this.g.notify(p, 'queueFound', players.length, bots);
      }
    }
  }
}
