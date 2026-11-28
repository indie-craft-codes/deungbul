// 캐릭터 정의 (틀의 공용 형식)와 그 검증기. 정의 하나(id, 이름, 짧은 소개, 겉모습, 역할, 등급, 능력치 배분, 기술)를
// 수집형의 영웅(roster: charHero로 영웅의 표에 더한다)과 MMORPG의 변신(morph 모듈)이 함께 읽는다.
// 정의는 바깥(AI의 결과, 다른 서버, 사람이 적은 JSON)에서 오므로 **믿지 않는다**: validateCharDef가 모양·길이·글자·없는 부품과 기술·
// 등급마다의 능력치 예산(합계와 칸마다의 상한)·크기 배율을 모두 보고, 거절하면 까닭을 기계가 읽는 코드(CharErr)와 자리(path)로 돌려준다
// (화면의 문장은 engine/client/i18n의 fmt.charErr). 예외를 던지지 않는다 (engine/test/fx/chardef.test.ts의 퍼징이 지킨다).
// 규칙(능력치의 칸과 무게, 예산의 표, 역할·기술의 목록, 글자 수, 금칙어)은 게임의 내용 CHAR_RULES. 적지 않으면 아래의 기본값이고,
// 예산의 표를 적지 않으면 내용의 영웅(HEROES)들의 범위에서 셈한다 (budgetFromHeroes).
import { CHAR_RULES, HERO_RARITIES, HERO_ROLES, HEROES, SKILL_DEFS } from '../content';
import type { HeroDef } from './collect';
import { checkLook, type Look, type LookIssue } from './look';
import { isClean } from '../textfilter';

/** 정의 형식의 버전 */
export const CHAR_V = 1;
/** 캐릭터 정의 하나 */
export interface CharDef {
  v: number;
  /** 영문 소문자로 시작하는 3~32자 (영웅·변신의 id로 쓴다) */
  id: string;
  /** 이름과 짧은 소개·성격 (사람이 쓴 글: 화면이 그대로 보인다. 틀은 번역하지 않는다) */
  name: string; bio: string;
  /**
   * 언어마다의 이름·소개 (선택): 언어 코드('en', 'ja' …) → { name, bio? }. 화면이 그 언어일 때 이것을 보인다 (없는 언어는 name·bio 그대로).
   * 검증기가 name·bio와 같은 규칙(길이·글자·금칙어)으로 본다. 언어는 CHAR_TEXT_LANGS개까지
   */
  text?: Record<string, { name: string; bio?: string }>;
  look: Look;
  /** 역할 (HERO_ROLES의 id. 역할이 없는 게임은 빈 문자열) */
  role: string;
  /** 등급 번호 (HERO_RARITIES) */
  rarity: number;
  /** 능력치 배분: CHAR_RULES.stats의 칸마다 정수 */
  stats: Record<string, number>;
  /** 기술: 틀의 기술 효과(SKILL_DEFS)에서 고른 것 (CHAR_RULES.skills의 목록 안) */
  skills: string[];
}

/** 능력치의 칸 하나: 예산을 셀 때의 무게, 가장 작은 값, 이름의 문장 키 (없으면 틀의 문장: atk 공격, hp 체력) */
export interface CharStat { w: number; min: number; name?: string }
/** 한 등급의 예산: 무게를 곱한 합의 상한과 칸마다의 상한 */
export interface CharBudget { total: number; cap?: Readonly<Record<string, number>> }
/** 캐릭터 정의의 규칙 (내용의 CHAR_RULES. 모두 선택) */
export interface CharRules {
  /** 능력치의 칸 (기본: atk 무게 4, hp 무게 0.5. 영웅의 전투력 셈과 같은 무게) */
  stats?: Readonly<Record<string, CharStat>>;
  /** 등급마다의 예산 (HERO_RARITIES의 차례). 적지 않으면 내용의 영웅에서 셈한다 (budgetFromHeroes. 그 등급의 영웅이 없으면 그 등급은 만들 수 없다) */
  budget?: readonly CharBudget[];
  /** 고를 수 있는 역할 (기본: HERO_ROLES 전부) */
  roles?: readonly string[];
  /** 고를 수 있는 기술 (기본: SKILL_DEFS 전부)과 그 수 (기본 1) */
  skills?: readonly string[];
  maxSkills?: number;
  /** 이름·소개의 길이 (글자 수: 기본 이름 1~16, 소개 0~120) */
  nameMax?: number; bioMax?: number;
  /** 쓸 수 있는 글자 (기본: 한글, 로마자, 숫자, 빈칸, 문장 부호 몇) */
  charset?: RegExp;
  /** 이름과 소개에 쓸 수 없는 말 (대소문자·빈칸·문장 부호를 무시하고 견준다) */
  banned?: readonly string[];
  /** 정의를 영웅으로 쓸 때의 공격·체력 (기본: stats.atk, stats.hp) */
  toHero?: (d: CharDef) => { atk: number; hp: number };
}
export const CHAR_RULE_VIEW: CharRules = CHAR_RULES;

