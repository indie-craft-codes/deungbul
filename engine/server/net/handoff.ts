// 기기 옮기기 (계정 없이): 지금 기기에서 일회용 코드를 받아 다른 기기에 넣으면, 그 기기가 새 토큰으로 같은 캐릭터를 이어받고 옛 토큰은 쓸 수 없게 된다.
// 진짜 계정(로그인, 비밀번호, 이메일)이 아니다. 그 설계는 docs/accounts.md에 있고, 이것이 그 안에서 어떤 자리인지도 거기에 적었다.
//
// 토큰과 저장 키: 저장 키는 처음 토큰의 해시이고, 캐릭터와 월드의 여러 곳(길드 명단, 거래소, 우편, 던전 …)이 그 키(Ent.pid)로 사람을 가리킨다.
// 그래서 옮길 때 저장 키를 바꾸지 않고, '토큰 해시 → 저장 키'의 별칭을 둔다. 새 토큰의 해시는 별칭으로 저장 키를 가리키고, 옛 토큰의 해시는 '물러난 것'으로 적어 받지 않는다.
// 이것은 accounts.md의 설계(캐릭터 번호와 손님 토큰 해시를 따로 둔다)와 같은 방향이다: 계정이 생기면 별칭 표가 그 '손님 토큰 해시' 칸으로 옮겨 간다.
//
// 코드: 헷갈리는 글자(0 O 1 I L)를 뺀 31자에서 8자. 10분 동안 한 번만 쓰인다. 서버 메모리에만 있다 (다시 켜면 사라지고, 새로 받으면 된다).
// 틀린 코드: 접속 주소와 사람(저장 키, 손님은 주소)마다 10분에 5번까지. 넘으면 그 10분이 지날 때까지 받지 않는다.
// 별칭과 물러난 토큰은 월드와 함께 저장한다 (game.worldSaves의 'handoff' 칸).
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Game } from '../game/game';

/** 코드에 쓰는 글자: 헷갈리는 0 O 1 I L을 뺐다 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 8;
/** 코드가 살아 있는 시간 */
export const CODE_MS = 10 * 60000;
/** 틀린 코드를 넣을 수 있는 횟수와 그 창 */
export const TRY_MAX = 5;
export const TRY_WINDOW_MS = 10 * 60000;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
/** 접속에 쓸 수 있는 토큰의 모양 (server.ts의 join이 받는 모양과 같다) */
export const TOKEN_RE = /^[A-Za-z0-9-]{16,64}$/;

/** 사람이 친 코드를 견줄 모양으로: 대문자로, 칸과 줄표를 뺀다 */
export const normCode = (raw: unknown): string => (typeof raw === 'string' ? raw.toUpperCase().replace(/[\s-]/g, '').slice(0, 16) : '');

export class Handoff {
  /** 살아 있는 코드: 코드 → 저장 키와 끝나는 시각 */
  private codes = new Map<string, { key: string; until: number }>();
  /** 저장 키 → 그 키의 지금 코드 (새로 받으면 옛 코드는 지운다) */
  private codeOf = new Map<string, string>();
  /** 새 토큰의 해시 → 저장 키 */
  private alias = new Map<string, string>();
  /** 저장 키 → 지금 그 캐릭터를 여는 토큰의 해시 (별칭이 없으면 저장 키 자신) */
  private owner = new Map<string, string>();
  /** 물러난(옮겨 가서 더는 받지 않는) 토큰의 해시 */
  private retired = new Set<string>();
  /** 틀린 시도: '주소'·'사람' 열쇠 → [창이 시작된 시각, 틀린 수] */
  private wrong = new Map<string, [number, number]>();

  constructor(private g: Game) {
    g.worldSaves.push({
      name: 'handoff',
      save: () => (this.alias.size || this.retired.size ? { alias: Object.fromEntries(this.alias), retired: [...this.retired] } : undefined),
      load: (raw) => {
        const d = (typeof raw === 'object' && raw !== null ? raw : {}) as { alias?: unknown; retired?: unknown };
        const hex = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
        if (typeof d.alias === 'object' && d.alias !== null) for (const [h, k] of Object.entries(d.alias)) if (hex(h) && hex(k)) { this.alias.set(h, k); this.owner.set(k, h); }
        if (Array.isArray(d.retired)) for (const h of d.retired) if (hex(h)) this.retired.add(h);
      },
    });
  }

