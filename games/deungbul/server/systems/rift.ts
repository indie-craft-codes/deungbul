// 안개 균열: 5분짜리 인스턴스 생존전. 문에서 들어가면 그 사람(과 파티)만의 판이 열리고, 사방에서 몰려오는 떼를 버틴다.
// 30초마다 강화 셋 가운데 하나를 골라 그 판에서만 강해진다. 판이 끝나면 버틴 시간에 맞춘 보상이 우편 한 통으로 온다.
// 던전 시스템(engine/server/game/systems/dungeon.ts)을 본떠 따로 만든 시스템이다: 두 놀이의 공통(층 열기, 들고 나기, 끊김 처리)은
// 둘째 모드를 만들 때 틀로 뽑는다 (docs/modes.md 6절: 모드의 틀을 지금 일반화하지 않는다). 내용과 수치는 games/deungbul/shared/content/rift.ts에 있다.
//
// 지키는 원칙 (docs/modes.md 3절, 4-4):
//   - 판 안에서는 캐릭터의 저장되는 칸을 건드리지 않는다. 강화는 판 상태(Seat.ups)에만 있고 g.mods가 "판 안의 이 사람"일 때만 읽는다.
//     저장되는 것은 기록(Ent.rift)과 하루 횟수뿐이고, 보상은 끝날 때 우편 한 통(mail:rift)으로만 간다.
//   - 총량을 늘리지 않는다: 하루 횟수는 던전의 것을 함께 쓰고(일일 진행의 같은 칸), 판 안의 몬스터는 누구의 처치로도 치지 않는다
//     (g.rules.credit: 처치 보상, 장비·재료 드롭, 일일 임무와 퀘스트의 처치 수가 모두 생기지 않는다).
import { MONSTERS, PORTAL_REACH, RIFT, RIFT_ECON, RIFT_GEAR, RIFT_UPS, RIFT_UP_IDS, classOf, clearRar, maxHpFor, riftKeep, riftPack, riftPicksBy, riftReward, riftUp, riftWaveAt, runKey, type MonsterDef, type MonsterId, type Reward, type RiftUpId } from '../../shared/defs';
import type { RiftBest } from '../../shared/deungbul';
import { resolve } from '@engine/shared/sim';
import { AREAS, EDGE, areaAt } from '@engine/shared/world';
import { dist, readInt, type Ent } from '@engine/server/game/entity';
import type { Game } from '@engine/server/game/game';
import { fieldLayer, isField } from '@engine/server/game/layers';

/** 균열 인스턴스의 층은 이 수부터 센다. 던전의 층(1000부터 하나씩)과 겹치지 않게 멀리 잡는다. 들판이 아닌 층이므로 틀은 인스턴스로 본다 (layers.ts의 isField) */
export const RIFT_LAYER = 1_000_000;

type Ups = Partial<Record<RiftUpId, number>>;

/** 판 안의 한 사람 */
interface Seat {
  id: number;
  /** 들어오기 전에 있던 들판의 층(채널): 나갈 때 그곳으로 돌려보낸다 */
  back: number;
  /** 들어온 때(판의 시계)와, 내 판이 끝났을 때 적어 둔 버틴 시간(초) */
  from: number; timeS: number;
  /** 고른 강화의 단계 */
  ups: Ups;
  /** 지금까지 받은 고르기의 수(열려 있는 것 포함), 열려 있는 고르기와 남은 시간 */
  given: number; offer: RiftUpId[] | null; offerLeft: number;
  /** 쓰러진 횟수와, 이 시각(게임 시계)까지 피해를 받지 않는다 */
  downs: number; safeUntil: number;
  /** 처치로 모인 회복(곧 한꺼번에 준다), 다음 고리까지 남은 시간 */
  heal: number; ringT: number;
  /** 마지막 틱 뒤로 몬스터를 때린 기록 (한 마리만 때렸으면 번지는 일격이 터진다) */
  hits: { x: number; z: number; id: number }[];
  /** 내 판이 끝났다 (결과를 보는 중이거나 곧 나간다): 강화는 더 듣지 않고 몬스터의 대상도 되지 않는다 */
  out: boolean;
}

interface Run {
  layer: number;
  /** 판의 시계(초) */
  t: number;
  seats: Map<number, Seat>;
  mobs: Set<number>;
  kills: number;
  /** 다음 무리까지 남은 시간, 우두머리를 불렀는가 */
  spawnT: number; fillT: number; bossCalled: boolean;
  /** 판이 끝났다(완주했거나 모두 쓰러졌다): 남은 사람은 결과를 보다가 exit초 뒤에 밖으로 나간다 */
  ended: boolean; exit: number;
  /** 상태를 마지막으로 알린 뒤 흐른 시간 */
  told: number;
  /** 몬스터를 마지막으로 때린 사람 (처치 회복이 누구의 것인지) */
  lastHit: Map<number, number>;
}

