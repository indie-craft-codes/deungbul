// 금칙어 거르기: 글을 한 가지 모양으로 펴고(정규화) 목록의 낱말과 게임이 꽂은 거르개로 견준다.
// 서버의 대화·이름·길드 이름·길드 공지(engine/server/text.ts가 다시 내보낸다)와 캐릭터 정의(engine/shared/defs/chardef.ts)가 이 하나를 쓴다.
// 이 파일은 아무것도 import하지 않는다 (서버·화면·내용 어디서나 읽는다).
//
// 펴는 것 (우회 표기):
//   보이지 않는 글자·전각·꾸밈 글자(tidy, NFKC) · 대소문자 · 악센트(ü → u) · 키릴·그리스 닮은꼴(а → a)
//   한글 음절을 자모로 풀기(씨발 = ㅆㅣㅂㅏㄹ: 'ㅅㅣ발', 'ㅆ ㅣ ㅂ ㅏ ㄹ'도 같다) · 겹모음·겹받침을 친 순서대로(ㅘ = ㅗㅏ)
//   늘인 소리(씨이발 → 씨발) · 되풀이한 글자(fuuuck, ffuucckk)·음절(병신신) · 숫자·기호 치환(sh1t, a$$hole: 로마자 곁에서만)
//   한글을 영문 자판으로 친 것(tlqkf = 시발) · 띄어쓰기·특수문자·숫자를 끼운 것(씨 발, 씨.발, 씨1발, f u c k)
// 잘못 막지 않게 지키는 것:
//   음절의 경계: '조직'의 ㅈㅗㅈ은 '좆'이 아니다 (걸린 곳은 음절의 처음에서 시작해 음절의 끝에서 끝나야 한다)
//   자모만으로 된 낱말(ㅅㅂ, ㅂㅅ)은 따로 친 자모에만 걸린다 ('깃발'·'밥상'의 받침과 다음 초성은 아니다)
//   낱말 사이: 대화(느슨함)에서 띄어쓰기를 건너 걸린 것은 한 덩어리의 처음에서 시작해 한 덩어리의 끝에서 끝날 때만 ('시 발표', '다시 발사', 'this hit'은 아니다).
//   이름(엄격함: 이름·길드 이름·캐릭터 이름)은 경계를 보지 않는다 (이름은 짧고, 띄어 쓴 금칙어 이름을 막는 쪽이 낫다)
//   허용 낱말: 금칙어를 품은 보통 낱말(시발점 …)은 그 안에서 걸린 것을 넘긴다

/** 견주는 자리: 대화·공지·캐릭터 소개는 느슨하게, 이름·길드 이름·캐릭터 이름은 엄격하게 */
export type TextWhere = 'chat' | 'notice' | 'name' | 'guild' | 'charName' | 'charBio';
const STRICT: ReadonlySet<TextWhere> = new Set(['name', 'guild', 'charName']);

/** 틀의 시작용 목록 (한국어, 영어). 게임은 addBannedWords로 자기 언어와 세계의 낱말을 더한다 */
export const BASE_BANNED: readonly string[] = [
  // 한국어
  '씨발', '시발', '씨팔', '시팔', '씨빨', '시빨', '씨벌', 'ㅅㅂ', 'ㅆㅂ', 'ㅄ', '병신', '븅신', '빙신', 'ㅂㅅ', '좆', '개새끼', '개새', '개색기', '개색히', '지랄', 'ㅈㄹ', '니애미', '느금마', '창녀', '걸레년',
  // 영어 (로마자로 적은 한국어 욕 포함)
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'sibal', 'ssibal', 'shibal', 'byungsin',
];
/** 금칙어를 품었지만 보통 쓰는 낱말: 그 안에서 걸린 것은 넘긴다 */
export const BASE_ALLOWED: readonly string[] = ['시발점', '시발역', '시발택시'];

const words: string[] = [];
const allowed: string[] = [];
/** 게임이 꽂은 거르개: 걸리면 true (예외를 던지면 걸린 것으로 본다) */
export type TextFilter = (text: string, where: TextWhere) => boolean;
const filters: TextFilter[] = [];

// ---------- 다듬기 ----------
/**
 * 글자를 한 가지 모양으로 다듬는다: 전각 글자와 꾸밈 글자를 보통 글자로(NFKC), 눈에 보이지 않는 글자(폭 없는 공백, 방향 뒤집기,
 * 한글 채움 문자)는 지운다. 이런 글자로 금칙어를 피하거나 남의 이름을 흉내 내지 못하게 한다.
 */
