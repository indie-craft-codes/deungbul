// 초대와 공개 설정 (핵심의 작은 부품): 6자 방 코드, 초대 링크(?join=코드), 공개/비공개/친구만/비밀번호의 들어가기 검사, 비밀번호의 해시와 빈도 제한.
// 판(rooms 모듈)이 쓰고, 파티·던전처럼 '무리 하나에 들어가기'가 있는 시스템도 같은 부품을 쓸 수 있다 (무리 하나 = 코드 하나).
// 서버만 읽는다: 비밀번호는 원문을 남기지 않는다(소금 + scrypt), 코드는 화면에 보여도 되는 값이다(저장 키를 가리키지 않는다).
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Ent } from './entity';
import type { Game } from './game';

/** 공개 설정: public 목록에 보이고 누구나, private 코드로만, friends 방장의 친구만(코드로도), password 목록에 자물쇠와 함께 보이고 비밀번호를 알아야 */
export type Privacy = 'public' | 'private' | 'friends' | 'password';
export const PRIVACY: readonly Privacy[] = ['public', 'private', 'friends', 'password'];
export const isPrivacy = (v: unknown): v is Privacy => typeof v === 'string' && (PRIVACY as readonly string[]).includes(v);

/** 코드의 글자: 헷갈리는 0·O·1·I·L을 뺀 대문자와 숫자 31자 */
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 6;
/** 비밀번호의 길이 (글자 수) */
export const PASS_MAX = 24;
/** 틀린 비밀번호: 이 시간(ms) 안에 이만큼 틀리면 그 사람은 잠시 막힌다 */
export const PASS_TRIES = 5, PASS_WINDOW_MS = 60_000;

/** 받은 코드를 견줄 모양으로 (앞뒤 공백, 소문자, 헷갈리는 글자 O→0이 아니라 빼 둔 글자이므로 그대로 둔다). 모양이 틀리면 빈 문자열 */
export function normCode(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim().toUpperCase();
  return s.length === CODE_LEN && [...s].every((c) => CODE_CHARS.includes(c)) ? s : '';
}

/** 비밀번호의 해시 (소금:해시, hex). 빈 비밀번호면 빈 문자열 */
export function hashPass(pass: string): string {
  if (!pass) return '';
  const salt = randomBytes(8);
  return `${salt.toString('hex')}:${scryptSync(pass, salt, 24, { N: 1024 }).toString('hex')}`;
}
/** 비밀번호가 해시와 맞는가 */
export function passOk(hash: string, pass: string): boolean {
  const [salt, h] = hash.split(':');
  if (!salt || !h || !pass) return false;
  const got = scryptSync(pass, Buffer.from(salt, 'hex'), 24, { N: 1024 });
  const want = Buffer.from(h, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** 무리 하나의 문: 공개 설정과 비밀번호의 해시, 방장의 엔티티(친구만에서 친구를 본다) */
export interface Door { privacy: Privacy; pass: string }
/** 들어가기 검사의 답: ok, 또는 막힌 까닭 (private 코드가 아니면 못 들어감, friends 친구가 아님, password 틀림·없음, slow 너무 자주 틀림) */
export type DoorAnswer = 'ok' | 'private' | 'friends' | 'password' | 'slow';

/**
 * 코드 표와 들어가기 검사. 코드 → 무리(T)를 기억하고, 사람마다 틀린 비밀번호를 센다.
 * 쓰는 법: issue(무리)로 코드를 받고, 무리가 없어지면 drop(코드). 들어갈 때 enter(문, 사람, 방장, { code, pass })
 */
export class Invites<T> {
  private readonly byCode = new Map<string, T>();
  /** 사람(저장 키, 손님은 엔티티 id) → 틀린 때들 (ms, g.now) */
  private readonly misses = new Map<string, number[]>();
  constructor(private g: Game, private rng: () => number = Math.random) {}

  /** 새 코드 (겹치지 않게) */
  issue(target: T): string {
    for (let k = 0; k < 1000; k++) {
      let c = '';
      for (let i = 0; i < CODE_LEN; i++) c += CODE_CHARS[Math.floor(this.rng() * CODE_CHARS.length) % CODE_CHARS.length];
      if (!this.byCode.has(c)) { this.byCode.set(c, target); return c; }
    }
    throw new Error('[invites] 코드를 더 만들 수 없습니다');
  }
  /** 코드의 무리 (없거나 모양이 틀리면 undefined) */
  find(code: unknown): T | undefined { const c = normCode(code); return c ? this.byCode.get(c) : undefined; }
  drop(code: string): void { this.byCode.delete(code); }
  get size(): number { return this.byCode.size; }

  /**
   * 그 사람이 문을 지나갈 수 있는가. byCode: 코드로 왔다 (비공개도 지나간다), lead: 방장 (친구만에서 친구인지 본다), pass: 받은 비밀번호.
   * 비밀번호가 틀리면 센다: PASS_WINDOW_MS 안에 PASS_TRIES번 틀린 사람은 맞는 비밀번호를 줘도 'slow' (해시를 부르지 않는다)
   */
  enter(door: Door, p: Ent, lead: Ent | undefined, o: { byCode?: boolean; pass?: unknown } = {}): DoorAnswer {
    switch (door.privacy) {
      case 'public': return 'ok';
      case 'private': return o.byCode ? 'ok' : 'private';
      case 'friends': return lead && (lead === p || this.g.friends(lead, p)) ? 'ok' : 'friends';
      case 'password': {
        const who = p.pid || `#${p.id}`, now = this.g.now();
        const recent = (this.misses.get(who) ?? []).filter((t) => now - t < PASS_WINDOW_MS);
        if (recent.length >= PASS_TRIES) { this.misses.set(who, recent); return 'slow'; }
        const pass = typeof o.pass === 'string' ? o.pass.slice(0, PASS_MAX) : '';
        if (door.pass && passOk(door.pass, pass)) { this.misses.delete(who); return 'ok'; }
        recent.push(now);
        this.misses.set(who, recent);
        if (this.misses.size > 5000) for (const [k, ts] of this.misses) if (!ts.some((t) => now - t < PASS_WINDOW_MS)) this.misses.delete(k); // 오래된 사람을 비운다
        return 'password';
      }
    }
  }
}
