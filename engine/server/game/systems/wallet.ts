// 지갑(economy 모듈): 캐릭터의 재화(골드, 두 번째 재화 sparks, 경험치)를 더하고 빼는 한 통로.
// 재화를 바꾸는 코드는 모두 여기를 지난다 (틀의 시스템과 게임의 규칙 시스템 모두). 캐릭터의 재화 칸(p.gold, p.sparks, p.exp)을 직접 고치는 곳은
// 이 파일과 저장을 읽는 곳(players.ts의 spawn), 레벨 업(players.ts의 levelUp)뿐이고, 다른 곳에 생기면 engine/test/wallet.test.ts가 실패한다.
//
//   g.wallet.add(p, 'gold', n, why)    더한다. 실제로 더한 양을 돌려준다 (배율과 상한이 적용된 값)
//   g.wallet.take(p, 'gold', n, why)   뺀다. 모자라면 false를 돌려주고 아무것도 바꾸지 않는다
//   g.wallet.can(p, 'gold', n)         그만큼 낼 수 있는가
//   g.wallet.amount(p, 'gold', n, why) 지금 더하면 실제로 더해질 양 (바꾸지 않는다. 받기 전에 안내문에 넣을 값을 알아야 할 때)
//
// 왜 한 통로인가 (docs/economy.md 4-6의 (2)):
//   - 원인(why)을 아는 쪽이 장부에 직접 알린다: 장부(ledger.ts)가 경계의 앞뒤 차이로 짐작하던 것보다 정확하다
//   - 수급 배율을 끼울 자리가 생긴다: 하루 몫(밝은 등불)이나 모드별 보상 배율은 scale에 함수를 등록한다. 더하는 쪽에만 걸리고, 빼는 쪽(값을 치르는 것)에는 걸리지 않는다
//   - 깨진 값(NaN, 음수, 소수, 상한을 넘는 수)이 캐릭터에 들어가지 않는다
//
// 원인의 이름은 장부의 이름과 같은 체계다: 명령은 'cmd:명령[:하위 동작]', 우편은 'mail:종류', 사냥은 ECON_HUNT(hunt, huntAway, huntDungeon),
// 그 밖의 보상은 게임이 정한 이름(이 게임: quest, raid, tier). 운영에 쌓인 자료와 이어지도록 한 번 쓴 이름은 바꾸지 않는다.
// 이름을 비워 두면('') 장부가 그때의 경계로 가려 적는다: 명령과 사건 밖(시험의 준비, 운영 도구)에서 준 것은 other로 남거나 g.ledger.note가 붙인 이름으로 적힌다.
//
// 재화의 표(이름, 거래 가능 여부, 상한)는 게임의 내용에 있다 (CURRENCIES). 틀이 아는 칸은 엔티티의 gold, sparks, exp 셋이고, 표에 없는 재화는 한도 없이 다룬다.
// 장비(낱개)와 아이템(재료, 물약)은 짝이 되는 통로인 가방(bag.ts)을 지난다. 원인의 이름은 아래 WHY를 함께 쓴다.
//
// 재화의 종류 (CURRENCIES의 선택 칸 kinds: 유상·무상·이벤트·귀속, 쓰는 차례, 만료. engine/shared/defs/economy.ts):
//   적은 재화만 종류마다의 몫(지갑의 주머니)을 따로 센다. 엔티티의 칸(p.sparks)은 그대로 합이고, 주머니는 저장의 ext.purse에 적힌다.
//   add(p, cur, n, why, kind)  kind를 주지 않으면 earn의 종류. take는 spend의 차례로(같은 종류 안에서는 먼저 사라질 몫부터) 꺼낸다.
//   장부에 알리는 원인에는 ':종류'가 붙는다 ('cmd:gacha:free', 'quest:event'). 만료된 몫은 'expire:종류'로 빠진다 (1분마다, 접속 중인 사람만. 접속할 때도 본다).
//   주머니의 합이 칸과 다르면(종류를 적기 전의 저장, 지갑 밖의 변화) 칸을 믿는다: 모자라면 earn의 종류로 채우고, 남으면 쓰는 차례로 덜어 낸다.
//   종류를 적지 않은 게임(지금의 게임 모두)은 주머니가 없다: 저장·장부·줄 위가 예전과 같다.
import { CURRENCIES, curKinds, earnKind, type CurKind, type CurrencyDef, type CurrencyKinds } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';

