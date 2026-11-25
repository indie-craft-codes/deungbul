// 별빛 채굴기: 이 게임에만 있는 '들어오는 몫'의 규칙.
//   골드로 채굴기를 짓고 올리면, 레벨에 따라 1분마다 별가루(두 번째 재화 sparks)가 저장고에 쌓인다.
//   시간으로 셈하므로 접속 중이든, 창을 닫고 자리를 비웠든, 아예 나가 있든 똑같이 쌓인다(저장의 마지막 시각부터).
//   저장고는 DRILL.capMin분 어치에서 멈춘다. 거두면(drillTake) 지갑에 들어간다.
//   모은 별가루로 각인(engrave)을 올리면 주는 피해가 오른다(g.mods의 damage).
// 틀의 시스템처럼 필요한 것을 생성자에서 스스로 등록한다. 틀은 이 파일을 모른다.
import { DRILL, drillCap, ENGRAVE } from '../shared/content/drill';
import type { MeState } from '../shared/starmine';
import { clamp, type Ent, type Game, readInt } from '@engine/server';

/** 캐릭터의 채굴기 칸 */
export interface DrillState { lv: number; stash: number; at: number; engrave: number }

export class Drill {
  /** 지난 주기 처리 뒤 흐른 시간(초) */
  private acc = 0;

  constructor(private g: Game) {
    g.entInit.push((e) => { e.drill = { lv: 0, stash: 0, at: g.now(), engrave: 0 }; });
    g.saves.push({
      name: 'drill',
      save: (p) => { this.accrue(p); return { lv: p.drill.lv, stash: p.drill.stash, at: p.drill.at, engrave: p.drill.engrave }; },
      load: (p, raw) => {
        const r = (raw ?? {}) as Partial<Record<keyof DrillState, unknown>>, now = g.now();
        const lv = readInt(r.lv, 0, DRILL.maxLv, 0);
        const stash = typeof r.stash === 'number' && Number.isFinite(r.stash) ? clamp(r.stash, 0, drillCap(lv)) : 0;
        // 마지막 시각이 깨졌거나 앞날이면 지금부터 센다 (시계를 돌려 별가루를 만들지 못하게)
        const at = typeof r.at === 'number' && Number.isFinite(r.at) && r.at <= now ? r.at : now;
        p.drill = { lv, stash, at, engrave: readInt(r.engrave, 0, ENGRAVE.maxLv, 0) };
      },
    });
    g.rules.touched = (p) => p.drill.lv > 0 || p.drill.engrave > 0;
    g.personal.push({ name: 'drill', state: (p): MeState['drill'] => this.view(p) });
    g.commands.set('drillUp', (p) => this.upgrade(p));
    g.commands.set('drillTake', (p) => this.take(p));
    g.commands.set('engrave', (p) => this.engrave(p));
    // 1초마다 쌓는다: 개인 상태가 바뀌어 화면의 저장고 숫자가 따라간다 (자리를 비운 사람의 캐릭터도 서버에 있으면 함께)
    g.ticks.push((dt) => {
      this.acc += dt;
      if (this.acc < 1) return;
      this.acc = 0;
      for (const e of g.ents.values()) if (e.kind === 'p' && e.drill.lv > 0) this.accrue(e);
    });
    // 나가 있던 동안 쌓인 몫을 알린다 (저장에서 읽은 마지막 시각부터)
    g.on('playerJoined', (p) => {
      const minutes = Math.floor((g.now() - p.drill.at) / 60000), before = Math.floor(p.drill.stash);
      this.accrue(p);
      const gained = Math.floor(p.drill.stash) - before;
      if (p.drill.lv > 0 && minutes >= 1 && gained > 0) g.notify(p, 'drillAway', gained, minutes);
    });
    // 각인: 주는 피해에 곱한다
    g.mods.provide('damage', (p) => (p ? 1 + ENGRAVE.per * p.drill.engrave : 1));
  }

  /** 지금 시각까지의 생산을 저장고에 더한다 (가득 차면 멈춘다) */
  accrue(p: Ent): void {
    const d = p.drill, now = this.g.now();
    if (now <= d.at) return;
    const cap = drillCap(d.lv);
    const next = Math.min(cap, d.stash + DRILL.rate(d.lv) * (now - d.at) / 60000);
    d.at = now;
    if (next !== d.stash) { d.stash = next; p.unsaved = true; }
  }

  view(p: Ent): MeState['drill'] {
    const d = p.drill;
    return { lv: d.lv, stash: Math.floor(d.stash), rate: DRILL.rate(d.lv), cap: drillCap(d.lv), engrave: d.engrave };
  }

  private upgrade(p: Ent): void {
    const g = this.g, d = p.drill;
    if (d.lv >= DRILL.maxLv) { g.notify(p, 'drillMax'); return; }
    const cost = DRILL.cost(d.lv);
    this.accrue(p);
    // 골드는 지갑으로만 뺀다: 장부가 원인을 적는다
    if (!g.wallet.take(p, 'gold', cost, 'cmd:drillUp')) { g.notify(p, 'drillPoor', cost); return; }
    d.lv++; p.unsaved = true;
    g.notify(p, 'drillUp', d.lv);
  }

  private take(p: Ent): void {
    const g = this.g, d = p.drill;
    this.accrue(p);
    const n = Math.floor(d.stash);
    if (n < 1) { g.notify(p, 'drillEmpty'); return; }
    const got = g.wallet.add(p, 'sparks', n, 'cmd:drillTake');
    d.stash -= got; p.unsaved = true;
    g.notify(p, 'drillTook', got);
    g.fire('collected', p, got);
  }

  private engrave(p: Ent): void {
    const g = this.g, d = p.drill;
    if (d.engrave >= ENGRAVE.maxLv) { g.notify(p, 'engraveMax'); return; }
    const cost = ENGRAVE.cost(d.engrave);
    if (!g.wallet.take(p, 'sparks', cost, 'cmd:engrave')) { g.notify(p, 'engravePoor', cost); return; }
    d.engrave++; p.unsaved = true;
    g.notify(p, 'engraveUp', d.engrave);
  }
}
