// [stages] 단계: 장과 단계(내용의 CHAPTERS. id는 '장-단계': 1-1, 1-2 …)를 차례로 깬다.
// 단계는 그 사람만의 층(인스턴스: 던전과 같은 층 번호의 줄 layers.ts의 instanceLayer)에서 STAGE_RULES.arena를 가운데로 벌어진다.
// 물결(StageDef.waves)을 차례로 다 잡고 우두머리(boss)를 잡으면 깬다 → 보상(지갑과 가방으로 바로, 처음 깨면 first도) → 자동 진행이 켜져 있으면 다음 단계로.
// 실패(쓰러짐, 제한 시간): 가장 멀리 깬 단계로 돌아가 자동 진행을 끄고 그 단계를 되풀이한다(파밍). 사람이 '도전'(go)으로 다음 단계를 다시 고른다.
// 몬스터는 몰려온 적(swarm)으로 놓는다: 집으로 돌아가지 않고 죽으면 다시 나오지 않는다. 대상이 없으면 이 시스템이 사람이나 그 영웅을 노리게 한다.
// 단계 안에서는 사람도 서버가 대신 싸운다 (STAGE_RULES.leaderAuto: 손으로 움직이면 1.5초 동안은 맡기지 않는다).
// 방치 보상(idle 모듈)은 깬 단계의 수를 받는다 (g.idle.stageOf).
// 소탕(STAGE_RULES.sweep): 깬 단계를 싸우지 않고 바로 끝내 보통 보상을 받는다 ({ t: 'stage', a: 'sweep', id, n }. 값은 소탕권이나 재화: systems/sweep.ts).
// 던전 뒤 단계로 돌아가기(STAGE_RULES.returnAfterDungeon): 던전을 끝내거나 스스로 나온 사람을 몇 초 뒤 지금 단계로 들여보낸다 (사건 dungeonExited).
// 오프라인 단계 진행(STAGE_RULES.offline): 돌아온 사람이 자동 진행을 켜 두었으면 편성의 전투력과 권장 전투력으로 '그동안 깼을 단계'를 셈해 앞으로 옮긴다 (offlinePlan).
// 대기실(lobby): 몬스터 없이 그 사람만의 층에서 단계의 자리에 서 있는 회차 (g.stages.lobby. 모드 modes의 단계 모드가 고르는 곳). 단계를 고르면(go·start) 그 층에서 시작한다.
// 뒤에서 이어 가기(bg): 사람이 단계의 층을 떠나도(모드 modes로 들판에 감) 회차는 그 층에 남아 편성의 영웅만으로 싸운다 (detach / attach).
//   지금 싸움은 끝까지(깸·실패) 하고, 자동 진행이 켜져 있으면 다음 단계로, 꺼져 있거나 실패했으면 회차를 닫는다(안내문 stageBgStop). 영웅이 모두 쓰러지면 실패다.
//   그동안 사람은 그 층에 없으므로 대신 싸우지 않고, 몬스터는 영웅만 노리며, 쓰러진 자리·실패 사건은 회차와 상관없다.
// 별(StageDef.stars·STAGE_RULES.stars, 없으면 별이 없다): 깰 때 조건(깸·n초 안·아무도 쓰러지지 않음)마다 별 하나. 단계마다 가장 많이 딴 별을 남기고(stars),
//   안내문 stageClear의 셋째 값으로 이번에 딴 별(비트)을 알린다. STAGE_RULES.sweep.allStars면 별을 다 딴 단계만 소탕할 수 있다.
// 배속(STAGE_RULES.speed)·일시정지(STAGE_RULES.pause): 그 사람의 단계 층의 시간 배율(g.layerScale: ×2면 한 틱에 두 번, 멈추면 0)과 제한 시간·기다림을 함께 바꾼다.
//   명령 { t: 'stage', a: 'speed', x } (unlock 단계를 깨야 ×2 이상), { a: 'pause', on }. 뒤에서 잇는 회차·대기실은 늘 ×1이고 멈추지 않는다. 일시정지는 maxS초 뒤 풀린다.
// 저장: 캐릭터의 ext 'stages' ({ cur, best, auto }, 별을 땄으면 stars, 배속을 골랐으면 speed). 본인에게는 개인 상태 'stage' (StageMe: 진행 중이면 물결·남은 적·남은 시간까지).
import { IDLE_VIEW, MONSTERS, STAMINA_RULE_VIEW, stageCost, allStarsOf, anyStars, stageStars, starMask, STAGE_RULES, STAGE_RULE_VIEW, STAGES, isMonsterId, offlinePlan, stageIndex, stageSweepable, sweepMax, waveCount, type MonsterDef, type MonsterId, type Reward, type StageMe, type StageRef } from '../../../shared/defs';
import { resolve } from '../../../shared/sim';
import { clampInto } from '../../../shared/world';
import { dist, type Ent } from '../entity';
import type { Game } from '../game';
import { fieldLayer, instanceLayer, isField } from '../layers';
import { leaderFight } from './leader';
import { SQUAD_RULES } from '../../../shared/defs';
import { SWEEP_WHY, costCheck, costPay, costProblem, giveInto, sweepGot } from './sweep';
import { CURS } from './wallet';