/** 재미를 재는 지표의 재료: 서버가 켜진 뒤가 아니라 처음부터 쌓인다 (월드 저장의 rift 칸) */
export interface RiftStats {
  /** 들어간 횟수, 완주한 횟수, 버틴 시간의 합(초), 처치 수의 합 */
  runs: number; clears: number; seconds: number; kills: number;
  /** 강화별: 보여 준 횟수와 골라진 횟수, 그 가운데 시간이 다 돼 첫째 것이 골라진 횟수 */
  shown: Record<string, number>; picked: Record<string, number>; timeouts: number;
}

declare module '@engine/server/game/ext' {
  interface EntExt {
    /** 안개 균열의 내 기록: 가장 오래 버틴 시간(초)과 그때의 처치 수, 오늘의 것, 완주한 횟수, 처음 완주 덤을 받았는가 */
    rift: { s: number; k: number; day: string; dayS: number; dayK: number; clears: number; first: boolean };
  }
}

const blank = (): Ent['rift'] => ({ s: 0, k: 0, day: '', dayS: 0, dayK: 0, clears: 0, first: false });
const blankStats = (): RiftStats => ({ runs: 0, clears: 0, seconds: 0, kills: 0, shown: {}, picked: {}, timeouts: 0 });

export class Rift {
  private runs = new Map<number, Run>();
  private of = new Map<number, Run>();
  private nextLayer = RIFT_LAYER;
  /** 판 전용 몬스터 정의: 종류와 배율마다 하나씩 만들어 두고 함께 쓴다 */
  private defs = new Map<string, MonsterDef>();
  /** 내가 주는 피해(고리, 번짐)를 넣는 중: 그 피해가 다시 번지지 않게 한다 */
  private inner = false;
  /** 시험에서 고르기와 무리의 난수를 고정할 수 있다 */
  random: () => number = Math.random;
  stats: RiftStats = blankStats();

