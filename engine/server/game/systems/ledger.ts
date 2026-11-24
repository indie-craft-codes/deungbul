// 재화 흐름 지표(경제 장부): 골드·불씨·경험치·장비·재료가 어디서 얼마나 생기고 어디로 얼마나 사라지는지를 날짜별·원인별로 적는다.
// 게임의 규칙은 하나도 바꾸지 않는다. 기록만 더한다.
//
// 방식은 둘이 겹쳐 있다.
//   1. 지갑이 알린다: 골드·불씨·경험치는 지갑(wallet.ts)을 지날 때 원인의 이름과 함께 바로 적힌다 (direct). 주는 쪽이 원인을 아니까 가장 정확하다.
//   2. 경계에서 차이를 잰다: 명령·처치 사건·틱의 앞뒤로 캐릭터가 가진 것의 차이를 재어 그 경계의 탓으로 적는다. 장비와 재료·물약은 이 방식으로 센다.
//      캐릭터마다 '여기까지는 적었다'는 기준값을 들고 있다가, 경계가 끝날 때 기준값과 지금 값의 차이를 적고 기준값을 옮긴다(settle).
//      안쪽 경계(명령 안에서 일어난 처치)가 먼저 적고 기준값을 옮기므로, 바깥 경계에는 나머지만 남는다: 같은 변화가 두 번 적히지 않는다.
// 지갑이 알린 만큼은 기준값도 함께 옮기므로, 골드·불씨·경험치에서 경계의 차이로 남는 것은 '지갑 밖에서 일어난 변화'뿐이다.
// 그것은 어느 경계에서 드러나든 other나 tick으로 적는다: 이 칸이 0이 아니면 지갑을 거치지 않고 재화를 고친 코드가 있거나 재화가 복사된 것이다.
//
// 원인의 이름은 게임의 낱말을 코드에 박지 않고 만들어진다:
//   cmd:명령[:하위 동작]   플레이어 명령이 바꾼 것 (하위 동작은 명령의 a 값: cmd:guild:give, cmd:market:post). 골드는 지갑이 같은 이름으로 알린다 (wallet.ts의 WHY)
//   mail:우편 종류         우편 수령. 명령 하나(mailClaim)가 여러 우편을 받으므로 우편마다 받은 것을 나눠 적는다
//   hunt, huntAway, huntDungeon   처치로 얻은 것: 접속 중, 자리 비움 사냥 중, 던전 인스턴스 안 (players.ts의 huntWhy)
//   quest, raid, tier 등   게임의 규칙이 지갑에 넘긴 이름 (이 게임: games/deungbul/shared/content/economy.ts의 ECON_WHY)
//   market:out, market:in  사람 사이를 건너가는 골드 (ECON_MOVES). 생성도 소멸도 아니다
//   lostFull               가방이 가득 차 버려진 장비
//   ev:playerJoined        접속 처리 중에 생긴, 위의 어느 것도 아닌 변화 (장비와 재료)
//   tick, other            어느 원인에도 잡히지 않은 변화: 틱 안에서 생긴 것과 그 밖. 0이어야 하고, 0이 아니면 빠뜨린 통로나 재화 복사 버그다
//
// 끼어드는 자리: 지갑의 seen에 등록하고, 생성자에서 Game의 command·fire·tick과 gear.give를 감싼다(아래 wrap).
// Game에 '끼어드는 자리'를 따로 만들지 않은 까닭: 장부가 필요한 것은 "앞뒤에서 불린다"뿐이고, 감싸면 game.ts와 다른 시스템을 한 줄도 고치지 않는다.
// 틱도 같다: g.ticks에 등록한 함수는 시스템 틱의 뒤에만 불려서 틱 전체의 앞뒤를 잴 수 없다.
// 감싸는 쪽에서 난 예외는 삼키고 적어만 둔다: 장부의 잘못으로 게임이 멈추면 안 된다.
//
// 저장: 게임 계층은 저장소를 모른다. 아직 저장하지 않은 줄을 drain()으로 내어 주고 통신 계층이 저장소에 얹는다(월드 저장과 같은 방향).
// 캐릭터별 기록(플레이 시간, 레벨 도달, 오늘 번·쓴 골드)은 g.saves로 캐릭터와 함께 저장된다(PlayerSave.ext.stats).
import { ECON_FRESH_DAYS, ECON_LEVEL_MARKS, ECON_LOST_FULL, ECON_MOVES, ECON_UNKNOWN, GEAR_SLOTS, RARITIES, isEconMove, type Gear, type Mail } from '../../../shared/defs';
import type { EconRow, PlayerSave } from '../../store';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { isField } from '../layers';
import { mailWhy, type Cur } from './wallet';

