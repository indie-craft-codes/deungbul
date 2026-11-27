// [morph] 변신: 사람이 가진 캐릭터 정의(chars 모듈)로 바뀐다. 겉모습은 g.setLook으로 바뀌어 남의 화면에도 보이고(EnterInfo.l, 메시지 look),
// 힘의 보정은 g.mods(주는 피해, 받는 피해, 치명타, 자연 회복)로 건다. 세기와 때는 게임의 내용 MORPH_RULES: 지속 시간, 재사용 대기, 전투 중 금지, 보정과 상한.
// 기본값은 겉모습만 바뀐다 (보정 0). 화면의 짝은 engine/client/hud/morph.ts (메뉴의 '변신' 탭).
// 명령: { t: 'morph', a: 'on', id } 변신, { t: 'morph', a: 'off' } 풀기. 캐릭터를 주는 길은 grant 하나다 (게임의 보상, 상점, 나중의 거래·AI 만들기).
// 저장은 캐릭터의 ext 'morph' ({ own, on?, left?, cd? }: 남은 시간은 초), 본인에게는 개인 상태 'morph'(MorphMe).
// 선택 칸 (내용의 MORPH_RULES):
//   fromRoster  가진 변신 = 가진 영웅 ∩ 정의 (roster). own을 따로 저장하지 않는다. 영웅이 바뀌면(사건 heroChanged) 그 변신의 값을 다시 맞춘다
//   mods(def, grow)  보정에 그 사람이 키운 만큼(영웅의 레벨·별)을 넘긴다
//   stats(card)  능력치 대체: 변신한 동안 기본 최대 체력과 기본 공격을 카드에서 셈한 값으로 (g.mods의 hp에 차이를 더하고, damage에 카드 공격 ÷ 직업 기본 공격을 곱한다.
//                장비·버프는 그 위에 그대로). 화면은 같은 셈(engine/shared/defs/morph.ts의 morphCard·morphStats)으로 카드와 변신 탭에 같은 수를 보인다
import { classBaseAtk, classBaseHp, encodeLook, gearOn, MORPH_RULE_VIEW, morphCard, morphMods, morphStats, type CharDef, type MorphMe, type MorphMods, type MorphStats } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

const ID_RE = /^[a-z][a-z0-9_]{2,31}$/;
const NONE: Required<MorphMods> = { damage: 0, guard: 0, crit: 0, regen: 0 };

export class Morph {
  /** 변신한 사람마다의 보정 (변신할 때 셈해 둔다) */
  private bonus = new WeakMap<Ent, Required<MorphMods>>();
  /** 능력치 대체 방식: 변신한 사람마다의 카드 능력치와 그것을 셈한 때의 레벨·직업 (변신할 때, 영웅·레벨·직업이 바뀔 때 다시) */
  private card = new WeakMap<Ent, { s: MorphStats; lv: number; cls: string }>();
  private acc = 0;
  private readonly fromRoster: boolean;

  constructor(private g: Game) {
    const R = MORPH_RULE_VIEW;
    this.fromRoster = !!R.fromRoster;
    if (this.fromRoster && !g.has('roster')) throw new Error('[morph] MORPH_RULES.fromRoster는 영웅 모듈(roster)이 있어야 합니다');
    g.commands.set('morph', (p, m) => {
      if (m.a === 'on' && typeof m.id === 'string') this.on(p, m.id);
      else if (m.a === 'off') this.off(p, 'off');
    });
    g.saves.push({ name: 'morph', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'morph', state: (p): MorphMe => this.me(p) });
    // 보정: 변신하지 않은 사람에게는 1(곱)·0(합)이다
    const b = (p?: Ent) => (p && p.kind === 'p' && p.morph.on ? this.bonus.get(p) ?? NONE : NONE);
    g.mods.provide('damage', (p) => (1 + b(p).damage) * this.atkMul(p));
    // 능력치 대체: 기본 최대 체력을 카드의 체력으로 (차이를 더한다: players.refresh가 직업·레벨의 체력 + 보정 hp의 합으로 셈한다)
    if (R.stats) g.mods.provide('hp', (p) => this.hpDelta(p));
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
    g.on('charAdded', (def) => { for (const p of g.ents.values()) if (p.kind === 'p' && p.morph.on === def.id) { this.fit(p, def); g.setLook(p, encodeLook(def.look)); } });
    // 영웅이 바뀌었다(레벨·별 …): 그것으로 변신해 있으면 보정과 카드 능력치를 다시 (키운 만큼 바로 세진다)
    if (g.has('roster')) g.on('heroChanged', (p, id) => { const def = p.morph.on === id ? g.chars.get(id) : undefined; if (def) this.fit(p, def); });
  }

