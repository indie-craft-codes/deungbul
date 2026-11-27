// [ranked] 랭크 대전 (묶음 8): 판(rooms)의 RoomDef.rated와 내용의 COMPETE.
//   레이팅   Glicko-2 (engine/shared/defs/compete.ts의 glicko). 사다리(RoomDef.rated: true면 판의 이름)마다 저장 키(pid)의 레이팅. 셋 이상·팀은 쌍대 비교로 한 번에.
//            배치 경기(placement)를 마치기 전과, 쉬어서 RD가 showRd 이상이면 등급을 숨기고 순위표에서 뺀다 (휴면 점거 방지). 쉬면 RD가 하루에 perDay씩 는다 (idleDays 뒤, rdMax까지)
//   반영 안 함  모든 사람이 끊겼거나 떠난 판(둘 다 끊김), 누군가 첫 수를 두기 전에 떠나 끝난 판 (첫 수 전 취소). 떠난 사람의 이탈은 그래도 센다
//   랭크 판의 이탈은 패배  떠난 자리(나감·끊긴 채 돌아오지 않음·잠수)는 등수가 맨 뒤다
//   잠수     시간 넘김이 COMPETE.leave.afkTurns번 이어지면(그 사이 수가 늘지 않음) 판에서 뺀다 (랭크 판만)
//   이탈 제재  떠날 때마다 점수 1: 점수의 단계(steps 분: 0이면 경고)만큼 큐 금지. decayH시간마다 점수가 하나 준다. 기록은 관리자 명령 leavers로 본다
//   시즌     COMPETE.season.period(없으면 SEASON의 주기)가 바뀌면 모두를 기준 쪽으로 pull만큼 당기고 RD를 rdTo 이상으로. 지난 시즌 최고 등급의 보상은 우편(sendTo: 접속하지 않은 사람도)
// 저장: 월드의 ranked 칸 { season, n, lad: { 사다리: { pid: 레이팅 } }, leave: { pid: 이탈 } }. 개인 상태 rating(RatingMe[])·leave(LeaveMe). 순위표 'rating:<사다리>'(boards 모듈).
// 큐는 queue.ts (같은 모듈).
import { SEASON, competeRules, glicko, idleRd, leaveDecay, leaveMinutes, pairwise, ratingCfg, seasonAt, seasonPull, tierOf, type LeaveMe, type RatingCfg, type RatingMe, type Versus } from '../../../shared/defs';
import { NAME_MAX } from '../../../shared/world';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { personalData } from '../personal';
import { ratingBoardId } from './boards';
import { Queue } from './queue';
import type { Room } from './rooms';

/** 한 사람의 한 사다리 */
export interface RatingRec { name: string; r: number; rd: number; vol: number; n: number; w: number; l: number; d: number; at: number; best: number; hist?: [string, number][] }
/** 한 사람의 이탈 기록: 점수, 마지막으로 점수를 바꾼 때, 큐 금지의 끝, 최근 기록 [때, 판의 이름, 까닭] */
export interface LeaveRec { p: number; at: number; ban: number; log: [number, string, string][] }
/** 봇의 RD (queue.botR가 있을 때 봇의 레이팅에 붙인다) */
const BOT_RD = 150;
const LOG_KEEP = 20, HIST_KEEP = 8, CHECK_S = 5;

export class Ranked {
  /** 사다리 → pid → 레이팅 */
  readonly lad = new Map<string, Map<string, RatingRec>>();
  readonly leaves = new Map<string, LeaveRec>();
  /** 마지막 판의 변화 (pid → 사다리 → 변화): 결과 창의 +12 */
  private readonly last = new Map<string, Map<string, { d: number; room: number; tier: number }>>();
  /** 잠수: 판 id·자리 → [이어진 시간 넘김, 그때의 수] */
  private readonly afk = new Map<string, [number, number]>();
  private season = '';
  private seasonN = 0;
  private acc = 0;
  readonly queue: Queue;
  /** 순위표의 줄을 다시 셀지 (사다리마다의 판 버전) */
  private ver = 0;
  private readonly boardCache = new Map<string, { ver: number; day: number; rows: { pid: string; name: string; v: number }[] }>();

