// 우편: 보상을 바로 주지 않고 우편으로 보내 두면, 플레이어가 열어서 받는다.
// 방치 보상, 출석, 일일 임무, 거래소가 이 통로를 쓴다. 새 보상도 send()만 부르면 된다.
// 우편에는 골드·경험치·불씨뿐 아니라 장비와 재료도 붙는다. 접속해 있지 않은 사람에게는 sendTo()로 보내면
// 월드와 함께 맡아 두었다가 그 사람이 접속할 때 우편함에 넣는다.
import { MAIL_MAX, MAT_MAX, POTION_MAX, isItemId, mailKept, type Gear, type ItemId, type Mail, type MailKind, type Reward, itemDef } from '../../../shared/defs';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { GearSys } from './gear';
import { mailWhy } from './wallet';

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 아직 우편함에 들어가지 않은 우편 (번호는 우편함에 들어갈 때 붙는다) */
interface Waiting { k: MailKind; a: (string | number)[]; r: Reward }

/** 그 아이템을 들 수 있는 한도. 낱개 장비로 다루는 무기와 갑옷은 0이다 */
const cap = (id: ItemId): number => (itemDef(id).kind === 'mat' ? MAT_MAX : itemDef(id).kind === 'potion' ? POTION_MAX : 0);

/** 우편 한 통에 붙을 수 있는 골드·경험치·불씨의 상한. 정상적인 보상(거래소의 가장 비싼 값 100만)보다 넉넉하고, 깨진 저장이 캐릭터를 망가뜨릴 만큼 크지는 않다 */
const REWARD_MAX = 1e7;
/** 우편 한 통에 붙을 수 있는 장비의 수 */
const MAIL_GEAR_MAX = 8;
/** 제목에 넣을 값: 글자와 수만, 짧게 */
const readArgs = (a: unknown[]): (string | number)[] => a.filter((v): v is string | number => typeof v === 'string' || num(v)).slice(0, 8).map((v) => (typeof v === 'string' ? v.slice(0, 40) : v));

/**
 * 저장된 보상을 읽는다: 숫자가 아닌 값(문자열), 음수, 모양이 깨진 장비, 없어진 아이템은 버린다.
 * 골드·경험치·불씨는 1 이상 REWARD_MAX 이하의 정수로, 아이템 수는 그 아이템을 들 수 있는 한도까지로 맞춘다.
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
        // 예전 형식(골드·경험치·불씨만 든 보상)도 그대로 읽힌다
        p.mail = (d.list as unknown[]).filter((x): x is Mail => shaped(x) && num((x as Mail).id)).map((x) => ({ id: x.id, k: x.k, a: readArgs(x.a), r: readReward(x.r) }));
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
          const list = w.list.filter(shaped).map((x): Waiting => ({ k: x.k, a: readArgs(x.a), r: readReward(x.r) }));
          if (list.length) this.waiting.set(w.pid, [...(this.waiting.get(w.pid) ?? []), ...list]);
        }
      },
    });
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

  /** 우편을 보낸다. 가득 찼으면 가장 오래된 보상 우편부터 밀려난다 */
  send(p: Ent, k: MailKind, a: (string | number)[], r: Reward): void {
    if (p.bot) return;
    p.mail.push({ id: ++p.mailSeq, k, a, r });
    MailSys.trim(p.mail);
    p.metaDirty = true; p.unsaved = true;
    this.g.notify(p, 'mailNew');
  }

  /**
   * 저장 키로 우편을 보낸다: 접속해 있지 않은 사람에게도 간다 (거래소의 판 값, 돌아오는 물건).
   * 월드에 있으면 바로 우편함에 넣고, 없으면 월드 저장에 맡아 두었다가 접속할 때 넣는다.
   */
  sendTo(pid: string, k: MailKind, a: (string | number)[], r: Reward): void {
    if (!pid) return;
    const p = this.find(pid);
    if (p) { this.send(p, k, a, r); return; }
    const list = this.waiting.get(pid);
    if (list) list.push({ k, a, r }); else this.waiting.set(pid, [{ k, a, r }]);
    this.g.saveDirty = true;
  }

  /** 접속한 사람에게 그동안 맡아 둔 우편을 넣는다 */
  private arrive(p: Ent): void {
    const list = p.pid ? this.waiting.get(p.pid) : undefined;
    if (!list) return;
    this.waiting.delete(p.pid);
    this.g.saveDirty = true;
    for (const m of list) this.send(p, m.k, m.a, m.r);
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
    /** 우편마다 붙어 있던 골드·경험치·불씨: 물건을 다 살핀 뒤에 우편의 종류를 원인으로 지갑에 넣는다 */
    const paid: { why: string; r: Reward }[] = [];
    for (const m of take) {
      paid.push({ why: mailWhy(m.k), r: m.r });
      const restGear: Gear[] = [], restItems: Record<string, number> = {};
      // 가방에는 베낀 것을 넣는다: 같은 보상 값을 여러 우편이 함께 쓰더라도 한 장비가 두 가방에 들어가지 않게
      for (const it of m.r.gear ?? []) { if (g.gear.put(p, { ...it, opts: it.opts.map(([k, v]): [typeof k, number] => [k, v]) })) gears++; else restGear.push(it); }
      for (const [item, n] of Object.entries(m.r.items ?? {})) {
        if (!isItemId(item) || !(n >= 1)) continue;
        const got = Math.max(0, Math.min(n, cap(item) - (p.items[item] ?? 0)));
        if (got > 0) { p.items[item] = (p.items[item] ?? 0) + got; items += got; }
        if (n > got) restItems[item] = n - got;
      }
      if (!restGear.length && !Object.keys(restItems).length) continue;
      // 골드·경험치·불씨는 이미 받았으므로 남은 물건만 적어 둔다. 보상 값을 여러 우편이 함께 쓸 수 있어 새로 만든다
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
