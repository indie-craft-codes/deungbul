// 봇·매크로 의심 점수 (운영 도구, docs/genre-features.md 5.5): 사람마다 게임 명령의 빈도와 간격을 재어 점수(0~100)를 낸다. 관리자가 보기만 한다: 자동으로 막지 않는다.
// 통신 계층(server.ts)이 게임 명령을 받을 때마다 see(사람의 열쇠, 이름, 명령 이름, 시각)를 부른다. 서버가 켜져 있는 동안만 둔다(저장하지 않는다).
//
// 점수의 재료 (최근 WINDOW개의 명령으로 잰다. 명령이 MIN_CMDS개보다 적으면 점수를 내지 않는다):
//   rate     분당 명령 수: 사람이 쉬지 않고 누를 수 있는 빠르기(RATE_HI)를 넘을수록 높다
//   steady   간격의 고르기: 간격의 변동 계수(표준편차/평균)가 낮을수록 기계 같다 (사람의 간격은 들쭉날쭉하다)
//   repeat   같은 명령의 되풀이: 가장 많이 낸 명령 하나의 몫
//   nonstop  쉬지 않음: 접속한 뒤로 5분 넘게 아무것도 하지 않은 틈이 없이 이어진 시간 (긴 세션)
// 점수 = 0.35×steady + 0.25×rate + 0.2×repeat + 0.2×nonstop (각 0~1을 100점으로). 50 이상이면 목록에서 '살펴볼 것'으로 표시한다.
// 정상이 높은 점수를 받는 경우(자동 사냥을 켠 사람은 명령을 보내지 않으므로 해당 없음, 같은 단추를 연타하는 사람)도 있으므로 점수는 근거일 뿐이다.

const WINDOW = 120;
const MIN_CMDS = 30;
/** 사람이 오래 이어 낼 수 있는 빠르기(분당). 넘으면 rate가 1에 가까워진다 */
const RATE_HI = 90;
/** 이만큼 아무 명령이 없으면 쉰 것으로 본다 */
const IDLE_GAP_MS = 5 * 60_000;
/** 쉬지 않고 이만큼 이어지면 nonstop이 1 */
const NONSTOP_FULL_MS = 4 * 3600_000;
/** 마지막 명령 뒤 이만큼 지나면 목록에서 뺀다 */
const KEEP_MS = 6 * 3600_000;
/** 지켜보는 사람의 상한 (넘으면 가장 오래 조용한 사람부터 뺀다) */
const PEOPLE_MAX = 5000;
export const SUSPECT_LINE = 50;

interface Track { name: string; at: number[]; cmd: string[]; runFrom: number; last: number; total: number }
export interface SuspectRow {
  /** 사람의 열쇠 ('k:저장 키' | 'i:주소')와 마지막 이름 */
  who: string; name: string;
  score: number;
  /** 재료: 분당 명령, 간격의 변동 계수, 가장 많이 낸 명령과 그 몫(0~1), 쉬지 않고 이어진 분, 잰 명령 수 */
  perMin: number; cv: number; top: string; topShare: number; nonstopMin: number; n: number;
  last: number;
}

/** 재료에서 점수를 낸다 (시험이 직접 부른다) */
export function scoreOf(perMin: number, cv: number, topShare: number, nonstopMs: number): number {
  const rate = Math.min(1, Math.max(0, perMin - 20) / (RATE_HI - 20));
  const steady = Math.min(1, Math.max(0, (0.6 - cv) / 0.55)); // 변동 계수 0.05 이하면 1, 0.6 이상이면 0
  const repeat = Math.min(1, Math.max(0, (topShare - 0.5) / 0.45));
  const nonstop = Math.min(1, nonstopMs / NONSTOP_FULL_MS);
  return Math.round(100 * (0.35 * steady + 0.25 * rate + 0.2 * repeat + 0.2 * nonstop));
}

export class Suspects {
  private people = new Map<string, Track>();

  /** 게임 명령 하나를 본다 */
  see(who: string, name: string, cmd: string, now: number): void {
    let t = this.people.get(who);
    if (!t) {
      if (this.people.size >= PEOPLE_MAX) this.dropOldest();
      this.people.set(who, t = { name, at: [], cmd: [], runFrom: now, last: now, total: 0 });
    }
    if (now - t.last > IDLE_GAP_MS) t.runFrom = now;
    t.name = name; t.last = now; t.total++;
    t.at.push(now); t.cmd.push(cmd.slice(0, 20));
    if (t.at.length > WINDOW) { t.at.shift(); t.cmd.shift(); }
  }

  private dropOldest(): void {
    let old = '', at = Infinity;
    for (const [k, t] of this.people) if (t.last < at) { at = t.last; old = k; }
    this.people.delete(old);
  }

  /** 한 사람의 점수 (명령이 모자라면 null) */
  row(who: string): SuspectRow | null {
    const t = this.people.get(who);
    if (!t || t.at.length < MIN_CMDS) return null;
    const gaps: number[] = [];
    for (let i = 1; i < t.at.length; i++) gaps.push(t.at[i] - t.at[i - 1]);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    const cv = mean > 0 ? sd / mean : 0;
    const span = t.at[t.at.length - 1] - t.at[0];
    const perMin = span > 0 ? (gaps.length / span) * 60_000 : 0;
    const counts = new Map<string, number>();
    for (const c of t.cmd) counts.set(c, (counts.get(c) ?? 0) + 1);
    let top = '', topN = 0;
    for (const [c, n] of counts) if (n > topN) { top = c; topN = n; }
    const nonstop = t.last - t.runFrom;
    return {
      who, name: t.name, score: scoreOf(perMin, cv, topN / t.cmd.length, nonstop),
      perMin: Math.round(perMin * 10) / 10, cv: Math.round(cv * 1000) / 1000, top, topShare: Math.round((topN / t.cmd.length) * 100) / 100,
      nonstopMin: Math.round(nonstop / 60_000), n: t.total, last: t.last,
    };
  }

  /** 점수가 높은 차례로 (오래 조용한 사람은 먼저 정리한다) */
  list(now: number, limit = 50): SuspectRow[] {
    for (const [k, t] of this.people) if (now - t.last > KEEP_MS) this.people.delete(k);
    const out: SuspectRow[] = [];
    for (const k of this.people.keys()) { const r = this.row(k); if (r) out.push(r); }
    return out.sort((a, b) => b.score - a.score || b.n - a.n).slice(0, limit);
  }
  get size(): number { return this.people.size; }
}