/** 지갑이 다루는 재화: 엔티티의 칸 이름과 같다 */
export type Cur = 'gold' | 'sparks' | 'exp';
/** 지갑이 다루는 재화의 목록 (관리자 지급처럼 이름으로 고를 때) */
export const CURS: readonly Cur[] = ['gold', 'sparks', 'exp'];
/**
 * 수급 배율: 그 사람이 그 재화를 그 원인으로 n만큼 받을 때 곱할 값 (1이면 그대로, 0이면 주지 않는다).
 * 값을 돌려주기만 해야 한다: 받기 전에 양을 미리 묻는 데도 불리므로(amount), 여기서 하루 몫을 깎거나 하면 두 번 깎인다. 몫을 쓰는 일은 사건(monsterKilled 등)에서 한다
 */
export type Scale = (p: Ent, cur: Cur, n: number, why: string) => number;

/**
 * 틀의 시스템이 지갑과 가방(bag.ts)에 넘기는 원인의 이름. 장부가 명령에 붙이는 이름(cmd:명령[:하위 동작])과 같게 맞춘다:
 * 한 명령이 바꾼 골드(지갑이 알림)와 장비·재료(가방이 알림)가 같은 줄에 놓인다
 */
export const WHY = {
  buy: 'cmd:buy', craft: 'cmd:craft', sell: 'cmd:sell', enhance: 'cmd:enhance', statReset: 'cmd:statReset', skillUp: 'cmd:skillUp',
  guildCreate: 'cmd:guild:create', guildGive: 'cmd:guild:give', marketBuy: 'cmd:market:buy',
  use: 'cmd:use', marketPost: 'cmd:market:post', marketCancel: 'cmd:market:cancel',
  salvage: 'cmd:salvage', bagUp: 'cmd:bagUp', reforge: 'cmd:reforge',
  /** 주운 장비를 그 자리에서 분해한 것 (명령이 아니라 처치 사건 안에서 일어난다) */
  autoSalvage: 'autoSalvage',
  /** 관리자가 준 것과 거둔 것 (관리자 통로: systems/sanctions.ts). 장부에 따로 보여 경제 지표에서 '관리자' 몫으로 가려진다 */
  admin: 'admin',
} as const;
/** 종류 하나의 몫: [양, 사라지는 때(UTC ms, 0이면 사라지지 않는다)] 들 */
type Lots = [number, number][];
/** 한 사람의 주머니: 재화 → 종류 → 몫들 */
type Purse = Partial<Record<Cur, Partial<Record<CurKind, Lots>>>>;
const DAY_MS = 86_400_000;
/** 한 종류에 두는 몫의 수 (넘으면 사라지는 때가 가장 늦은 둘을 합친다: 이벤트 재화를 자주 받아도 저장이 끝없이 늘지 않게) */
const LOTS_MAX = 64;
/** 원인 이름에 넣어도 되는 낱말: 영문자, 숫자, 밑줄만 (장부의 줄을 가르는 글자가 섞이지 않게) */
const WORD = /^[A-Za-z0-9_]{1,24}$/;
/** 우편으로 받은 것의 원인 이름. 우편의 종류는 저장에서 읽은 값이라 걸러서 쓴다 */
export const mailWhy = (kind: string): string => `mail:${WORD.test(kind) ? kind : 'unknown'}`;
/** 종류를 세는 재화가 원인에 붙인 ':종류'를 뗀 원인 ('hunt:free' → 'hunt'). 원인으로 가르는 쪽(모드의 다른 쪽 셈 같은 것)이 쓴다 (묶음 6에서 고침) */
export const baseWhy = (why: string): string => why.replace(/:(paid|free|event|bound)$/, '');

export class Wallet {
  /** 수급 배율들. 등록한 함수들의 값을 모두 곱한다. 비어 있으면 배율 1이다 */
  readonly scale: Scale[] = [];
  /** 지갑을 지난 변화를 듣는 곳: 바뀐 양은 더했으면 +, 뺐으면 −. 장부가 등록한다 */
  readonly seen: ((p: Ent, cur: Cur, d: number, why: string) => void)[] = [];
  /** 재화별 상한 (표에 없으면 한도 없음) */
  private max: Record<Cur, number>;
  /** 종류를 세는 재화와 그 규칙 (CURRENCIES의 kinds. 경험치는 세지 않는다). 비어 있으면 주머니가 없다 */
  private readonly kinded = new Map<Cur, CurrencyKinds>();
  /** 사람(엔티티 id) → 주머니 */
  private readonly purses = new Map<number, Purse>();
  private expAcc = 0;
  /** 마지막으로 꺼낸 종류마다의 양 (종류를 세는 재화의 take 뒤. 세지 않으면 null). 뽑기의 추첨 기록이 '무엇으로 치렀나'를 적는다 */
  lastTake: Partial<Record<CurKind, number>> | null = null;