  /** 그 캐릭터를 가졌는가 (fromRoster면 영웅으로 가졌고 정의가 있는가) */
  owns(p: Ent, id: string): boolean { return this.fromRoster ? Object.hasOwn(p.heroes, id) && this.g.chars.has(id) : p.morph.own.includes(id); }
  /** 가진 캐릭터 id들 (fromRoster면 가진 영웅 가운데 정의가 있는 것, 얻은 차례) */
  owned(p: Ent): string[] { return this.fromRoster ? Object.keys(p.heroes).filter((id) => this.g.chars.has(id)) : p.morph.own; }
  /** 캐릭터를 준다 (이미 가졌거나 한도(MORPH_RULES.maxOwn)에 닿았거나 없는 정의면 false). fromRoster면 영웅으로 준다 (g.roster.grant) */
  grant(p: Ent, id: string): boolean {
    if (this.fromRoster) { if (this.owns(p, id) || !this.g.chars.has(id)) return false; return !!this.g.roster.grant(p, id); }
    const m = p.morph;
    if (m.own.includes(id) || !this.g.chars.has(id) || m.own.length >= MORPH_RULE_VIEW.maxOwn) return false;
    m.own.push(id);
    p.unsaved = true;
    this.g.notify(p, 'charNew', id);
    return true;
  }
  /** 캐릭터를 거둔다 (거래·회수). 그것으로 변신해 있으면 푼다 */
  take(p: Ent, id: string): boolean {
    if (this.fromRoster) return false; // 영웅을 거두는 길은 틀에 없다
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
    if (!def || !this.owns(p, id)) { g.notify(p, 'morphNone'); return false; }
    if (m.on === id) return false;
    if (g.clock < m.cdUntil) { g.notify(p, 'morphWait', Math.ceil(m.cdUntil - g.clock)); return false; }
    if (R.noFightS > 0 && g.has('combat') && g.clock - p.lastHurt < R.noFightS) { g.notify(p, 'morphFight'); return false; }
    m.on = id;
    m.until = R.durationS > 0 ? g.clock + R.durationS : 0;
    this.fit(p, def);
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
    this.refit(p);
    g.setLook(p, '');
    g.notify(p, why === 'off' ? 'morphOff' : why === 'end' ? 'morphEnd' : 'morphGone');
    g.fire('morphed', p, '', why);
    return true;
  }

  /** 지금의 보정 (변신하지 않았으면 모두 0) */
  mods(p: Ent): Required<MorphMods> { return p.morph.on ? this.bonus.get(p) ?? NONE : NONE; }
  /** 능력치 대체 방식의 지금 값 (변신하지 않았거나 그 방식이 아니면 null) */
  stats(p: Ent): MorphStats | null { return this.cardOf(p); }

