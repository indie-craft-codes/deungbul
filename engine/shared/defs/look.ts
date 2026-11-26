// 겉모습 정의 (틀의 공용 형식): 사람형 캐릭터의 칸마다 부품 id, 색 넷, 무늬, 크기 배율. 서버(검증·저장·전송)와 화면(그리기: engine/client/scene/look.ts)이 함께 읽는다.
// 줄 위와 저장에는 짧은 글자로 싣는다 (encodeLook / decodeLook: '1;b=stout;r=bob;C=3f7fbf'). 버전(맨 앞의 수)을 둔다: 모양을 바꾸면 버전을 올리고 옛 글자를 읽는 길을 남긴다.
// 부품의 목록은 틀의 기본 묶음(BASE_PARTS)에서 게임이 내용의 LOOK_RULES로 더하거나 빼거나 칸을 끈다. 그리는 법은 화면이 등록한다 (registerLookPart).
// 이 형식을 쓰지 않는 게임(겉모습을 적지 않은 사람형)은 예전의 그림 그대로다: 겉모습은 선택 칸이다.
import { LOOK_RULES } from '../content';

/** 겉모습 글자의 버전 */
export const LOOK_V = 1;
/** 겉모습의 칸: 체형, 머리 모양, 머리카락, 모자, 얼굴 장식, 등 장식 */
export const LOOK_SLOTS = ['body', 'head', 'hair', 'hat', 'face', 'back'] as const;
export type LookSlot = (typeof LOOK_SLOTS)[number];
/** 색의 칸: 살갗, 옷, 머리카락, 강조색(모자·무늬·장식) */
export const LOOK_COLORS = ['skin', 'cloth', 'hair', 'accent'] as const;
export type LookColor = (typeof LOOK_COLORS)[number];

/** 겉모습 하나. 적지 않은 칸은 그 칸의 기본 부품(목록의 첫째)·사람형의 색이다 */
export interface Look {
  parts: Partial<Record<LookSlot, string>>;
  colors: Partial<Record<LookColor, number>>;
  /** 옷의 무늬 (강조색으로 그린다). 없으면 'none' */
  pattern?: string;
  /** 키 배율과 너비 배율 (LOOK_RULES.size·width의 범위 안. 없으면 1) */
  size?: number; width?: number;
}

/** 틀의 기본 부품 묶음: 칸마다 첫째가 기본(적지 않았을 때)이다. 체형 plain·머리 box는 틀의 네모난 사람과 같은 모양 */
export const BASE_PARTS: Readonly<Record<LookSlot, readonly string[]>> = {
  body: ['plain', 'stout', 'slim', 'robe'],
  head: ['box', 'round', 'tall', 'wide'],
  hair: ['none', 'short', 'bob', 'long', 'spiky', 'bun', 'tail'],
  hat: ['none', 'cap', 'hood', 'pointed', 'crown', 'helm', 'horns', 'band'],
  face: ['none', 'eyes', 'mask', 'beard', 'goggles'],
  back: ['none', 'cape', 'pack', 'wings', 'scarf', 'shield'],
};
/** 틀의 기본 무늬 */
export const BASE_PATTERNS: readonly string[] = ['none', 'stripe', 'sash', 'belt', 'trim'];

/**
 * 게임이 겉모습의 부품을 고치는 규칙 (내용의 LOOK_RULES. 모두 선택):
 * add 칸마다 더할 부품 id (화면에서 registerLookPart로 그리는 법을 등록한다), remove 칸마다 뺄 부품 id(첫째 기본은 뺄 수 없다),
 * off 끌 칸(그 칸은 기본 부품만 된다), patterns 더하고 뺄 무늬, size·width 키·너비 배율의 범위
 */
export interface LookRules {
  add?: Partial<Record<LookSlot, readonly string[]>>;
  remove?: Partial<Record<LookSlot, readonly string[]>>;
  off?: readonly LookSlot[];
  patterns?: { add?: readonly string[]; remove?: readonly string[] };
  size?: readonly [number, number];
  width?: readonly [number, number];
}
/** 내용의 규칙을 넓은 타입으로 */
export const LOOK_RULE_VIEW: LookRules = LOOK_RULES;
/** 키·너비 배율의 범위 (기본 0.85~1.15, 0.85~1.2) */
export const lookSizeRange = (): readonly [number, number] => LOOK_RULE_VIEW.size ?? [0.85, 1.15];
export const lookWidthRange = (): readonly [number, number] => LOOK_RULE_VIEW.width ?? [0.85, 1.2];

