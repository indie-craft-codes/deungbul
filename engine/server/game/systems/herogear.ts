// [herogear] 영웅 장비: 사람마다 가진 영웅 장비(표 HERO_RULES.gear의 id, 강화, 낀 영웅). 영웅마다 칸(slots)에 하나씩 낀다.
// 끼기·빼기·강화(재화와 재료: herocost.ts의 payCost, 원인 cmd:hgear:enhance)·분해(원인 cmd:hgear:salvage). 같은 세트를 n개 끼면 그 단의 덤.
// 장비는 단계를 깰 때(stageCleared)와 던전을 끝낼 때(dungeonCleared) 내용의 떨어지는 표(drops)대로 생긴다. 게임의 보상은 give(p, id)로 준다.
// 낀 장비의 공격·체력과 세트는 영웅의 최종 값(engine/shared/defs/herogrow.ts의 heroFull)에 들어가 싸움과 전투력에 함께 쓰인다:
// 끼거나 빼거나 강화하면 사건 heroChanged(p, 영웅)를 내고, 편성(squad)이 그 영웅의 체력·공격을 맞춘다.
// 저장: 캐릭터의 ext 'herogear' ({ seq, items: [[번호, id, 강화, 낀 영웅]] }). 본인에게는 개인 상태 'hgear' (HeroGearMe).
import { gearChance, gearMaxLv, heroGearDef, heroGearRules, isHeroGearId, isHeroId, isItemId, type HeroGearDrop, type HeroGearMe, type HeroGearPiece, type HeroGearRules, type Reward } from '../../../shared/defs';
import { readInt, type Ent } from '../entity';
import type { Game } from '../game';
import { payCost } from './herocost';
import { CURS } from './wallet';

/** 지갑과 가방에 넘기는 원인의 이름 (장부가 명령에 붙이는 이름과 같다) */
export const HGEAR_WHY = { enhance: 'cmd:hgear:enhance', salvage: 'cmd:hgear:salvage' } as const;