  constructor(private g: Game) {
    this.queue = new Queue(g, this);
    g.worldSaves.push({ name: 'ranked', save: () => this.save(), load: (raw) => this.load(raw) });
    g.rooms.hooks.finish.push((room) => this.finished(room));
    g.rooms.hooks.timeout.push((room, seat) => this.timedOut(room, seat));
    g.personal.push({ name: 'rating', state: (p) => (p.bot ? null : this.me(p)) });
    g.personal.push({ name: 'leave', state: (p): LeaveMe | null => (p.bot || !p.pid ? null : { ban: Math.max(0, this.banUntil(p.pid) - this.g.now()) > 0 ? Math.ceil((this.banUntil(p.pid) - this.g.now()) / 60_000) : 0, pts: this.points(p.pid) }) });
    g.ticks.push((dt) => { this.acc += dt; if (this.acc >= CHECK_S) { this.acc = 0; this.rollSeason(); } });
    g.on('playerRenamed', (p) => { for (const m of this.lad.values()) { const r = p.pid ? m.get(p.pid) : undefined; if (r) { r.name = p.name; this.ver++; } } });
    personalData(g).push({
      name: 'ranked',
      get: (pid) => { const lad = Object.fromEntries([...this.lad].filter(([, m]) => m.has(pid)).map(([k, m]) => [k, m.get(pid)])); const lv = this.leaves.get(pid); return Object.keys(lad).length || lv ? { lad, leave: lv } : undefined; },
      erase: (pid) => { for (const m of this.lad.values()) m.delete(pid); this.leaves.delete(pid); this.ver++; this.g.saveDirty = true; },
    });
    // 사다리마다의 레이팅 순위표 (boards 모듈), 시즌의 열쇠를 순위표의 기간 'season'에
    g.ready.push(() => {
      this.ladders().forEach((id) => { if (!this.lad.has(id)) this.lad.set(id, new Map()); });
      g.boards.season = () => this.seasonNow();
      for (const id of this.ladders()) {
        const bid = ratingBoardId(id);
        if (g.boards.has(bid)) continue;
        g.boards.adopt({ tab: { id: bid, name: this.ladders().length > 1 ? `boardRating:${id}` : 'boardRating', period: 'season', fmt: 'rating' }, rows: () => this.boardRows(id), to: () => this.seasonNow()?.to ?? 0 });
      }
      if (!this.season) { const s = this.seasonNow(); this.season = s?.key ?? ''; this.seasonN = s?.n ?? 0; }
    });
  }

  private cfg(): RatingCfg { return ratingCfg(); }
  /** 랭크 판의 사다리들 (RoomDef.rated) */
  ladders(): string[] { return [...new Set(this.g.rooms.defIds().map((id) => this.ladderOf(id)).filter((x): x is string => !!x))]; }
  /** 판의 이름 → 사다리 (랭크 판이 아니면 '') */
  ladderOf(defId: string): string { const r = this.g.rooms.defOf(defId)?.rated; return r ? (typeof r === 'string' ? r : defId) : ''; }

  /** 지금 레이팅 시즌 (없으면 null) */
  seasonNow(): { key: string; n: number; to: number } | null {
    const period = competeRules()?.season?.period ?? SEASON?.period;
    return period ? seasonAt({ name: '', period, points: {}, track: [] }, this.g.now(), this.g.time.cal) : null;
  }

  /** 그 사람의 레이팅 (없으면 처음 값). 쉰 동안 늘어난 RD를 넣은 것 */
  rating(ladder: string, pid: string): RatingRec {
    const c = this.cfg(), r = this.lad.get(ladder)?.get(pid);
    if (!r) return { name: '', r: c.start, rd: c.rd, vol: c.vol, n: 0, w: 0, l: 0, d: 0, at: 0, best: -1 };
    return { ...r, rd: idleRd(r.rd, r.at, this.g.now(), c) };
  }
  /** 등급이 보이는가 (배치를 마쳤고 RD가 기준 아래) */
  shown(rec: RatingRec): boolean { const c = this.cfg(); return rec.n >= c.placement && rec.rd < c.showRd; }

