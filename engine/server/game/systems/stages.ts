// [stages] 단계: 장과 단계(내용의 CHAPTERS. id는 '장-단계': 1-1, 1-2 …)를 차례로 깬다.
// 단계는 그 사람만의 층(인스턴스: 던전과 같은 층 번호의 줄 layers.ts의 instanceLayer)에서 STAGE_RULES.arena를 가운데로 벌어진다.
// 물결(StageDef.waves)을 차례로 다 잡고 우두머리(boss)를 잡으면 깬다 → 보상(지갑과 가방으로 바로, 처음 깨면 first도) → 자동 진행이 켜져 있으면 다음 단계로.
// 실패(쓰러짐, 제한 시간): 가장 멀리 깬 단계로 돌아가 자동 진행을 끄고 그 단계를 되풀이한다(파밍). 사람이 '도전'(go)으로 다음 단계를 다시 고른다.
// 몬스터는 몰려온 적(swarm)으로 놓는다: 집으로 돌아가지 않고 죽으면 다시 나오지 않는다. 대상이 없으면 이 시스템이 사람이나 그 영웅을 노리게 한다.
// 단계 안에서는 사람도 서버가 대신 싸운다 (STAGE_RULES.leaderAuto: 손으로 움직이면 1.5초 동안은 맡기지 않는다).
// 방치 보상(idle 모듈)은 깬 단계의 수를 받는다 (g.idle.stageOf).
// 저장: 캐릭터의 ext 'stages' ({ cur, best, auto }). 본인에게는 개인 상태 'stage' (StageMe: 진행 중이면 물결·남은 적·남은 시간까지).
import { MONSTERS, STAGE_RULES, STAGES, classOf, isMonsterId, isSkillId, skillDef, stageIndex, waveCount, type MonsterDef, type MonsterId, type Reward, type StageMe, type StageRef } from '../../../shared/defs';
import { resolve } from '../../../shared/sim';
import { clampInto } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { fieldLayer, instanceLayer, isField } from '../layers';
import { CURS } from './wallet';

/** 지갑과 가방에 넘기는 원인의 이름: 단계를 깬 보상 */
export const STAGE_WHY = 'stage';

interface Run {
  p: Ent; layer: number; stage: StageRef;
  /** 지금 물결 (0부터. waves.length면 우두머리) */
  wave: number;
  mobs: Set<number>;
  /** 이 물결에 나온 적의 수 */
  total: number;
  state: 'fight' | 'gap' | 'clear' | 'fail';
  /** 다음 일까지 남은 시간(초): gap이면 다음 물결, clear면 다음 단계, fail이면 다시 하기 */
  wait: number;
  /** 남은 제한 시간(초) */
  left: number;
  /** 들어오기 전의 자리와 층 (나갈 때 돌아간다) */
  back: { x: number; z: number; layer: number };
  /** 사람을 대신 싸우게 할 생각의 간격 */
  think: number;
}

/** 단계가 없다는 알림을 이미 했다 (한 프로세스에 한 번: 시험은 게임을 여러 번 만든다) */
let warned = false;

export class Stages {
  private readonly runs = new Map<number, Run>();
  /** 층 → 그 층의 회차 */
  private readonly byLayer = new Map<number, Run>();

  constructor(private g: Game) {
    if (!STAGES.length && !warned) { warned = true; console.warn('[stages] 모듈 stages를 골랐지만 내용의 CHAPTERS가 비어 있습니다: 단계가 없습니다'); }
    for (const s of STAGES) for (const w of [...s.def.waves.flat(), ...(s.def.boss ? [s.def.boss] : [])]) if (!isMonsterId(w.type)) throw new Error(`[stages] 단계 ${s.id}의 몬스터 '${w.type}'가 MONSTERS에 없습니다`);
    g.commands.set('stage', (p, m) => this.command(p, m));
    g.ticks.push((dt) => this.tick(dt));
    g.saves.push({ name: 'stages', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'stage', state: (p) => this.me(p) });
    g.on('monsterKilled', (m) => this.killed(m));
    g.on('playerDied', (p) => { const r = this.runs.get(p.id); if (r && r.state !== 'fail') this.fail(r, 0); });
    g.on('playerDropped', (p) => this.leave(p, false));
    g.on('playerLeft', (id) => { const r = this.runs.get(id); if (r) this.end(r); });
    g.on('playerJoined', (p) => { if (STAGE_RULES.enterOnJoin && !p.bot && STAGES.length) this.start(p, this.curIndex(p)); });
    // 단계 안에서 쓰러지면 그 단계의 가운데에서 일어난다 (회차는 실패로 끝나고 잠시 뒤 다시 시작한다)
    const respawn = g.rules.respawn;
    g.rules.respawn = (p) => (this.runs.has(p.id) ? { x: STAGE_RULES.arena.x, z: STAGE_RULES.arena.z, id: 'stage' } : respawn(p));
    if (g.has('idle')) g.idle.stageOf = (p) => this.cleared(p);
  }