  /**
   * 접속한 토큰의 해시를 저장 키로 바꾼다: 옮겨 간 토큰이면 null (그 연결은 받지 않는다), 별칭이 있으면 그 저장 키, 없으면 해시 그대로
   */
  keyFor(hash: string): string | null {
    if (this.retired.has(hash)) return null;
    return this.alias.get(hash) ?? hash;
  }

  /** 그 캐릭터(저장 키)를 옮길 코드를 만든다. 살아 있는 코드가 1분 넘게 남았으면 그것을 다시 준다 */
  make(key: string): { code: string; ms: number } {
    const now = this.g.now(), old = this.codeOf.get(key), had = old ? this.codes.get(old) : undefined;
    if (old && had && had.until - now > 60000) return { code: old, ms: had.until - now };
    if (old) this.codes.delete(old);
    let code = '';
    do { code = Array.from({ length: CODE_LEN }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); } while (this.codes.has(code));
    this.codes.set(code, { key, until: now + CODE_MS });
    this.codeOf.set(key, code);
    return { code, ms: CODE_MS };
  }

  /** 지금 틀린 코드를 더 받지 않는 열쇠가 있으면 다시 해 볼 수 있을 때까지의 ms, 없으면 0 */
  blocked(keys: string[]): number {
    const now = this.g.now();
    let wait = 0;
    for (const k of keys) {
      const w = this.wrong.get(k);
      if (!w) continue;
      if (now - w[0] >= TRY_WINDOW_MS) { this.wrong.delete(k); continue; }
      if (w[1] >= TRY_MAX) wait = Math.max(wait, w[0] + TRY_WINDOW_MS - now);
    }
    return wait;
  }

  /**
   * 코드를 쓴다. who: 시도를 세는 열쇠들 (접속 주소, 사람). self: 이 연결의 저장 키 (손님이면 null).
   * 맞으면 새 토큰을 만들어 별칭을 옮기고 { token, key, old }(old: 물러난 토큰 해시)를, 틀리면 { left }(더 틀릴 수 있는 수)를,
   * 막혀 있으면 { wait }(ms)를, 자기 캐릭터의 코드면 { self: true }를 돌려준다
   */
  use(raw: unknown, who: string[], self: string | null): { token: string; key: string } | { left: number } | { wait: number } | { self: true } {
    const now = this.g.now();
    const wait = this.blocked(who);
    if (wait > 0) return { wait };
    const code = normCode(raw), hit = code.length === CODE_LEN ? this.codes.get(code) : undefined;
    if (!hit || hit.until <= now) {
      if (hit) { this.codes.delete(code); this.codeOf.delete(hit.key); } // 시간이 지난 코드는 지운다
      let left = TRY_MAX;
      for (const k of who) {
        const w = this.wrong.get(k), cur: [number, number] = w && now - w[0] < TRY_WINDOW_MS ? w : [now, 0];
        cur[1]++;
        this.wrong.set(k, cur);
        left = Math.min(left, TRY_MAX - cur[1]);
      }
      return left > 0 ? { left } : { wait: TRY_WINDOW_MS };
    }
    if (self === hit.key) return { self: true };
    // 맞았다: 한 번만 쓰이게 지우고, 새 토큰을 만들어 별칭을 옮긴다. 지금 그 캐릭터를 여는 토큰은 물러난다
    this.codes.delete(code); this.codeOf.delete(hit.key);
    const token = randomBytes(16).toString('hex'), fresh = hashToken(token);
    const before = this.owner.get(hit.key) ?? hit.key;
    this.retired.add(before);
    this.alias.delete(before);
    this.alias.set(fresh, hit.key);
    this.owner.set(hit.key, fresh);
    this.g.saveDirty = true;
    return { token, key: hit.key };
  }

  /** 오래된 기록(지난 코드, 창이 지난 틀린 시도)을 지운다. 주기적으로 부른다 */
  sweep(): void {
    const now = this.g.now();
    for (const [code, c] of this.codes) if (c.until <= now) { this.codes.delete(code); if (this.codeOf.get(c.key) === code) this.codeOf.delete(c.key); }
    for (const [k, w] of this.wrong) if (now - w[0] >= TRY_WINDOW_MS) this.wrong.delete(k);
  }
}