  private me(p: Ent): RatingMe[] {
    const s = this.seasonNow(), c = this.cfg();
    return this.ladders().map((id) => {
      const rec = this.rating(id, p.pid), ok = this.shown(rec), last = this.last.get(p.pid)?.get(id) ?? null;
      return { id, r: rec.n >= c.placement ? Math.round(rec.r) : 0, tier: ok ? tierOf(rec.r) : -1, n: Math.min(rec.n, c.placement), need: c.placement, unsure: rec.n >= c.placement && !ok ? 1 : 0, best: rec.best, season: s?.n ?? 0, to: s?.to ?? 0, last, w: rec.w, l: rec.l, dr: rec.d };
    });
  }

  /** 레이팅 순위표의 줄: 배치를 마치고 RD가 기준 아래인 사람, 높은 차례 (같으면 판을 많이 둔 사람, 그다음 먼저 둔 사람) */
  private boardRows(ladder: string): { pid: string; name: string; v: number }[] {
    const day = Math.floor(this.g.now() / 3_600_000), hit = this.boardCache.get(ladder);
    if (hit && hit.ver === this.ver && hit.day === day) return hit.rows;
    const rows = [...(this.lad.get(ladder) ?? new Map<string, RatingRec>())].map(([pid]) => ({ pid, rec: this.rating(ladder, pid) }))
      .filter((x) => this.shown(x.rec)).sort((a, b) => b.rec.r - a.rec.r || b.rec.n - a.rec.n || a.rec.at - b.rec.at)
      .map((x) => ({ pid: x.pid, name: x.rec.name, v: Math.round(x.rec.r) }));
    this.boardCache.set(ladder, { ver: this.ver, day, rows });
    return rows;
  }

  // ---------- 판이 끝났다 ----------

  private finished(room: Room<unknown>): void {
    this.afkClear(room);
    if (!room.rated) return;
    const ladder = this.ladderOf(room.def);
    if (!ladder) return;
    const def = this.g.rooms.defOf(room.def)!, c = this.cfg(), rules = competeRules(), now = this.g.now();
    const humans = room.seats.map((s, i) => ({ s, i })).filter((x) => !!x.s && !x.s.cpu);
    // 이탈은 반영 여부와 상관없이 센다
    for (const [i, why] of room.leavers) { const s = room.seats[i]; if (s && !s.cpu && s.key && !s.key.startsWith('guest:')) this.addLeave(s.key, room.def, why); }
    // 반영 안 함: 모두 끊겼거나 떠남 / 누군가 첫 수 전에 떠남
    const stayed = humans.filter((x) => x.s!.goneAt === 0 && !room.leavers.has(x.i));
    const early = room.leavers.size > 0 && humans.some((x) => (room.moves[x.i] ?? 0) === 0);
    if (!stayed.length || early) {
      for (const x of humans) { const p = this.g.rooms.playerAt(room, x.i); if (p) this.g.notify(p, 'rankedVoid', stayed.length ? 1 : 0); }
      return;
    }
    // 등수: 게임이 준 것, 없으면 이김/짐. 떠난 자리는 맨 뒤
    const n = room.seats.length;
    let ranks = room.seats.map((s, i) => (!s ? 0 : room.ranks.length ? room.ranks[i] || n : room.win === -2 ? 1 : room.win === i ? 1 : 2));
    const worst = Math.max(...ranks) + 1;
    ranks = ranks.map((k, i) => (room.leavers.has(i) && k > 0 ? worst : k));
    const teams = def.teamOf ? room.seats.map((_, i) => def.teamOf!(room, i)) : undefined;
    const botR = rules?.queue?.botR;
    const before = room.seats.map((s) => (!s ? null : s.cpu ? (s.bot && botR !== undefined ? { r: botR, rd: BOT_RD } : null) : s.key && !s.key.startsWith('guest:') ? this.rating(ladder, s.key) : { r: c.start, rd: c.rd }));
    const pairs = pairwise(ranks.map((k, i) => (before[i] ? k : 0)), teams);
    const m = this.lad.get(ladder) ?? new Map<string, RatingRec>();
    this.lad.set(ladder, m);
    for (const x of humans) {
      const s = x.s!;
      if (!s.key || s.key.startsWith('guest:')) continue;
      const old = this.rating(ladder, s.key), vs: Versus[] = pairs[x.i].map((q) => ({ r: before[q.j]!.r, rd: before[q.j]!.rd, s: q.s }));
      if (!vs.length) continue; // 봇만 남은 판 (botR가 없다)
      const nu = glicko(old, vs, c);
      const res = room.leavers.has(x.i) ? 1 : this.g.rooms.resultOf(room, x.i);
      const rec: RatingRec = { ...old, name: s.name.slice(0, NAME_MAX), r: nu.r, rd: nu.rd, vol: nu.vol, n: old.n + 1, at: now, w: old.w + (res === 0 ? 1 : 0), l: old.l + (res === 1 ? 1 : 0), d: old.d + (res === 2 ? 1 : 0) };
      const wasShown = this.shown(old), isShown = this.shown(rec), t0 = wasShown ? tierOf(old.r) : -1, t1 = isShown ? tierOf(rec.r) : -1;
      if (t1 > rec.best) rec.best = t1;
      m.set(s.key, rec);
      const d = old.n >= c.placement && rec.n >= c.placement ? Math.round(rec.r) - Math.round(old.r) : 0;
      const lm = this.last.get(s.key) ?? new Map();
      lm.set(ladder, { d, room: room.id, tier: t1 });
      this.last.set(s.key, lm);
      const p = this.g.rooms.playerAt(room, x.i);
      if (p) {
        if (old.n < c.placement && rec.n >= c.placement) this.g.notify(p, 'rankedPlaced', t1, Math.round(rec.r));
        else if (wasShown && isShown && t1 !== t0) this.g.notify(p, 'rankedTier', t1, t1 > t0 ? 1 : 0);
        p.metaDirty = true;
      }
    }
    this.ver++;
    this.g.saveDirty = true;
  }