/** 거절의 까닭 (기계가 읽는 코드). 화면의 문장은 i18n의 fmt.charErr(code, path, arg) */
export const CHAR_ERRS = [
  'shape', 'extra', 'missing', 'type', 'version', 'id', 'idTaken', 'length', 'control', 'charset', 'space', 'banned',
  'role', 'rarity', 'stat', 'statMin', 'statCap', 'budget', 'skill', 'skillCount', 'skillDup', 'part', 'slotOff', 'color', 'pattern', 'size',
] as const;
export type CharErr = (typeof CHAR_ERRS)[number];
export interface CharIssue { code: CharErr; path: string; arg?: string | number }
export type CharCheck = { ok: true; def: CharDef; issues: [] } | { ok: false; issues: CharIssue[] };

/** JSON 글자로 받을 때의 가장 긴 길이 */
export const CHAR_JSON_MAX = 4096;
/** 한 번에 돌려주는 거절 까닭의 가장 많은 수 */
const ISSUE_MAX = 32;
const ID_RE = /^[a-z][a-z0-9_]{2,31}$/;
/** 기본 글자: 한글(음절·자모), 로마자(악센트 포함), 숫자, 빈칸, 문장 부호 몇 */
const CHARSET = /^[\p{Script=Hangul}A-Za-zÀ-ɏ0-9 .,!?'"()\-~·:;&]*$/u;
/** 보이지 않거나 줄을 바꾸는 글자: 제어 문자, 서식 문자(폭 없는 빈칸, 방향 바꾸기), 대리 쌍의 반쪽, 사용자 영역, 줄·문단 구분 */
const CONTROL = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;

const STATS_DEFAULT: Readonly<Record<string, CharStat>> = { atk: { w: 4, min: 1 }, hp: { w: 0.5, min: 1 } };
export const charStats = (): Readonly<Record<string, CharStat>> => CHAR_RULE_VIEW.stats ?? STATS_DEFAULT;
export const charRoles = (): readonly string[] => CHAR_RULE_VIEW.roles ?? Object.keys(HERO_ROLES);
export const charSkills = (): readonly string[] => (CHAR_RULE_VIEW.skills ?? Object.keys(SKILL_DEFS)).filter((s) => Object.hasOwn(SKILL_DEFS, s));
export const charMaxSkills = (): number => Math.max(0, Math.floor(CHAR_RULE_VIEW.maxSkills ?? 1));
/** 무게를 곱한 합 (예산에 견주는 값) */
export const charWeight = (stats: Readonly<Record<string, number>>): number => Object.entries(charStats()).reduce((s, [k, d]) => s + d.w * (stats[k] ?? 0), 0);

/**
 * 영웅들의 범위에서 등급마다의 예산을 셈한다: 그 등급 영웅들의 (무게를 곱한) 합의 가장 큰 값과 칸마다의 가장 큰 값. 그 등급의 영웅이 없으면 합 0 (만들 수 없다).
 * 영웅의 능력치는 atk·hp 두 칸이다 (능력치의 칸이 그 둘이 아닌 게임은 예산의 표를 직접 적는다)
 */
export function budgetFromHeroes(heroes: Readonly<Record<string, HeroDef>> = HEROES): CharBudget[] {
  const stats = charStats();
  return HERO_RARITIES.map((_, r) => {
    const list = Object.values(heroes).filter((h) => h.rarity === r);
    if (!list.length) return { total: 0, cap: {} };
    const cap: Record<string, number> = {};
    let total = 0;
    for (const h of list) {
      const s: Record<string, number> = { atk: h.atk, hp: h.hp };
      total = Math.max(total, Object.entries(stats).reduce((a, [k, d]) => a + d.w * (s[k] ?? 0), 0));
      for (const k of Object.keys(stats)) cap[k] = Math.max(cap[k] ?? 0, s[k] ?? 0);
    }
    return { total, cap };
  });
}
let budgetCache: readonly CharBudget[] | null = null;
/** 지금 쓰는 등급마다의 예산 (CHAR_RULES.budget, 없으면 영웅에서) */
export const charBudgets = (): readonly CharBudget[] => CHAR_RULE_VIEW.budget ?? (budgetCache ??= budgetFromHeroes());

// ---------- 금칙어 고리 ----------
// 캐릭터 정의의 이름·소개는 세 가지를 다 지나야 한다: CHAR_RULES.banned(아래 banKey로, 글자 사이의 모든 것을 무시하고), addCharFilter의 거르개,
// 그리고 대화·이름과 같은 공통 고리(engine/shared/textfilter.ts의 isClean: 틀의 목록, addBannedWords의 낱말, addTextFilter의 거르개). 게임은 공통 고리에 꽂으면 한 번으로 모두에 걸린다.
/** 금칙어 견주기의 바탕: 호환 문자를 펴고(NFKC) 소문자로, 글자와 숫자만 남긴다 (띄어쓰기·문장 부호로 피하지 못하게) */
export const banKey = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** 게임이 꽂는 거르개: 걸리면 true (이름과 소개 모두에 불린다) */
export type CharFilter = (text: string, field: 'name' | 'bio') => boolean;
const filters: CharFilter[] = [];
/** 금칙어 거르개를 더한다 (서버가 시작할 때. 목록은 CHAR_RULES.banned로도 된다). 거르개가 예외를 던지면 걸린 것으로 본다 */
export function addCharFilter(fn: CharFilter): void { filters.push(fn); }
/** 시험이 더한 거르개를 지운다 */
export function clearCharFilters(): void { filters.length = 0; }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const cut = (s: string): string => s.slice(0, 24);

/** 글 하나를 확인한다: 모양, 길이(글자 수), 보이지 않는 글자, 쓸 수 있는 글자, 빈칸, 금칙어. 다듬은 글(NFC)을 돌려준다 */
function checkText(raw: unknown, field: 'name' | 'bio', min: number, max: number, out: CharIssue[], path: string = field): string {
  if (typeof raw !== 'string') { out.push({ code: 'type', path }); return ''; }
  if (raw.length > max * 4 + 16) { out.push({ code: 'length', path, arg: max }); return ''; }
  const s = raw.normalize('NFC'), n = [...s].length;
  if (CONTROL.test(s)) { out.push({ code: 'control', path }); return ''; }
  if (n < min || n > max) { out.push({ code: 'length', path, arg: n < min ? min : max }); return ''; }
  if (!(CHAR_RULE_VIEW.charset ?? CHARSET).test(s)) { out.push({ code: 'charset', path }); return ''; }
  if (s !== s.trim() || /\s{2,}/.test(s)) { out.push({ code: 'space', path }); return ''; }
  const key = banKey(s);
  const hit = (CHAR_RULE_VIEW.banned ?? []).some((w) => { const k = banKey(w); return !!k && key.includes(k); })
    || filters.some((f) => { try { return f(s, field); } catch { return true; } })
    // 대화·이름과 같은 금칙어 고리 (engine/shared/textfilter.ts: 틀의 목록, 게임이 addBannedWords로 더한 낱말, addTextFilter의 거르개). 우회 표기를 펴서 견준다
    || !isClean(s, field === 'name' ? 'charName' : 'charBio');
  if (hit) { out.push({ code: 'banned', path }); return ''; }
  return s;
}

/** 언어마다의 이름·소개(text)에 적을 수 있는 언어의 수 */
export const CHAR_TEXT_LANGS = 8;
const LANG_RE = /^[a-z]{2}(-[a-z]{2})?$/;
/** 언어마다의 이름·소개를 확인한다 (없으면 undefined). 모양이 틀리면 issues에 적는다 */
function checkTexts(raw: unknown, out: CharIssue[]): Record<string, { name: string; bio?: string }> | undefined {
  if (raw === undefined) return undefined;
  if (!isObj(raw)) { out.push({ code: 'type', path: 'text' }); return undefined; }
  const keys = Object.keys(raw);
  if (keys.length > CHAR_TEXT_LANGS) { out.push({ code: 'length', path: 'text', arg: CHAR_TEXT_LANGS }); return undefined; }
  const res: Record<string, { name: string; bio?: string }> = {};
  for (const lang of keys) {
    const v = raw[lang], at = `text.${cut(lang)}`;
    if (!LANG_RE.test(lang)) { out.push({ code: 'extra', path: at }); continue; }
    if (!isObj(v)) { out.push({ code: 'type', path: at }); continue; }
    for (const k of Object.keys(v)) if (k !== 'name' && k !== 'bio') out.push({ code: 'extra', path: `${at}.${cut(k)}` });
    const name = checkText(v.name, 'name', 1, Math.max(1, CHAR_RULE_VIEW.nameMax ?? 16), out, `${at}.name`);
    const bio = v.bio === undefined ? undefined : checkText(v.bio, 'bio', 0, Math.max(0, CHAR_RULE_VIEW.bioMax ?? 120), out, `${at}.bio`);
    res[lang] = bio === undefined ? { name } : { name, bio };
  }
  return res;
}

const KEYS = ['v', 'id', 'name', 'bio', 'text', 'look', 'role', 'rarity', 'stats', 'skills'];
const REQUIRED = ['v', 'id', 'name', 'look', 'rarity', 'stats'];

/**
 * 믿지 않는 캐릭터 정의를 확인한다: 객체나 JSON 글자를 받는다. 통과하면 다듬은 정의(def), 아니면 까닭들(issues, 32개까지).
 * taken: 이미 쓰는 id인가 (내용의 영웅과 겹치는지는 언제나 본다). 예외를 던지지 않는다
 */
export function validateCharDef(input: unknown, taken?: (id: string) => boolean): CharCheck {
  const issues: CharIssue[] = [];
  const fail = (): CharCheck => ({ ok: false, issues: issues.slice(0, ISSUE_MAX) });
  try {
    let raw = input;
    if (typeof raw === 'string') {
      if (raw.length > CHAR_JSON_MAX) { issues.push({ code: 'shape', path: '', arg: CHAR_JSON_MAX }); return fail(); }
      try { raw = JSON.parse(raw); } catch { issues.push({ code: 'shape', path: '' }); return fail(); }
    }
    if (!isObj(raw)) { issues.push({ code: 'shape', path: '' }); return fail(); }
    for (const k of Object.keys(raw)) if (!KEYS.includes(k)) issues.push({ code: 'extra', path: cut(k) });
    for (const k of REQUIRED) if (!Object.hasOwn(raw, k)) issues.push({ code: 'missing', path: k });
    if (issues.length) return fail();

    if (raw.v !== CHAR_V) issues.push({ code: 'version', path: 'v', arg: CHAR_V });
    const id = raw.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) issues.push({ code: 'id', path: 'id' });
    else if (Object.hasOwn(HEROES, id) || taken?.(id)) issues.push({ code: 'idTaken', path: 'id' });
    const name = checkText(raw.name, 'name', 1, Math.max(1, CHAR_RULE_VIEW.nameMax ?? 16), issues);
    const bio = raw.bio === undefined ? '' : checkText(raw.bio, 'bio', 0, Math.max(0, CHAR_RULE_VIEW.bioMax ?? 120), issues);
    const text = checkTexts(raw.text, issues);

    const lk = checkLook(raw.look);
    for (const x of lk.issues) issues.push(x as LookIssue & { code: CharErr });

    const roles = charRoles();
    const role = raw.role === undefined ? '' : raw.role;
    if (typeof role !== 'string') issues.push({ code: 'type', path: 'role' });
    else if (roles.length ? !roles.includes(role) : role !== '') issues.push({ code: 'role', path: 'role', arg: cut(role) });

    const rarity = raw.rarity, budgets = charBudgets();
    const rOk = typeof rarity === 'number' && Number.isInteger(rarity) && rarity >= 0 && rarity < HERO_RARITIES.length && !!budgets[rarity];
    if (!rOk) issues.push({ code: 'rarity', path: 'rarity' });

    const stats: Record<string, number> = {}, defs = charStats();
    if (!isObj(raw.stats)) issues.push({ code: 'type', path: 'stats' });
    else {
      for (const k of Object.keys(raw.stats)) if (!Object.hasOwn(defs, k)) issues.push({ code: 'stat', path: `stats.${cut(k)}` });
      const cap = rOk ? budgets[rarity as number].cap ?? {} : {};
      for (const [k, d] of Object.entries(defs)) {
        const v = raw.stats[k];
        if (v === undefined) { issues.push({ code: 'missing', path: `stats.${k}` }); continue; }
        if (typeof v !== 'number' || !Number.isSafeInteger(v)) { issues.push({ code: 'type', path: `stats.${k}` }); continue; }
        if (v < d.min) { issues.push({ code: 'statMin', path: `stats.${k}`, arg: d.min }); continue; }
        if (cap[k] !== undefined && v > cap[k]) { issues.push({ code: 'statCap', path: `stats.${k}`, arg: cap[k] }); continue; }
        stats[k] = v;
      }
      if (rOk && Object.keys(stats).length === Object.keys(defs).length) {
        const total = budgets[rarity as number].total;
        if (!(charWeight(stats) <= total + 1e-9)) issues.push({ code: 'budget', path: 'stats', arg: total });
      }
    }

    const skills: string[] = [], allowed = charSkills();
    const rs = raw.skills === undefined ? [] : raw.skills;
    if (!Array.isArray(rs)) issues.push({ code: 'type', path: 'skills' });
    else if (rs.length > charMaxSkills()) issues.push({ code: 'skillCount', path: 'skills', arg: charMaxSkills() });
    else rs.forEach((s, i) => {
      if (typeof s !== 'string' || !allowed.includes(s)) issues.push({ code: 'skill', path: `skills.${i}`, arg: typeof s === 'string' ? cut(s) : '' });
      else if (skills.includes(s)) issues.push({ code: 'skillDup', path: `skills.${i}`, arg: s });
      else skills.push(s);
    });

    if (issues.length || !lk.look) return fail();
    return { ok: true, def: { v: CHAR_V, id: id as string, name, bio, ...(text && Object.keys(text).length ? { text } : {}), look: lk.look, role: role as string, rarity: rarity as number, stats, skills }, issues: [] };
  } catch {
    // 여기까지 오면 검증기의 빈틈이다: 통과시키지 않는다
    issues.push({ code: 'shape', path: '' });
    return fail();
  }
}