const DAY_MS = 24 * 3600000;
/** 틱의 끝에서 캐릭터 하나를 빠짐없이(장비 구성과 재료까지) 다시 세는 주기(틱). 20틱 = 1초 */
const AUDIT_TICKS = 20;
/** 원인 이름에 넣어도 되는 낱말: 영문자, 숫자, 밑줄만. 클라이언트가 보낸 값(명령의 a)이 원인 이름이 되므로 걸러서 쓴다 */
const WORD = /^[A-Za-z0-9_]{1,24}$/;
/** 지갑이 넘긴 원인 이름으로 받아들이는 모양: 낱말을 쌍점으로 이은 것. 장부의 줄을 가르는 글자(|)가 섞인 이름은 받지 않는다 */
const WHY = /^[A-Za-z0-9_:]{1,64}$/;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const gearCur = (rar: number): string => `gear:${RARITIES[rar]?.id ?? rar}`;

/** 하루의 골드: [날짜, 번 골드, 쓴 골드] */
type DayGold = [string, number, number];
/** 캐릭터별 기록 (PlayerSave.ext.stats). 덧붙는 칸이라 이 칸이 없는 옛 저장도 그대로 읽힌다 */
export interface CharStats {
  /** 만든 시각(ms). 이 기록이 생기기 전에 만든 캐릭터는 0(모름) */
  born: number;
  /** 접속해서 보낸 시간(초)과, 자리를 비운 채 서버가 대신 사냥한 시간(초) */
  play: number; away: number;
  /** 레벨(ECON_LEVEL_MARKS)에 처음 닿았을 때의 [접속 시간, 자리 비움 사냥 시간] (초). 만든 뒤로 줄곧 기록된 캐릭터만 적힌다 */
  reach: Record<string, [number, number]>;
  /** 오늘과, 그 전에 마지막으로 골드가 움직인 날의 번·쓴 골드 */
  d: DayGold; y: DayGold;
}

/** 하루 한 번의 분포 스냅샷. 개인을 가리킬 수 있는 것(이름, 저장 키)은 넣지 않는다 */
export interface EconSnapshot {
  day: string;
  /** 만든 시각(ms) */
  at: number;
  /** 분포에 넣은 캐릭터의 수와, 진행이 없어(레벨 1, 골드 0) 뺀 캐릭터의 수 */
  chars: number; blank: number;
  /** 활동 캐릭터: 1일·7일·30일 안에 접속(마지막 저장)한 수 */
  active: { d1: number; d7: number; d30: number };
  /** 레벨별 캐릭터 수 */
  levels: Record<string, number>;
  /** 골드 보유: 합계, 중간값, 상위 10%·1% 경계, 최대, 상위 10명이 가진 몫(0~1) */
  gold: { sum: number; median: number; p90: number; p99: number; max: number; top10Share: number };
  sparks: { sum: number };
  /** 어제 하루 수입(골드): 수입이 있던 캐릭터의 수와 중간값 */
  income: { day: string; n: number; median: number };
  /** 낀 장비: 수, 강화 단계별 수(+0부터), 등급별 수 */
  worn: { n: number; plus: number[]; rar: Record<string, number> };
  /** 거래소: 올라와 있는 물건의 수, 종류(장비 칸, item:재료 id)별 수와 낱개 값의 중간값 */
  market: { n: number; kinds: Record<string, { n: number; median: number }> };
  /** 최근 ECON_FRESH_DAYS일에 만든 캐릭터: 수와, 레벨에 닿은 수·접속 시간의 중간값(초)·자리 비움 사냥까지 더한 시간의 중간값(초) */
  fresh: { n: number; reach: Record<string, { n: number; play: number; total: number }> };
}

/** 장부가 지켜보는 캐릭터 하나: 기준값(여기까지는 적었다)과 캐릭터별 기록 */
interface Track {
  p: Ent; rec: CharStats;
  gold: number; sparks: number; lv: number;
  /** 등급별 장비 수와, 그 합 */
  gear: number[]; nGear: number;
  items: Record<string, number>; nItems: number;
  /** 원인의 이름 없이 받아 아직 적지 않은 경험치 (레벨이 오르며 exp가 깎이므로 차이로 재지 못하고 받은 양을 모아 둔다) */
  expIn: number;
  /** 이미 다른 원인으로 적어 둔 몫 (재화 → 양). 다음에 차이를 잴 때 그만큼 뺀다 */
  credit: Map<string, number> | null;
}