/** 지갑과 가방에 넘기는 원인의 이름: 단계를 깬 보상 */
export const STAGE_WHY = 'stage';
/** 오프라인 단계 진행으로 깬 것으로 친 단계의 보상 */
export const STAGE_AWAY_WHY = 'stageAway';

interface Run {
  p: Ent; layer: number; stage: StageRef;
  /** 지금 물결 (0부터. waves.length면 우두머리) */
  wave: number;
  mobs: Set<number>;
  /** 이 물결에 나온 적의 수 */
  total: number;
  state: 'fight' | 'gap' | 'clear' | 'fail' | 'lobby';
  /** 다음 일까지 남은 시간(초): gap이면 다음 물결, clear면 다음 단계, fail이면 다시 하기 */
  wait: number;
  /** 남은 제한 시간(초) */
  left: number;
  /** 들어오기 전의 자리와 층 (나갈 때 돌아간다) */
  back: { x: number; z: number; layer: number };
  /** 사람을 대신 싸우게 할 생각의 간격 */
  think: number;
  /** 뒤에서 이어 가는 중 (사람이 이 층에 없다: detach) */
  bg?: boolean;
  /** 이번 판에 편성(또는 사람)이 쓰러진 적이 있다 (별 조건 alive) */
  lost?: boolean;
  /** 일시정지한 지 몇 초 (멈춰 있지 않으면 undefined) */
  paused?: number;
  /** 이 판에 치른 스태미나 (stamina 모듈: 지거나 포기하면 refund의 몫을 돌려준다) */
  paid?: number;
}

/** 편성만 싸우는 단계 (STAGE_RULES.squadOnly) */
const SQUAD_ONLY = !!(STAGE_RULES as { squadOnly?: boolean }).squadOnly;
/** 영웅만 싸우는 회차인가: 뒤에서 이어 가거나, 편성만 싸우는 게임 */
const heroesOnly = (r: { bg?: boolean }): boolean => !!r.bg || SQUAD_ONLY;
/** 별 조건이 있는 게임 (없으면 별을 셈하지도 알리지도 않는다: 예전과 같다) */
const STARS = anyStars();
/** 배속·일시정지의 규칙 (없으면 없다) */
const SPEED = STAGE_RULE_VIEW.speed;
const PAUSE_MAX_S = STAGE_RULE_VIEW.pause ? (typeof STAGE_RULE_VIEW.pause === 'object' ? STAGE_RULE_VIEW.pause.maxS : 600) : 0;

/** 단계가 없다는 알림을 이미 했다 (한 프로세스에 한 번: 시험은 게임을 여러 번 만든다) */
let warned = false;

export class Stages {
  private readonly runs = new Map<number, Run>();
  /** 층 → 그 층의 회차 */
  private readonly byLayer = new Map<number, Run>();
  /** 단계와 상관없이 들판에서 일어나는 자리 (게임의 규칙 g.rules.respawn: 단계가 감싸기 전의 것. 다른 층에 있는 사람의 들판의 몸이 쓴다) */
  fieldRespawn: (p: Ent) => { x: number; z: number; id: string } = (p) => this.g.rules.respawn(p);
  /**
   * 출격·소탕의 값 (stamina 모듈이 단다: engine/server/game/systems/stamina.ts). 없으면 공짜 (예전과 같다).
   * have 가진 양, pay n을 치른다(모자라면 false), back 돌려준다
   */
  fuel: { have: (p: Ent) => number; pay: (p: Ent, n: number) => boolean; back: (p: Ent, n: number) => void } | null = null;
  /** 던전에서 나와 단계로 돌아갈 사람 → 남은 초 (STAGE_RULES.returnAfterDungeon) */
  private readonly returning = new Map<number, number>();