  /** 그 사람이 그 캐릭터를 키운 만큼 (영웅으로 가졌으면) */
  private growOf(p: Ent, id: string): { lv: number; stars: number } | undefined {
    const h = this.g.has('roster') ? this.g.roster.owned(p, id) : undefined;
    return h ? { lv: h.lv, stars: h.stars } : undefined;
  }
  /** 카드 능력치를 셈한다 (능력치 대체 방식이 아니면 null): 영웅 탭의 카드와 같은 셈 (morphCard → morphStats) */
  private statsOf(p: Ent, def: CharDef): MorphStats | null {
    if (!MORPH_RULE_VIEW.stats) return null;
    const g = this.g, h = g.has('roster') ? g.roster.owned(p, def.id) : undefined;
    return morphStats(morphCard(def, h, { lv: g.field(p, 'lv') }, h && g.has('herogear') ? gearOn(g.field(p, 'hgear'), def.id) : []));
  }
  /** 변신의 보정과 카드 능력치를 셈해 둔다 (변신할 때, 정의·영웅이 바뀔 때) */
  private fit(p: Ent, def: CharDef): void {
    this.bonus.set(p, morphMods(def, this.growOf(p, def.id)));
    const s = this.statsOf(p, def);
    if (s) this.card.set(p, { s, lv: this.g.field(p, 'lv'), cls: p.cls }); else this.card.delete(p);
    this.refit(p);
  }
  /** 최대 체력을 다시 셈한다 (능력치 대체 방식: 체력의 비율을 지킨다) */
  private refit(p: Ent): void {
    if (!MORPH_RULE_VIEW.stats || !this.g.has('combat')) return;
    if (!p.morph.on) this.card.delete(p);
    const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    this.g.players.refresh(p);
    p.hp = p.hp <= 0 ? p.hp : Math.max(1, Math.min(p.maxHp, Math.round(p.maxHp * ratio)));
  }
  /** 지금의 카드 능력치 (레벨이 오르거나 직업을 바꿨으면 다시 셈한다: 카드에 사람의 레벨을 넘기는 게임이 있다) */
  private cardOf(p: Ent): MorphStats | null {
    if (!p.morph.on) return null;
    const c = this.card.get(p);
    if (!c) return null;
    if (c.lv !== this.g.field(p, 'lv') || c.cls !== p.cls) {
      const def = this.g.chars.get(p.morph.on), s = def ? this.statsOf(p, def) : null;
      if (!s) return c.s;
      this.card.set(p, { s, lv: this.g.field(p, 'lv'), cls: p.cls });
      return s;
    }
    return c.s;
  }
  /** 기본 공격(과 기술)의 배율: 카드 공격 ÷ 직업의 기본 공격 (능력치 대체 방식이 아니거나 변신하지 않았으면 1) */
  private atkMul(p?: Ent): number {
    if (!MORPH_RULE_VIEW.stats || !p || p.kind !== 'p' || !p.morph.on) return 1;
    const s = this.cardOf(p);
    return s ? s.atk / classBaseAtk(p.cls) : 1;
  }
  /** 최대 체력에 더할 값: 카드 체력 − 직업·레벨의 기본 체력 */
  private hpDelta(p?: Ent): number {
    if (!p || p.kind !== 'p' || !p.morph.on) return 0;
    const s = this.cardOf(p);
    return s ? s.hp - classBaseHp(p.cls, this.g.field(p, 'lv')) : 0;
  }

  private me(p: Ent): MorphMe {
    const m = p.morph, c = this.g.clock;
    return { own: this.owned(p), on: m.on, left: m.on && m.until > 0 ? Math.max(0, Math.ceil(m.until - c)) : -1, cd: Math.max(0, Math.ceil(m.cdUntil - c)) };
  }

  // ---------- 저장 ----------
  private saveOf(p: Ent): unknown {
    const m = p.morph, c = this.g.clock;
    if (!m.own.length && !m.on) return undefined;
    return { own: this.fromRoster ? [] : m.own, ...(m.on ? { on: m.on, ...(m.until > 0 ? { left: Math.max(1, Math.ceil(m.until - c)) } : {}) } : {}), ...(m.cdUntil > c ? { cd: Math.ceil(m.cdUntil - c) } : {}) };
  }
  /** 깨진 값은 건너뛴다. 가진 캐릭터는 지금 정의가 없어도 간직한다 (정의가 돌아오면 이어진다). 변신은 정의가 있을 때만 되살린다 */
  private loadOf(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const r = raw as Record<string, unknown>, m = p.morph, c = this.g.clock;
    // fromRoster면 가진 것은 영웅에서 읽는다: 저장의 own(예전 저장)은 버린다 (영웅의 소유가 원본이다)
    if (Array.isArray(r.own) && !this.fromRoster) m.own = [...new Set(r.own.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)))].slice(0, MORPH_RULE_VIEW.maxOwn);
    const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0);
    m.cdUntil = c + num(r.cd, 86400);
    const def = typeof r.on === 'string' && this.owns(p, r.on) ? this.g.chars.get(r.on) : undefined;
    if (!def) return;
    const left = num(r.left, 86400 * 7);
    m.on = def.id;
    m.until = MORPH_RULE_VIEW.durationS > 0 ? c + (left > 0 ? Math.min(left, MORPH_RULE_VIEW.durationS) : MORPH_RULE_VIEW.durationS) : 0;
    this.fit(p, def);
    this.g.setLook(p, encodeLook(def.look));
  }
}
