// 우편: 보상을 바로 주지 않고 우편으로 보내 두면, 플레이어가 열어서 받는다.
// 방치 보상, 출석, 일일 임무, 거래소가 이 통로를 쓴다. 새 보상도 send()만 부르면 된다.
// 우편에는 골드·경험치·두 번째 재화뿐 아니라 장비와 재료도 붙는다. 접속해 있지 않은 사람에게는 sendTo()로 보내면
// 월드와 함께 맡아 두었다가 그 사람이 접속할 때 우편함에 넣는다.
// 만료 (묶음 6): 내용의 MAIL_RULES.days(우편 종류 → 일 수, '*'는 나머지 모두)를 적으면 보낼 때 사라지는 때(Mail.x)가 붙는다 (거래·물건 우편은 붙이지 않는다).
// 관리자의 일괄 발송은 --expire로 직접 준다. 1분마다(와 접속할 때) 지난 것을 지우고, 사라지기 MAIL_RULES.warnH시간(기본 24) 전에 한 번 알린다.
// 적지 않으면 아무 우편에도 x가 없다: 저장과 줄 위가 예전 그대로다.
import { MAIL_MAX, MAIL_RULES, isItemId, itemCap, mailKept, type Gear, type ItemId, type Mail, type MailKind, type Reward } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { personalData } from '../personal';
import { GearSys } from './gear';
import { mailWhy } from './wallet';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 아직 우편함에 들어가지 않은 우편 (번호는 우편함에 들어갈 때 붙는다) */
interface Waiting { k: MailKind; a: (string | number)[]; r: Reward; x?: number }
const HOUR = 3_600_000, DAY = 86_400_000;
/** 그 종류의 우편이 보낼 때부터 사라지기까지의 일 수 (MAIL_RULES.days. 없으면 0: 사라지지 않는다) */
export function mailDays(k: string): number { const d = MAIL_RULES.days; if (!d) return 0; const v = Object.hasOwn(d, k) ? d[k] : d['*']; return typeof v === 'number' && v > 0 ? v : 0; }

/** 그 아이템을 들 수 있는 한도. 낱개 장비로 다루는 무기와 갑옷은 0이다 */
const cap = (id: ItemId): number => itemCap(id);

/** 우편 한 통에 붙을 수 있는 골드·경험치·두 번째 재화의 상한. 정상적인 보상(거래소의 가장 비싼 값 100만)보다 넉넉하고, 깨진 저장이 캐릭터를 망가뜨릴 만큼 크지는 않다 */
const REWARD_MAX = 1e7;
/** 우편 한 통에 붙을 수 있는 장비의 수 */
const MAIL_GEAR_MAX = 8;
/** 제목에 넣을 값: 글자와 수만, 짧게 */
const readArgs = (a: unknown[]): (string | number)[] => a.filter((v): v is string | number => typeof v === 'string' || num(v)).slice(0, 8).map((v) => (typeof v === 'string' ? v.slice(0, 40) : v));

/**
 * 저장된 보상을 읽는다: 숫자가 아닌 값(문자열), 음수, 모양이 깨진 장비, 없어진 아이템은 버린다.
 * 골드·경험치·두 번째 재화는 1 이상 REWARD_MAX 이하의 정수로, 아이템 수는 그 아이템을 들 수 있는 한도까지로 맞춘다.
 */
function readReward(raw: unknown): Reward {
  const d = raw as Record<string, unknown>, r: Reward = {};
  for (const k of ['gold', 'exp', 'sparks'] as const) if (num(d[k]) && d[k] >= 1) r[k] = Math.min(REWARD_MAX, Math.floor(d[k]));
  if (Array.isArray(d.gear)) {
    const gear = d.gear.filter(GearSys.valid).slice(0, MAIL_GEAR_MAX);
    if (gear.length) r.gear = gear;
  }
  if (typeof d.items === 'object' && d.items !== null) {
    const items: Record<string, number> = {};
    for (const [id, n] of Object.entries(d.items as Record<string, unknown>)) if (isItemId(id) && cap(id) > 0 && num(n) && n >= 1) items[id] = Math.min(cap(id), Math.floor(n));
    if (Object.keys(items).length) r.items = items;
  }
  return r;
}
const shaped = (x: unknown): x is { k: MailKind; a: (string | number)[]; r: object } => {
  const m = x as Mail;
  return typeof x === 'object' && x !== null && typeof m.k === 'string' && Array.isArray(m.a) && typeof m.r === 'object' && m.r !== null;
};

export class MailSys {
  /** 접속해 있지 않은 사람에게 온 우편: 저장 키 → 우편들. 그 사람이 접속하면 우편함으로 옮긴다 */
  private waiting = new Map<string, Waiting[]>();