  constructor(private g: Game) {
    if (!STAGES.length && !warned) { warned = true; console.warn('[stages] 모듈 stages를 골랐지만 내용의 CHAPTERS가 비어 있습니다: 단계가 없습니다'); }
    for (const s of STAGES) for (const w of [...s.def.waves.flat(), ...(s.def.boss ? [s.def.boss] : [])]) if (!isMonsterId(w.type)) throw new Error(`[stages] 단계 ${s.id}의 몬스터 '${w.type}'가 MONSTERS에 없습니다`);
    g.commands.set('stage', (p, m) => this.command(p, m));
    g.ticks.push((dt) => this.tick(dt));
    g.saves.push({ name: 'stages', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'stage', state: (p) => this.me(p) });
    g.on('monsterKilled', (m) => this.killed(m));
    g.on('playerDied', (p) => { const r = this.runs.get(p.id); if (r && !r.bg && r.state !== 'fail' && r.state !== 'lobby') { r.lost = true; this.fail(r, 0); } });
    g.on('playerDropped', (p) => this.leave(p, false));
    g.on('playerLeft', (id) => { const r = this.runs.get(id); if (r) this.end(r); });
    // 오프라인 진행: 방치 보상(idle)이 있으면 그 셈 안에서(깬 단계로 토막을 나눠 보상을 셈한다), 없으면 접속할 때 따로. 둘 다 단계로 들어가기(enterOnJoin)보다 먼저다
    if (STAGE_RULE_VIEW.offline) {
      // 돌아왔을 때의 창(IDLE.popup)을 쓰는 게임은 그 창이 진행을 함께 보이므로 안내문 stageAway를 따로 내지 않는다 (창이 뜨지 않으면 idle.ts가 낸다)
      if (g.has('idle')) g.idle.advance = (p, ms) => this.offline(p, ms, !!IDLE_VIEW.popup);
      else g.on('playerJoined', (p) => { if (!p.bot) this.offline(p, p.offMs); });
    }
    g.on('playerJoined', (p) => { if (STAGE_RULES.enterOnJoin && !p.bot && STAGES.length) this.start(p, this.curIndex(p)); });
    // 단계 안에서 쓰러지면 그 단계의 가운데에서 일어난다 (회차는 실패로 끝나고 잠시 뒤 다시 시작한다)
    // 편성만 싸우는 단계: 단계의 층에 있는 사람은 보기만 한다
    if (SQUAD_ONLY) { const ghost = g.rules.ghost; g.rules.ghost = (p) => this.inStage(p) || !!ghost?.(p); }
    const respawn = g.rules.respawn;
    this.fieldRespawn = respawn;
    g.rules.respawn = (p) => (this.inStage(p) ? { x: STAGE_RULES.arena.x, z: STAGE_RULES.arena.z, id: 'stage' } : respawn(p));
    if (g.has('idle')) g.idle.stageOf = (p) => this.cleared(p);
    // 던전 뒤 단계로 돌아가기: 던전을 끝냈거나 스스로 나온 사람 (접속이 끊겨 나온 것은 아니다)
    const back = STAGE_RULE_VIEW.returnAfterDungeon;
    if (back !== undefined && g.has('dungeon')) {
      g.on('dungeonExited', (p, _id, why) => { if (why !== 'drop' && !p.bot && STAGES.length) this.returning.set(p.id, Math.max(0, Number(back) || 0)); });
      g.on('playerLeft', (id) => { this.returning.delete(id); });
    }
    const bad = costProblem(g, STAGE_RULE_VIEW.sweep?.cost, '[stages] STAGE_RULES.sweep');
    if (bad) throw new Error(bad);
  }

  // ---------- 읽기 ----------
  /** 지금 단계의 번호 (저장된 것이 없거나 없는 단계면 0) */
  curIndex(p: Ent): number { return Math.max(0, stageIndex(p.stage.cur)); }
  /** 가장 멀리 깬 단계의 번호 (없으면 -1) */
  bestIndex(p: Ent): number { return stageIndex(p.stage.best); }
  /** 깬 단계의 수 (방치 보상의 셈) */
  cleared(p: Ent): number { return this.bestIndex(p) + 1; }
  /** 사람이 단계의 층에 있는가 (대기실에 있어도 참. 뒤에서 이어 가는 회차만 있으면 거짓) */
  inStage(p: Ent): boolean { const r = this.runs.get(p.id); return !!r && !r.bg; }
  /** 그 사람의 회차 (대기실·뒤에서 이어 가는 것 포함): 층, 뒤에서 이어 가는가, 상태, 단계 id, 들어오기 전의 자리. 없으면 undefined */
  runOf(p: Ent): { layer: number; bg: boolean; state: Run['state']; id: string; back: { x: number; z: number; layer: number } } | undefined {
    const r = this.runs.get(p.id);
    return r ? { layer: r.layer, bg: !!r.bg, state: r.state, id: r.stage.id, back: { ...r.back } } : undefined;
  }
  /**
   * 사람이 단계의 층을 떠난다 (부른 쪽이 사람을 옮긴다). 싸우는 중이면 회차를 남겨 뒤에서 이어 가고(bg) true, 대기실이면 회차를 닫고 false.
   * 사람의 자리는 바꾸지 않는다: 돌아갈 자리는 runOf(p).back
   */
  detach(p: Ent): boolean {
    const r = this.runs.get(p.id);
    if (!r) return false;
    if (r.state === 'lobby') { this.end(r); this.squadIn(p); return false; }
    r.bg = true; r.paused = undefined; this.scale(r);
    for (const id of r.mobs) { const m = this.g.ents.get(id); if (m && m.targetId === p.id) m.targetId = 0; }
    this.squadIn(p);
    return true;
  }
  /** 뒤에서 이어 가던 회차로 사람이 돌아온다: 그 층의 단계의 자리에 선다 (싸움은 그대로 이어진다. 회차의 층 밖에 있으면 그 층으로). 회차가 없으면 false */
  attach(p: Ent): boolean {
    const r = this.runs.get(p.id);
    if (!r) return false;
    if (!r.bg && p.layer === r.layer) return true;
    r.bg = false; this.scale(r);
    this.place(p, STAGE_RULES.arena.x, STAGE_RULES.arena.z + 3, r.layer);
    if (this.g.has('combat')) { p.targetId = 0; p.hp = Math.max(1, p.hp); }
    this.squadIn(p);
    return true;
  }
  /** 대기실에 있는가 */
  inLobby(p: Ent): boolean { return this.runs.get(p.id)?.state === 'lobby'; }