/** 가운데 값. 수가 짝수면 가운데 둘의 평균이다. 비어 있으면 0 */
export function median(list: number[]): number {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** 아래에서부터 q(0~1) 자리의 값: 정렬한 뒤 floor(q × 수)번째 (서버 지표의 95%와 같은 셈법). 비어 있으면 0 */
export function quantile(list: number[], q: number): number {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}

function readDay(raw: unknown): DayGold {
  const d = Array.isArray(raw) ? raw : [];
  return [typeof d[0] === 'string' ? d[0].slice(0, 10) : '', num(d[1]) && d[1] > 0 ? Math.floor(d[1]) : 0, num(d[2]) && d[2] > 0 ? Math.floor(d[2]) : 0];
}
/** 저장된 캐릭터별 기록을 읽는다. 깨진 값은 처음 상태로 둔다 */
export function readStats(raw: unknown): CharStats {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const sec = (v: unknown): number => (num(v) && v > 0 ? v : 0);
  const reach: CharStats['reach'] = {};
  if (typeof d.reach === 'object' && d.reach !== null) {
    for (const lv of ECON_LEVEL_MARKS) {
      const r = (d.reach as Record<string, unknown>)[lv];
      if (Array.isArray(r)) reach[lv] = [sec(r[0]), sec(r[1])];
    }
  }
  return { born: sec(d.born), play: sec(d.play), away: sec(d.away), reach, d: readDay(d.d), y: readDay(d.y) };
}

export class Ledger {
  private tracks = new Map<number, Track>();
  /** 아직 저장소에 얹지 않은 줄과, 서버가 켜진 뒤의 줄(오늘과 어제 것만 남긴다). 열쇠는 '날짜|재화|원인|방향' */
  private unsaved = new Map<string, { amount: number; n: number }>();
  private all = new Map<string, { amount: number; n: number }>();
  /** 지금 무엇의 안인가: 틱 안이면 'tick', 아니면 'other'. 어느 경계에도 들지 않은 변화가 이 이름으로 적힌다 */
  private base = ECON_UNKNOWN[0];
  /** 지금 처리 중인 명령: 낸 사람과 원인 이름 */
  private cmd: { id: number; why: string } | null = null;
  private day = ''; private dayFrom = 0; private dayTo = 0;
  /** 지표 로그 한 줄에 쓸, 마지막으로 찍은 뒤의 합계: 재화 → [생김, 사라짐] */
  private span: Record<string, [number, number]> = {};
  private cmdNames = new Map<string, string>();
  private moves = new Map<string, string>(ECON_MOVES.map((m) => [`${m.cur}|${m.why}|${m.dir}`, m.as]));
  private moveCurs = new Set(ECON_MOVES.map((m) => m.cur));
  private scratch: number[] = RARITIES.map(() => 0);
  private errors = 0;
  private tickNo = 0;

  constructor(private g: Game) {
    g.saves.push({
      name: 'stats',
      save: (p) => { const t = this.tracks.get(p.id); return t ? Ledger.pack(t.rec) : undefined; },
      // 접속 사건보다 먼저 불린다: 읽은 기록을 그 캐릭터에 붙여 둔다 (기준값은 접속 사건에서 잡는다)
      load: (p, raw) => { if (!p.bot) this.tracks.set(p.id, this.track(p, readStats(raw))); },
    });
    g.on('playerLeft', (id) => {
      const t = this.tracks.get(id);
      if (!t) return;
      this.settle(t, this.base);
      this.tracks.delete(id);
    });
    // 지갑을 지난 변화: 원인의 이름과 함께 바로 적는다
    g.wallet.seen.push((p, cur, d, why) => { try { this.direct(p, cur, d, why); } catch (err) { this.oops(err); } });
    this.wrap();
  }

  // ---------- 끼어드는 자리 ----------
  /** Game의 통로들을 감싼다. 원래 함수는 그대로 부르고, 그 앞뒤에서 재기만 한다 */
  private wrap(): void {
    const g = this.g;

    // 명령의 앞뒤: 그 명령을 낸 캐릭터의 변화는 그 명령의 탓이다
    const command = g.command.bind(g);
    g.command = (p, msg) => {
      const t = this.tracks.get(p.id), name = msg.t;
      if (!t || typeof name !== 'string' || !g.commands.has(name)) { command(p, msg); return; }
      const outer = this.cmd;
      let mails: ReturnType<Ledger['openMails']> = null;
      try {
        this.settle(t, this.base); // 명령 전에 쌓여 있던 것은 이 명령의 탓이 아니다
        let why = this.cmdNames.get(name);
        if (!why) this.cmdNames.set(name, why = `cmd:${name}`);
        if (typeof msg.a === 'string' && WORD.test(msg.a)) why += ':' + msg.a;
        this.cmd = { id: p.id, why };
        if (name === 'mailClaim') mails = this.openMails(p, msg.id);
      } catch (err) { this.oops(err); }
      try { command(p, msg); } finally {
        try {
          if (mails) this.closeMails(t, mails);
          if (this.cmd) this.settle(t, this.cmd.why);
        } catch (err) { this.oops(err); }
        this.cmd = outer;
      }
    };

    // 사건의 앞뒤: 처치 보상과 접속 처리. 처치는 보상을 받는 사람들(때린 사람과 곁의 파티원)을 재고,
    // 인스턴스 안이면 그 층에 있는 사람 모두를 잰다(던전을 함께 끝낸 사람은 때리지 않았어도 보상을 받는다)
    const fire = g.fire.bind(g) as (name: string, ...args: unknown[]) => void;
    (g as unknown as { fire: typeof fire }).fire = (name, ...args) => {
      if (name === 'monsterKilled') {
        const m = args[0] as Ent, here: Track[] = [], inst = !isField(m.layer);
        try {
          if (inst) { for (const t of this.tracks.values()) if (t.p.layer === m.layer) here.push(t); }
          else for (const p of args[1] as Ent[]) { const t = this.tracks.get(p.id); if (t) here.push(t); }
          for (const t of here) this.settle(t, this.outer(t));
        } catch (err) { this.oops(err); }
        try { fire(name, ...args); } finally {
          try {
            for (const t of here) this.settle(t, g.players.huntWhy(t.p, m));
          } catch (err) { this.oops(err); }
        }
      } else if (name === 'playerJoined') {
        const p = args[0] as Ent;
        let t: Track | undefined;
        try { t = this.join(p); } catch (err) { this.oops(err); }
        try { fire(name, ...args); } finally {
          try { if (t) this.settle(t, 'ev:playerJoined'); } catch (err) { this.oops(err); }
        }
      } else fire(name, ...args);
    };

    // 틱의 앞뒤: 틱 밖에서 쌓인 것은 other로, 틱 안에서 어느 경계에도 잡히지 않은 것은 tick으로. 플레이 시간도 여기서 센다.
    // 틱의 앞뒤에서는 모두를 가볍게만 잰다(골드·불씨·경험치·장비 수). 재화가 실제로 바뀌는 곳(명령, 처치)은 그 경계가 이미 다 세었으므로,
    // 여기서 남는 것은 '있어서는 안 되는 변화'뿐이다. 장비의 구성과 재료까지 다 세는 것은 캐릭터마다 AUDIT_TICKS틱에 한 번씩 돌아가며 한다
    // (모두를 틱마다 다 세면 300명일 때 틱마다 0.4ms쯤 든다). 그래서 명령 밖에서 재료만 바뀐 경우는 길어야 1초 뒤에 tick으로 드러난다
    const tick = g.tick.bind(g);
    g.tick = (dt) => {
      try { for (const t of this.tracks.values()) this.settle(t, ECON_UNKNOWN[0], false); } catch (err) { this.oops(err); }
      this.base = ECON_UNKNOWN[1];
      try { tick(dt); } finally {
        try {
          const slot = this.tickNo++ % AUDIT_TICKS;
          for (const t of this.tracks.values()) {
            this.settle(t, ECON_UNKNOWN[1], t.p.id % AUDIT_TICKS === slot);
            if (g.away.active(t.p)) t.rec.away += dt; else t.rec.play += dt;
          }
        } catch (err) { this.oops(err); }
        this.base = ECON_UNKNOWN[0];
      }
    };

    // 가방이 가득 차 버려진 장비: 생겼다가 사라진 것으로 적는다 (생긴 쪽은 그 경계의 원인으로, 사라진 쪽은 lostFull로)
    const give = g.gear.give.bind(g.gear);
    g.gear.give = (p, it) => {
      const ok = give(p, it);
      if (!ok) {
        const t = this.tracks.get(p.id);
        try { if (t) this.pre(t, gearCur(it.rar), ECON_LOST_FULL, -1); } catch (err) { this.oops(err); }
      }
      return ok;
    };
  }

  private oops(err: unknown): void {
    if (this.errors++ < 5) console.error('[ledger] 장부를 적다가 난 예외 (게임은 계속 돈다):', err);
  }

  // ---------- 재기 ----------
  private track(p: Ent, rec: CharStats): Track {
    return { p, rec, gold: p.gold, sparks: p.sparks, lv: p.lv, gear: RARITIES.map(() => 0), nGear: 0, items: {}, nItems: 0, expIn: 0, credit: null };
  }

  /** 접속: 기준값을 지금 가진 것으로 잡는다 (저장에서 읽어 온 것은 새로 생긴 것이 아니다) */
  private join(p: Ent): Track | undefined {
    if (p.bot) return undefined;
    let t = this.tracks.get(p.id);
    if (!t) {
      // 기록이 없는 캐릭터: 아직 아무것도 하지 않았으면 지금 만든 것이고, 진행이 있으면 이 기록이 생기기 전의 캐릭터다
      const fresh = p.lv === 1 && p.exp === 0 && p.gold === 0 && p.cls === '';
      this.tracks.set(p.id, t = this.track(p, { born: fresh ? this.g.now() : 0, play: 0, away: 0, reach: {}, d: ['', 0, 0], y: ['', 0, 0] }));
    }
    t.gold = p.gold; t.sparks = p.sparks; t.lv = p.lv; t.expIn = 0; t.credit = null;
    t.gear.fill(0); t.nGear = p.gear.length;
    for (const it of p.gear) t.gear[it.rar]++;
    t.items = { ...p.items }; t.nItems = Object.keys(t.items).length;
    return t;
  }

  /** 지금 이 캐릭터에게 쌓여 있는 변화가 누구의 탓인가: 명령을 낸 사람이면 그 명령, 아니면 틱 또는 그 밖 */
  private outer(t: Track): string { return this.cmd && this.cmd.id === t.p.id ? this.cmd.why : this.base; }

  /**
   * 지갑을 지난 변화를 그 원인으로 바로 적고, 기준값도 그만큼 옮긴다 (경계의 차이에 다시 잡히지 않게).
   * 원인의 이름이 없으면('') 적지 않고 둔다: 다음 경계에서 차이로 드러나 other·tick이나 note가 붙인 이름으로 적힌다.
   */
  private direct(p: Ent, cur: Cur, d: number, why: string): void {
    const t = this.tracks.get(p.id);
    if (!t) return;
    if (!why) { if (cur === 'exp') t.expIn += d; return; }
    this.add(cur, WHY.test(why) ? why : this.base, d, t);
    if (cur === 'gold') t.gold += d; else if (cur === 'sparks') t.sparks += d;
  }

  /**
   * 기준값과 지금 값의 차이를 그 원인으로 적고, 기준값을 지금으로 옮긴다.
   * full이 아니면 가볍게만 잰다: 골드·불씨·경험치는 언제나 재고, 장비와 재료는 장비 수가 달라졌을 때만 센다
   * (틱의 앞뒤에서 모두를 훑을 때 쓴다. 그때 놓친 것은 다음에 다 셀 때 드러나므로 사라지지 않는다).
   * 골드·불씨·경험치의 차이는 지갑 밖에서 일어난 변화다 (지갑을 지난 것은 direct가 이미 적었다): 명령이나 처치의 경계에서 드러났더라도
   * 그 이름이 아니라 other·tick으로 적어 경보가 되게 한다. named(g.ledger.note가 붙인 이름)일 때만 그 이름으로 적는다.
   */
  private settle(t: Track, why: string, full = true, named = false): void {
    const p = t.p, c = t.credit;
    if (c) t.credit = null;
    if (p.gold !== t.gold || p.sparks !== t.sparks || t.expIn !== 0) {
      const stray = named || ECON_UNKNOWN.includes(why) ? why : this.base;
      this.add('gold', stray, p.gold - t.gold, t);
      this.add('sparks', stray, p.sparks - t.sparks, t);
      this.add('exp', stray, t.expIn, t);
      t.gold = p.gold; t.sparks = p.sparks; t.expIn = 0;
    }
    if (p.lv !== t.lv) {
      t.lv = p.lv;
      // 레벨에 처음 닿은 플레이 시간: 만든 뒤로 줄곧 기록된 캐릭터만 (중간부터 기록된 캐릭터의 시간은 뜻이 없다)
      if (t.rec.born > 0) for (const lv of ECON_LEVEL_MARKS) if (p.lv >= lv && !t.rec.reach[lv]) t.rec.reach[lv] = [Math.round(t.rec.play), Math.round(t.rec.away)];
    }
    const list = p.gear;
    if (!full && !c && list.length === t.nGear) return;
    // 장비: 등급별 수
    const n = this.scratch;
    for (let i = 0; i < n.length; i++) n[i] = 0;
    for (let i = 0; i < list.length; i++) n[list[i].rar]++;
    t.nGear = list.length;
    for (let i = 0; i < n.length; i++) {
      const owed = c ? c.get(gearCur(i)) ?? 0 : 0;
      if (n[i] !== t.gear[i] || owed) { this.add(gearCur(i), why, n[i] - t.gear[i] - owed, t); t.gear[i] = n[i]; }
    }
    // 재료와 물약: 아이템별 수
    let keys = 0;
    for (const id in p.items) {
      keys++;
      const v = p.items[id], was = t.items[id], owed = c ? c.get(`item:${id}`) ?? 0 : 0;
      if (v === was && !owed) continue;
      if (was === undefined) t.nItems++;
      this.add(`item:${id}`, why, v - (was ?? 0) - owed, t);
      t.items[id] = v;
    }
    if (keys !== t.nItems) { // 칸째로 없어진 아이템
      for (const id in t.items) if (!(id in p.items)) { this.add(`item:${id}`, why, -t.items[id], t); delete t.items[id]; }
      t.nItems = keys;
    }
  }

  /** 지금 바로 그 원인으로 적고, 다음에 차이를 잴 때 그만큼 빼게 해 둔다 (값을 아는 보상을 먼저 가려 적을 때) */
  private pre(t: Track, cur: string, why: string, d: number): void {
    this.add(cur, why, d, t);
    (t.credit ??= new Map()).set(cur, (t.credit.get(cur) ?? 0) + d);
  }

  private add(cur: string, why: string, d: number, t?: Track): void {
    if (!d) return;
    const plus = d > 0, dir = plus ? '+' : '-', amount = plus ? d : -d, day = this.today();
    if (this.moveCurs.has(cur)) why = this.moves.get(`${cur}|${why}|${dir}`) ?? why;
    const key = `${day}|${cur}|${why}|${dir}`;
    const a = this.unsaved.get(key), b = this.all.get(key);
    if (a) { a.amount += amount; a.n++; } else this.unsaved.set(key, { amount, n: 1 });
    if (b) { b.amount += amount; b.n++; } else this.all.set(key, { amount, n: 1 });
    if (!isEconMove(why)) (this.span[cur] ??= [0, 0])[plus ? 0 : 1] += amount;
    if (t && cur === 'gold') {
      const rec = t.rec;
      if (rec.d[0] !== day) { if (rec.d[0]) rec.y = rec.d; rec.d = [day, 0, 0]; }
      rec.d[plus ? 1 : 2] += amount;
    }
  }

  // ---------- 우편 ----------
  /** 받으려는 우편들에 지금 무엇이 붙어 있는지 적어 둔다. 받은 뒤에 남은 것과 견주면 우편마다 받은 것이 나온다 */
  private openMails(p: Ent, id: unknown): { m: Mail; why: string; gear: Gear[]; items: Record<string, number> }[] | null {
    if (!num(id)) return null;
    return p.mail.filter((m) => id === 0 || m.id === id).map((m) => ({ m, why: mailWhy(m.k), gear: [...(m.r.gear ?? [])], items: { ...m.r.items } }));
  }
  private closeMails(t: Track, mails: NonNullable<ReturnType<Ledger['openMails']>>): void {
    for (const b of mails) {
      // 우편함에 그대로 남아 있으면 남은 물건을 뺀 만큼만 받은 것이다 (가방이 차서 못 받은 물건, 받지 않은 우편).
      // 우편에 붙은 골드·경험치·불씨는 우편 시스템이 같은 이름(mail:종류)으로 지갑에 넣으므로 여기서는 물건만 가린다
      const left = t.p.mail.includes(b.m) ? b.m.r : {};
      const rest = new Set(left.gear ?? []);
      for (const it of b.gear) if (!rest.has(it)) this.pre(t, gearCur(it.rar), b.why, 1);
      for (const [id, n] of Object.entries(b.items)) { const got = n - (left.items?.[id] ?? 0); if (got) this.pre(t, `item:${id}`, b.why, got); }
    }
  }

  // ---------- 밖에서 쓰는 것 ----------
  /** 오늘 날짜 (일일 임무와 같은 셈법: 서버 현지 시간, 자정에 바뀐다) */
  today(): string {
    const now = this.g.now();
    if (now < this.dayFrom || now >= this.dayTo) {
      const d = new Date(now);
      this.dayFrom = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      this.dayTo = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      const before = this.day, keep = this.g.daily.dayOf(now - DAY_MS);
      this.day = this.g.daily.dayOf(now);
      // 켜진 뒤의 합계는 오늘과 어제 것만 남긴다 (오래 켜 둔 서버에서 끝없이 늘지 않게)
      if (before) for (const k of this.all.keys()) { const day = k.slice(0, k.indexOf('|')); if (day !== this.day && day !== keep) this.all.delete(k); }
    }
    return this.day;
  }

  /**
   * 그 캐릭터에게 지금까지 쌓인 변화를 이 원인으로 적는다. 명령과 사건 밖에서 가진 것을 바꾸는 코드(운영 도구, 시험의 준비)가
   * 바꾼 직후에 부르면 other가 아니라 제 이름으로 적힌다. 재화는 되도록 지갑에 이름을 넘겨 준다: 이것은 이름 없이 준 것과 장비·재료를 위한 길이다
   */
  note(p: Ent, why: string): void {
    const t = this.tracks.get(p.id);
    if (t) this.settle(t, WORD.test(why) ? why : ECON_UNKNOWN[0], true, true);
  }

  /** 아직 저장소에 얹지 않은 줄을 내어 주고 비운다. 통신 계층이 저장 주기에 맞춰 가져간다 */
  drain(): EconRow[] {
    const out = Ledger.rowsOf(this.unsaved);
    this.unsaved.clear();
    return out;
  }
  /** 저장하지 못한 줄을 되돌려 받는다 (다음 저장 때 다시 나간다) */
  giveBack(rows: EconRow[]): void {
    for (const r of rows) {
      const key = `${r.day}|${r.cur}|${r.why}|${r.dir}`, old = this.unsaved.get(key);
      if (old) { old.amount += r.amount; old.n += r.n; } else this.unsaved.set(key, { amount: r.amount, n: r.n });
    }
  }
  /** 서버가 켜진 뒤에 적힌 줄 (오늘과 어제. 날짜를 주면 그날 것만). 시험과 지표 로그용 */
  rows(day?: string): EconRow[] { return Ledger.rowsOf(this.all).filter((r) => !day || r.day === day); }

  private static rowsOf(map: Map<string, { amount: number; n: number }>): EconRow[] {
    return [...map].map(([k, v]) => { const [day, cur, why, dir] = k.split('|'); return { day, cur, why, dir: dir as EconRow['dir'], amount: v.amount, n: v.n }; });
  }

  /** 지표 로그 한 줄: 마지막으로 찍은 뒤에 생기고 사라진 양 (이동은 빼고) */
  line(): string {
    const s = this.span, f = (cur: string) => `+${Math.round(s[cur]?.[0] ?? 0)} -${Math.round(s[cur]?.[1] ?? 0)}`;
    let gear = 0, lost = 0, unknown = 0;
    for (const cur in s) if (cur.startsWith('gear:')) gear += s[cur][0];
    const today = this.today();
    for (const [k, v] of this.all) {
      const [day, , why] = k.split('|');
      if (day !== today) continue;
      if (why === ECON_LOST_FULL) lost += v.amount;
      if (ECON_UNKNOWN.includes(why)) unknown += v.n;
    }
    this.span = {};
    return `[econ] 골드 ${f('gold')} | 불씨 ${f('sparks')} | 경험치 ${f('exp')} | 장비 +${gear} | 오늘 버려진 장비 ${lost}, 원인 모름 ${unknown}건`;
  }

  private static pack(r: CharStats): CharStats {
    const reach: CharStats['reach'] = {};
    for (const [lv, v] of Object.entries(r.reach)) reach[lv] = [Math.round(v[0]), Math.round(v[1])];
    return { born: r.born, play: Math.round(r.play), away: Math.round(r.away), reach, d: [...r.d], y: [...r.y] };
  }
  /** 그 캐릭터의 기록 (시험용) */
  statsOf(p: Ent): CharStats | undefined { const t = this.tracks.get(p.id); return t && Ledger.pack(t.rec); }

  /**
   * 분포 스냅샷을 만든다: 저장된 모든 캐릭터를 훑는다(each는 저장소의 eachPlayer). 하루 한 번, 통신 계층이 부른다.
   * 접속 중인 사람은 마지막으로 저장된 값으로 들어간다. 진행이 없는 캐릭터(레벨 1, 골드 0)는 분포에서 빼고 수만 센다.
   */
  snapshot(each: (fn: (s: PlayerSave) => void) => void): EconSnapshot {
    const now = this.g.now(), day = this.today(), yesterday = this.g.daily.dayOf(now - DAY_MS);
    const golds: number[] = [], incomes: number[] = [], levels: Record<string, number> = {}, rar: Record<string, number> = {};
    const plus: number[] = [], active = { d1: 0, d7: 0, d30: 0 };
    const reach: Record<string, { play: number[]; total: number[] }> = {};
    let blank = 0, sparks = 0, worn = 0, fresh = 0;
    each((s) => {
      const lv = num(s.lv) ? Math.max(1, Math.floor(s.lv)) : 1, gold = num(s.gold) && s.gold > 0 ? Math.floor(s.gold) : 0;
      if (lv <= 1 && gold === 0) { blank++; return; }
      golds.push(gold);
      levels[lv] = (levels[lv] ?? 0) + 1;
      sparks += num(s.sparks) && s.sparks > 0 ? Math.floor(s.sparks) : 0;
      const ago = num(s.seen) ? now - s.seen : Infinity;
      if (ago <= DAY_MS) active.d1++;
      if (ago <= 7 * DAY_MS) active.d7++;
      if (ago <= 30 * DAY_MS) active.d30++;
      const ext = (typeof s.ext === 'object' && s.ext !== null ? s.ext : {}) as Record<string, unknown>;
      // 낀 장비 (systems/gear.ts가 저장한 모양: { list, worn })
      const gear = ext.gear as { list?: unknown; worn?: unknown } | undefined;
      if (gear && Array.isArray(gear.list) && typeof gear.worn === 'object' && gear.worn !== null) {
        for (const slot of GEAR_SLOTS) {
          const uid = (gear.worn as Record<string, unknown>)[slot];
          const it = uid === undefined ? undefined : (gear.list as Partial<Gear>[]).find((x) => typeof x === 'object' && x !== null && x.uid === uid);
          if (!it || !num(it.plus) || !num(it.rar) || !RARITIES[it.rar]) continue;
          const at = Math.max(0, Math.floor(it.plus));
          worn++;
          while (plus.length <= at) plus.push(0);
          plus[at]++;
          rar[RARITIES[it.rar].id] = (rar[RARITIES[it.rar].id] ?? 0) + 1;
        }
      }
      if (ext.stats === undefined) return;
      const rec = readStats(ext.stats);
      const earned = rec.d[0] === yesterday ? rec.d[1] : rec.y[0] === yesterday ? rec.y[1] : 0;
      if (earned > 0) incomes.push(earned);
      if (rec.born > 0 && now - rec.born <= ECON_FRESH_DAYS * DAY_MS) {
        fresh++;
        for (const [mark, v] of Object.entries(rec.reach)) { const r = (reach[mark] ??= { play: [], total: [] }); r.play.push(v[0]); r.total.push(v[0] + v[1]); }
      }
    });
    const sum = golds.reduce((a, b) => a + b, 0), top = [...golds].sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
    const kinds: Record<string, number[]> = {};
    const listed = this.g.market.listed();
    for (const l of listed) (kinds[l.kind] ??= []).push(l.price);
    return {
      day, at: now, chars: golds.length, blank, active, levels,
      gold: { sum, median: median(golds), p90: quantile(golds, 0.9), p99: quantile(golds, 0.99), max: golds.length ? Math.max(...golds) : 0, top10Share: sum > 0 ? Math.round((top / sum) * 10000) / 10000 : 0 },
      sparks: { sum: sparks },
      income: { day: yesterday, n: incomes.length, median: median(incomes) },
      worn: { n: worn, plus, rar },
      market: { n: listed.length, kinds: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { n: v.length, median: Math.round(median(v) * 100) / 100 }])) },
      fresh: { n: fresh, reach: Object.fromEntries(Object.entries(reach).map(([k, v]) => [k, { n: v.play.length, play: median(v.play), total: median(v.total) }])) },
    };
  }
}