  constructor(private g: Game) {
    const defs: Readonly<Record<string, CurrencyDef>> = CURRENCIES;
    const max = (cur: Cur): number => { const m = defs[cur]?.max; return typeof m === 'number' && m > 0 ? m : Infinity; };
    this.max = { gold: max('gold'), sparks: max('sparks'), exp: max('exp') };
    for (const cur of ['gold', 'sparks'] as const) { const k = curKinds(defs[cur]); if (k) this.kinded.set(cur, k); }
    // 저장 칸은 늘 등록한다(engine/shared/modules.ts의 MODULE_SAVES): 종류를 세지 않으면 적을 것이 없어 칸이 생기지 않는다
    g.saves.push({ name: 'purse', save: (p) => this.savePurse(p), load: (p, raw) => this.loadPurse(p, raw) });
    if (this.kinded.size) {
      g.on('playerJoined', (p) => { for (const cur of this.kinded.keys()) this.expire(p, cur); });
      g.on('playerLeft', (id) => { this.purses.delete(id); });
      if ([...this.kinded.values()].some((k) => k.days && Object.values(k.days).some((d) => (d ?? 0) > 0))) g.ticks.push((dt) => this.tickExpire(dt));
    }
  }

  // ---------- 재화의 종류 ----------
  /** 그 재화가 종류를 세는가 (세면 그 규칙) */
  kindsOf(cur: Cur): CurrencyKinds | null { return this.kinded.get(cur) ?? null; }
  /** 종류마다 가진 양 (종류를 세지 않는 재화는 null). 지금 칸과 맞춘 뒤의 값 */
  balance(p: Ent, cur: Cur): Partial<Record<CurKind, number>> | null {
    const k = this.kinded.get(cur);
    if (!k) return null;
    const bag = this.sync(p, cur, k), out: Partial<Record<CurKind, number>> = {};
    for (const kind of k.spend) out[kind] = (bag[kind] ?? []).reduce((s, l) => s + l[0], 0);
    return out;
  }
  /** 종류마다의 몫 (사라지는 때와 함께: 화면·관리자). 종류를 세지 않는 재화는 null */
  lots(p: Ent, cur: Cur): Partial<Record<CurKind, Lots>> | null {
    const k = this.kinded.get(cur);
    return k ? structuredClone(this.sync(p, cur, k)) : null;
  }
  private bagOf(p: Ent, cur: Cur): Partial<Record<CurKind, Lots>> {
    let purse = this.purses.get(p.id);
    if (!purse) this.purses.set(p.id, purse = {});
    return (purse[cur] ??= {});
  }
  /** 주머니의 합을 칸에 맞춘다 (칸이 원본). 맞춘 주머니 */
  private sync(p: Ent, cur: Cur, k: CurrencyKinds): Partial<Record<CurKind, Lots>> {
    const bag = this.bagOf(p, cur);
    let sum = 0;
    for (const kind of k.spend) for (const l of bag[kind] ?? []) sum += l[0];
    const have = p[cur];
    if (sum < have) this.put(bag, earnKind(k), have - sum, this.until(k, earnKind(k)));
    else if (sum > have) this.pull(bag, k, sum - have);
    return bag;
  }
  private until(k: CurrencyKinds, kind: CurKind): number { const d = k.days?.[kind] ?? 0; return d > 0 ? this.g.now() + d * DAY_MS : 0; }
  private put(bag: Partial<Record<CurKind, Lots>>, kind: CurKind, n: number, until: number): void {
    const lots = (bag[kind] ??= []);
    const same = lots.find((l) => l[1] === until);
    if (same) same[0] += n; else { lots.push([n, until]); lots.sort((a, b) => (a[1] || Infinity) - (b[1] || Infinity)); }
    if (lots.length > LOTS_MAX) { const last = lots.pop()!, keep = lots[lots.length - 1]; keep[0] += last[0]; keep[1] = keep[1] === 0 || last[1] === 0 ? 0 : Math.max(keep[1], last[1]); }
  }
  /** 쓰는 차례로 n을 덜어 낸다. 종류마다 덜어 낸 양 */
  private pull(bag: Partial<Record<CurKind, Lots>>, k: CurrencyKinds, n: number): [CurKind, number][] {
    const out: [CurKind, number][] = [];
    for (const kind of k.spend) {
      const lots = bag[kind];
      if (!lots || n <= 0) continue;
      let took = 0;
      while (lots.length && n > 0) {
        const l = lots[0], d = Math.min(l[0], n);
        l[0] -= d; n -= d; took += d;
        if (l[0] <= 0) lots.shift();
      }
      if (took) out.push([kind, took]);
      if (!lots.length) delete bag[kind];
    }
    return out;
  }
  /** 그 종류의 몫 (종류를 세지 않거나 그 종류가 없으면 0) */
  kindHave(p: Ent, cur: Cur, kind: CurKind): number {
    const k = this.kinded.get(cur);
    if (!k || !k.spend.includes(kind)) return 0;
    return (this.sync(p, cur, k)[kind] ?? []).reduce((s, l) => s + l[0], 0);
  }
  /**
   * 그 종류의 몫에서만 뺀다 (이벤트 상점: 이벤트 재화로만 산다. 묶음 6). 모자라거나 그 종류가 없으면 false, 아무것도 바꾸지 않는다.
   * 장부에는 'why:종류'
   */
  takeKind(p: Ent, cur: Cur, kind: CurKind, n: number, why: string): boolean {
    const k = this.kinded.get(cur), cost = Wallet.cost(n);
    if (!k || !k.spend.includes(kind) || !(cost >= 0)) return false;
    if (this.kindHave(p, cur, kind) < cost) return false;
    if (cost === 0) return true;
    this.pull(this.sync(p, cur, k), { spend: [kind] }, cost);
    p[cur] -= cost; p.dirty = true; p.unsaved = true;
    for (let i = 0; i < this.seen.length; i++) this.seen[i](p, cur, -cost, why ? `${why}:${kind}` : why);
    return true;
  }
  /** 그 종류의 몫을 모두 뺀다 (이벤트가 끝나 이벤트 재화가 사라지거나 바뀔 때). 뺀 양. 장부에는 'why:종류' */
  drainKind(p: Ent, cur: Cur, kind: CurKind, why: string): number {
    const n = this.kindHave(p, cur, kind);
    return n > 0 && this.takeKind(p, cur, kind, n, why) ? n : 0;
  }
  /** 사라질 때가 된 몫을 뺀다 (장부에는 'expire:종류') */
  expire(p: Ent, cur: Cur): number {
    const k = this.kinded.get(cur);
    if (!k || p.bot) return 0;
    const bag = this.sync(p, cur, k), now = this.g.now();
    let all = 0;
    for (const kind of k.spend) {
      const lots = bag[kind];
      if (!lots) continue;
      let gone = 0;
      for (let i = lots.length - 1; i >= 0; i--) if (lots[i][1] > 0 && lots[i][1] <= now) { gone += lots[i][0]; lots.splice(i, 1); }
      if (!lots.length) delete bag[kind];
      if (gone <= 0) continue;
      all += gone;
      p[cur] -= gone; p.dirty = true; p.unsaved = true;
      for (let i = 0; i < this.seen.length; i++) this.seen[i](p, cur, -gone, `expire:${kind}`);
    }
    return all;
  }
  private tickExpire(dt: number): void {
    this.expAcc += dt;
    if (this.expAcc < 60) return;
    this.expAcc = 0;
    for (const e of this.g.ents.values()) if (e.kind === 'p' && !e.bot) for (const cur of this.kinded.keys()) this.expire(e, cur);
  }
  private savePurse(p: Ent): Purse | undefined {
    if (!this.kinded.size) return undefined;
    const out: Purse = {};
    for (const [cur, k] of this.kinded) { const bag = this.sync(p, cur, k); if (Object.keys(bag).length) out[cur] = structuredClone(bag); }
    return Object.keys(out).length ? out : undefined;
  }
  private loadPurse(p: Ent, raw: unknown): void {
    if (!this.kinded.size || typeof raw !== 'object' || raw === null) return;
    for (const [cur, k] of this.kinded) {
      const src = (raw as Record<string, unknown>)[cur];
      if (typeof src !== 'object' || src === null) continue;
      const bag = this.bagOf(p, cur);
      for (const kind of k.spend) {
        const lots = (src as Record<string, unknown>)[kind];
        if (!Array.isArray(lots)) continue;
        for (const l of lots) if (Array.isArray(l) && Number.isInteger(l[0]) && l[0] > 0 && typeof l[1] === 'number' && l[1] >= 0) this.put(bag, kind, l[0], l[1]);
      }
    }
  }

