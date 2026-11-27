// [coupon] 쿠폰 코드와 복귀 보상 (묶음 6).
//   쿠폰    관리자가 만든다 (관리자 명령 coupon add: net/livecmds.ts). 코드는 영문 대문자·숫자 COUPON.min~max자, 금칙어가 든 코드는 만들 수 없다.
//           사람(저장 키)마다 한 번, 전체 쓰임 수(uses, 0이면 한도 없음), 기간(from·to). 보상은 우편으로 (종류 coupon)
//           남용 막기: 틀린 코드를 COUPON.lockMin분 안에 tries번 넣으면 lockMin분 동안 막는다 (저장 키마다), 손님(저장 키 없음)은 쓸 수 없다
//           저장: DB의 coupons(정의)·coupon_uses(누가 언제, 코드와 사람이 짝으로 한 번) 표 (CouponStore). 저장소가 없으면(시험) 메모리에
//   복귀    COMEBACK { days, r }: days일 넘게 쉬었다 들어오면 우편 (종류 comeback, [쉰 날 수]). 쉰 시간은 저장의 seen에서 (p.offMs)
// 명령: { t: 'coupon', code }. 개인 상태는 없다 (결과는 안내문 couponOk·couponNo).
import { COMEBACK, COUPON, couponNorm, couponShape, type Reward } from '../../../shared/defs';
import { isClean } from '../../../shared/textfilter';
import type { CouponRow, CouponStore } from '../../store/types';
import type { Ent } from '../entity';
import type { Game } from '../game';
import { personalData } from '../personal';

const MIN = 60_000, DAY = 86_400_000;

export class CouponSys {
  private store: CouponStore | null = null;
  private memRows = new Map<string, CouponRow>();
  private memUses = new Map<string, Map<string, number>>();
  /** 저장 키 → 틀린 때들, 막힌 끝 */
  private wrong = new Map<string, { at: number[]; until: number }>();

  constructor(private g: Game) {
    g.commands.set('coupon', (p, m) => { if (typeof m.code === 'string') this.redeem(p, m.code); });
    if (COMEBACK) g.on('playerJoined', (p) => this.comeback(p));
    personalData(g).push({
      name: 'coupons',
      get: (pid) => { const used = this.usedBy(pid); return used.length ? used : undefined; },
      erase: (pid) => { if (this.store) this.store.forgetCouponUses(pid); else for (const m of this.memUses.values()) m.delete(pid); },
    });
  }

  attach(store: CouponStore): void { this.store = store; }

  // ---------- 관리자 ----------
  list(): CouponRow[] { return this.store ? this.store.coupons() : [...this.memRows.values()].map((r) => ({ ...r, used: this.memUses.get(r.code)?.size ?? 0 })); }
  get(code: string): CouponRow | null { return this.list().find((r) => r.code === couponNorm(code)) ?? null; }
  /** 쿠폰을 만든다 (같은 코드가 있으면 바꾼다). 문제가 있으면 까닭 */
  put(raw: string, r: Reward, opt: { uses?: number; from?: number; to?: number; note?: string }, by: string): string | null {
    const code = couponNorm(raw);
    if (!couponShape(code)) return `코드는 영문 대문자·숫자 ${COUPON.min}~${COUPON.max}자입니다: ${raw}`;
    if (!isClean(code, 'name')) return `금칙어가 든 코드는 만들 수 없습니다: ${code}`;
    if (!Object.keys(r).length) return '보상이 없습니다';
    const uses = opt.uses ?? 0;
    if (!Number.isInteger(uses) || uses < 0) return `--uses는 0 이상의 정수 (0이면 한도 없음): ${opt.uses}`;
    const row: CouponRow = { code, r, uses, used: 0, from: opt.from ?? 0, to: opt.to ?? 0, at: this.g.now(), by, note: (opt.note ?? '').slice(0, 80) };
    if (this.store) this.store.putCoupon(code, row); else this.memRows.set(code, row);
    return null;
  }
  del(raw: string): boolean {
    const code = couponNorm(raw);
    if (!this.get(code)) return false;
    if (this.store) this.store.putCoupon(code, null); else this.memRows.delete(code);
    return true;
  }
  private usedBy(pid: string): string[] {
    if (this.store) return this.store.couponUsesOf(pid);
    return [...this.memUses].filter(([, m]) => m.has(pid)).map(([c]) => c);
  }

  // ---------- 사람 ----------
  /** 쿠폰을 쓴다. 받았으면 true (보상은 우편). 까닭: couponNo [0 없는 코드, 1 이미 씀, 2 기간, 3 모두 쓰임, 4 막힘(남은 분), 5 손님, 6 모양] */
  redeem(p: Ent, raw: string): boolean {
    const g = this.g, now = g.now(), pid = p.pid;
    const no = (why: number, extra: number | string = ''): false => { g.notify(p, 'couponNo', why, extra); return false; };
    if (!pid) return no(5);
    const w = this.wrong.get(pid);
    if (w && w.until > now) return no(4, Math.ceil((w.until - now) / MIN));
    const code = couponNorm(raw.slice(0, 64));
    const row = couponShape(code) ? this.get(code) : null;
    if (!row) { this.miss(pid, now); return no(couponShape(code) ? 0 : 6); }
    if ((row.from && now < row.from) || (row.to && now >= row.to)) return no(2);
    if (row.uses && row.used >= row.uses) return no(3);
    const ok = this.store ? this.store.useCoupon(code, pid, now) : this.memUse(code, pid, now);
    if (!ok) return no(1);
    g.mail.send(p, 'coupon', [code], row.r);
    g.notify(p, 'couponOk', code);
    g.track('coupon', { ok: true }, p);
    return true;
  }
  private memUse(code: string, pid: string, at: number): boolean {
    const m = this.memUses.get(code) ?? new Map<string, number>();
    if (m.has(pid)) return false;
    m.set(pid, at); this.memUses.set(code, m);
    return true;
  }
  /** 틀린 코드를 센다: lockMin분 안에 tries번이면 lockMin분 막는다 */
  private miss(pid: string, now: number): void {
    const span = COUPON.lockMin * MIN, w = this.wrong.get(pid) ?? { at: [], until: 0 };
    w.at = [...w.at.filter((t) => now - t < span), now];
    if (w.at.length >= COUPON.tries) { w.until = now + span; w.at = []; }
    this.wrong.set(pid, w);
    if (this.wrong.size > 10_000) for (const [k, v] of this.wrong) if (v.until <= now && !v.at.some((t) => now - t < span)) this.wrong.delete(k);
  }

  /** 오래 쉬었다 왔으면 복귀 보상 */
  private comeback(p: Ent): void {
    const c = COMEBACK;
    if (!c || p.bot || !p.pid || !(p.offMs >= c.days * DAY)) return;
    const days = Math.floor(p.offMs / DAY);
    this.g.mail.send(p, 'comeback', [days], c.r);
    this.g.notify(p, 'comeback', days);
  }
}
