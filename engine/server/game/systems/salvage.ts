// 분해: 안 쓰는 장비를 장비 가루로 바꾼다. 장비의 잠금과 자동 분해도 여기서 맡는다.
//   salvage { uids }      고른 장비들을 분해한다 (일괄 분해도 이 명령 하나다: 화면이 대상의 번호를 모아 보낸다)
//   gearLock { uid, on }  장비를 잠그거나 푼다. 잠근 장비는 팔기, 분해, 거래소 올리기가 막힌다
//   autoSalvage { rar }   주운 장비가 이 등급 이하면 그 자리에서 분해한다 (-1이면 끔)
// 낀 장비, 보급형(상점에서 산 것), 잠근 장비는 분해할 수 없다. 나오는 가루는 등급과 강화 단계로 정해지고(틀의 dustFor), 수치는 게임의 내용에 있다 (SALVAGE).
// 가루를 주지 않는 게임(SALVAGE.dust가 비어 있음)에서는 분해와 자동 분해가 꺼진다: 명령은 거절되고 화면에도 보이지 않는다 (개인 상태 salvage.on).
// 장비와 가루는 가방 통로(bag.ts)를 지나므로 장부에 제 이름으로 적힌다: 분해는 cmd:salvage, 자동 분해는 autoSalvage.
import { RARITIES, SALVAGE, autoSalvageChoices, canSalvage, dustFor, isItemId, salvageOn, type Gear, type ItemId, type SalvageDef } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { WHY } from './wallet';

/** 아직 알리지 않은 자동 분해: 장비 수, 얻은 가루, 처음 쌓인 시각(게임 시계) */
interface Pending { n: number; dust: number; at: number }

export class Salvage {
  /** 분해의 표. 게임의 내용(SALVAGE)에서 읽는다. 시험이 다른 표(가루를 주지 않는 게임)를 넣어 볼 수 있다 */
  cfg: SalvageDef = SALVAGE;
  /** 접속 중인 사람의 자동 분해를 묶어 알리려고 모아 둔 것 */
  private pending = new Map<number, Pending>();

  constructor(private g: Game) {
    g.commands.set('salvage', (p, m) => this.salvage(p, m.uids));
    g.commands.set('gearLock', (p, m) => { if (typeof m.uid === 'number') this.lock(p, m.uid, m.on === true); });
    g.commands.set('autoSalvage', (p, m) => this.setAuto(p, m.rar));
    g.on('playerLeft', (id) => { this.pending.delete(id); });
    g.saves.push({
      name: 'salvage',
      // 자동 분해를 켜지 않았으면 칸을 만들지 않는다 (이 기능을 쓰지 않은 캐릭터의 저장은 전과 같다)
      save: (p) => (p.autoSalvage >= 0 ? { auto: p.autoSalvage } : undefined),
      load: (p, raw) => {
        const d = (typeof raw === 'object' && raw !== null ? raw : {}) as { auto?: unknown };
        p.autoSalvage = this.readAuto(d.auto);
      },
    });
    // 화면에 알릴 것: 분해가 있는 게임인가, 자동 분해의 설정
    g.personal.push({ name: 'salvage', state: (p) => ({ on: this.on, auto: this.on ? p.autoSalvage : -1 }) });
    // 묶어 둔 자동 분해 안내를 때가 되면 보낸다
    g.ticks.push(() => {
      if (!this.pending.size) return;
      for (const [id, w] of this.pending) if (g.clock - w.at >= this.cfg.tellS) this.flush(id);
    });
  }

  /** 이 게임에 분해가 있는가 */
  get on(): boolean { return salvageOn(this.cfg); }

  /** 고를 수 있는 자동 분해 값으로 맞춘다: 깨진 값이나 고를 수 없는 등급(영웅)은 끔(-1)이다 */
  private readAuto(v: unknown): number {
    return typeof v === 'number' && autoSalvageChoices(this.cfg).includes(v) ? v : -1;
  }

  /** 가루로 들어갈 아이템 (분해가 꺼져 있으면 null) */
  private item(): ItemId | null { return this.on && isItemId(this.cfg.item) ? this.cfg.item : null; }