  constructor(private g: Game) {
    g.entInit.push((e) => { e.rift = blank(); });
    g.ticks.push((dt) => this.tick(dt));
    g.commands.set('rift', (p, m) => {
      if (m.a === 'enter') this.enter(p);
      else if (m.a === 'leave') this.leave(p, true);
      else if (m.a === 'pick' && typeof m.n === 'number') this.pick(p, m.n, false);
    });

    // ---------- 판 안의 몬스터는 누구의 처치로도 치지 않는다 (보상·드롭·처치 수 없음) ----------
    const credit = g.rules.credit;
    g.rules.credit = (m) => !this.runs.has(m.layer) && (credit?.(m) ?? true);
    g.on('monsterKilled', (m) => {
      const run = this.runs.get(m.layer);
      if (!run) return;
      run.mobs.delete(m.id);
      g.remove(m.id); // 판의 몬스터는 다시 나오지 않는다
      run.kills++;
      const seat = run.seats.get(run.lastHit.get(m.id) ?? 0);
      run.lastHit.delete(m.id);
      if (seat && !seat.out) seat.heal += riftUp.leech(seat.ups.leech ?? 0);
    });
    g.on('hit', (p, m) => {
      const run = this.runs.get(m.layer);
      if (!run) return;
      run.lastHit.set(m.id, p.id);
      if (!this.inner) run.seats.get(p.id)?.hits.push({ x: m.x, z: m.z, id: m.id });
    });

    // ---------- 들고 나기 ----------
    // 접속이 끊기면 판은 끝난다: 그때까지의 기록으로 보상을 받고 문 앞으로 나온 뒤에 저장된다 (자리 비움 사냥으로 판을 돌리지 못한다)
    g.on('playerDropped', (p) => this.leave(p, false));
    g.on('playerLeft', (id) => { const run = this.of.get(id); if (run) { run.seats.delete(id); this.of.delete(id); } });
    // 서버가 꺼졌다 켜진 경우처럼 판 없이 전장 안에 있으면 문 앞으로 내보낸다
    g.on('playerJoined', (p) => { if (!this.of.has(p.id) && AREAS[areaAt(p.x, p.z)]?.id === RIFT.area.id) this.move(p, RIFT.portal.x + 1.5, RIFT.portal.z + 1.5, fieldLayer(1)); });
    g.on('playerDied', (p) => this.died(p));
    // 판 안에서 쓰러지면 제자리에서 다시 일어난다 (그럴 수 있는 횟수는 died가 센다)
    const respawn = g.rules.respawn;
    g.rules.respawn = (p) => (this.of.has(p.id) ? { x: p.x, z: p.z, id: 'rift' } : respawn(p));

    // ---------- 강화: 판 안의 그 사람에게만 듣는 보정 ----------
    const lv = (p: Ent | undefined, id: RiftUpId): number => { const s = p && this.of.get(p.id)?.seats.get(p.id); return s && !s.out ? s.ups[id] ?? 0 : 0; };
    g.mods.provide('damage', (p) => riftUp.might(lv(p, 'might')));
    g.mods.provide('area', (p) => riftUp.reach(lv(p, 'reach')));
    g.mods.provide('cooldown', (p) => riftUp.haste(lv(p, 'haste')));
    g.mods.provide('crit', (p) => riftUp.keen(lv(p, 'keen')));
    g.mods.provide('hp', (p) => { const n = lv(p, 'vigor'); return n && p ? riftUp.vigor(n, maxHpFor(p.cls, p.lv)) : 0; });
    g.mods.provide('guard', (p) => {
      const s = p && this.of.get(p.id)?.seats.get(p.id);
      if (!s || s.out) return 1;
      return g.clock < s.safeUntil ? 0 : riftUp.ward(s.ups.ward ?? 0); // 다시 일어난 직후에는 피해를 받지 않는다 (틀이 1은 남긴다)
    });
    // 이동 속도는 보정 목록이 아니라 규칙이다 (화면이 같은 식으로 예측한다: games/deungbul/client/hud/rift.ts)
    const speed = g.rules.speed;
    g.rules.speed = (p) => speed(p) * riftUp.swift(lv(p, 'swift'));

    // ---------- 기록 ----------
    g.saves.push({
      name: 'rift',
      // 한 번도 들어가지 않은 캐릭터는 칸을 만들지 않는다: 균열을 하지 않는 사람의 저장이 전과 한 글자도 다르지 않다
      save: (p) => (p.rift.s || p.rift.k || p.rift.day ? { ...p.rift } : undefined),
      load: (p, raw) => {
        if (typeof raw !== 'object' || raw === null) return;
        const d = raw as Record<string, unknown>;
        p.rift = {
          s: readInt(d.s, 0, RIFT.timeS, 0), k: readInt(d.k, 0, 1e6, 0), day: typeof d.day === 'string' ? d.day.slice(0, 10) : '',
          dayS: readInt(d.dayS, 0, RIFT.timeS, 0), dayK: readInt(d.dayK, 0, 1e6, 0), clears: readInt(d.clears, 0, 1e6, 0), first: d.first === true,
        };
      },
    });
    // 본인에게 알리는 개인 상태: 문 앞 창과 결과 창이 읽는다. 값이 작아 달라졌을 때만 간다
    g.personal.push({ name: 'rift', state: (p) => this.best(p) });
    g.worldSaves.push({
      name: 'rift',
      save: () => (this.stats.runs > 0 ? this.stats : undefined), // 아무도 들어간 적이 없으면 칸을 만들지 않는다
      load: (raw) => {
        if (typeof raw !== 'object' || raw === null) return;
        const d = raw as Record<string, unknown>, count = (v: unknown): Record<string, number> => {
          const out: Record<string, number> = {};
          if (typeof v === 'object' && v !== null) for (const id of RIFT_UP_IDS) out[id] = readInt((v as Record<string, unknown>)[id], 0, 1e9, 0);
          return out;
        };
        this.stats = { runs: readInt(d.runs, 0, 1e9, 0), clears: readInt(d.clears, 0, 1e9, 0), seconds: readInt(d.seconds, 0, 1e12, 0), kills: readInt(d.kills, 0, 1e12, 0), shown: count(d.shown), picked: count(d.picked), timeouts: readInt(d.timeouts, 0, 1e9, 0) };
      },
    });
  }

  // ---------- 밖에서 읽는 것 ----------
  /** 열려 있는 판의 수 (시험과 지표용) */
  get count(): number { return this.runs.size; }
  /** 그 사람이 들어가 있는 판 (없으면 undefined) */
  runOf(p: Ent): { t: number; kills: number; foes: number; players: number; ended: boolean; ups: Ups; offer: readonly RiftUpId[] | null; downs: number; out: boolean } | undefined {
    const run = this.of.get(p.id), s = run?.seats.get(p.id);
    return run && s && { t: run.t, kills: run.kills, foes: run.mobs.size, players: this.active(run).length, ended: run.ended, ups: s.ups, offer: s.offer, downs: s.downs, out: s.out };
  }
  /** 개인 상태로 보내는 기록. 오늘의 것은 날짜가 오늘일 때만이다 */
  best(p: Ent): RiftBest {
    const r = p.rift, today = r.day === this.g.daily.dayOf(this.g.now());
    return { s: r.s, k: r.k, dayS: today ? r.dayS : 0, dayK: today ? r.dayK : 0, clears: r.clears };
  }

