// [teams] 팀: 팀 고르기·옮기기(사람 수 균형), 팀의 점수와 사람마다의 점수, 점수판(공유 상태), 사람마다의 팀(상태 줄에 실어 화면이 팀 색 옷을 입힌다).
// 팀의 표와 규칙은 내용의 TEAMS, TEAM_RULES (engine/shared/defs/teams.ts). 화면의 짝은 engine/client/hud/teams.ts.
// 상태는 이 시스템 안에만 있다 (엔티티 id → 팀 번호, 점수): 엔티티(Ent)에 칸을 더하지 않는다. 나가면 빠진다.
// 저장은 TEAM_RULES.persist일 때만 (캐릭터 저장의 ext 'teams': 팀 id와 내 점수, 월드 저장의 'teams': 팀 id → 점수). 기본은 아무것도 저장하지 않는다.
// 사람마다 남이 보는 값(g.playerSync)은 이 시스템이 쓴다: [팀 번호, …게임의 값]. 게임이 사람에게 값을 더 실으려면 g.playerSync 대신 g.teams.syncAlso.
// 무엇을 하면 점수가 오르는지(골, 깃발, 처치)는 게임이 정한다: g.teams.add(팀, n), g.teams.addPlayer(사람, n).
import { TEAM_RULES, TEAMS, type TeamBoard, type TeamDef, type TeamMe } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

/** 저장한 점수를 읽을 때의 상한 (깨진 저장을 막는다) */
const SCORE_MAX = 1e9;
const readScore = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-SCORE_MAX, Math.min(SCORE_MAX, Math.round(v))) : 0);

export class Teams {
  /** 팀들 (내용의 TEAMS: 차례가 번호) */
  readonly list: readonly TeamDef[] = TEAMS;
  /** 사람(엔티티 id) → 팀 번호 */
  private readonly side = new Map<number, number>();
  /** 사람(엔티티 id) → 내 점수 */
  private readonly pts = new Map<number, number>();
  /** 팀마다의 점수 */
  private readonly scores: number[] = TEAMS.map(() => 0);
  /** 사람에게 더 실을 게임의 값 (syncAlso) */
  private extra: ((p: Ent) => readonly number[]) | null = null;