export function tidy(text: string): string {
  // 낱글자 자모(ㅋ, ㅠ, ㅅㅂ)는 그대로 둔다: NFKC는 이것을 조합용 자모로 바꿔서 화면에서 깨져 보이고 금칙어 목록과도 어긋난다
  return [...text].map((ch) => (/[㄰-㆏]/.test(ch) ? ch : ch.normalize('NFKC'))).join('').replace(/[​-‏‪-‮⁠-⁤⁦-⁯﻿­ᅟᅠㅤﾠ]/g, '');
}

// ---------- 한글 ----------
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
/** 겹모음·겹받침을 자판으로 친 순서로 편다 */
const SPLIT: Readonly<Record<string, string>> = {
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
};
const spread = (j: string): string[] => [...(SPLIT[j] ?? j)];
/** 조합용 자모(U+1100대) → 호환 자모(U+3130대) */
const COMPAT = new Map<string, string>();
for (let c = 0x3131; c <= 0x318e; c++) { const ch = String.fromCharCode(c), n = ch.normalize('NFKC'); if (n !== ch) COMPAT.set(n, ch); }
/** 두벌식 자판: 로마자 글쇠 → 자모 (대문자는 Shift) */
const KEYS: Readonly<Record<string, string>> = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ', a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ', Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ',
};
// ---------- 로마자 ----------
/** 키릴·그리스 닮은꼴 */
const LOOKALIKE: Readonly<Record<string, string>> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', к: 'k', ѕ: 's', ј: 'j', ԁ: 'd', ӏ: 'l', ο: 'o', α: 'a', ν: 'v', ι: 'i', κ: 'k', ρ: 'p', τ: 't', υ: 'u', ϲ: 'c',
};
/** 숫자·기호 치환 (로마자 곁에서만) */
const LEET: Readonly<Record<string, string>> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
const isLatin = (ch: string): boolean => /^[a-z]$/.test(ch);

/** 편 글의 한 칸 */
interface Unit {
  c: string;
  /** 원문(다듬은 글)의 글자 자리: 처음과 끝(포함) */
  src: number; end: number;
  /** 띄어쓰기·기호로 나뉜 덩어리의 번호 */
  tok: number;
  /** 음절(따로 친 자모·로마자는 한 칸이 곧 하나)의 처음·끝인가 */
  st: boolean; en: boolean;
  /** 따로 친 자모인가 */
  jamo: boolean;
}

/** 다듬은 글의 글자들을 편 칸들로. leet가 false면 로마자 곁의 숫자·기호도 띄어쓰기로 본다 (f1uck은 'fiuck'도 'f|uck'도 된다: 둘 다 견준다) */
function unitsOf(cps: readonly string[], useLeet = true): Unit[] {
  const out: Unit[] = [];
  // 로마자 곁의 숫자·기호를 글자로 (곁의 곁도: a$$hole)
  const low = cps.map((ch) => { const l = ch.toLowerCase(); const b = LOOKALIKE[l] ?? l; return /[À-ɏ]/.test(b) ? b.normalize('NFD').replace(/\p{M}/gu, '') : b; });
  const leet = low.map(() => false);
  for (let changed = useLeet; changed;) {
    changed = false;
    for (let i = 0; i < low.length; i++) {
      if (leet[i] || !(low[i] in LEET)) continue;
      const near = (j: number) => j >= 0 && j < low.length && (isLatin(low[j]) || leet[j]);
      if (near(i - 1) || near(i + 1)) { leet[i] = true; changed = true; }
    }
  }
  let tok = 0, gap = false;
  /** 늘인 소리를 견줄 앞 음절: 받침 없는 음절의 모음 */
  let lastOpen = '', lastAt = -1, lastSyl = '';
  for (let i = 0; i < cps.length; i++) {
    const ch = leet[i] ? LEET[low[i]] : low[i];
    const code = ch.codePointAt(0) ?? 0;
    const put = (list: string[], jamo: boolean) => {
      if (gap) { tok++; gap = false; }
      list.forEach((c, k) => out.push({ c, src: i, end: i, tok, st: k === 0, en: k === list.length - 1, jamo }));
    };
    if (code >= 0xac00 && code <= 0xd7a3) {
      const s = code - 0xac00, l = CHO[Math.floor(s / 588)], v = JUNG[Math.floor((s % 588) / 28)], t = JONG[s % 28];
      // 늘인 소리 (씨이발): 받침 없는 음절 뒤의 'ㅇ + 같은 모음'은 앞 음절에 붙인다. 같은 음절을 되풀이한 것(병신신, 개새끼끼)도 앞 음절에 붙인다
      if (((l === 'ㅇ' && !t && v === lastOpen) || ch === lastSyl) && lastAt === i - 1 && !gap && out.length) { out[out.length - 1].end = i; lastAt = i; continue; }
      put([l, ...spread(v), ...(t ? spread(t) : [])], false);
      lastOpen = t ? '' : v; lastAt = i; lastSyl = ch;
      continue;
    }
    lastOpen = ''; lastAt = -1; lastSyl = '';
    const jamo = COMPAT.get(ch) ?? ch;
    if (/^[ㄱ-ㆎ]$/.test(jamo)) { put(spread(jamo), true); continue; }
    if (/^\p{L}$/u.test(ch)) { put([ch], false); continue; }
    gap = true; // 띄어쓰기, 문장 부호, 기호, 로마자 곁이 아닌 숫자
  }
  return out;
}