  // ---------- 들고 나기 ----------
  private move(p: Ent, x: number, z: number, layer: number): void {
    const g = this.g;
    p.layer = layer; p.x = x; p.z = z; p.tx = x; p.tz = z; p.moving = false; p.path = null; p.targetId = 0;
    resolve(p, g.world.obstacles);
    g.emit(['r', p.id]); // 클라이언트가 새 자리로 바로 옮긴다
    for (const e of g.ents.values()) {
      if (e.kind === 'm') { e.hitters.delete(p.id); if (e.targetId === p.id) e.targetId = 0; }
    }
  }

  enter(p: Ent): void {
    const g = this.g;
    if (this.of.has(p.id) || !isField(p.layer)) return;
    if (dist(p, RIFT.portal) > PORTAL_REACH) { g.notify(p, 'riftFar'); return; }
    if (p.lv < RIFT.minLv) { g.notify(p, 'riftLevel', RIFT.minLv); return; }
    g.daily.roll(p); // 날이 바뀌었으면 입장 횟수도 새로 센다
    // 하루 횟수는 던전과 함께 쓴다: 일일 진행의 같은 칸에 센다 (던전을 다 쓰면 균열도 못 들어가고, 반대도 같다)
    const key = runKey(RIFT_ECON.sharesRunsWith), used = p.daily.prog[key] ?? 0;
    if (used >= RIFT.perDay) { g.notify(p, 'riftNoRuns'); return; }

    // 파티원이 이미 들어가 있는 판이 있으면 거기로 합류한다 (끝났거나 가득 찬 판은 빼고)
    let run = g.party.mates(p).map((m) => this.of.get(m.id)).find((r) => r && !r.ended && r.seats.size < RIFT.maxPlayers);
    if (!run) run = this.create();
    p.daily.prog[key] = used + 1;
    p.metaDirty = true; p.unsaved = true;
    const seat: Seat = { id: p.id, back: p.layer, from: run.t, timeS: 0, ups: {}, given: 0, offer: null, offerLeft: 0, downs: 0, safeUntil: 0, heal: 0, ringT: RIFT_UPS.ring.everyS, hits: [], out: false };
    run.seats.set(p.id, seat);
    this.of.set(p.id, run);
    this.move(p, RIFT.entry.x + (this.random() - 0.5) * 3, RIFT.entry.z + (this.random() - 0.5) * 3, run.layer);
    p.hp = p.maxHp; // 판은 온전한 체력으로 시작한다
    this.stats.runs++; g.saveDirty = true;
    g.notify(p, 'riftEnter');
    // 아직 같은 판에 없는 파티원에게 알린다: 문에서 들어가면 여기로 합류한다
    for (const m of g.party.mates(p)) if (this.of.get(m.id) !== run) g.notify(m, 'riftMate', p.name);
    this.tell(run);
  }

  private create(): Run {
    const run: Run = { layer: this.nextLayer++, t: 0, seats: new Map(), mobs: new Set(), kills: 0, spawnT: 1.5, fillT: 1.5, bossCalled: false, ended: false, exit: 0, told: 0, lastHit: new Map() };
    this.runs.set(run.layer, run);
    return run;
  }

  /** 아직 싸우고 있는 사람들 */
  private active(run: Run): Ent[] {
    const out: Ent[] = [];
    for (const s of run.seats.values()) { const p = this.g.ents.get(s.id); if (p && !s.out) out.push(p); }
    return out;
  }

  /** 균열에서 나온다. 싸우는 중이었으면 그때까지의 기록으로 판을 끝낸다. 스스로 나오면(notify) 알려 준다 */
  leave(p: Ent, notify: boolean): void {
    const run = this.of.get(p.id), seat = run?.seats.get(p.id);
    if (!run || !seat) return;
    if (!seat.out) this.finish(run, seat, p, false);
    run.seats.delete(p.id);
    this.of.delete(p.id);
    this.move(p, RIFT.portal.x + 1.5 + Math.random(), RIFT.portal.z + 1.5 + Math.random(), seat.back);
    p.hp = p.maxHp;
    this.g.out.push({ id: p.id, msg: { t: 'riftPick', opts: [], s: 0 } });
    this.g.out.push({ id: p.id, msg: { t: 'rift', on: false, left: 0, kills: 0, wave: 0, foes: 0, ups: {}, downs: 0, n: 0, over: false } });
    if (notify) this.g.notify(p, 'riftLeft');
  }