  constructor(private g: Game) {
    if (!TEAMS.length) console.warn('[teams] 모듈 teams를 골랐지만 내용의 TEAMS가 비어 있습니다: 고를 팀이 없습니다');
    g.commands.set('team', (p, m) => { this.pick(p, m.team); });
    g.on('playerLeft', (id) => this.drop(id));
    g.shared.push({ name: 'teams', state: (): TeamBoard => this.board() });
    g.personal.push({ name: 'team', state: (p): TeamMe => ({ i: this.index(p), score: this.playerScore(p) }) });
    g.playerSync((p) => (this.extra ? [this.index(p), ...this.extra(p)] : [this.index(p)]));
    if (TEAM_RULES.persist) {
      g.saves.push({ name: 'teams', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
      g.worldSaves.push({ name: 'teams', save: () => this.saveWorld(), load: (raw) => this.loadWorld(raw) });
    }
  }

  // ---------- 누가 어느 팀인가 ----------
  /** 그 사람의 팀 번호 (없으면 -1) */
  index(p: Ent | number): number { return this.side.get(typeof p === 'number' ? p : p.id) ?? -1; }
  /** 그 사람의 팀 (없으면 undefined) */
  of(p: Ent | number): TeamDef | undefined { return this.list[this.index(p)]; }
  /** 그 팀의 사람 수 (but: 이 사람은 빼고 센다) */
  count(team: number, but = 0): number { let n = 0; for (const [id, s] of this.side) if (s === team && id !== but) n++; return n; }
  /** 그 팀의 사람들 (월드에 있는 플레이어. 층은 가리지 않는다) */
  *members(team: number): Generator<Ent> {
    for (const [id, s] of this.side) {
      if (s !== team) continue;
      const p = this.g.ents.get(id);
      if (p && p.kind === 'p') yield p;
    }
  }
  /** 팀이 있는 사람들과 그 팀 */
  *all(): Generator<[Ent, number]> {
    for (const [id, s] of this.side) {
      const p = this.g.ents.get(id);
      if (p && p.kind === 'p') yield [p, s];
    }
  }
  /** 팀이 있는 사람의 수 */
  get size(): number { return this.side.size; }

  /** 들어갈 수 있는가: 'ok', 'same'(이미 그 팀), 'bad'(없는 팀), 'full'(사람이 더 많은 팀: balance), 'stay'(옮길 수 없다: switch가 꺼짐) */
  canJoin(p: Ent, team: number): 'ok' | 'same' | 'bad' | 'full' | 'stay' {
    if (!Number.isInteger(team) || team < 0 || team >= this.list.length) return 'bad';
    const now = this.index(p);
    if (now === team) return 'same';
    if (now >= 0 && !TEAM_RULES.switch) return 'stay';
    if (TEAM_RULES.balance) {
      // 나를 빼고 셌을 때, 그 팀이 가장 적은 다른 팀보다 많으면 못 간다 (같으면 된다)
      let least = Infinity;
      for (let i = 0; i < this.list.length; i++) if (i !== team) least = Math.min(least, this.count(i, p.id));
      if (this.count(team, p.id) > least) return 'full';
    }
    return 'ok';
  }

  /** 플레이어의 명령: 그 팀에 들어간다 (옮긴다). 안 되면 까닭을 알린다. 들어갔으면 true */
  pick(p: Ent, raw: unknown): boolean {
    const team = typeof raw === 'number' ? raw : NaN;
    const why = this.canJoin(p, team);
    if (why === 'full') this.g.notify(p, 'teamFull', team);
    else if (why === 'stay') this.g.notify(p, 'teamStay', this.index(p));
    if (why !== 'ok') return false;
    this.set(p, team);
    this.g.notify(p, 'teamJoined', team);
    return true;
  }

  /** 사람이 가장 적은 팀에 넣는다 (같으면 앞 팀). 이미 팀이 있으면 그대로. 들어간 팀 번호 (팀이 없으면 -1) */
  auto(p: Ent): number {
    const now = this.index(p);
    if (now >= 0 || !this.list.length) return now;
    let best = 0;
    for (let i = 1; i < this.list.length; i++) if (this.count(i) < this.count(best)) best = i;
    this.set(p, best);
    this.g.notify(p, 'teamJoined', best);
    return best;
  }

  /** 규칙(균형, 옮기기)을 보지 않고 넣는다 (게임이 정해 줄 때). -1이면 팀에서 뺀다 */
  set(p: Ent, team: number): void {
    if (team < 0 || team >= this.list.length) { this.leave(p); return; }
    if (this.side.get(p.id) === team) return;
    this.side.set(p.id, team);
    this.changed(p);
  }

  /** 팀에서 뺀다 (내 점수는 남는다) */
  leave(p: Ent): void { if (this.side.delete(p.id)) this.changed(p); }

  /** 나갔다: 팀과 내 점수를 잊는다 (저장하는 게임은 나가기 전에 저장했다) */
  private drop(id: number): void {
    const had = this.side.delete(id);
    this.pts.delete(id);
    if (had) this.g.stateDirty = true;
  }

  private changed(p: Ent): void {
    this.g.stateDirty = true;
    if (TEAM_RULES.persist) p.unsaved = true;
  }

  // ---------- 점수 ----------
  /** 그 팀의 점수 */
  score(team: number): number { return this.scores[team] ?? 0; }
  /** 팀에 점수를 더한다 (빼려면 음수) */
  add(team: number, n = 1): void {
    if (!(team >= 0 && team < this.scores.length) || !Number.isFinite(n)) return;
    this.scores[team] += n;
    this.g.stateDirty = true;
    if (TEAM_RULES.persist) this.g.saveDirty = true;
  }
  /** 팀의 점수를 모두 0으로 (새 판). players면 사람마다의 점수도 */
  reset(players = false): void {
    this.scores.fill(0);
    if (players) { for (const id of this.pts.keys()) { const p = this.g.ents.get(id); if (p && TEAM_RULES.persist) p.unsaved = true; } this.pts.clear(); }
    this.g.stateDirty = true;
    if (TEAM_RULES.persist) this.g.saveDirty = true;
  }
  /** 그 사람의 점수 */
  playerScore(p: Ent | number): number { return this.pts.get(typeof p === 'number' ? p : p.id) ?? 0; }
  /** 사람에게 점수를 더한다 (개인 상태로 본인에게 간다) */
  addPlayer(p: Ent, n = 1): void {
    if (!Number.isFinite(n)) return;
    this.pts.set(p.id, this.playerScore(p) + n);
    if (TEAM_RULES.persist) p.unsaved = true;
  }
  /** 가장 점수가 많은 팀 (같으면 -1) */
  leader(): number {
    let best = -1, top = -Infinity, tie = false;
    this.scores.forEach((s, i) => { if (s > top) { top = s; best = i; tie = false; } else if (s === top) tie = true; });
    return tie ? -1 : best;
  }

  /** 점수판: 팀마다의 점수와 사람 수 */
  board(): TeamBoard { return { score: [...this.scores], count: this.list.map((_, i) => this.count(i)) }; }

  /** 사람에게 더 실을 게임의 값 (상태 줄에서 팀 번호 뒤에 붙는다). g.playerSync는 이 모듈이 쓰므로 그 대신 이것을 쓴다 */
  syncAlso(fn: ((p: Ent) => readonly number[]) | null): void { this.extra = fn; }

  // ---------- 저장 (TEAM_RULES.persist일 때만 등록된다) ----------
  private saveOf(p: Ent): { t: string; s: number } | undefined {
    const team = this.of(p), s = this.playerScore(p);
    return team || s ? { t: team?.id ?? '', s } : undefined;
  }
  private loadOf(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const d = raw as { t?: unknown; s?: unknown };
    const i = this.list.findIndex((x) => x.id === d.t);
    if (i >= 0) { this.side.set(p.id, i); this.g.stateDirty = true; }
    const s = readScore(d.s);
    if (s) this.pts.set(p.id, s);
  }
  private saveWorld(): Record<string, number> | undefined {
    return this.scores.some((s) => s !== 0) ? Object.fromEntries(this.list.map((t, i) => [t.id, this.scores[i]])) : undefined;
  }
  private loadWorld(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const d = raw as Record<string, unknown>;
    this.list.forEach((t, i) => { this.scores[i] = readScore(d[t.id]); });
    this.g.stateDirty = true;
  }
}