  constructor(private g: Game) {
    // id가 0이면 모두 받는다
    g.commands.set('mailClaim', (p, m) => { if (num(m.id)) this.claim(p, m.id); });
    g.on('playerJoined', (p) => this.arrive(p));
    g.saves.push({
      name: 'mail',
      save: (p) => ({ list: p.mail, seq: p.mailSeq }),
      load: (p, raw) => {
        const d = raw as { list?: unknown; seq?: unknown };
        if (!Array.isArray(d.list)) return;
        // 예전 형식(골드·경험치·두 번째 재화만 든 보상)도 그대로 읽힌다
        p.mail = (d.list as unknown[]).filter((x): x is Mail => shaped(x) && num((x as Mail).id)).map((x) => ({ id: x.id, k: x.k, a: readArgs(x.a), r: readReward(x.r), ...(num(x.x) && x.x > 0 ? { x: x.x } : {}), ...(x.w === 1 ? { w: 1 as const } : {}) }));
        MailSys.trim(p.mail);
        p.mailSeq = Math.max(num(d.seq) ? d.seq : 0, ...p.mail.map((x) => x.id));
      },
    });
    g.worldSaves.push({
      name: 'mailbox',
      save: () => ({ waiting: [...this.waiting].map(([pid, list]) => ({ pid, list })) }),
      load: (raw) => {
        if (typeof raw !== 'object' || raw === null) return;
        const d = raw as { waiting?: unknown };
        if (!Array.isArray(d.waiting)) return;
        for (const w of d.waiting as { pid?: unknown; list?: unknown }[]) {
          if (typeof w !== 'object' || w === null || typeof w.pid !== 'string' || !w.pid || !Array.isArray(w.list)) continue;
          const list = w.list.filter(shaped).map((x): Waiting => { const ex = (x as { x?: unknown }).x; return { k: x.k, a: readArgs(x.a), r: readReward(x.r), ...(num(ex) && ex > 0 ? { x: ex } : {}) }; });
          if (list.length) this.waiting.set(w.pid, [...(this.waiting.get(w.pid) ?? []), ...list]);
        }
      },
    });
    // 내 데이터 (engine/server/game/personal.ts): 접속하지 않은 동안 맡아 둔 우편. 삭제하면 버린다 (내가 남에게 보낸 것은 받은 사람의 것)
    personalData(g).push({
      name: 'mailbox',
      get: (pid) => this.waiting.get(pid),
      erase: (pid) => { if (this.waiting.delete(pid)) g.saveDirty = true; },
    });
    // 만료: 1분마다 접속한 사람의 우편을 본다 (사라지는 때가 붙은 우편이 없으면 아무것도 바꾸지 않는다)
    g.ticks.push((dt) => { this.expAcc += dt; if (this.expAcc < 60) return; this.expAcc = 0; for (const e of g.ents.values()) if (e.kind === 'p' && !e.bot) this.expire(e); });
  }
  private expAcc = 0;

  /** 사라질 때가 지난 우편을 지우고, 곧 사라질 우편을 한 번 알린다. 지운 수 */
  expire(p: Ent): number {
    if (!p.mail.length) return 0;
    const now = this.g.now(), warn = Math.max(0, MAIL_RULES.warnH ?? 24) * HOUR;
    const gone = p.mail.filter((m) => m.x !== undefined && m.x <= now);
    if (gone.length) { p.mail = p.mail.filter((m) => !gone.includes(m)); p.metaDirty = true; p.unsaved = true; this.g.notify(p, 'mailExpired', gone.length); }
    const soon = p.mail.filter((m) => m.x !== undefined && !m.w && m.x - now <= warn);
    if (soon.length) { for (const m of soon) m.w = 1; p.metaDirty = true; p.unsaved = true; this.g.notify(p, 'mailExpSoon', soon.length, Math.max(1, Math.ceil((Math.min(...soon.map((m) => m.x!)) - now) / HOUR))); }
    return gone.length;
  }

  /**
   * 우편함이 한도를 넘으면 오래된 것부터 밀어낸다. 거래로 생긴 우편(물건이 붙었거나 판 값이 든 것)은 밀어내지 않는다:
   * 다른 사람과 주고받은 것이 사라지면 안 되므로, 그런 우편만 남았으면 한도를 넘겨서라도 둔다.
   */
  private static trim(list: Mail[]): void {
    // 가장 나중에 온 것은 밀어내지 않는다: 거래 우편이 한도를 채우고 있을 때 새 보상 우편이 오자마자 사라지지 않게
    while (list.length > MAIL_MAX) {
      const i = list.findIndex((m, k) => k < list.length - 1 && !mailKept(m));
      if (i < 0) break;
      list.splice(i, 1);
    }
  }

  /** 그 저장 키로 지금 월드에 있는 사람 (자리 비움 사냥 중인 캐릭터도 포함). 없으면 undefined */
  find(pid: string): Ent | undefined {
    if (!pid) return undefined;
    for (const e of this.g.ents.values()) if (e.kind === 'p' && !e.bot && e.pid === pid) return e;
    return undefined;
  }

  /**
   * 우편을 보낸다. 가득 찼으면 가장 오래된 보상 우편부터 밀려난다.
   * x: 사라지는 때(UTC ms)를 직접 준다 (관리자의 일괄 발송). 주지 않으면 MAIL_RULES.days의 그 종류 (거래·물건 우편은 사라지지 않는다)
   */
  send(p: Ent, k: MailKind, a: (string | number)[], r: Reward, x?: number): void {
    if (p.bot) return;
    const days = x === undefined && !mailKept({ k, r }) ? mailDays(k) : 0;
    const until = x ?? (days ? this.g.now() + days * DAY : 0);
    p.mail.push({ id: ++p.mailSeq, k, a, r, ...(until > 0 ? { x: until } : {}) });
    MailSys.trim(p.mail);
    p.metaDirty = true; p.unsaved = true;
    this.g.notify(p, 'mailNew');
  }