  /**
   * 그 사람의 판이 끝났다(완주, 두 번째 쓰러짐, 나감, 끊김): 기록을 적고, 버틴 시간에 맞춘 보상을 우편 한 통으로 보내고, 결과를 알린다.
   * 이때부터 강화는 듣지 않는다 (최대 체력도 제자리로 돌아간다).
   */
  private finish(run: Run, seat: Seat, p: Ent, done: boolean): void {
    const g = this.g, r = p.rift;
    seat.out = true; seat.offer = null; seat.heal = 0;
    const timeS = seat.timeS = done ? RIFT.timeS : Math.max(0, Math.min(RIFT.timeS - 1, Math.floor(run.t - seat.from))), kills = run.kills;
    const first = done && !r.first;
    // 기록: 오래 버틴 쪽이 낫고, 같으면 많이 잡은 쪽
    const better = (s: number, k: number) => timeS > s || (timeS === s && kills > k);
    const today = g.daily.dayOf(g.now());
    if (r.day !== today) { r.day = today; r.dayS = 0; r.dayK = 0; }
    const newBest = better(r.s, r.k);
    if (newBest) { r.s = timeS; r.k = kills; }
    if (better(r.dayS, r.dayK)) { r.dayS = timeS; r.dayK = kills; }
    if (done) { r.clears++; r.first = true; this.stats.clears++; }
    this.stats.seconds += timeS; this.stats.kills += kills; g.saveDirty = true;
    p.unsaved = true;

    // 보상: 우편 한 통. 완주하면 던전 한 번의 완료 보상과 같고, 덜 버티면 그만큼 깎인다 (수치는 economy.ts의 RIFT_ECON)
    const rw = riftReward(timeS, done, first), reward: Reward = {};
    if (rw.gold + rw.bonus > 0) reward.gold = rw.gold + rw.bonus;
    if (rw.exp > 0) reward.exp = rw.exp;
    if (rw.sparks > 0) reward.sparks = rw.sparks;
    if (rw.gear !== 'none') {
      const rolled = g.gear.roll(RIFT_GEAR.lv);
      reward.gear = [rw.gear === 'clear' ? g.gear.roll(RIFT_GEAR.lv, clearRar({ dropRar: RIFT_GEAR.rar }, rolled.rar)) : rolled];
    }
    if (Object.keys(reward).length) g.mail.send(p, 'rift', [timeS, done ? 1 : 0, rw.bonus > 0 ? 1 : 0], reward);

    g.players.refresh(p); // 강화로 늘었던 최대 체력을 되돌린다
    g.notify(p, 'riftResult', timeS, kills, done ? 1 : 0);
    g.out.push({ id: p.id, msg: { t: 'riftPick', opts: [], s: 0 } });
    g.out.push({ id: p.id, msg: { t: 'riftEnd', timeS, kills, done, ups: { ...seat.ups }, best: this.best(p), reward: { gold: rw.gold, exp: rw.exp, sparks: rw.sparks, gear: rw.gear !== 'none', bonus: rw.bonus }, newBest } });
  }

  /** 판 안에서 쓰러졌다 (틀이 이미 제자리에서 일으켜 세웠다): 정해진 횟수까지는 잠깐 무적으로 이어 가고, 그다음에는 그 사람의 판이 끝난다 */
  private died(p: Ent): void {
    const g = this.g, run = this.of.get(p.id), seat = run?.seats.get(p.id);
    if (!run || !seat || seat.out) return;
    seat.downs++;
    if (seat.downs <= RIFT.revives) {
      seat.safeUntil = g.clock + RIFT.reviveSafeS;
      // 일어나며 둘레의 안개를 밀어낸다: 붙어 있던 떼가 그대로면 일어나자마자 다시 쓰러진다. 흩어진 것은 처치로 세지 않는다
      for (const id of [...run.mobs]) {
        const m = g.ents.get(id);
        if (m && !m.def?.boss && dist(m, p) <= RIFT.reviveClear) { run.mobs.delete(id); run.lastHit.delete(id); g.emit(['d', id]); g.remove(id); }
      }
      for (const s of run.seats.values()) g.out.push({ id: s.id, msg: { t: 'riftFx', k: 'ring', id: p.id, r: RIFT.reviveClear } });
      g.notify(p, 'riftRevive', RIFT.reviveSafeS);
      this.tell(run);
      return;
    }
    this.finish(run, seat, p, false);
    // 아직 싸우는 사람이 있으면 먼저 나가서 기다린다. 아무도 없으면 판이 끝난다 (tick이 정리한다)
    if (this.active(run).length > 0) this.leave(p, false);
  }