/** 부품·무늬 id의 모양: 영문 소문자로 시작하는 16자 이내 */
const ID_RE = /^[a-z][a-z0-9_]{0,15}$/;
export const isLookId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);

const partCache = new Map<LookSlot, readonly string[]>();
/** 그 칸에서 쓸 수 있는 부품 (게임의 규칙을 넣은 것. 첫째가 기본). 끈 칸은 기본 하나뿐이다 */
export function lookParts(slot: LookSlot): readonly string[] {
  let list = partCache.get(slot);
  if (list) return list;
  const r = LOOK_RULE_VIEW, base = BASE_PARTS[slot];
  if (r.off?.includes(slot)) list = [base[0]];
  else {
    const drop = new Set(r.remove?.[slot] ?? []);
    list = [...new Set([...base.filter((p, i) => i === 0 || !drop.has(p)), ...(r.add?.[slot] ?? []).filter(isLookId)])];
  }
  partCache.set(slot, list);
  return list;
}
/** 쓸 수 있는 무늬 (첫째 'none'이 기본) */
export function lookPatterns(): readonly string[] {
  const p = LOOK_RULE_VIEW.patterns, drop = new Set(p?.remove ?? []);
  return [...new Set([...BASE_PATTERNS.filter((x, i) => i === 0 || !drop.has(x)), ...(p?.add ?? []).filter(isLookId)])];
}
/** 그 칸을 껐는가 */
export const lookSlotOff = (slot: LookSlot): boolean => !!LOOK_RULE_VIEW.off?.includes(slot);

// ---------- 짧은 글자 (줄 위와 저장) ----------
/** 칸 → 글자의 열쇠. 부품은 소문자, 색은 대문자 */
const PART_KEY: Record<LookSlot, string> = { body: 'b', head: 'h', hair: 'r', hat: 't', face: 'f', back: 'k' };
const COLOR_KEY: Record<LookColor, string> = { skin: 'S', cloth: 'C', hair: 'H', accent: 'A' };
const KEY_PART = Object.fromEntries(Object.entries(PART_KEY).map(([k, v]) => [v, k])) as Record<string, LookSlot>;
const KEY_COLOR = Object.fromEntries(Object.entries(COLOR_KEY).map(([k, v]) => [v, k])) as Record<string, LookColor>;
/** 겉모습 글자의 가장 긴 길이 (이보다 길면 읽지 않는다) */
export const LOOK_CODE_MAX = 200;

/** 겉모습을 짧은 글자로: '1;b=stout;r=bob;C=3f7fbf;p=stripe;z=105'. 기본값(기본 부품, 배율 1, 무늬 none)은 적지 않는다 */
export function encodeLook(l: Look): string {
  const out = [String(LOOK_V)];
  for (const s of LOOK_SLOTS) { const p = l.parts[s]; if (p && p !== lookParts(s)[0] && p !== BASE_PARTS[s][0]) out.push(`${PART_KEY[s]}=${p}`); }
  for (const c of LOOK_COLORS) { const v = l.colors[c]; if (v !== undefined) out.push(`${COLOR_KEY[c]}=${(v >>> 0 & 0xffffff).toString(16)}`); }
  if (l.pattern && l.pattern !== 'none') out.push(`p=${l.pattern}`);
  if (l.size !== undefined && l.size !== 1) out.push(`z=${Math.round(l.size * 100)}`);
  if (l.width !== undefined && l.width !== 1) out.push(`w=${Math.round(l.width * 100)}`);
  return out.join(';');
}

/**
 * 짧은 글자를 겉모습으로. 모양이 틀리면(모르는 버전·열쇠, 겹친 열쇠, 이상한 id·색·수, 너무 긺) null. 부품이 목록에 있는지는 보지 않는다 (checkLook이 본다:
 * 화면은 모르는 부품을 기본으로 그린다). 배율은 범위로 자른다
 */
