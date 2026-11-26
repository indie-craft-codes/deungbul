// [morph] 변신: 사람이 가진 캐릭터 정의(chars 모듈)로 바뀐다. 겉모습은 g.setLook으로 바뀌어 남의 화면에도 보이고(EnterInfo.l, 메시지 look),
// 힘의 보정은 g.mods(주는 피해, 받는 피해, 치명타, 자연 회복)로 건다. 세기와 때는 게임의 내용 MORPH_RULES: 지속 시간, 재사용 대기, 전투 중 금지, 보정과 상한.
// 기본값은 겉모습만 바뀐다 (보정 0). 화면의 짝은 engine/client/hud/morph.ts (메뉴의 '변신' 탭).
// 명령: { t: 'morph', a: 'on', id } 변신, { t: 'morph', a: 'off' } 풀기. 캐릭터를 주는 길은 grant 하나다 (게임의 보상, 상점, 나중의 거래·AI 만들기).
// 저장은 캐릭터의 ext 'morph' ({ own, on?, left?, cd? }: 남은 시간은 초), 본인에게는 개인 상태 'morph'(MorphMe).
import { encodeLook, MORPH_RULE_VIEW, morphMods, type MorphMe, type MorphMods } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

const ID_RE = /^[a-z][a-z0-9_]{2,31}$/;
const NONE: Required<MorphMods> = { damage: 0, guard: 0, crit: 0, regen: 0 };

export class Morph {
  /** 변신한 사람마다의 보정 (변신할 때 셈해 둔다) */
  private bonus = new WeakMap<Ent, Required<MorphMods>>();
  private acc = 0;

  constructor(private g: Game) {
    const R = MORPH_RULE_VIEW;
    g.commands.set('morph', (p, m) => {
      if (m.a === 'on' && typeof m.id === 'string') this.on(p, m.id);
      else if (m.a === 'off') this.off(p, 'off');
    });
    g.saves.push({ name: 'morph', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'morph', state: (p): MorphMe => this.me(p) });
    // 보정: 변신하지 않은 사람에게는 1(곱)·0(합)이다
    const b = (p?: Ent) => (p && p.kind === 'p' && p.morph.on ? this.bonus.get(p) ?? NONE : NONE);
    g.mods.provide('damage', (p) => 1 + b(p).damage);
    g.mods.provide('guard', (p) => 1 - b(p).guard);
    g.mods.provide('crit', (p) => b(p).crit);
    g.mods.provide('regen', (p) => 1 + b(p).regen);
    // 시간이 다 된 변신을 푼다 (1초마다 훑는다)
    g.ticks.push((dt) => {
      this.acc += dt;
      if (this.acc < 1) return;
      this.acc = 0;
      if (!R.durationS) return;
      for (const p of g.ents.values()) if (p.kind === 'p' && p.morph.on && p.morph.until > 0 && g.clock >= p.morph.until) this.off(p, 'end');
    });
    // 정의가 빠지면 그것으로 변신한 사람을 풀고, 다시 바뀌면 겉모습을 맞춘다
    g.on('charRemoved', (id) => { for (const p of g.ents.values()) if (p.kind === 'p' && p.morph.on === id) this.off(p, 'gone'); });
    g.on('charAdded', (def) => { for (const p of g.ents.values()) if (p.kind === 'p' && p.morph.on === def.id) { this.bonus.set(p, morphMods(def)); g.setLook(p, encodeLook(def.look)); } });
  }

  /** 그 캐릭터를 가졌는가 */
  owns(p: Ent, id: string): boolean { return p.morph.own.includes(id); }
  /** 캐릭터를 준다 (이미 가졌거나 한도(MORPH_RULES.maxOwn)에 닿았거나 없는 정의면 false) */
  grant(p: Ent, id: string): boolean {
    const m = p.morph;
    if (m.own.includes(id) || !this.g.chars.has(id) || m.own.length >= MORPH_RULE_VIEW.maxOwn) return false;
    m.own.push(id);
    p.unsaved = true;
    this.g.notify(p, 'charNew', id);
    return true;
  }
  /** 캐릭터를 거둔다 (거래·회수). 그것으로 변신해 있으면 푼다 */
  take(p: Ent, id: string): boolean {
    const i = p.morph.own.indexOf(id);
    if (i < 0) return false;
    if (p.morph.on === id) this.off(p, 'gone');
    p.morph.own.splice(i, 1);
    p.unsaved = true;
    return true;
  }