  private destroy(run: Run): void {
    for (const s of [...run.seats.values()]) { const p = this.g.ents.get(s.id); if (p) this.leave(p, false); }
    this.clearMobs(run);
    this.runs.delete(run.layer);
  }

  /** 남은 몬스터를 흩어 없앤다 (화면에는 쓰러지는 연출로 보인다) */
  private clearMobs(run: Run): void {
    for (const id of run.mobs) { if (this.g.ents.has(id)) { this.g.emit(['d', id]); this.g.remove(id); } }
    run.mobs.clear(); run.lastHit.clear();
  }

  // ---------- 강화 고르기 ----------
  /** 고를 것 셋을 내놓는다: 끝까지 올린 것은 빼고 무작위로 */
  private offer(seat: Seat): void {
    const pool = RIFT_UP_IDS.filter((id) => (seat.ups[id] ?? 0) < RIFT_UPS[id].max), opts: RiftUpId[] = [];
    while (opts.length < RIFT.choices && pool.length) opts.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    seat.given++;
    if (!opts.length) return;
    seat.offer = opts; seat.offerLeft = RIFT.pickTimeoutS;
    for (const id of opts) this.stats.shown[id] = (this.stats.shown[id] ?? 0) + 1;
    this.g.out.push({ id: seat.id, msg: { t: 'riftPick', opts, s: RIFT.pickTimeoutS } });
  }

  /** n번째 것을 고른다. auto: 시간이 다 돼 첫째 것이 골라졌다 */
  private pick(p: Ent, n: number, auto: boolean): void {
    const g = this.g, run = this.of.get(p.id), seat = run?.seats.get(p.id);
    if (!run || !seat || seat.out || !seat.offer || !Number.isInteger(n) || n < 0 || n >= seat.offer.length) return;
    const id = seat.offer[n];
    seat.offer = null;
    seat.ups[id] = (seat.ups[id] ?? 0) + 1;
    this.stats.picked[id] = (this.stats.picked[id] ?? 0) + 1;
    if (auto) this.stats.timeouts++;
    g.saveDirty = true;
    g.players.refresh(p); // 최대 체력이 바뀌었을 수 있다
    if (id === 'vigor') {
      const amount = Math.round(Math.min(p.maxHp * RIFT_UPS.vigor.heal, p.maxHp - p.hp));
      if (amount >= 1) { p.hp += amount; g.emit(['heal', p.id, amount]); }
    }
    g.out.push({ id: p.id, msg: { t: 'riftPick', opts: [], s: 0 } });
    this.tellOne(run, seat);
  }

  // ---------- 떼 ----------
  /** 판 전용 몬스터 정의: 체력과 피해에 배율을 곱하고, 처치 보상은 0이다. 먼저 덤비지 않게(aggro 0) 두고 대상은 판이 직접 정해 준다 */
  private defOf(type: MonsterId, hp: number, dmg: number, boss: boolean): MonsterDef {
    const key = `${type}|${hp}|${dmg}|${boss}`;
    let def = this.defs.get(key);
    if (!def) {
      const base: MonsterDef = MONSTERS[type];
      def = { hp: Math.max(1, Math.round(base.hp * hp)), dmg: [Math.max(1, Math.round(base.dmg[0] * dmg)), Math.max(1, Math.round(base.dmg[1] * dmg))], speed: base.speed, exp: 0, gold: [0, 0], aggro: 0, h: base.h, boss: boss || undefined };
      this.defs.set(key, def);
    }
    return def;
  }

  /** 그 사람 둘레의 바깥(화면 밖)에서, 전장 안에 드는 자리를 고른다. 가장자리에 붙어 있으면 맞은편에서 나온다 */
  private spot(at: { x: number; z: number }, angle: number): { x: number; z: number } {
    const a = RIFT.area, [r0, r1] = RIFT.spawnRadius, pad = EDGE + 1;
    let best = { x: at.x, z: at.z }, bd = -1;
    for (let k = 0; k < 4; k++) {
      const ang = angle + k * (Math.PI / 2), r = r0 + this.random() * (r1 - r0);
      const x = Math.min(a.x1 - pad, Math.max(a.x0 + pad, at.x + Math.cos(ang) * r)), z = Math.min(a.z1 - pad, Math.max(a.z0 + pad, at.z + Math.sin(ang) * r));
      const d = Math.hypot(x - at.x, z - at.z);
      if (d > bd) { bd = d; best = { x, z }; }
      if (d >= r0 - 2) break;
    }
    return best;
  }