export function decodeLook(code: unknown): Look | null {
  if (typeof code !== 'string' || !code || code.length > LOOK_CODE_MAX) return null;
  const [v, ...fields] = code.split(';');
  if (v !== String(LOOK_V)) return null;
  const l: Look = { parts: {}, colors: {} }, seen = new Set<string>();
  for (const f of fields) {
    const eq = f.indexOf('=');
    if (eq !== 1) return null;
    const k = f[0], val = f.slice(2);
    if (seen.has(k)) return null;
    seen.add(k);
    if (KEY_PART[k]) { if (!isLookId(val)) return null; l.parts[KEY_PART[k]] = val; }
    else if (KEY_COLOR[k]) { if (!/^[0-9a-f]{1,6}$/.test(val)) return null; l.colors[KEY_COLOR[k]] = parseInt(val, 16); }
    else if (k === 'p') { if (!isLookId(val)) return null; l.pattern = val; }
    else if (k === 'z' || k === 'w') {
      if (!/^\d{1,3}$/.test(val)) return null;
      const [a, b] = k === 'z' ? lookSizeRange() : lookWidthRange();
      const n = Math.min(b, Math.max(a, Number(val) / 100));
      if (k === 'z') l.size = n; else l.width = n;
    } else return null;
  }
  return l;
}

/** 겉모습의 틀린 곳 하나: 까닭과 자리 (engine/shared/defs/chardef.ts의 거절 코드와 같은 이름) */
export interface LookIssue { code: 'part' | 'slotOff' | 'color' | 'pattern' | 'size' | 'type' | 'extra'; path: string; arg?: string | number }
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const isColor = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff;

/**
 * 믿지 않는 값(AI의 결과, 줄 위의 것)을 겉모습으로 읽으며 모두 확인한다: 칸·색·무늬가 아는 것이고 목록에 있는가, 배율이 범위 안인가, 모르는 칸이 없는가.
 * 문제가 없으면 look에 다듬은 겉모습을, 있으면 issues에 모두 적는다 (예외를 던지지 않는다)
 */
export function checkLook(raw: unknown, at = 'look'): { look?: Look; issues: LookIssue[] } {
  const issues: LookIssue[] = [];
  if (!isObj(raw)) return { issues: [{ code: 'type', path: at }] };
  for (const k of Object.keys(raw)) if (!['parts', 'colors', 'pattern', 'size', 'width'].includes(k)) issues.push({ code: 'extra', path: `${at}.${k.slice(0, 24)}` });
  const look: Look = { parts: {}, colors: {} };
  const parts = raw.parts ?? {}, colors = raw.colors ?? {};
  if (!isObj(parts)) issues.push({ code: 'type', path: `${at}.parts` });
  else for (const [k, v] of Object.entries(parts)) {
    if (!(LOOK_SLOTS as readonly string[]).includes(k)) { issues.push({ code: 'extra', path: `${at}.parts.${k.slice(0, 24)}` }); continue; }
    const slot = k as LookSlot;
    if (!isLookId(v)) { issues.push({ code: 'part', path: `${at}.parts.${slot}` }); continue; }
    if (lookSlotOff(slot) && v !== BASE_PARTS[slot][0]) { issues.push({ code: 'slotOff', path: `${at}.parts.${slot}`, arg: v }); continue; }
    if (!lookParts(slot).includes(v)) { issues.push({ code: 'part', path: `${at}.parts.${slot}`, arg: v }); continue; }
    look.parts[slot] = v;
  }
  if (!isObj(colors)) issues.push({ code: 'type', path: `${at}.colors` });
  else for (const [k, v] of Object.entries(colors)) {
    if (!(LOOK_COLORS as readonly string[]).includes(k)) { issues.push({ code: 'extra', path: `${at}.colors.${k.slice(0, 24)}` }); continue; }
    if (!isColor(v)) { issues.push({ code: 'color', path: `${at}.colors.${k}` }); continue; }
    look.colors[k as LookColor] = v;
  }
  if (raw.pattern !== undefined) {
    if (!isLookId(raw.pattern) || !lookPatterns().includes(raw.pattern)) issues.push({ code: 'pattern', path: `${at}.pattern`, arg: isLookId(raw.pattern) ? raw.pattern : '' });
    else look.pattern = raw.pattern;
  }
  for (const k of ['size', 'width'] as const) {
    const v = raw[k];
    if (v === undefined) continue;
    const [a, b] = k === 'size' ? lookSizeRange() : lookWidthRange();
    if (typeof v !== 'number' || !Number.isFinite(v) || v < a - 1e-9 || v > b + 1e-9) issues.push({ code: 'size', path: `${at}.${k}` });
    else look[k] = Math.round(v * 100) / 100;
  }
  return issues.length ? { issues } : { look, issues };
}