  private me(p: Ent): StageMe {
    const r = this.runs.get(p.id);
    return {
      cur: STAGES[this.curIndex(p)]?.id ?? '', best: p.stage.best, auto: p.stage.auto,
      ...(STARS ? { stars: { ...(p.stage.stars ?? {}) } } : {}),
      ...(SPEED ? { speed: this.speedOf(p), speedMax: this.speedMax(p) } : {}),
      ...(PAUSE_MAX_S ? { paused: r?.paused !== undefined } : {}),
      run: r ? { id: r.stage.id, wave: r.wave, waves: waveCount(r.stage.def), foes: r.mobs.size, total: r.total, left: r.state === 'lobby' ? 0 : Math.ceil(Math.max(0, r.state === 'fight' || r.state === 'gap' ? r.left : r.wait)), state: r.state, boss: r.wave >= r.stage.def.waves.length && !!r.stage.def.boss } : null,
    };
  }

  // ---------- 명령 ----------
  private command(p: Ent, m: Record<string, unknown>): void {
    if (p.bot || !STAGES.length) return;
    if (m.a === 'start') { if (!this.runs.has(p.id)) this.start(p, this.curIndex(p)); }
    else if (m.a === 'leave') this.leave(p, true);
    else if (m.a === 'auto') { p.stage.auto = m.on === true; p.unsaved = true; }
    else if (m.a === 'sweep' && typeof m.id === 'string') this.sweep(p, m.id, m.n);
    else if (m.a === 'speed' && SPEED) { const x = Number(m.x); if (Number.isInteger(x) && x >= 1 && x <= this.speedMax(p)) { p.stage.speed = x; p.unsaved = true; const r = this.runs.get(p.id); if (r) this.scale(r); } }
    else if (m.a === 'pause' && PAUSE_MAX_S) { const r = this.runs.get(p.id); if (r && !r.bg && (r.state === 'fight' || r.state === 'gap')) { r.paused = m.on === true ? r.paused ?? 0 : undefined; this.scale(r); } }
    else if (m.a === 'go' && typeof m.id === 'string') {
      const i = stageIndex(m.id);
      if (i < 0) return;
      // 깬 단계와 그다음 단계까지만 고를 수 있다
      if (i > this.bestIndex(p) + 1) { this.g.notify(p, 'stageLocked', m.id); return; }
      p.stage.cur = STAGES[i].id; p.unsaved = true;
      this.start(p, i);
    }
  }

  // ---------- 배속·일시정지 ----------
  /** 지금 쓸 수 있는 가장 큰 배속 (잠겼으면 1) */
  speedMax(p: Ent): number { return !SPEED ? 1 : SPEED.unlock && stageIndex(SPEED.unlock) > this.bestIndex(p) ? 1 : Math.max(1, Math.floor(SPEED.max)); }
  /** 고른 배속 (쓸 수 있는 만큼으로 줄인다) */
  speedOf(p: Ent): number { return Math.max(1, Math.min(p.stage.speed ?? 1, this.speedMax(p))); }
  /** 회차의 시간 배율: 멈춤 0, 대기실·뒤에서 잇는 회차 1, 아니면 고른 배속 */
  private rate(r: Run): number { return r.state === 'lobby' || r.bg ? 1 : r.paused !== undefined ? 0 : this.speedOf(r.p); }
  /** 회차의 층에 시간 배율을 적는다 (1이면 지운다: 배율이 없는 층은 예전과 똑같이 돈다) */
  private scale(r: Run): void { const k = this.rate(r); if (k === 1) this.g.layerScale.delete(r.layer); else this.g.layerScale.set(r.layer, k); }