  // ---------- 잠수 ----------

  private timedOut(room: Room<unknown>, seat: number): void {
    if (!room.rated) return;
    const s = room.seats[seat], need = competeRules()?.leave?.afkTurns ?? 0;
    if (!s || s.cpu || need <= 0) return;
    const k = `${room.id}:${seat}`, moves = room.moves[seat] ?? 0, was = this.afk.get(k);
    const run = was && was[1] === moves ? was[0] + 1 : 1;
    this.afk.set(k, [run, moves]);
    if (run < need) return;
    this.afk.delete(k);
    for (const q of this.g.rooms.players(room)) this.g.notify(q, 'afkOut', s.name);
    this.g.rooms.drop(room, seat, 'afk');
  }
  private afkClear(room: Room<unknown>): void { for (const k of [...this.afk.keys()]) if (k.startsWith(`${room.id}:`)) this.afk.delete(k); }

  // ---------- 이탈 제재 ----------

  /** 지금의 이탈 점수 (시간이 지나 준 것) */
  points(pid: string): number { const r = this.leaves.get(pid); return r ? leaveDecay(r.p, r.at, this.g.now()) : 0; }
  /** 큐 금지의 끝 (UTC ms, 없으면 0) */
  banUntil(pid: string): number { const r = this.leaves.get(pid); return r && r.ban > this.g.now() ? r.ban : 0; }
  private addLeave(pid: string, def: string, why: string): void {
    const now = this.g.now(), old = this.leaves.get(pid);
    const pts = (old ? leaveDecay(old.p, old.at, now) : 0) + 1, mins = leaveMinutes(pts);
    const rec: LeaveRec = { p: pts, at: now, ban: mins ? Math.max(old?.ban ?? 0, now + mins * 60_000) : old?.ban ?? 0, log: [...(old?.log ?? []), [now, def, why] as [number, string, string]].slice(-LOG_KEEP) };
    this.leaves.set(pid, rec);
    this.g.saveDirty = true;
    const p = this.online(pid);
    if (p) this.g.notify(p, mins ? 'leavePenalty' : 'leaveWarn', mins);
  }
  /** 접속해 있는 그 사람 */
  online(pid: string): Ent | undefined { if (!pid) return undefined; for (const e of this.g.ents.values()) if (e.kind === 'p' && !e.bot && e.pid === pid) return e; return undefined; }
  /** 관리자: 이탈 기록을 지운다 (고객지원의 판단) */
  forgive(pid: string): boolean { const had = this.leaves.delete(pid); if (had) this.g.saveDirty = true; return had; }

