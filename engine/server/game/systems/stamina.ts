// [stamina] 스태미나 (묶음 D): 시간으로 차오르는 행동력. 규칙은 내용의 STAMINA_RULES (engine/shared/defs/stamina.ts). enabled가 거짓이면 아무것도 등록하지 않는다.
// 단계(stages)의 출격 한 번·소탕 한 번이 깎는다 (g.stages.fuel): 모자라면 거절하고 안내문 staminaShort(필요, 가진 것). 자동 진행·되풀이도 한 판마다 깎고, 모자라면 대기실로 멈춘다.
// 진 단계·싸우다 나온 것은 refund의 몫을 돌려준다. 오프라인 진행(STAGE_RULES.offline)도 깬 단계마다 깎는다 (모자라면 거기서 멈춘다).
// 회복은 시각으로 셈한다(staminaAt): 접속하지 않은 동안도 저장의 { n, at }로 이어진다. 상한(max)까지만 차오르고, 물약·우편·레벨 업은 hold까지 쌓으며 넘는 몫은 overflow(우편·버림).
// 명령 { t: 'stamina', a: 'potion' } (물약 하나). 저장: 캐릭터의 ext 'stamina' ({ n, at }). 개인 상태 'stamina' (StaminaMe).
import { STAMINA_RULE_VIEW, isItemId, staminaAt, staminaHold, staminaMax, staminaOn, type StaminaMe, type StaminaSave } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

export const STAMINA_WHY = 'stamina';

export class Stamina {
  /** 켜져 있는가 (만들 때의 규칙: 꺼져 있으면 아무것도 하지 않는다) */
  readonly on: boolean;
  private readonly st = new Map<number, StaminaSave>();

  constructor(private g: Game) {
    this.on = staminaOn();
    if (!this.on) return;
    const r = STAMINA_RULE_VIEW;
    if (r.potion && (!g.has('items') || !isItemId(r.potion.item))) throw new Error(`[stamina] 물약 '${r.potion.item}'이 ITEMS에 없거나 items 모듈이 없습니다`);
    if (r.overflow === 'mail' && !g.has('mail')) throw new Error('[stamina] 넘친 몫을 우편으로 보내려면(overflow: mail) mail 모듈이 있어야 합니다');
    g.commands.set('stamina', (p, m) => { if (m.a === 'potion') this.potion(p); });
    g.saves.push({ name: 'stamina', save: (p) => { const s = this.st.get(p.id); return s ? { ...this.now(p) } : undefined; }, load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'stamina', state: (p) => this.me(p) });
    g.on('playerLeft', (id) => { this.st.delete(id); });
    g.on('leveledUp', (p) => { if (r.levelFill && !p.bot) this.give(p, staminaMax(p.lv), 'level'); });
    g.stages.fuel = { have: (p) => this.have(p), pay: (p, n) => this.take(p, n), back: (p, n) => this.give(p, n, 'refund') };
  }

  private lv(p: Ent): number { return this.g.has('growth') ? p.lv : 1; }
  /** 지금의 { n, at } (회복을 셈해 적어 둔다). 처음이면 start(없으면 상한) */
  private now(p: Ent): StaminaSave {
    const max = staminaMax(this.lv(p)), now = this.g.now();
    let s = this.st.get(p.id);
    if (!s) { s = { n: Math.max(0, Math.floor(STAMINA_RULE_VIEW.start ?? max)), at: now }; this.st.set(p.id, s); }
    const next = staminaAt(s, now, max, STAMINA_RULE_VIEW.everyS);
    if (next.n !== s.n || next.at !== s.at) { this.st.set(p.id, next); s = next; }
    return s;
  }
  /** 가진 양 */
  have(p: Ent): number { return this.on && !p.bot ? this.now(p).n : 0; }
  private me(p: Ent): StaminaMe {
    const s = this.now(p), max = staminaMax(this.lv(p)), per = Math.max(1, STAMINA_RULE_VIEW.everyS);
    const pot = STAMINA_RULE_VIEW.potion ? { pot: { item: STAMINA_RULE_VIEW.potion.item, n: STAMINA_RULE_VIEW.potion.n } } : {};
    if (s.n >= max) return { n: s.n, max, next: 0, full: 0, ...pot };
    const next = Math.max(1, Math.ceil((s.at + per * 1000 - this.g.now()) / 1000));
    return { n: s.n, max, next, full: next + (max - s.n - 1) * per, ...pot };
  }
  /** n만큼 쓴다 (모자라면 쓰지 않고 false) */
  take(p: Ent, n: number): boolean {
    if (!this.on || p.bot || n <= 0) return true;
    const s = this.now(p);
    if (s.n < n) return false;
    const max = staminaMax(this.lv(p));
    // 상한 이상에서 쓰면 그때부터 회복을 센다
    this.st.set(p.id, { n: s.n - n, at: s.n >= max ? this.g.now() : s.at });
    p.unsaved = true;
    this.g.track('stamina_use', { n }, p);
    return true;
  }
  /** n만큼 더한다 (hold까지. 넘는 몫은 overflow: 우편이면 우편으로). 실제로 더한 양 */
  give(p: Ent, n: number, why = ''): number {
    if (!this.on || p.bot || !(n > 0)) return 0;
    const s = this.now(p), hold = staminaHold(this.lv(p)), add = Math.max(0, Math.min(Math.floor(n), hold - s.n)), over = Math.floor(n) - add;
    if (add) this.st.set(p.id, { n: s.n + add, at: s.at });
    if (over > 0 && STAMINA_RULE_VIEW.overflow === 'mail') this.g.mail.send(p, 'stamina', [over], { stamina: over });
    p.unsaved = true;
    if (why) this.g.track('stamina_get', { n: add, why }, p);
    return add;
  }
  /** 물약 하나: 가방에서 쓰고 그만큼 더한다 (가방에 없거나 hold가 꽉 찼으면 쓰지 않는다) */
  potion(p: Ent): boolean {
    const pot = STAMINA_RULE_VIEW.potion, g = this.g;
    if (!this.on || !pot || p.bot || !isItemId(pot.item)) return false;
    if (this.now(p).n >= staminaHold(this.lv(p))) { g.notify(p, 'staminaFull'); return false; }
    if (!g.bag.takeItem(p, pot.item, 1, 'use')) { g.notify(p, 'itemShort', pot.item, 1, g.bag.count(p, pot.item)); return false; }
    const got = this.give(p, pot.n, 'potion');
    g.notify(p, 'staminaGot', got);
    return true;
  }
  private loadOf(p: Ent, raw: unknown): void {
    const d = raw as { n?: unknown; at?: unknown } | null;
    if (!d || typeof d !== 'object' || typeof d.n !== 'number' || typeof d.at !== 'number') return;
    this.st.set(p.id, { n: Math.max(0, Math.min(staminaHold(this.lv(p)), Math.floor(d.n))), at: Math.min(d.at, this.g.now()) });
  }
}