  private spawn(run: Run, type: MonsterId, hp: number, dmg: number, near: Ent, angle: number, boss = false): Ent {
    const at = this.spot(near, angle);
    const m = this.g.monsters.spawn(type, at.x, at.z);
    m.layer = run.layer;
    m.def = this.defOf(type, hp, dmg, boss);
    m.hp = m.maxHp = m.def.hp;
    m.targetId = near.id;
    run.mobs.add(m.id);
    return m;
  }

  /** 무리 하나를 부른다: 한 사람을 골라 그 둘레의 한쪽에서 뭉쳐 나온다 */
  private pack(run: Run, people: Ent[]): void {
    const wave = RIFT.waves[riftWaveAt(run.t)];
    const n = Math.min(riftPack(wave.n, people.length), RIFT.maxFoes - run.mobs.size);
    if (n <= 0) return;
    const near = people[Math.floor(this.random() * people.length)], base = this.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const type = wave.types[Math.floor(this.random() * wave.types.length)];
      this.spawn(run, type, wave.hp, wave.dmg, near, base + (this.random() - 0.5) * RIFT.spawnSpread);
    }
  }

  /**
   * 판 안의 몬스터는 끝까지 쫓아온다. 틀의 몬스터는 집에서 멀어지면 돌아가고 대상을 잃으면 어슬렁거리므로(monsters.ts),
   * 틱마다 집을 지금 자리로 옮기고(돌아갈 곳이 없다) 대상이 없으면 가장 가까운 사람을 정해 준다.
   * 너무 멀어진 것은 대상의 둘레로 다시 불러온다: 달아나서 떼를 떼어 낼 수 없고, 틀이 대상을 놓는 거리(loseRange)에 닿지 않는다.
   */
  private chase(run: Run, people: Ent[]): void {
    const g = this.g;
    for (const id of run.mobs) {
      const m = g.ents.get(id);
      if (!m || m.dead) continue;
      m.hx = m.x; m.hz = m.z; m.homing = false;
      let t = g.ents.get(m.targetId);
      if (!t || !people.includes(t)) {
        t = undefined;
        let nd = Infinity;
        for (const p of people) { const d = dist(p, m); if (d < nd) { nd = d; t = p; } }
        m.targetId = t?.id ?? 0;
      }
      if (t && dist(m, t) > RIFT.regroupAt) {
        const at = this.spot(t, this.random() * Math.PI * 2);
        m.x = at.x; m.z = at.z; m.tx = at.x; m.tz = at.z; m.hx = at.x; m.hz = at.z; m.moving = false; m.path = null;
        resolve(m, g.world.obstacles);
      }
    }
  }

  /** 그 사람의 고리와 번지는 일격, 처치 회복을 처리한다 */
  private powers(run: Run, seat: Seat, p: Ent, dt: number): void {
    const g = this.g, reach = riftUp.reach(seat.ups.reach ?? 0);
    const around = (x: number, z: number, r: number, skip: number, amount: number) => {
      this.inner = true;
      try {
        for (const id of [...run.mobs]) {
          const m = g.ents.get(id);
          if (m && !m.dead && id !== skip && Math.hypot(m.x - x, m.z - z) <= r) g.combat.damage(p, m, amount, false);
        }
      } finally { this.inner = false; }
    };
    // 번지는 일격: 이번 틱에 한 마리만 때렸으면(기본 공격이나 대상 하나를 치는 기술) 그 둘레의 다른 적에게 번진다. 범위 기술은 여럿을 치므로 번지지 않는다
    const chain = seat.ups.chain ?? 0;
    if (chain > 0 && seat.hits.length === 1) {
      const basic = classOf(p.cls).basic, h = seat.hits[0];
      around(h.x, h.z, RIFT_UPS.chain.radius * reach, h.id, Math.max(1, Math.round(((basic[0] + basic[1]) / 2) * riftUp.chain(chain))));
    }
    seat.hits.length = 0;
    // 안개 고리: 정해진 간격마다 내 둘레의 적 모두에게 피해
    const ring = seat.ups.ring ?? 0;
    if (ring > 0) {
      seat.ringT -= dt;
      if (seat.ringT <= 0) {
        seat.ringT = RIFT_UPS.ring.everyS;
        const r = RIFT_UPS.ring.radius * reach;
        around(p.x, p.z, r, 0, riftUp.ring(ring));
        for (const s of run.seats.values()) g.out.push({ id: s.id, msg: { t: 'riftFx', k: 'ring', id: p.id, r } });
      }
    }
    // 처치 회복: 쓰러뜨릴 때마다 띄우면 화면이 숫자로 덮이므로 모아서 준다
    if (seat.heal >= 1 && Math.floor(run.t * 2) !== Math.floor((run.t - dt) * 2)) {
      const amount = Math.round(Math.min(seat.heal, p.maxHp - p.hp));
      seat.heal = 0;
      if (amount >= 1) { p.hp += amount; g.emit(['heal', p.id, amount]); }
    }
  }

  // ---------- 알리기 ----------
  private tellOne(run: Run, seat: Seat): void {
    const left = Math.max(0, Math.ceil(run.ended ? run.exit : RIFT.timeS - run.t));
    this.g.out.push({ id: seat.id, msg: { t: 'rift', on: true, left, kills: run.kills, wave: riftWaveAt(run.t) + 1, foes: run.mobs.size, ups: { ...seat.ups }, downs: seat.downs, n: this.active(run).length, over: seat.out } });
  }
  /** 안에 있는 사람들에게 남은 시간과 처치 수를 알린다 */
  private tell(run: Run): void {
    run.told = 0;
    for (const s of run.seats.values()) this.tellOne(run, s);
  }

  tick(dt: number): void {
    const g = this.g;
    for (const run of [...this.runs.values()]) {
      if (run.seats.size === 0) { this.destroy(run); continue; }
      if (run.ended) {
        run.exit -= dt;
        if (run.exit <= 0) { this.destroy(run); continue; }
      } else {
        const people = this.active(run);
        if (people.length === 0) { this.end(run); continue; } // 모두 쓰러졌다
        const before = run.t;
        run.t += dt;
        if (run.t >= RIFT.timeS) {
          // 끝까지 버텼다: 남아 있는 사람 모두 완주다
          for (const p of people) this.finish(run, run.seats.get(p.id)!, p, true);
          this.end(run);
          continue;
        }
        // 무리: 물결마다 정해진 간격으로
        // 빨리 잡아 적이 물결의 기준(keep)보다 적어지면 간격을 기다리지 않고 더 부른다
        const wave = RIFT.waves[riftWaveAt(run.t)];
        run.spawnT -= dt; run.fillT -= dt;
        if (run.spawnT <= 0 || (run.fillT <= 0 && run.mobs.size < riftKeep(wave.keep, people.length))) { run.spawnT = wave.every; run.fillT = RIFT.refillS; this.pack(run, people); }
        // 우두머리: 한 번
        if (!run.bossCalled && run.t >= RIFT.boss.atS) {
          run.bossCalled = true;
          // 가득 차 있어도 우두머리의 자리는 낸다: 가장 오래된 것 하나를 흩어 보낸다 (한도를 넘기지 않는다)
          if (run.mobs.size >= RIFT.maxFoes) { const old = run.mobs.values().next().value; if (old !== undefined) { run.mobs.delete(old); run.lastHit.delete(old); g.emit(['d', old]); g.remove(old); } }
          this.spawn(run, RIFT.boss.type, RIFT.boss.hp, RIFT.boss.dmg, people[Math.floor(this.random() * people.length)], this.random() * Math.PI * 2, true);
          for (const p of people) g.notify(p, 'riftBoss', RIFT.boss.type);
        }
        this.chase(run, people);
        // 사람마다: 고를 차례, 고르기의 시간, 강화의 효과
        const due = riftPicksBy(run.t);
        for (const p of people) {
          const seat = run.seats.get(p.id)!;
          if (seat.out) continue; // 방금 쓰러져 끝난 사람
          if (seat.offer) { seat.offerLeft -= dt; if (seat.offerLeft <= 0) this.pick(p, 0, true); }
          if (!seat.offer && seat.given < due) this.offer(seat);
          this.powers(run, seat, p, dt);
        }
        if (riftWaveAt(before) !== riftWaveAt(run.t)) run.told = 99; // 물결이 바뀌면 바로 알린다
      }
      run.told += dt;
      if (run.told >= 0.5) this.tell(run); // 처치 수와 적의 수가 화면에서 늦지 않게 자주 알린다
    }
  }

  /** 판을 끝낸다: 남은 몬스터를 흩고, 남은 사람은 결과를 보다가 나간다 */
  private end(run: Run): void {
    run.ended = true; run.exit = RIFT.exitS;
    this.clearMobs(run);
    this.tell(run);
  }
}