/** 정의를 영웅의 정의로 (roster에 더할 때: engine/shared/defs/collect.ts의 addHeroDef). 이름은 글 그대로(label), 기술은 첫째 것 */
export function charHero(d: CharDef): HeroDef {
  const s = CHAR_RULE_VIEW.toHero?.(d) ?? { atk: d.stats.atk ?? 1, hp: d.stats.hp ?? 1 };
  return { name: '', label: d.name, rarity: d.rarity, role: d.role, atk: Math.max(1, Math.round(s.atk)), hp: Math.max(1, Math.round(s.hp)), look: d.look, ...(d.skills[0] ? { skill: d.skills[0] } : {}) };
}

// ---------- 알고 있는 정의 (서버의 chars 모듈과 화면이 채운다: 안내문의 이름, 변신 창) ----------
const KNOWN = new Map<string, CharDef>();
/** 알고 있는 정의를 통째로 바꾼다 (서버: 정의가 바뀔 때, 화면: 개인 상태 'chars'를 받을 때) */
export function setKnownChars(list: readonly CharDef[]): void { KNOWN.clear(); for (const d of list) KNOWN.set(d.id, d); }
/** 알고 있는 정의 (없으면 undefined) */
export const knownChar = (id: string): CharDef | undefined => KNOWN.get(id);
/** 알고 있는 정의 모두 (변신한 사람의 겉모습 글자로 그 캐릭터를 찾을 때: 화면의 시트 그림) */
export const knownChars = (): readonly CharDef[] => [...KNOWN.values()];
/** 이름·소개를 고를 언어 (화면이 언어를 바꿀 때 setCharLang으로 알린다. 서버는 정하지 않는다: 정의의 글 그대로) */
let charLang = '';
export function setCharLang(code: string): void { charLang = code; }
/** 그 정의의 그 언어(주지 않으면 setCharLang의 언어)의 이름·소개. 그 언어의 글(text)이 없으면 정의의 name·bio */
export function charText(d: CharDef, lang: string = charLang): { name: string; bio: string } {
  const x = lang && d.text ? d.text[lang] ?? d.text[lang.slice(0, 2)] : undefined;
  return { name: x?.name ?? d.name, bio: x?.bio ?? d.bio };
}
/** 정의의 이름 (지금 언어의 글, 없으면 사람이 쓴 글 그대로. 모르는 id는 id 그대로) */
export const charName = (id: unknown): string => { const d = KNOWN.get(String(id)); return d ? charText(d).name : String(id); };