  /**
   * 저장 키로 우편을 보낸다: 접속해 있지 않은 사람에게도 간다 (거래소의 판 값, 돌아오는 물건).
   * 월드에 있으면 바로 우편함에 넣고, 없으면 월드 저장에 맡아 두었다가 접속할 때 넣는다.
   */
  sendTo(pid: string, k: MailKind, a: (string | number)[], r: Reward, x?: number): void {
    if (!pid) return;
    const p = this.find(pid);
    if (p) { this.send(p, k, a, r, x); return; }
    // 맡아 둘 때 사라지는 때를 정한다 (접속하지 않은 동안에도 시계가 간다)
    const days = x === undefined && !mailKept({ k, r }) ? mailDays(k) : 0;
    const until = x ?? (days ? this.g.now() + days * DAY : 0);
    const w: Waiting = { k, a, r, ...(until > 0 ? { x: until } : {}) };
    const list = this.waiting.get(pid);
    if (list) list.push(w); else this.waiting.set(pid, [w]);
    this.g.saveDirty = true;
  }

  /** 접속한 사람에게 그동안 맡아 둔 우편을 넣는다 */
  private arrive(p: Ent): void {
    const list = p.pid ? this.waiting.get(p.pid) : undefined;
    if (!list) return;
    this.waiting.delete(p.pid);
    this.g.saveDirty = true;
    // 맡아 둔 동안 정한 사라지는 때를 그대로 (없던 우편은 0: 사라지지 않는다)
    for (const m of list) this.send(p, m.k, m.a, m.r, m.x ?? 0);
    this.expire(p);
  }

  /** 그 사람에게 맡아 둔 우편 (시험과 지표용) */
  waitingFor(pid: string): readonly Readonly<Waiting>[] { return this.waiting.get(pid) ?? []; }

  /**
   * 우편의 보상을 받는다. 장비는 가방에 자리가 있는 만큼, 아이템은 한도까지만 받고,
   * 받지 못한 물건은 그 우편에 그대로 남긴다 (물건이 사라지지 않게).
   */
  claim(p: Ent, id: number): void {
    const g = this.g, take = p.mail.filter((x) => id === 0 || x.id === id);
    if (!take.length) return;
    let gold = 0, exp = 0, sparks = 0, gears = 0, items = 0;
    const left = new Set<Mail>();
    /** 우편마다 붙어 있던 골드·경험치·두 번째 재화: 물건을 다 살핀 뒤에 우편의 종류를 원인으로 지갑에 넣는다 */
    const paid: { why: string; r: Reward }[] = [];
    for (const m of take) {
      const why = mailWhy(m.k);
      paid.push({ why, r: m.r });
      const restGear: Gear[] = [], restItems: Record<string, number> = {};
      // 가방에는 베낀 것을 넣는다: 같은 보상 값을 여러 우편이 함께 쓰더라도 한 장비가 두 가방에 들어가지 않게
      for (const it of m.r.gear ?? []) { if (g.has('gear') && g.gear.put(p, { ...it, opts: it.opts.map(([k, v]): [typeof k, number] => [k, v]) }, why)) gears++; else restGear.push(it); }
      for (const [item, n] of Object.entries(m.r.items ?? {})) {
        if (!isItemId(item) || !(n >= 1)) continue;
        const got = g.bag.putItem(p, item, Math.floor(n), why);
        items += got;
        if (n > got) restItems[item] = n - got;
      }
      if (!restGear.length && !Object.keys(restItems).length) continue;
      // 골드·경험치·두 번째 재화는 이미 받았으므로 남은 물건만 적어 둔다. 보상 값을 여러 우편이 함께 쓸 수 있어 새로 만든다
      m.r = {};
      if (restGear.length) m.r.gear = restGear;
      if (Object.keys(restItems).length) m.r.items = restItems;
      left.add(m);
    }
    p.mail = p.mail.filter((x) => !take.includes(x) || left.has(x));
    // 안내문에는 실제로 받은 양을 넣는다 (배율이나 상한이 걸렸으면 그만큼)
    for (const { why, r } of paid) {
      gold += g.wallet.add(p, 'gold', r.gold ?? 0, why);
      sparks += g.wallet.add(p, 'sparks', r.sparks ?? 0, why);
      exp += g.wallet.add(p, 'exp', r.exp ?? 0, why);
    }
    // 받은 재화가 없어도 전처럼 저장할 것으로 표시하고 레벨을 확인한다
    p.dirty = true; p.unsaved = true; g.players.levelUp(p);
    p.metaDirty = true;
    if (gold || exp || sparks || gears || items) g.notify(p, 'mailGot', gold, exp, sparks, gears, items);
    if (left.size) g.notify(p, 'mailLeft');
  }
}