  /** 그 재화를 가질 수 있는 상한 (CURRENCIES의 max). 한도가 없으면 Number.MAX_SAFE_INTEGER: 저장을 읽을 때 범위를 잡는 데 쓴다 */
  limit(cur: Cur): number { return Math.min(this.max[cur], Number.MAX_SAFE_INTEGER); }

  /**
   * 지금 더하면 실제로 더해질 양: 배율을 곱해 내림하고, 상한까지 남은 자리로 자른다. 아무것도 바꾸지 않는다.
   * 깨진 값(NaN, 무한대, 0 이하, 수가 아닌 값)은 0이다. 소수는 내린다
   */
  amount(p: Ent, cur: Cur, n: number, why: string): number {
    if (typeof n !== 'number' || !(n > 0) || n === Infinity) return 0;
    if (cur === 'exp' && !this.g.has('growth')) return 0; // 성장 모듈이 없으면 경험치의 칸이 없다: 받지 않는다
    let k = 1;
    for (let i = 0; i < this.scale.length; i++) {
      const v = this.scale[i](p, cur, n, why);
      if (v >= 0 && v !== Infinity) k *= v; // 깨진 배율(NaN, 음수)은 없는 것으로 친다
    }
    // 1e-9: 0.29 × 100이 28.999…가 되는 것 같은 부동소수 오차로 하나 덜 주지 않게
    const got = Math.min(Math.floor(n * k + 1e-9), this.max[cur] - p[cur]);
    return got > 0 ? got : 0;
  }