  // ---------- 읽기 ----------
  /** 지금 단계의 번호 (저장된 것이 없거나 없는 단계면 0) */
  curIndex(p: Ent): number { return Math.max(0, stageIndex(p.stage.cur)); }
  /** 가장 멀리 깬 단계의 번호 (없으면 -1) */
  bestIndex(p: Ent): number { return stageIndex(p.stage.best); }
  /** 깬 단계의 수 (방치 보상의 셈) */
  cleared(p: Ent): number { return this.bestIndex(p) + 1; }
  /** 진행 중인가 */
  inStage(p: Ent): boolean { return this.runs.has(p.id); }

  private me(p: Ent): StageMe {
    const r = this.runs.get(p.id);
    return {
      cur: STAGES[this.curIndex(p)]?.id ?? '', best: p.stage.best, auto: p.stage.auto,
      run: r ? { id: r.stage.id, wave: r.wave, waves: waveCount(r.stage.def), foes: r.mobs.size, total: r.total, left: Math.ceil(Math.max(0, r.state === 'fight' || r.state === 'gap' ? r.left : r.wait)), state: r.state, boss: r.wave >= r.stage.def.waves.length && !!r.stage.def.boss } : null,
    };
  }

  // ---------- 명령 ----------
  private command(p: Ent, m: Record<string, unknown>): void {
    if (p.bot || !STAGES.length) return;
    if (m.a === 'start') { if (!this.runs.has(p.id)) this.start(p, this.curIndex(p)); }
    else if (m.a === 'leave') this.leave(p, true);
    else if (m.a === 'auto') { p.stage.auto = m.on === true; p.unsaved = true; }
    else if (m.a === 'go' && typeof m.id === 'string') {
      const i = stageIndex(m.id);
      if (i < 0) return;
      // 깬 단계와 그다음 단계까지만 고를 수 있다
      if (i > this.bestIndex(p) + 1) { this.g.notify(p, 'stageLocked', m.id); return; }
      p.stage.cur = STAGES[i].id; p.unsaved = true;
      this.start(p, i);
    }
  }

  // ---------- 회차 ----------
  /** 그 단계를 처음부터 시작한다 (진행 중이면 같은 층에서 다시) */
  start(p: Ent, i: number): void {
    const g = this.g, stage = STAGES[i];
    if (!stage || p.kind !== 'p' || g.ents.get(p.id) !== p) return;
    // 던전 안에서는 시작하지 않는다
    if (!this.runs.has(p.id) && !isField(p.layer)) return;
    let r = this.runs.get(p.id);
    if (r) this.despawn(r);
    else {
      r = { p, layer: instanceLayer(g), stage, wave: 0, mobs: new Set(), total: 0, state: 'fight', wait: 0, left: 0, back: { x: p.x, z: p.z, layer: p.layer }, think: 0 };
      this.runs.set(p.id, r);
      this.byLayer.set(r.layer, r);
    }
    r.stage = stage; r.wave = 0; r.left = stage.def.timeS ?? STAGE_RULES.timeS; r.state = 'fight'; r.wait = 0;
    p.stage.cur = stage.id; p.unsaved = true;
    // 사람을 단계의 가운데로 (체력을 채운다: 앞 단계의 상처를 끌고 들어가지 않게)
    this.place(p, STAGE_RULES.arena.x, STAGE_RULES.arena.z + 3, r.layer);
    if (g.has('combat')) { p.hp = p.maxHp; p.targetId = 0; }
    this.spawnWave(r);
  }

  /** 그 사람을 그 자리·층으로 옮긴다 (화면이 바로 옮기게 알린다) */
  private place(p: Ent, x: number, z: number, layer: number): void {
    p.layer = layer; p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.path = null;
    clampInto(p); resolve(p, this.g.world.obstacles);
    this.g.emit(['r', p.id]);
  }