  /** 변신한다: 가진 캐릭터, 재사용 대기가 끝났고, 싸우는 중이 아니어야 한다 (MORPH_RULES.noFightS) */
  on(p: Ent, id: string): boolean {
    const g = this.g, m = p.morph, R = MORPH_RULE_VIEW, def = g.chars.get(id);
    if (!def || !m.own.includes(id)) { g.notify(p, 'morphNone'); return false; }
    if (m.on === id) return false;
    if (g.clock < m.cdUntil) { g.notify(p, 'morphWait', Math.ceil(m.cdUntil - g.clock)); return false; }
    if (R.noFightS > 0 && g.has('combat') && g.clock - p.lastHurt < R.noFightS) { g.notify(p, 'morphFight'); return false; }
    m.on = id;
    m.until = R.durationS > 0 ? g.clock + R.durationS : 0;
    this.bonus.set(p, morphMods(def));
    g.setLook(p, encodeLook(def.look));
    g.notify(p, 'morphOn', id);
    g.fire('morphed', p, id, 'on');
    return true;
  }

  /** 변신을 푼다 (why: off 스스로, end 시간이 다 됨, gone 정의가 빠짐). 풀리면 재사용 대기가 시작된다 */
  off(p: Ent, why: 'off' | 'end' | 'gone'): boolean {
    const g = this.g, m = p.morph;
    if (!m.on) return false;
    m.on = ''; m.until = 0;
    m.cdUntil = g.clock + Math.max(0, MORPH_RULE_VIEW.cooldownS);
    this.bonus.delete(p);
    g.setLook(p, '');
    g.notify(p, why === 'off' ? 'morphOff' : why === 'end' ? 'morphEnd' : 'morphGone');
    g.fire('morphed', p, '', why);
    return true;
  }

  /** 지금의 보정 (변신하지 않았으면 모두 0) */
  mods(p: Ent): Required<MorphMods> { return p.morph.on ? this.bonus.get(p) ?? NONE : NONE; }

  private me(p: Ent): MorphMe {
    const m = p.morph, c = this.g.clock;
    return { own: m.own, on: m.on, left: m.on && m.until > 0 ? Math.max(0, Math.ceil(m.until - c)) : -1, cd: Math.max(0, Math.ceil(m.cdUntil - c)) };
  }

  // ---------- 저장 ----------
  private saveOf(p: Ent): unknown {
    const m = p.morph, c = this.g.clock;
    if (!m.own.length && !m.on) return undefined;
    return { own: m.own, ...(m.on ? { on: m.on, ...(m.until > 0 ? { left: Math.max(1, Math.ceil(m.until - c)) } : {}) } : {}), ...(m.cdUntil > c ? { cd: Math.ceil(m.cdUntil - c) } : {}) };
  }
  /** 깨진 값은 건너뛴다. 가진 캐릭터는 지금 정의가 없어도 간직한다 (정의가 돌아오면 이어진다). 변신은 정의가 있을 때만 되살린다 */
  private loadOf(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const r = raw as Record<string, unknown>, m = p.morph, c = this.g.clock;
    if (Array.isArray(r.own)) m.own = [...new Set(r.own.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)))].slice(0, MORPH_RULE_VIEW.maxOwn);
    const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);
    m.cdUntil = c + num(r.cd, 86400);
    const def = typeof r.on === 'string' && m.own.includes(r.on) ? this.g.chars.get(r.on) : undefined;
    if (!def) return;
    const left = num(r.left, 86400 * 7);
    m.on = def.id;
    m.until = MORPH_RULE_VIEW.durationS > 0 ? c + (left > 0 ? Math.min(left, MORPH_RULE_VIEW.durationS) : MORPH_RULE_VIEW.durationS) : 0;
    this.bonus.set(p, morphMods(def));
    this.g.setLook(p, encodeLook(def.look));
  }
}
