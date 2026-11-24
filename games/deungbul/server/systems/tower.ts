// 등탑과 주민: 서버 전체가 공유하는 진행. 불씨를 바쳐 밝기를 올리고 주민을 되돌린다.
// 등탑은 구역마다 하나씩 있다. 바깥 구역의 등탑은 꺼진 채로 시작하고, 모두가 불씨를 모아 밝혀야 한다.
import { FULL_TOWER_OFFER, GLOW_BRIGHT_REGEN, GLOW_MAX, RESIDENTS, TOWER_REACH, speedFor, stageOf, type ResidentId, type Stage } from '../../shared/defs';
import type { MeState } from '../../shared/deungbul';
import type { WorldState } from '@engine/shared/protocol';
import { TOWERS, zoneOf, type TowerDef } from '../../shared/world';
import { clamp, dist, readInt, type Ent } from '@engine/server/game/entity';
import type { Game } from '@engine/server/game/game';

export class Tower {
  /** 등탑별 밝기 (0~100). 시간으로 줄지 않는다: 습격 결과로만 변한다 */
  readonly glows: number[] = TOWERS.map((t) => t.start);
  /** 주민별로 모인 불씨 */
  private got: number[] = RESIDENTS.map(() => 0);

  constructor(private g: Game) {
    // 엔티티 칸과 저장: 지금까지 바친 불씨(누적 기여). ext.tower = { contrib }. 칸을 옮기기 전의 저장은 최상위 contrib에 있다
    g.entInit.push((e) => { e.contrib = 0; });
    g.saves.push({
      name: 'tower',
      save: (p) => ({ contrib: p.contrib }),
      load: (p, raw) => { p.contrib = readInt((raw as { contrib?: unknown } | null)?.contrib, 0, 1e9, 0); },
      legacy: (whole) => (whole.contrib === undefined ? undefined : { contrib: whole.contrib }),
      legacySave: (p) => ({ contrib: p.contrib }),
    });
    // 본인에게 알리는 개인 상태: 기여가 바뀌면 간다
    g.personal.push({ name: 'contrib', state: (p): MeState['contrib'] => p.contrib });
    // 칸 이름이 생기기 전의 저장({ glow, residents })은 통째로 등탑의 몫이다
    g.worldSaves.push({ name: 'tower', save: () => this.save(), load: (d) => this.load(d), legacy: (whole) => whole });
    // 등탑이 정하는 규칙: 일어나는 자리, 이동 속도, 직업을 바꿀 수 있는 곳, 주민이 돌아와야 풀리는 것
    g.rules.respawn = (p) => { const t = this.respawnFor(p); return { x: t.spawn.x, z: t.spawn.z, id: t.id }; };
    g.rules.speed = (p) => speedFor(this.stageAt(p.x));
    g.rules.canChangeClass = (p) => this.near(p) >= 0;
    g.rules.unlocked = (key) => { const r = RESIDENTS.find((x) => x.id === key); return !r || this.returned(r.id); };
    g.shared.push({ name: 'tower', state: () => this.state() });
    g.commands.set('offer', (p, m) => {
      if (typeof m.n === 'number' && (m.to === 'tower' || m.to === 'resident')) this.offer(p, m.to, m.n);
    });
    // 밝기 혜택: 내가 있는 구역의 등탑이 환하면 회복이 빨라진다.
    // 주민이 돌아와 생기는 일은 다른 시스템이 맡는다: 상점 물건(shop.ts), 등탑지기의 일(keepers.ts)
    g.mods.provide('regen', (p) => (p && this.stageAt(p.x) === 2 ? GLOW_BRIGHT_REGEN : 1));
  }

  /** 첫불 마을 등탑의 밝기 (습격의 대상) */
  get glow(): number { return this.glows[0]; }

  /** 그 자리가 속한 구역의 등탑 밝기 단계 */
  stageAt(x: number): Stage { return stageOf(this.glows[zoneOf(x)]); }

  /** 가까이 있는 등탑의 번호. 없으면 -1 */
  near(p: Ent): number { return TOWERS.findIndex((t) => dist(p, t) <= TOWER_REACH); }