  /** 지금 물결의 몬스터를 놓는다: 가운데 둘레(radius)에 고르게, 사람의 앞쪽(북쪽)부터 */
  private spawnWave(r: Run): void {
    const g = this.g, def = r.stage.def, boss = r.wave >= def.waves.length;
    const list: { type: string; scale: number }[] = boss
      ? (def.boss ? [{ type: def.boss.type, scale: def.scale * (def.boss.scale ?? 1) }] : [])
      : def.waves[r.wave].flatMap((w) => Array.from({ length: Math.max(0, w.n) }, () => ({ type: w.type, scale: def.scale })));
    const c = STAGE_RULES.arena, R = boss ? STAGE_RULES.radius * 0.6 : STAGE_RULES.radius;
    list.forEach((w, k) => {
      const a = -Math.PI / 2 + (list.length > 1 ? (k / (list.length - 1) - 0.5) * Math.PI * 0.9 : 0);
      const m = g.monsters.spawn(w.type as MonsterId, c.x + Math.cos(a) * R, c.z + Math.sin(a) * R, true);
      m.layer = r.layer;
      // 단계의 세기: 체력과 피해를 scale만큼 (정의의 복사본을 그 몬스터에게: 다른 곳의 같은 몬스터는 그대로)
      if (w.scale !== 1) {
        const base: MonsterDef = MONSTERS[w.type as MonsterId];
        m.def = { ...base, dmg: [Math.max(1, Math.round(base.dmg[0] * w.scale)), Math.max(1, Math.round(base.dmg[1] * w.scale))] };
        m.maxHp = Math.max(1, Math.round(base.hp * w.scale)); m.hp = m.maxHp;
      }
      m.wait = 0;
      r.mobs.add(m.id);
    });
    r.total = list.length;
    if (!list.length) this.next(r);
  }

  /** 지금 물결을 다 잡았다: 다음 물결(잠깐 쉬고) 또는 깸 */
  private next(r: Run): void {
    if (r.wave + 1 < waveCount(r.stage.def)) { r.wave++; r.state = 'gap'; r.wait = STAGE_RULES.waveGapS; return; }
    this.clear(r);
  }

  private killed(m: Ent): void {
    const r = this.byLayer.get(m.layer);
    if (!r || !r.mobs.delete(m.id)) return;
    this.g.remove(m.id);
    if (r.state === 'fight' && r.mobs.size === 0) this.next(r);
  }

  /** 깼다: 보상, 가장 멀리 깬 단계, 자동 진행이면 다음 단계를 지금 단계로 */
  private clear(r: Run): void {
    const g = this.g, p = r.p, first = r.stage.i > this.bestIndex(p);
    r.state = 'clear'; r.wait = STAGE_RULES.nextS;
    this.give(p, r.stage.def.reward);
    if (first) { if (r.stage.def.first) this.give(p, r.stage.def.first); p.stage.best = r.stage.id; }
    const last = r.stage.i >= STAGES.length - 1;
    if (p.stage.auto && !last) p.stage.cur = STAGES[r.stage.i + 1].id;
    p.unsaved = true;
    g.notify(p, 'stageClear', r.stage.id, first ? 1 : 0);
    if (p.stage.auto && last && first) g.notify(p, 'stageLast');
    g.fire('stageCleared', p, r.stage.id, first);
  }

  /** 실패했다 (0 쓰러짐, 1 시간): 깬 단계로 돌아가 자동 진행을 끄고 잠시 뒤 다시 */
  private fail(r: Run, why: 0 | 1): void {
    const p = r.p;
    this.despawn(r);
    r.state = 'fail'; r.wait = STAGE_RULES.retryS;
    const back = Math.max(0, Math.min(this.bestIndex(p), r.stage.i - 1));
    p.stage.cur = STAGES[Math.min(r.stage.i, back)]?.id ?? STAGES[0].id;
    p.stage.auto = false;
    p.unsaved = true;
    this.g.notify(p, 'stageFail', r.stage.id, why);
  }

  /** 보상을 바로 준다: 재화는 지갑, 재료·물약은 가방(아이템 모듈이 있으면), 장비는 장비 모듈이 있으면 */
  private give(p: Ent, rw: Reward): void {
    const g = this.g;
    if (g.has('economy')) for (const cur of CURS) { const n = rw[cur]; if (n) g.wallet.add(p, cur, n, STAGE_WHY); }
    if (g.has('items')) for (const [id, n] of Object.entries(rw.items ?? {})) g.bag.putItem(p, id as Parameters<typeof g.bag.putItem>[1], n, STAGE_WHY);
    if (g.has('gear')) for (const it of rw.gear ?? []) g.gear.give(p, it, STAGE_WHY);
  }