  // ---------- 소탕 ----------
  /**
   * 깬 단계를 n번 소탕한다: 값(STAGE_RULES.sweep.cost × n)을 치르고 그 단계의 보통 보상(reward, 처음 깬 보상 first는 아니다)을 n번 바로 준다.
   * 깨지 않았거나 소탕할 수 없는 단계, 1~max가 아닌 횟수는 받지 않는다. 진행 중인 회차와 지금 단계는 바뀌지 않는다. 받은 것의 합을 돌려준다 (안 되면 null)
   */
  sweep(p: Ent, id: string, n: unknown): ReturnType<typeof sweepGot> | null {
    const g = this.g, rule = STAGE_RULE_VIEW.sweep, i = stageIndex(id), s = STAGES[i];
    if (!rule || p.bot || !s) return null;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > sweepMax(rule)) return null;
    if (!stageSweepable(s) || i > this.bestIndex(p) || (rule.allStars && !allStarsOf(s, p.stage.stars?.[id] ?? 0))) { g.notify(p, 'sweepLocked', 'stage', id); return null; }
    // 스태미나 (stamina 모듈): 소탕 한 번마다 use.sweep. 모자라면 거절, 다른 값을 치르지 못하면 돌려준다
    const fuel = this.fuel ? Math.max(0, Math.floor(STAMINA_RULE_VIEW.use.sweep ?? 0)) * n : 0;
    if (fuel && this.fuel!.have(p) < fuel) { g.notify(p, 'staminaShort', fuel, this.fuel!.have(p)); return null; }
    if (!costCheck(g, p, rule.cost, n)) return null;
    if (fuel) this.fuel!.pay(p, fuel);
    if (!costPay(g, p, rule.cost, n, 'cmd:stage:sweep')) { if (fuel) this.fuel!.back(p, fuel); return null; }
    const got = sweepGot('stage', id, n);
    for (let k = 0; k < n; k++) giveInto(g, p, s.def.reward, SWEEP_WHY, got);
    p.unsaved = true;
    g.notify(p, 'swept', 'stage', id, n);
    g.out.push({ id: p.id, msg: { t: 'sweep', got } });
    g.fire('swept', p, 'stage', id, n);
    return got;
  }

  // ---------- 오프라인 진행 ----------
  /**
   * 돌아온 사람의 오프라인 진행 (STAGE_RULES.offline. 자동 진행을 켜 둔 사람만): ms 동안 깼을 단계를 셈해 가장 멀리 깬 단계와 지금 단계를 옮기고,
   * 깬 것으로 친 단계마다 처음 깬 보상(first)과 보통 보상(clearReward)을 바로 준다(원인 stageAway). 깬 단계마다 사건 stageCleared(처음)도 난다.
   * 비우기 시작할 때 깬 단계의 수와 단계마다의 깬 때(ms)를 돌려준다 (방치 보상의 토막: idle.ts). quiet면 안내문 stageAway를 내지 않는다 (돌아왔을 때의 창이 대신 알린다)
   */
  offline(p: Ent, ms: number, quiet = false): { cleared: number; at: number[]; from: string; to: string } | null {
    const g = this.g, rules = STAGE_RULE_VIEW.offline;
    if (!rules || p.bot || !p.stage.auto || !STAGES.length) return null;
    const best = this.bestIndex(p), power = g.has('squad') ? g.squad.power(p) : 0;
    const plan = offlinePlan(best, power, ms, rules);
    // 스태미나 (stamina 모듈): 깬 것으로 칠 단계마다 그 값 (모자라면 거기서 멈춘다)
    if (this.fuel) for (let k = 0; k < plan.passed.length; k++) if (!this.fuel.pay(p, stageCost(STAGES[plan.passed[k]].def.cost))) { plan.passed.length = k; plan.at.length = k; break; }
    if (!plan.passed.length) return { cleared: best + 1, at: [], from: '', to: '' };
    const from = STAGES[this.curIndex(p)].id;
    for (const i of plan.passed) {
      const s = STAGES[i];
      if (rules.clearReward !== false) this.give(p, s.def.reward, STAGE_AWAY_WHY);
      if (s.def.first) this.give(p, s.def.first, STAGE_AWAY_WHY);
      p.stage.best = s.id;
      g.fire('stageCleared', p, s.id, true);
    }
    const last = plan.passed[plan.passed.length - 1];
    p.stage.cur = STAGES[Math.min(STAGES.length - 1, last + 1)].id;
    p.unsaved = true;
    if (!quiet) g.notify(p, 'stageAway', from, p.stage.cur, plan.passed.length);
    return { cleared: best + 1, at: plan.at, from, to: p.stage.cur };
  }

  // ---------- 회차 ----------
  /** 그 단계를 처음부터 시작한다 (진행 중이면 같은 층에서 다시) */
  start(p: Ent, i: number): void {
    const g = this.g, stage = STAGES[i];
    if (!stage || p.kind !== 'p' || g.ents.get(p.id) !== p) return;
    // 던전 안에서는 시작하지 않는다
    if (!this.runs.has(p.id) && !isField(p.layer)) return;
    let r = this.runs.get(p.id);
    // 스태미나 (stamina 모듈): 한 판의 값. 모자라면 시작하지 않는다 (싸우던 회차는 대기실로, 뒤에서 잇던 회차는 닫는다)
    const cost = this.fuel ? stageCost(stage.def.cost) : 0;
    if (cost && !this.fuel!.pay(p, cost)) {
      g.notify(p, 'staminaShort', cost, this.fuel!.have(p));
      if (r?.bg) { const at = r.stage.id; this.end(r); this.squadIn(p); g.notify(p, 'stageBgStop', at, 2); }
      else if (r && r.state !== 'lobby') this.lobby(p);
      return;
    }
    if (r) this.despawn(r);
    else {
      r = { p, layer: instanceLayer(g), stage, wave: 0, mobs: new Set(), total: 0, state: 'fight', wait: 0, left: 0, back: { x: p.x, z: p.z, layer: p.layer }, think: 0 };
      this.runs.set(p.id, r);
      this.byLayer.set(r.layer, r);
    }
    r.stage = stage; r.wave = 0; r.left = stage.def.timeS ?? STAGE_RULES.timeS; r.state = 'fight'; r.wait = 0; r.lost = false; r.paused = undefined; r.paid = cost;
    if (SPEED || PAUSE_MAX_S) this.scale(r);
    p.stage.cur = stage.id; p.unsaved = true;
    // 사람을 단계의 가운데로 (체력을 채운다: 앞 단계의 상처를 끌고 들어가지 않게). 뒤에서 이어 가는 회차는 사람이 이 층에 없다: 영웅만 가운데로
    if (!r.bg) {
      this.place(p, STAGE_RULES.arena.x, STAGE_RULES.arena.z + 3, r.layer);
      if (g.has('combat')) { p.hp = p.maxHp; p.targetId = 0; }
    }
    // 영웅만 싸우는 회차: 앞 판에서 쓰러져 다시 일어나기를 기다리는 영웅을 세운다 (기다리는 동안 '살아 있는 영웅이 없다'로 곧바로 다시 졌다: 다시 하기 4초 < 일어나기 8초)
    if (heroesOnly(r) && g.has('squad')) for (const e of g.squad.heroes(p)) if (e.dead) { e.dead = false; e.hp = e.maxHp; e.respawn = 0; }
    this.spawnWave(r);
    this.squadIn(p);
  }

  /**
   * 대기실로: 그 사람만의 층에서 몬스터 없이 단계의 자리에 선다 (회차가 있으면 그 층에서 싸움을 그친다. 없으면 새 층을 받는다).
   * 단계를 고르면(go·start) 그 층에서 시작한다. 던전 안에서는 하지 않는다
   */
  lobby(p: Ent): void {
    const g = this.g;
    if (p.kind !== 'p' || g.ents.get(p.id) !== p || p.bot) return;
    let r = this.runs.get(p.id);
    if (!r && !isField(p.layer)) return;
    if (r) { this.refund(r, 'quit'); this.despawn(r); }
    else {
      r = { p, layer: instanceLayer(g), stage: STAGES[this.curIndex(p)] ?? STAGES[0], wave: 0, mobs: new Set(), total: 0, state: 'lobby', wait: 0, left: 0, back: { x: p.x, z: p.z, layer: p.layer }, think: 0 };
      this.runs.set(p.id, r);
      this.byLayer.set(r.layer, r);
    }
    if (!r.stage) return;
    r.state = 'lobby'; r.wave = 0; r.wait = 0; r.left = 0; r.total = 0; r.paused = undefined;
    if (SPEED || PAUSE_MAX_S) this.scale(r);
    this.place(p, STAGE_RULES.arena.x, STAGE_RULES.arena.z + 3, r.layer);
    if (g.has('combat')) { p.hp = p.maxHp; p.targetId = 0; p.dead = false; }
    this.squadIn(p);
  }

  /** 그 회차의 층에 살아 있는 영웅이 있는가 */
  private anyHero(p: Ent): boolean { const r = this.runs.get(p.id); return !!r && this.g.has('squad') && this.g.squad.heroes(p).some((e) => !e.dead && e.layer === r.layer); }

  /** 편성이 단계 안에서만 나타나는 게임(SQUAD_RULES.where 'stage'): 들고 날 때 영웅을 세우고 치운다 */
  private squadIn(p: Ent): void { if (this.g.has('squad') && (SQUAD_RULES as { where?: string }).where === 'stage') this.g.squad.field(p); }

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
    r.state = 'clear'; r.wait = STAGE_RULES.nextS; r.paid = 0;
    this.give(p, r.stage.def.reward);
    if (first) { if (r.stage.def.first) this.give(p, r.stage.def.first); p.stage.best = r.stage.id; }
    const last = r.stage.i >= STAGES.length - 1;
    if (p.stage.auto && !last) p.stage.cur = STAGES[r.stage.i + 1].id;
    p.unsaved = true;
    const conds = stageStars(r.stage);
    if (conds.length) {
      // 별: 걸린 시간(제한 시간 − 남은 시간)과 쓰러짐으로 셈하고, 가장 많이 딴 것을 남긴다 (비트를 합친다: 따로 딴 별도 남는다)
      const mask = starMask(conds, (r.stage.def.timeS ?? STAGE_RULES.timeS) - r.left, !!r.lost);
      p.stage.stars = { ...(p.stage.stars ?? {}), [r.stage.id]: (p.stage.stars?.[r.stage.id] ?? 0) | mask };
      g.notify(p, 'stageClear', r.stage.id, first ? 1 : 0, mask);
    } else g.notify(p, 'stageClear', r.stage.id, first ? 1 : 0);
    if (p.stage.auto && last && first) g.notify(p, 'stageLast');
    g.fire('stageCleared', p, r.stage.id, first);
  }

  /** 실패했다 (0 쓰러짐, 1 시간): 깬 단계로 돌아가 자동 진행을 끄고 잠시 뒤 다시 */
  private fail(r: Run, why: 0 | 1): void {
    const p = r.p;
    this.despawn(r);
    this.refund(r, 'fail');
    r.state = 'fail'; r.wait = STAGE_RULES.retryS;
    const back = Math.max(0, Math.min(this.bestIndex(p), r.stage.i - 1));
    p.stage.cur = STAGES[Math.min(r.stage.i, back)]?.id ?? STAGES[0].id;
    p.stage.auto = false;
    p.unsaved = true;
    this.g.notify(p, 'stageFail', r.stage.id, why);
  }

  /** 보상을 바로 준다: 재화는 지갑, 재료·물약은 가방(아이템 모듈이 있으면), 장비는 장비 모듈이 있으면 */
  private give(p: Ent, rw: Reward, why = STAGE_WHY): void {
    const g = this.g;
    if (g.has('economy')) for (const cur of CURS) { const n = rw[cur]; if (n) g.wallet.add(p, cur, n, why); }
    if (g.has('items')) for (const [id, n] of Object.entries(rw.items ?? {})) g.bag.putItem(p, id as Parameters<typeof g.bag.putItem>[1], n, why);
    if (g.has('gear')) for (const it of rw.gear ?? []) g.gear.give(p, it, why);
  }

  /** 스태미나를 돌려준다 (진 판 fail, 싸우다 나옴 quit: STAMINA_RULES.refund의 몫). 싸우는 중의 판만 한 번 */
  private refund(r: Run, k: 'fail' | 'quit'): void {
    const paid = r.paid ?? 0;
    r.paid = 0;
    if (!this.fuel || paid <= 0 || (r.state !== 'fight' && r.state !== 'gap')) return;
    const n = Math.floor(paid * Math.max(0, Math.min(1, STAMINA_RULE_VIEW.refund?.[k] ?? 0)));
    if (n > 0) this.fuel.back(r.p, n);
  }

  /** 회차의 몬스터를 치운다 */
  private despawn(r: Run): void {
    for (const id of r.mobs) this.g.remove(id);
    r.mobs.clear();
  }

  /** 회차를 끝낸다 (사람은 옮기지 않는다) */
  private end(r: Run): void {
    this.g.layerScale.delete(r.layer);
    this.despawn(r);
    this.runs.delete(r.p.id);
    this.byLayer.delete(r.layer);
  }

  /** 단계에서 나온다: 들어오기 전의 자리와 층으로 */
  leave(p: Ent, notify: boolean): void {
    const r = this.runs.get(p.id);
    if (!r) return;
    // 뒤에서 이어 가던 회차: 사람은 이미 다른 곳에 있다 (닫기만 한다)
    if (r.bg) { this.end(r); this.squadIn(p); return; }
    this.refund(r, 'quit');
    this.end(r);
    const layer = isField(r.back.layer) ? r.back.layer : fieldLayer(1);
    this.place(p, r.back.x, r.back.z, layer);
    if (this.g.has('combat')) p.targetId = 0;
    if (notify) p.unsaved = true;
    this.squadIn(p);
  }

  // ---------- 틱 ----------
  private tick(dt: number): void {
    for (const r of [...this.runs.values()]) {
      const p = r.p;
      if (this.g.ents.get(p.id) !== p) { this.end(r); continue; }
      if (r.state === 'lobby') continue;
      // 배속·일시정지: 이 회차의 시간은 배율만큼 (멈춤은 maxS초까지)
      if (r.paused !== undefined) { r.paused += dt; if (r.paused >= PAUSE_MAX_S) { r.paused = undefined; this.scale(r); } else continue; }
      const d = SPEED && !r.bg ? dt * this.rate(r) : dt;
      // 뒤에서 이어 가는 회차: 영웅이 모두 쓰러졌으면 실패
      if (heroesOnly(r) && r.state === 'fight' && !this.anyHero(p)) { this.fail(r, 0); continue; }
      // 편성만 싸우는 게임: 보는 사람은 단계의 가운데에 묶인다 (화면의 눈이 싸움을 따라가게)
      if (SQUAD_ONLY && !r.bg && (p.moving || p.targetId)) { p.moving = false; p.path = null; p.targetId = 0; }
      if (r.state === 'fight' || r.state === 'gap') {
        // 별 조건 alive: 이 판의 층에서 편성의 영웅이 쓰러졌다
        if (STARS && !r.lost && this.g.has('squad') && this.g.squad.heroes(p).some((e) => e.dead && e.layer === r.layer)) r.lost = true;
        r.left -= d;
        if (r.left <= 0) { this.fail(r, 1); continue; }
      }
      if (r.state === 'gap') { r.wait -= d; if (r.wait <= 0) { r.state = 'fight'; this.spawnWave(r); } continue; }
      if (r.state === 'clear' || r.state === 'fail') {
        r.wait -= d;
        if (r.wait > 0) continue;
        // 뒤에서 이어 가는 회차는 자동 진행이 꺼졌거나 실패했으면 멈춘다 (회차를 닫는다)
        if (r.bg && (r.state === 'fail' || !p.stage.auto)) { const why = r.state === 'fail' ? 1 : 0, at = r.stage.id; this.end(r); this.squadIn(p); this.g.notify(p, 'stageBgStop', at, why); continue; }
        this.start(p, this.curIndex(p));
        continue;
      }
      this.aim(r, d);
    }
    if (this.returning.size) this.comeBack(dt);
  }

  /** 던전에서 나온 사람을 때가 되면 지금 단계로 들여보낸다 (그사이 단계나 던전에 들어갔으면 그만둔다) */
  private comeBack(dt: number): void {
    const g = this.g;
    for (const [id, s] of this.returning) {
      const p = g.ents.get(id);
      if (!p || this.runs.has(id) || g.dungeon.runOf(p)) { this.returning.delete(id); continue; }
      if (s - dt > 0) { this.returning.set(id, s - dt); continue; }
      this.returning.delete(id);
      this.start(p, this.curIndex(p));
    }
  }
  /** 던전에서 나와 단계로 돌아가기까지 남은 초 (기다리지 않으면 undefined: 시험과 화면의 셈) */
  returnIn(p: Ent): number | undefined { return this.returning.get(p.id); }

  /** 대상이 없는 몬스터는 가장 가까운 사람 편(사람, 영웅)을 노린다. 사람도 맡겼으면 가장 가까운 몬스터를 친다 */
  private aim(r: Run, dt: number): void {
    const g = this.g, p = r.p;
    const heroes = g.has('squad') ? g.squad.heroes(p).filter((e) => !e.dead && (!heroesOnly(r) || e.layer === r.layer)) : [];
    const friends = heroesOnly(r) ? heroes : [p, ...heroes];
    for (const id of r.mobs) {
      const m = g.ents.get(id);
      if (!m || m.dead || m.targetId) continue;
      let best: Ent | undefined, bd = Infinity;
      for (const f of friends) { const d = dist(m, f); if (d < bd) { bd = d; best = f; } }
      if (best) m.targetId = best.id;
    }
    if (heroesOnly(r) || !STAGE_RULES.leaderAuto || !g.has('combat') || p.hp <= 0) return;
    r.think -= dt;
    if (r.think > 0) return;
    r.think = 0.3;
    leaderFight(g, p, r.mobs);
  }

  // ---------- 저장 ----------
  private saveOf(p: Ent): { cur: string; best: string; auto: boolean; stars?: Record<string, number>; speed?: number } | undefined {
    const s = p.stage;
    const stars = s.stars && Object.keys(s.stars).length ? { stars: { ...s.stars } } : {};
    const speed = s.speed && s.speed > 1 ? { speed: s.speed } : {};
    return s.cur || s.best || !s.auto || stars.stars || speed.speed ? { cur: s.cur, best: s.best, auto: s.auto, ...stars, ...speed } : undefined;
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
    const sp = (d as { speed?: unknown }).speed;
    if (SPEED && Number.isInteger(sp) && (sp as number) > 1 && (sp as number) <= SPEED.max) p.stage.speed = sp as number;
    // 별: 있는 단계의 0~255 정수만
    const st = (d as { stars?: unknown }).stars;
    if (st && typeof st === 'object') {
      const keep = Object.entries(st as Record<string, unknown>).filter(([k, v]) => stageIndex(k) >= 0 && Number.isInteger(v) && (v as number) > 0 && (v as number) < 256);
      if (keep.length) p.stage.stars = Object.fromEntries(keep) as Record<string, number>;
    }
  }
}