  /**
   * 더한다. 실제로 더한 양을 돌려준다 (배율과 상한이 적용된 값). 경험치는 더한 뒤에 레벨 업을 확인한다.
   * kind: 종류를 세는 재화일 때 넣을 종류 (주지 않거나 그 재화에 없는 종류면 earn의 종류). 장부의 원인에 ':종류'가 붙는다
   */
  add(p: Ent, cur: Cur, n: number, why: string, kind?: CurKind): number {
    const got = this.amount(p, cur, n, why);
    if (got === 0) return 0;
    const k = this.kinded.get(cur);
    let as = why;
    if (k) {
      const bag = this.sync(p, cur, k), to = kind && k.spend.includes(kind) ? kind : earnKind(k);
      this.put(bag, to, got, this.until(k, to));
      if (why) as = `${why}:${to}`;
    }
    p[cur] += got; p.dirty = true; p.unsaved = true;
    for (let i = 0; i < this.seen.length; i++) this.seen[i](p, cur, got, as);
    if (cur === 'exp') this.g.players.levelUp(p);
    return got;
  }

  /** 치를 값으로 쓸 수 있는 수로 맞춘다: 소수는 올린다 (값이 깎이지 않게). 깨진 값(NaN, 무한대, 음수)은 NaN: 어떤 잔액으로도 치를 수 없다 */
  private static cost(n: number): number { return typeof n === 'number' && n >= 0 && n !== Infinity ? Math.ceil(n) : NaN; }

  /** 그만큼 낼 수 있는가. 배율은 걸리지 않는다 */
  can(p: Ent, cur: Cur, n: number): boolean { return this.g.field(p, cur) >= Wallet.cost(n); }

  /** 뺀다. 잔액이 모자라거나 값이 깨져 있으면 false를 돌려주고 아무것도 바꾸지 않는다. 배율은 걸리지 않는다 */
  take(p: Ent, cur: Cur, n: number, why: string): boolean {
    const cost = Wallet.cost(n);
    if (!(this.g.field(p, cur) >= cost)) return false; // 칸이 없는 재화(성장 없는 게임의 경험치)는 0으로 본다: 0이 아닌 값은 치를 수 없다
    if (cost === 0) { this.lastTake = null; return true; }
    const k = this.kinded.get(cur);
    if (k) {
      // 종류를 세는 재화: 쓰는 차례로 꺼내고, 종류마다 한 줄씩 장부에 알린다
      const parts = this.pull(this.sync(p, cur, k), k, cost);
      p[cur] -= cost; p.dirty = true; p.unsaved = true;
      this.lastTake = Object.fromEntries(parts);
      for (const [kind, d] of parts) for (let i = 0; i < this.seen.length; i++) this.seen[i](p, cur, -d, why ? `${why}:${kind}` : why);
      return true;
    }
    this.lastTake = null;
    p[cur] -= cost; p.dirty = true; p.unsaved = true;
    for (let i = 0; i < this.seen.length; i++) this.seen[i](p, cur, -cost, why);
    return true;
  }
}