  /** 회차의 몬스터를 치운다 */
  private despawn(r: Run): void {
    for (const id of r.mobs) this.g.remove(id);
    r.mobs.clear();
  }

  /** 회차를 끝낸다 (사람은 옮기지 않는다) */
  private end(r: Run): void {
    this.despawn(r);
    this.runs.delete(r.p.id);
    this.byLayer.delete(r.layer);
  }

  /** 단계에서 나온다: 들어오기 전의 자리와 층으로 */
  leave(p: Ent, notify: boolean): void {
    const r = this.runs.get(p.id);
    if (!r) return;
    this.end(r);
    const layer = isField(r.back.layer) ? r.back.layer : fieldLayer(1);
    this.place(p, r.back.x, r.back.z, layer);
    if (this.g.has('combat')) p.targetId = 0;
    if (notify) p.unsaved = true;
  }

  // ---------- 틱 ----------
  private tick(dt: number): void {
    for (const r of [...this.runs.values()]) {
      const p = r.p;
      if (this.g.ents.get(p.id) !== p) { this.end(r); continue; }
      if (r.state === 'fight' || r.state === 'gap') {
        r.left -= dt;
        if (r.left <= 0) { this.fail(r, 1); continue; }
      }
      if (r.state === 'gap') { r.wait -= dt; if (r.wait <= 0) { r.state = 'fight'; this.spawnWave(r); } continue; }
      if (r.state === 'clear' || r.state === 'fail') {
        r.wait -= dt;
        if (r.wait <= 0) this.start(p, this.curIndex(p));
        continue;
      }
      this.aim(r, dt);
    }
  }

  /** 대상이 없는 몬스터는 가장 가까운 사람 편(사람, 영웅)을 노린다. 사람도 맡겼으면 가장 가까운 몬스터를 친다 */
  private aim(r: Run, dt: number): void {
    const g = this.g, p = r.p;
    const friends = [p, ...(g.has('squad') ? g.squad.heroes(p).filter((e) => !e.dead) : [])];
    for (const id of r.mobs) {
      const m = g.ents.get(id);
      if (!m || m.dead || m.targetId) continue;
      let best: Ent | undefined, bd = Infinity;
      for (const f of friends) { const d = dist(m, f); if (d < bd) { bd = d; best = f; } }
      if (best) m.targetId = best.id;
    }
    if (!STAGE_RULES.leaderAuto || !g.has('combat') || p.hp <= 0) return;
    r.think -= dt;
    if (r.think > 0) return;
    r.think = 0.3;
    if (g.clock - p.lastMove < 1.5) return; // 손으로 움직이는 중
    let t = g.ents.get(p.targetId);
    if (!t || t.dead || t.layer !== p.layer) {
      t = undefined;
      let bd = Infinity;
      for (const id of r.mobs) { const m = g.ents.get(id); if (m && !m.dead) { const d = dist(p, m); if (d < bd) { bd = d; t = m; } } }
      if (t) { p.targetId = t.id; p.stuck = 0; }
    }
    if (!t || !g.has('classes')) return;
    // 기술: 쿨다운이 끝난 것 가운데 쓸 수 있는 것 하나 (회복은 체력이 60% 아래일 때만)
    const skills = classOf(p.cls).skills, d = dist(p, t);
    for (let n = 0; n < skills.length; n++) {
      const id = skills[n];
      if (!isSkillId(id) || (p.cds[n] ?? 0) > 0) continue;
      const sd = skillDef(id);
      if (sd.effect.kind === 'heal' && p.hp > p.maxHp * 0.6) continue;
      if (sd.range !== undefined && d > sd.range) continue;
      g.command(p, { t: 'skill', n });
      break;
    }
  }

  // ---------- 저장 ----------
  private saveOf(p: Ent): { cur: string; best: string; auto: boolean } | undefined {
    const s = p.stage;
    return s.cur || s.best || !s.auto ? { cur: s.cur, best: s.best, auto: s.auto } : undefined;
  }
  private loadOf(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const d = raw as { cur?: unknown; best?: unknown; auto?: unknown };
    const id = (v: unknown) => (typeof v === 'string' && stageIndex(v) >= 0 ? v : '');
    const best = id(d.best);
    let cur = id(d.cur);
    // 지금 단계는 깬 단계의 다음을 넘지 않는다 (내용이 바뀌어 단계가 줄었을 때)
    if (stageIndex(cur) > stageIndex(best) + 1) cur = STAGES[stageIndex(best) + 1]?.id ?? best;
    p.stage = { cur, best, auto: d.auto !== false };
  }
}