/** 한 낱말의 견주는 모양: 같은 글자의 덩어리(되풀이는 그 수 이상이면 맞다), 자모만으로 된 낱말인가 */
interface Word { runs: { c: string; k: number }[]; jamoOnly: boolean; hangul: boolean; text: string }
function wordOf(w: string): Word | null {
  const u = unitsOf([...tidy(w)]);
  if (!u.length) return null;
  const runs: { c: string; k: number }[] = [];
  for (const x of u) { const last = runs[runs.length - 1]; if (last && last.c === x.c) last.k++; else runs.push({ c: x.c, k: 1 }); }
  return { runs, jamoOnly: u.every((x) => x.jamo), hangul: u.every((x) => /^[ㄱ-ㆎ]$/.test(x.c)), text: w };
}
let compiled: Word[] = [];
let compiledAllow: Word[] = [];
function rebuild(): void {
  compiled = words.map(wordOf).filter((w): w is Word => w !== null);
  compiledAllow = allowed.map(wordOf).filter((w): w is Word => w !== null);
}
words.push(...BASE_BANNED.map((w) => tidy(w).trim().toLowerCase()));
allowed.push(...BASE_ALLOWED);
rebuild();

/**
 * 칸 s부터 그 낱말이 맞는 끝(포함하지 않음)들. 되풀이한 글자는 낱말의 수 이상이면 맞는다.
 * 안쪽 덩어리는 다 삼킨다(다음 덩어리는 글자가 달라 덜 삼킬 까닭이 없다). 마지막 덩어리만 다음 음절의 같은 글자까지 삼키지 않게 짧은 쪽도 본다 (쭈꾸미볶음 먹자의 ㅁ). 길이에 비례하는 셈이다
 */
function matchEnds(u: readonly Unit[], s: number, w: Word): number[] {
  let i = s;
  for (let ri = 0; ri < w.runs.length; ri++) {
    const r = w.runs[ri];
    let n = 0;
    while (i + n < u.length && u[i + n].c === r.c) n++;
    if (n < r.k) return [];
    if (ri === w.runs.length - 1) { const out: number[] = []; for (let k = n; k >= r.k; k--) out.push(i + k); return out; }
    i += n;
  }
  return [];
}
/** 걸린 곳 [s, e)가 규칙에 맞는가: 음절 경계, 자모 낱말, 덩어리 경계(느슨할 때) */
function fits(u: readonly Unit[], s: number, e: number, w: Word, strict: boolean): boolean {
  if (!u[s].st || !u[e - 1].en) return false;
  if (w.jamoOnly) { for (let i = s; i < e; i++) if (!u[i].jamo) return false; }
  if (!strict && u[s].tok !== u[e - 1].tok) {
    if (s > 0 && u[s - 1].tok === u[s].tok) return false;
    if (e < u.length && u[e].tok === u[e - 1].tok) return false;
  }
  return true;
}
/** 걸린 곳들 (칸의 [s, e)) */
function hits(u: readonly Unit[], strict: boolean, list: readonly Word[] = compiled): [number, number][] {
  const out: [number, number][] = [];
  for (let s = 0; s < u.length; s++) {
    for (const w of list) {
      if (u[s].c !== w.runs[0].c) continue;
      const e = matchEnds(u, s, w).find((x) => fits(u, s, x, w, strict));
      if (e !== undefined) out.push([s, e]);
    }
  }
  return out;
}
/** 허용 낱말이 덮는 칸 */
function guarded(u: readonly Unit[]): boolean[] {
  const g = u.map(() => false);
  for (const [s, e] of hits(u, false, compiledAllow)) if (u[s].tok === u[e - 1].tok) for (let i = s; i < e; i++) g[i] = true;
  return g;
}
/** 로마자만으로 된 덩어리를 두벌식 자판의 자모로 읽은 칸들 (원문의 대소문자로) */
function keyboardUnits(cps: readonly string[]): Unit[][] {
  const out: Unit[][] = [];
  let cur: Unit[] = [];
  const flush = () => { if (cur.length >= 2) out.push(cur); cur = []; };
  for (let i = 0; i < cps.length; i++) {
    const ch = cps[i], k = KEYS[ch] ?? KEYS[ch.toLowerCase()];
    if (!/^[A-Za-z]$/.test(ch) || !k) { flush(); continue; }
    cur.push(...spread(k).map((c) => ({ c, src: i, end: i, tok: 0, st: true, en: true, jamo: false })));
  }
  flush();
  return out;
}