/** 표가 없다는 알림을 이미 했다 (한 프로세스에 한 번) */
let warned = false;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export class HeroGear {
  /** 떨어지기와 강화의 난수 (시험은 정해진 난수로 바꿔 끼운다) */
  rng: () => number = Math.random;
  readonly rules: HeroGearRules | null = heroGearRules();

  constructor(private g: Game) {
    const r = this.rules;
    if (!r) { if (!warned) { warned = true; console.warn('[herogear] 모듈 herogear를 골랐지만 내용의 HERO_RULES.gear가 없습니다: 영웅 장비가 없습니다'); } return; }
    HeroGear.check(r);
    g.commands.set('hgear', (p, m) => this.command(p, m));
    g.saves.push({ name: 'herogear', save: (p) => this.saveOf(p), load: (p, raw) => this.loadOf(p, raw) });
    g.personal.push({ name: 'hgear', state: (p): HeroGearMe => ({ items: p.hgear.map((x) => [x.uid, x.id, x.lv, x.hero]), cap: r.bag }) });
    g.on('stageCleared', (p, id) => this.drop(p, r.drops?.stage, id));
    g.on('dungeonCleared', (id, players) => { for (const p of players) this.drop(p, r.drops?.dungeon, id); });
  }

  /** 표가 맞는가: 칸·세트·떨어지는 표의 id. 틀리면 서버를 띄울 때 멈춘다 */
  static check(r: HeroGearRules): void {
    const slots = new Set(r.slots.map((s) => s.id));
    for (const [id, d] of Object.entries(r.items)) {
      if (!slots.has(d.slot)) throw new Error(`[herogear] 장비 '${id}'의 칸 '${d.slot}'이 HERO_RULES.gear.slots에 없습니다`);
      if (d.set && !Object.hasOwn(r.sets ?? {}, d.set)) throw new Error(`[herogear] 장비 '${id}'의 세트 '${d.set}'가 HERO_RULES.gear.sets에 없습니다`);
    }
    for (const t of [r.drops?.stage, r.drops?.dungeon]) for (const [k, d] of Object.entries(t ?? {})) for (const x of d.pool) if (!Object.hasOwn(r.items, x.id)) throw new Error(`[herogear] 떨어지는 표 '${k}'의 장비 '${x.id}'가 표에 없습니다`);
  }

  // ---------- 읽기 ----------
  piece(p: Ent, uid: number): HeroGearPiece | undefined { return p.hgear.find((x) => x.uid === uid); }
  /** 그 영웅의 그 칸에 낀 것 */
  worn(p: Ent, hero: string, slot: string): HeroGearPiece | undefined { return p.hgear.find((x) => x.hero === hero && heroGearDef(x.id)?.slot === slot); }

  // ---------- 명령 ----------
  private command(p: Ent, m: Record<string, unknown>): void {
    if (m.a === 'salvage') { if (Array.isArray(m.uids)) this.salvage(p, m.uids); return; }
    if (!num(m.uid)) return;
    if (m.a === 'equip' && isHeroId(m.hero)) this.equip(p, m.uid, m.hero);
    else if (m.a === 'unequip') this.unequip(p, m.uid);
    else if (m.a === 'enhance') this.enhance(p, m.uid);
  }

  /** 끼운다: 가진 영웅에게, 그 칸에 낀 것이 있으면 바꾼다. 다른 영웅이 끼던 것이면 그 영웅에게서 뺀다 */
  equip(p: Ent, uid: number, hero: string): boolean {
    const g = this.g, x = this.piece(p, uid), d = x && heroGearDef(x.id);
    if (!x || !d || !g.roster.owned(p, hero) || x.hero === hero) return false;
    const had = this.worn(p, hero, d.slot), from = x.hero;
    if (had) had.hero = '';
    x.hero = hero;
    p.unsaved = true;
    g.fire('heroChanged', p, hero);
    if (from) g.fire('heroChanged', p, from);
    return true;
  }

  unequip(p: Ent, uid: number): boolean {
    const x = this.piece(p, uid);
    if (!x || !x.hero) return false;
    const from = x.hero;
    x.hero = '';
    p.unsaved = true;
    this.g.fire('heroChanged', p, from);
    return true;
  }

  /** 강화를 한 번 시도한다: 값을 치르고, 확률(enhance.chance)로 하나 오른다. 실패해도 값은 들고 강화는 그대로 */
  enhance(p: Ent, uid: number): boolean {
    const g = this.g, r = this.rules!, x = this.piece(p, uid), d = x && heroGearDef(x.id);
    if (!x || !d) return false;
    if (x.lv >= gearMaxLv(x.id)) { g.notify(p, 'hgEnhanceMax', x.id); return false; }
    if (!payCost(g, p, r.enhance.cost(x.lv, d.rarity), HGEAR_WHY.enhance)) return false;
    const ok = this.rng() < gearChance(x.id, x.lv);
    if (ok) x.lv++;
    p.unsaved = true;
    g.notify(p, 'hgEnhance', x.id, x.lv, ok ? 1 : 0);
    if (ok && x.hero) g.fire('heroChanged', p, x.hero);
    return ok;
  }

  /** 분해한다: 끼지 않은 것만 (하나라도 틀리면 아무것도 하지 않는다). 받는 것은 salvage(등급, 강화)의 합 */
  salvage(p: Ent, raw: readonly unknown[]): boolean {
    const g = this.g, r = this.rules!;
    if (!r.salvage || !raw.length) return false;
    const uids = [...new Set(raw)];
    const list = uids.map((u) => (num(u) ? this.piece(p, u) : undefined));
    if (list.some((x) => !x || x.hero)) return false;
    const got: Reward = {};
    for (const x of list as HeroGearPiece[]) {
      const rw = r.salvage(heroGearDef(x.id)!.rarity, x.lv);
      for (const cur of CURS) if (rw[cur]) got[cur] = (got[cur] ?? 0) + rw[cur]!;
      for (const [id, n] of Object.entries(rw.items ?? {})) (got.items ??= {})[id] = (got.items[id] ?? 0) + n;
    }
    p.hgear = p.hgear.filter((x) => !list.includes(x));
    this.reward(p, got, HGEAR_WHY.salvage);
    p.unsaved = true;
    g.notify(p, 'hgSalvaged', list.length);
    return true;
  }

  // ---------- 얻기 ----------
  /** 장비 한 점을 준다 (강화 0, 끼지 않음). 가득 찼으면 주지 않고 알린다(null) */
  give(p: Ent, id: string): HeroGearPiece | null {
    const r = this.rules;
    if (!r || !isHeroGearId(id) || p.kind !== 'p') return null;
    if (p.hgear.length >= r.bag) { this.g.notify(p, 'hgFull', id); return null; }
    const x: HeroGearPiece = { uid: ++p.hgSeq, id, lv: 0, hero: '' };
    p.hgear.push(x);
    p.unsaved = true;
    this.g.notify(p, 'hgDrop', id);
    return x;
  }

  /** 떨어지는 표에서 굴린다: 그 id의 표(없으면 '*') */
  private drop(p: Ent, table: Readonly<Record<string, HeroGearDrop>> | undefined, id: string): void {
    if (!table || p.bot) return;
    const d = Object.hasOwn(table, id) ? table[id] : Object.hasOwn(table, '*') ? table['*'] : undefined;
    if (!d) return;
    for (let i = 0; i < Math.max(1, d.n ?? 1); i++) {
      if (this.rng() >= d.chance) continue;
      const pick = HeroGear.pick(d.pool, this.rng());
      if (pick) this.give(p, pick);
    }
  }
  /** 무게의 표에서 하나 (r은 0 이상 1 미만) */
  static pick(pool: readonly { id: string; w: number }[], r: number): string | undefined {
    const live = pool.filter((x) => x.w > 0), sum = live.reduce((s, x) => s + x.w, 0);
    let acc = 0;
    for (const x of live) { acc += x.w / sum; if (r < acc) return x.id; }
    return live.at(-1)?.id;
  }

  private reward(p: Ent, rw: Reward, why: string): void {
    const g = this.g;
    for (const cur of CURS) { const n = rw[cur]; if (n) g.wallet.add(p, cur, n, why); }
    for (const [id, n] of Object.entries(rw.items ?? {})) if (isItemId(id)) g.bag.putItem(p, id, n, why);
  }

  // ---------- 저장 ----------
  private saveOf(p: Ent): { seq: number; items: [number, string, number, string][] } | undefined {
    return p.hgear.length || p.hgSeq ? { seq: p.hgSeq, items: p.hgear.map((x) => [x.uid, x.id, x.lv, x.hero]) } : undefined;
  }
  /** 깨진 줄과 표에서 빠진 장비는 버린다. 가지지 않은 영웅이 낀 것과 한 칸에 둘째로 낀 것은 뺀다. 번호가 겹치면 새 번호 */
  private loadOf(p: Ent, raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const d = raw as { seq?: unknown; items?: unknown };
    p.hgSeq = readInt(d.seq, 0, 1e9, 0);
    if (!Array.isArray(d.items)) return;
    const used = new Set<number>(), worn = new Set<string>();
    for (const v of d.items.slice(0, this.rules!.bag)) {
      if (!Array.isArray(v) || !isHeroGearId(v[1])) continue;
      let uid = readInt(v[0], 1, 1e9, 0);
      if (!uid || used.has(uid)) uid = ++p.hgSeq;
      used.add(uid);
      p.hgSeq = Math.max(p.hgSeq, uid);
      const id = v[1], slot = heroGearDef(id)!.slot;
      let hero = typeof v[3] === 'string' && isHeroId(v[3]) && Object.hasOwn(p.heroes, v[3]) ? v[3] : '';
      if (hero && worn.has(`${hero}|${slot}`)) hero = '';
      if (hero) worn.add(`${hero}|${slot}`);
      p.hgear.push({ uid, id, lv: readInt(v[2], 0, gearMaxLv(id), 0), hero });
    }
  }
}