  /** 쓰러졌을 때 다시 일어날 등탑: 켜져 있는 등탑 가운데 가장 가까운 곳 */
  respawnFor(p: Ent): TowerDef {
    let best = TOWERS[0], bd = Infinity;
    TOWERS.forEach((t, i) => {
      const d = dist(p, t);
      if (this.glows[i] > 0 && d < bd) { bd = d; best = t; }
    });
    return best;
  }

  returned(id: ResidentId): boolean {
    const i = RESIDENTS.findIndex((r) => r.id === id);
    return this.got[i] >= RESIDENTS[i].need;
  }

  /** i번 등탑의 밝기를 바꾼다. 단계가 바뀌거나 꺼져 있던 등탑이 켜지면 모두에게 알린다. */
  changeGlow(delta: number, i = 0): number {
    const before = this.glows[i], stage = stageOf(before), def = TOWERS[i];
    this.glows[i] = clamp(before + delta, delta < 0 ? Math.min(def.floor, before) : 0, GLOW_MAX);
    if (this.glows[i] === before) return 0;
    if (before === 0) this.g.announce('towerLit', def.id);
    else if (stageOf(this.glows[i]) !== stage) this.g.announce('stageChanged', stageOf(this.glows[i]), def.id);
    this.g.stateDirty = true; this.g.saveDirty = true;
    return this.glows[i] - before;
  }

  private offer(p: Ent, to: 'tower' | 'resident', want: number): void {
    const g = this.g;
    if (!Number.isInteger(want) || want < 1) return;
    const ti = this.near(p);
    if (ti < 0) { g.notify(p, 'offerFar'); return; }
    if (p.sparks < 1) { g.notify(p, 'noSparks'); return; }
    let used: number;
    if (to === 'tower') {
      // 등탑이 이미 가장 밝아도 바칠 수 있다: 밝기는 더 오르지 않지만 기여와 퀘스트에는 세어진다
      // (가득 찬 서버에 새로 온 사람이 '등탑에 바치기' 단계에서 막히지 않게)
      // 다만 '전부'로 불씨를 몽땅 태우지 않게, 가득 찬 등탑은 한 번에 조금(FULL_TOWER_OFFER)만 받는다
      const room = GLOW_MAX - this.glows[ti];
      used = Math.min(want, p.sparks, room > 0 ? room : FULL_TOWER_OFFER);
      if (room > 0) this.changeGlow(used, ti);
    } else {
      // 주민은 첫불 마을의 등탑에서만 되돌린다
      const i = ti === 0 ? RESIDENTS.findIndex((r, k) => this.got[k] < r.need) : -1;
      if (i < 0) { g.notify(p, 'noResident'); return; }
      used = Math.min(want, p.sparks, RESIDENTS[i].need - this.got[i]);
      this.got[i] += used;
      if (this.got[i] >= RESIDENTS[i].need) { g.announce('residentBack', RESIDENTS[i].id); g.fire('residentReturned', RESIDENTS[i].id); }
      g.stateDirty = true; g.saveDirty = true;
    }
    p.sparks -= used; p.contrib += used; p.dirty = true; p.unsaved = true;
    g.notify(p, 'offered', used, p.contrib, to);
    g.fire('offered', p, to, used, ti);
    g.daily.add(p, 'offer', used); // 일일 임무 '불씨 바치기'. 임무 시스템은 불씨를 모르므로 여기서 알린다
  }

  state(): WorldState['tower'] { return { glow: this.glows[0], glows: [...this.glows], residents: [...this.got] }; }

  save(): unknown { return this.state(); }
  load(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;
    const d = data as { glow?: unknown; glows?: unknown; residents?: unknown };
    const read = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), 0, GLOW_MAX) : fallback);
    // 등탑이 하나뿐이던 때의 저장(glow만 있다)도 읽는다
    const list = Array.isArray(d.glows) ? d.glows : [d.glow];
    TOWERS.forEach((t, i) => { this.glows[i] = read(list[i], t.start); });
    if (Array.isArray(d.residents)) this.got = RESIDENTS.map((r, i) => clamp(Math.round(Number((d.residents as unknown[])[i]) || 0), 0, r.need));
  }
}