/** 걸린 원문 자리(다듬은 글의 글자 번호들). 게임의 거르개에 걸리면 'all' */
function scan(text: string, where: TextWhere): { cps: string[]; marks: Set<number> | 'all' } {
  const cps = [...tidy(text)];
  const strict = STRICT.has(where);
  const marks = new Set<number>();
  const mark = (u: readonly Unit[], s: number, e: number) => { for (let i = u[s].src; i <= u[e - 1].end; i++) marks.add(i); };
  // 숫자·기호를 글자로 읽은 것과 띄어쓰기로 읽은 것 둘 다 (같으면 한 번만)
  const first = unitsOf(cps), second = unitsOf(cps, false);
  for (const u of filterKeyOf(first) === filterKeyOf(second) ? [first] : [first, second]) {
    if (!u.length) continue;
    const g = guarded(u);
    for (const [s, e] of hits(u, strict)) {
      let inside = true;
      for (let i = s; i < e; i++) if (!g[i]) { inside = false; break; }
      if (!inside) mark(u, s, e);
    }
  }
  // 한글을 영문 자판으로 친 것: 로마자 덩어리를 자모로 읽어 한글 낱말(자모만으로 된 것은 빼고)과 견준다
  const hangul = compiled.filter((w) => w.hangul && !w.jamoOnly);
  if (hangul.length) for (const ku of keyboardUnits(cps)) for (const [s, e] of hits(ku, true, hangul)) mark(ku, s, e);
  for (const f of filters) { let hit: boolean; try { hit = f(text, where); } catch { hit = true; } if (hit) return { cps, marks: 'all' }; }
  return { cps, marks };
}

// ---------- 바깥에서 쓰는 것 ----------
/** 금칙어를 더한다 (게임의 서버 진입점이나 규칙 플러그인에서). 빈 낱말과 이미 있는 낱말은 건너뛴다 */
export function addBannedWords(list: readonly string[]): void {
  for (const w of list.map((x) => tidy(x).trim().toLowerCase())) if (w && !words.includes(w)) words.push(w);
  rebuild();
}
/** 금칙어를 품은 보통 낱말을 더한다 (그 안에서 걸린 것은 넘긴다) */
export function addAllowedWords(list: readonly string[]): void {
  for (const w of list.map((x) => tidy(x).trim().toLowerCase())) if (w && !allowed.includes(w)) allowed.push(w);
  rebuild();
}
/** 거르개를 더한다: 글과 자리를 받아 걸리면 true. 대화·공지는 걸리면 말 전체를 가린다. 예외를 던지면 걸린 것으로 본다 (외부 검열을 꽂는 자리) */
export function addTextFilter(fn: TextFilter): void { filters.push(fn); }
/** 시험이 더한 거르개를 지운다 */
export function clearTextFilters(): void { filters.length = 0; }
/** 지금의 금칙어 목록 (관리자·문서용) */
export const bannedWords = (): readonly string[] => [...words];

/** 금칙어를 같은 길이의 별표로 가린다 (다듬은 글을 돌려준다). 기본은 대화의 느슨한 견주기 */
export function mask(text: string, where: TextWhere = 'chat'): string {
  const { cps, marks } = scan(text, where);
  if (marks === 'all') return cps.map((c) => (/\s/.test(c) ? c : '*')).join('');
  if (!marks.size) return cps.join('');
  return cps.map((c, i) => (marks.has(i) ? '*' : c)).join('');
}
/** 금칙어가 없는가. 기본은 이름의 엄격한 견주기 (이름처럼 가려서 쓸 수 없는 것을 검사할 때) */
export function isClean(text: string, where: TextWhere = 'name'): boolean {
  const { marks } = scan(text, where);
  return marks !== 'all' && marks.size === 0;
}
/** 편 모양을 글로 (시험과 관리자 확인용): 칸의 글자를 잇고 덩어리 사이에 '|' */
export function filterKey(text: string): string { return filterKeyOf(unitsOf([...tidy(text)])); }
function filterKeyOf(u: readonly Unit[]): string { return u.map((x, i) => (i && u[i - 1].tok !== x.tok ? '|' : '') + x.c).join(''); }