  // ---------- 시즌 ----------

  private rollSeason(): void {
    const s = this.seasonNow();
    if (!s || s.key === this.season) return;
    const oldKey = this.season, oldN = this.seasonN;
    this.season = s.key; this.seasonN = s.n;
    this.g.saveDirty = true;
    if (!oldKey) return; // 처음 켰다
    const c = this.cfg(), rules = competeRules(), tiers = rules?.tiers ?? [], rewards = rules?.season?.rewards ?? {};
    for (const [, m] of this.lad) for (const [pid, r] of m) {
      if (r.best >= 0 && tiers[r.best]) {
        const reward = rewards[tiers[r.best].id];
        if (reward && this.g.has('mail')) this.g.mail.sendTo(pid, 'rankSeason', [oldN || oldKey, r.best], reward);
      }
      r.hist = [...(r.hist ?? []), [oldKey, r.best] as [string, number]].slice(-HIST_KEEP);
      const pulled = seasonPull({ r: r.r, rd: idleRd(r.rd, r.at, this.g.now(), c), vol: r.vol }, c, rules?.season);
      r.r = pulled.r; r.rd = pulled.rd; r.best = -1;
      const p = this.online(pid);
      if (p) this.g.notify(p, 'rankedSeason', s.n, r.hist[r.hist.length - 1][1]);
    }
    this.last.clear();
    this.ver++;
  }

  // ---------- 저장 ----------

  private save(): unknown {
    return { season: this.season, n: this.seasonN, lad: Object.fromEntries([...this.lad].map(([k, m]) => [k, Object.fromEntries(m)])), leave: Object.fromEntries(this.leaves) };
  }
  private load(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const w = raw as { season?: unknown; n?: unknown; lad?: unknown; leave?: unknown };
    if (typeof w.season === 'string') this.season = w.season;
    if (typeof w.n === 'number' && Number.isInteger(w.n)) this.seasonN = w.n;
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const c = this.cfg();
    if (typeof w.lad === 'object' && w.lad !== null) for (const [k, m] of Object.entries(w.lad as Record<string, unknown>)) {
      if (typeof m !== 'object' || m === null) continue;
      const map = new Map<string, RatingRec>();
      for (const [pid, v] of Object.entries(m as Record<string, Record<string, unknown>>)) {
        if (!pid || typeof v !== 'object' || v === null) continue;
        map.set(pid, { name: typeof v.name === 'string' ? v.name.slice(0, NAME_MAX) : '', r: num(v.r, c.start), rd: Math.max(c.rdMin, Math.min(c.rdMax, num(v.rd, c.rd))), vol: num(v.vol, c.vol), n: num(v.n, 0), w: num(v.w, 0), l: num(v.l, 0), d: num(v.d, 0), at: num(v.at, 0), best: num(v.best, -1), ...(Array.isArray(v.hist) ? { hist: (v.hist as [string, number][]).slice(-HIST_KEEP) } : {}) });
      }
      this.lad.set(k, map);
    }
    if (typeof w.leave === 'object' && w.leave !== null) for (const [pid, v] of Object.entries(w.leave as Record<string, Record<string, unknown>>)) {
      if (!pid || typeof v !== 'object' || v === null) continue;
      this.leaves.set(pid, { p: num(v.p, 0), at: num(v.at, 0), ban: num(v.ban, 0), log: Array.isArray(v.log) ? (v.log as [number, string, string][]).slice(-LOG_KEEP) : [] });
    }
    this.ver++;
  }
}