  // ---------- 분해 ----------
  /**
   * 고른 장비들을 분해한다. 하나라도 분해할 수 없으면(없는 번호, 겹친 번호, 낀 것, 보급형, 잠근 것) 아무것도 하지 않는다:
   * 화면이 보여 준 대상과 수치 그대로 되거나 아예 안 되거나다. 가루가 한도를 넘게 되면 넘는 몫을 조용히 버리지 않고 거절한다
   */
  private salvage(p: Ent, raw: unknown): void {
    const g = this.g, item = this.item();
    if (!item || !Array.isArray(raw) || raw.length < 1 || raw.length > this.cfg.maxBatch) { g.notify(p, 'salvageCant'); return; }
    const picked: Gear[] = [], seen = new Set<number>();
    for (const uid of raw) {
      const it = typeof uid === 'number' && Number.isInteger(uid) && !seen.has(uid) ? p.gear.find((x) => x.uid === uid) : undefined;
      if (!it || p.worn[it.slot] === it.uid || !canSalvage(it)) { g.notify(p, 'salvageCant'); return; }
      seen.add(it.uid);
      picked.push(it);
    }
    const dust = picked.reduce((s, it) => s + dustFor(it, this.cfg), 0), room = g.bag.room(p, item);
    if (dust > room) { g.notify(p, 'salvageFull', dust, room); return; }
    for (const it of picked) g.bag.removeGear(p, it.uid, WHY.salvage);
    g.bag.putItem(p, item, dust, WHY.salvage);
    g.notify(p, 'salvaged', picked.length, dust);
  }

  // ---------- 잠금 ----------
  private lock(p: Ent, uid: number, on: boolean): void {
    const it = p.gear.find((x) => x.uid === uid);
    if (!it || !!it.lock === on) return;
    if (on) it.lock = true; else delete it.lock;
    p.metaDirty = true; p.unsaved = true;
  }

  // ---------- 자동 분해 ----------
  private setAuto(p: Ent, raw: unknown): void {
    if (!this.on) { this.g.notify(p, 'salvageCant'); return; }
    const v = this.readAuto(raw);
    if (v !== raw || v === p.autoSalvage) return; // 고를 수 없는 값은 무시한다
    p.autoSalvage = v;
    p.unsaved = true;
  }

  /** 가루가 꽉 차 자동 분해를 건너뛴 것을 이미 알린 사람 (tellFull) */
  private fullTold = new Set<number>();
  /**
   * 방금 떨어진 장비를 자동 분해할 것이면 그 자리에서 가루로 바꾸고 true를 돌려준다 (가방에 넣지 않는다: 가득 차 있어도 된다).
   * 몬스터가 떨어뜨린 장비에만 쓴다 (systems/gear.ts의 처치 사건). 우편, 거래소, 상점, 제작, 던전 완료 보상으로 받은 것은 거치지 않는다.
   * 가루가 한도까지 차서 다 받지 못하면 분해하지 않는다 (false): 장비는 평소처럼 가방으로 간다
   */
  auto(p: Ent, it: Gear, why: string): boolean {
    const g = this.g, item = this.item();
    if (!item || p.bot || p.autoSalvage < 0 || it.rar > p.autoSalvage || it.rar > this.cfg.autoMaxRar) return false;
    const dust = dustFor(it, this.cfg);
    if (dust > g.bag.room(p, item)) {
      // 가루가 꽉 찼다: 장비는 가방으로 간다. 알리기로 한 게임이면 자리가 다시 날 때까지 한 번만 알린다
      if (this.cfg.tellFull && !this.fullTold.has(p.id)) { this.fullTold.add(p.id); g.notify(p, 'autoSalvageFull', g.bag.count(p, item)); }
      return false;
    }
    this.fullTold.delete(p.id);
    // 장부에는 그 원인(사냥)으로 생겼다가 자동 분해로 사라진 장비와, 자동 분해로 생긴 가루로 적힌다
    g.bag.passed(p, it, why, WHY.autoSalvage);
    if (dust > 0) g.bag.putItem(p, item, dust, WHY.autoSalvage);
    if (g.has('away') && g.away.active(p)) { g.away.tally(p, 'salv', 1); g.away.tally(p, 'dust', dust); return true; } // 자리를 비운 동안의 것은 돌아왔을 때 한 번에 알린다
    const w = this.pending.get(p.id);
    if (w) { w.n++; w.dust += dust; } else this.pending.set(p.id, { n: 1, dust, at: g.clock });
    return true;
  }

  /** 모아 둔 자동 분해를 한 줄로 알린다 */
  private flush(id: number): void {
    const w = this.pending.get(id), p = this.g.ents.get(id);
    this.pending.delete(id);
    if (w && p) this.g.notify(p, 'autoSalvaged', w.n, w.dust);
  }

  /** 등급의 수 (시험용: 표의 길이가 등급과 맞는지 본다) */
  get complete(): boolean { return !this.on || this.cfg.dust.length === RARITIES.length; }
}
