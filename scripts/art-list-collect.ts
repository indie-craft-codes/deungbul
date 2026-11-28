// 필요한 그림 목록의 수집 (art-list.mjs가 tsx --tsconfig <게임의 tsconfig>로 부른다): 게임의 내용 정의(@game/shared/content → 틀의 content.ts)와
// 영어 이름표(@game/client/i18n/en의 enNames·enGame)에서 그 게임이 실제로 보여 주는 그림 칸을 모아 JSON으로 stdout에 쓴다.
// 내용에 없는 칸(손으로 쓴 캐릭터 정의의 영웅, 게임의 장면 이름)은 게임이 games/<게임>/scripts/artneeds.ts의 ART_NEEDS()로 더한다 (없어도 된다).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as C from '@engine/shared/content';
import { ICON_PATHS } from '@engine/client/hud/uiicons';
import { enBase } from '@engine/client/i18n/en';
import type { ContentNames } from '@engine/client/i18n/names';
import { MENU_TABS, ENGINE_TAB_MODS } from '@engine/client/hud/menu/tabs';
import { enGame, enNames } from '@game/client/i18n/en';

/** 칸 하나: 열쇠, 중요도(1 핵심 · 2 권장 · 3 선택), 그림을 만들 사람의 영어 설명 */
export interface ArtNeed { key: string; prio: 1 | 2 | 3; desc: string; append?: boolean }

const [gameDir] = process.argv.slice(2);
const has = (m: string): boolean => (C.MODULES as readonly string[]).includes(m);
const names = enNames as ContentNames;
const eng = enBase(names);
const ui = (k: string): string => ((enGame as { ui?: Record<string, string> }).ui?.[k] ?? (eng.ui as Record<string, string>)[k] ?? (eng as { words?: Record<string, string> }).words?.[k] ?? k);
const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
const STYLE = 'stylized low-poly fantasy, soft lighting';
const out: ArtNeed[] = [];
/** 게임이 덧붙인 설명 (artneeds의 append: 틀이 만든 설명 뒤에 붙인다) */
const flavor = new Map<string, string>();
const add = (key: string, prio: 1 | 2 | 3, desc: string) => { if (!out.some((x) => x.key === key)) out.push({ key, prio, desc: clean(flavor.has(key) ? `${desc} ${flavor.get(key)}` : desc) }); };

// ---------- 게임이 더하는 칸 (먼저: 같은 열쇠는 게임의 설명이 이긴다) ----------
const hook = join(gameDir, 'scripts', 'artneeds.ts');
if (existsSync(hook)) {
  const m = await import(pathToFileURL(hook).href) as { ART_NEEDS?: () => ArtNeed[] };
  for (const n of m.ART_NEEDS?.() ?? []) if (n.append) flavor.set(n.key, n.desc); else add(n.key, n.prio, n.desc);
}

// 유닛 그림을 켠 게임인가 (client/의 useSprites(…)): 켰으면 영웅·적의 그림은 전투의 유닛으로도 쓰이므로 서 있는 온몸으로 받는다
const clientTs = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'public' ? [] : clientTs(join(d, e.name))) : e.name.endsWith('.ts') ? [join(d, e.name)] : []));
const sprites = clientTs(join(gameDir, 'client')).some((f) => readFileSync(f, 'utf8').includes('useSprites('));
const POSE = sprites ? 'full body standing, three-quarter view facing right, feet at the bottom edge' : 'centered';

// ---------- 브랜드 ----------
const title = ui('title');
add('appicon', 1, `App icon for the game "${title}": one bold emblem readable at 32 px, ${STYLE}, square 1024x1024, opaque background, no text`);
add('logo', 1, `Title logo lettering "${title}", fantasy game logo, transparent background, wide`);
add('splash', 1, `Loading screen key art for "${title}", ${STYLE}, leave the center calm for a login card`);

// ---------- 영웅 (내용의 HEROES: 게임이 정의로 더한 영웅은 artneeds가) ----------
const rarName = (r: number): string => ui(C.HERO_RARITIES[r]?.name ?? '') || C.HERO_RARITIES[r]?.id || '';
if (has('roster')) {
  for (const [id, h] of Object.entries(C.HEROES)) add(`portrait:${id}`, 1, `Character portrait of "${ui(h.name)}", ${rarName(h.rarity)} ${ui(C.HERO_ROLES[h.role]?.name ?? h.role)}, full body centered, transparent background, ${STYLE}`);
  C.HERO_RARITIES.forEach((r, i) => add(`frame:${r.id}`, 2, `Card frame for ${rarName(i)} rarity (color #${r.color.toString(16).padStart(6, '0')}), ornate border, transparent center, 4:5`));
}
if (has('gacha')) {
  add('bg:summon', 2, `Summoning ritual backdrop for the gacha reveal, mystical glow, ${STYLE}`);
  add('fx:orb', 3, 'Glowing summoning orb, radiant light burst, transparent background');
  C.HERO_RARITIES.forEach((r, i) => add(`fx:orb-${r.id}`, 3, `Glowing summoning orb tinted for ${rarName(i)} rarity (#${r.color.toString(16).padStart(6, '0')}), transparent background`));
}
if (has('stages')) {
  add('bg:squad', 3, `Squad formation screen backdrop, war room / camp before battle, ${STYLE}`);
  add('bg:result', 3, `Battle result backdrop, victory banner mood, ${STYLE}`);
  // 단계 전투의 배경 (3D 바닥 대신 화면 뒤 그림): 하나, 또는 장마다
  add('bg:battle', 2, `Battle arena backdrop seen from a high three-quarter angle: open floor in the lower two thirds where units stand, scenery and sky at the top, no characters, ${STYLE}`);
  const chs = (C as { CHAPTERS?: readonly { name: string }[] }).CHAPTERS ?? [];
  chs.forEach((ch, i) => add(`bg:battle-${i + 1}`, 3, `Battle arena backdrop for chapter ${i + 1} "${ui(ch.name)}" (else bg:battle): open floor in the lower two thirds, chapter-themed scenery at the top, no characters, ${STYLE}`));
}

// ---------- 적 (이름, 우두머리, 싸우는 법, 크기, 나오는 장) ----------
if (has('combat')) {
  const chapters = (C as { CHAPTERS?: readonly { name: string; stages: readonly { waves: readonly (readonly { type: string }[])[]; boss?: { type: string } }[] }[] }).CHAPTERS ?? [];
  const bosses = new Set<string>(), where = new Map<string, Set<string>>();
  chapters.forEach((ch, i) => { for (const st of ch.stages) { const types = [...st.waves.flat().map((w) => w.type), ...(st.boss ? [st.boss.type] : [])]; if (st.boss) bosses.add(st.boss.type); for (const ty of types) { if (!where.has(ty)) where.set(ty, new Set()); where.get(ty)!.add(`${i + 1}. ${ui(ch.name)}`); } } });
  for (const [id, m] of Object.entries(C.MONSTERS) as [string, { boss?: boolean; behavior?: string; shot?: string; h?: number }][]) {
    const boss = m.boss || bosses.has(id), h = m.h ?? 1.5, size = h >= 3 ? 'huge' : h >= 2 ? 'large' : h >= 1.4 ? 'medium' : 'small';
    const how = m.behavior === 'ranged' ? `ranged attacker (${m.shot ?? 'missile'})` : m.behavior === 'flee' ? 'timid critter that flees' : 'melee fighter';
    const at = where.get(id), stage = !!at;
    add(`enemy:${id}`, 2, `Monster "${names.monsters?.[id as keyof typeof names.monsters] ?? id}": ${size} ${how}${boss ? ', chapter boss, imposing' : ''}${at ? `, appears in ${[...at].join(' / ')}` : ', roams the open field'}. ${stage ? POSE : 'centered'}, transparent background, ${STYLE}`);
    if (sprites && stage) add(`unit:${id}`, 3, `Optional in-battle sprite of "${names.monsters?.[id as keyof typeof names.monsters] ?? id}" if it should differ from enemy:${id} (else enemy:${id} is used). ${POSE}, transparent background`);
  }
}

// ---------- 기술 (들판의 기술 단추에 오르는 직업의 기술) ----------
if (has('combat')) {
  for (const [cls, c] of Object.entries(C.CLASSES) as [string, { skills: readonly string[] }][]) for (const s of c.skills) {
    const t = (names.skills as Record<string, { name: string; info?: string } | undefined>)[s];
    add(`skill:${s}`, 2, `Skill icon "${t?.name ?? s}" (${(names.classes as Record<string, { name: string } | undefined>)[cls]?.name ?? cls}): ${t?.info ?? ''}. Square game ability icon, bold silhouette`);
  }
}

// ---------- 아이템 (손 모양마다 이름이 다른 무기는 그 손의 칸도) ----------
if (has('items')) {
  for (const [id, d] of Object.entries(C.ITEMS) as [string, { kind: string; tier?: number }][]) {
    const t = (names.items as Record<string, string | { name: string; info?: string; [hand: string]: string | undefined } | undefined>)[id];
    const nm = typeof t === 'string' ? t : t?.name ?? id, info = typeof t === 'object' ? t?.info ?? '' : '';
    add(`item:${id}`, 2, `Item icon "${nm}" (${d.kind}${d.tier ? `, tier ${d.tier}` : ''})${info ? `: ${info}` : ''}. Centered, transparent background, ${STYLE}`);
    if (typeof t === 'object') for (const [hand, hn] of Object.entries(t)) if (hand !== 'name' && hand !== 'info' && hn) add(`item:${id}@${hand}`, 2, `Item icon "${hn}" (${hand} version of ${nm}, ${d.kind}). Centered, transparent background, ${STYLE}`);
  }
}

// ---------- 재화 ----------
if (has('economy')) {
  const g = names.currency1?.name ?? 'Gold', s = names.currency2?.name;
  add('cur:gold', 2, `Currency icon "${g}", coins, transparent background`);
  if (s) add('cur:second', 2, `Currency icon "${s}", premium currency, transparent background`);
  if ((C as { STAMINA_RULES?: { enabled?: boolean } }).STAMINA_RULES?.enabled) add('cur:stamina', 2, 'Stamina / energy currency icon, transparent background');
}

// ---------- 이벤트 배너 (홈의 배너 카드: 기간 이벤트와 시즌) ----------
for (const [id, e] of Object.entries((C as { EVENTS?: Record<string, { name: string; note?: string }> }).EVENTS ?? {})) add(`banner:${id}`, 2, `Event banner "${ui(e.name)}"${e.note ? `: ${ui(e.note)}` : ''}. Wide 12:5, ${STYLE}, leave the left third quiet for text`);
if (has('season') && (C as { SEASON?: { name: string } }).SEASON) add('banner:season', 2, `Season pass banner "${ui((C as { SEASON?: { name: string } }).SEASON!.name)}". Wide 12:5, ${STYLE}, leave the left third quiet for text`);

// ---------- 장면 (메뉴의 탭·직업 고르기) ----------
const modeTabs = ((C as { MODE_RULES?: { list?: readonly { tabs?: readonly string[] }[] } }).MODE_RULES?.list ?? []).flatMap((m) => m.tabs ?? []);
const tabs = modeTabs.length ? [...new Set(modeTabs)] : [...MENU_TABS.filter((t) => has(ENGINE_TAB_MODS[t])), 'codex'];
for (const t of tabs) add(`bg:${t}`, 3, `Menu backdrop for the "${t}" tab, subtle, low contrast, ${STYLE}`);
if (has('classes') && Object.keys(C.CLASSES).length > 1) add('bg:classes', 3, `Class selection backdrop: ${Object.keys(C.CLASSES).map((c) => (names.classes as Record<string, { name: string } | undefined>)[c]?.name ?? c).join(', ')}, ${STYLE}`);

// ---------- 줄의 아이콘: 장비 부위·등급·임무·업적·상품·강화 (없으면 글만) ----------
if (has('gear')) for (const slot of C.GEAR_SLOTS as readonly string[]) add(`item:slot-${slot}`, 2, `Equipment slot icon "${(names.gearSlots as Record<string, string> | undefined)?.[slot] ?? slot}" (empty-slot / generic ${slot}), transparent background`);
if (has('roster')) C.HERO_RARITIES.forEach((r, i) => add(`icon:rarity-${r.id}`, 3, `Small rarity badge for ${rarName(i)} (color #${r.color.toString(16).padStart(6, '0')}), gem or crest, transparent background`));
const kinds = new Set<string>();
for (const e of Object.values((C as { EVENTS?: Record<string, { missions?: Record<string, { kind: string }> }> }).EVENTS ?? {})) for (const m of Object.values(e.missions ?? {})) kinds.add(m.kind);
const ach = (C as { ACHIEVES?: Record<string, { name: string; kind: string }> }).ACHIEVES ?? {};
for (const a of Object.values(ach)) kinds.add(a.kind);
for (const k of kinds) add(`icon:mission-${k}`, 2, `Task icon for "${k}" tasks (${({ kill: 'defeat monsters', stage: 'clear stages', pull: 'summon', morph: 'transform', buy: 'shopping' } as Record<string, string>)[k] ?? k}), transparent background`);
for (const [id, a] of Object.entries(ach)) add(`icon:ach-${id}`, 3, `Achievement medal "${ui(a.name)}" (else icon:mission-${a.kind}), transparent background`);
if (has('daily')) for (const id of Object.keys(C.DAILIES)) add(`icon:daily-${id}`, 3, `Daily task icon "${(names.dailies as Record<string, string> | undefined)?.[id] ?? id}", transparent background`);
for (const [id, g] of Object.entries((C as { GOODS?: Record<string, { name: string }> }).GOODS ?? {})) add(`icon:goods-${id}`, 3, `Shop product icon "${ui(g.name)}" (else the first item it gives), transparent background`);
if (has('combat')) for (const [id, sk] of Object.entries(C.SKILL_DEFS) as [string, { effect: { kind: string } }][]) if (sk.effect.kind === 'buff') add(`icon:buff-${id}`, 3, `Small status-effect icon for "${(names.skills as Record<string, { name: string } | undefined>)[id]?.name ?? id}" (else skill:${id}), transparent background`);

// ---------- 움직이는 스프라이트 시트 (useSprites를 켠 게임): 영웅·적·직업 (변신 캐릭터는 영웅과 같은 id) ----------
const SHEET_DESC = 'Sprite sheet, 4 columns x 4 rows of equal cells, transparent background, side view facing right, same foot baseline in every cell. Row 1: idle, 4 frames (slow breathing loop). Row 2: walk, 4 frames (loop). Row 3: attack, 4 frames (wind-up, swing, impact, recover). Row 4: hit, stagger, kneel, fallen (death ends lying down). Same character, scale and lighting in every frame, no text, no grid lines';
if (sprites) {
  for (const n of [...out]) if (/^(portrait|enemy):/.test(n.key)) add(`sheet:${n.key.split(':')[1]}`, 2, `${n.key.startsWith('enemy') ? 'Monster' : 'Character'} ${n.key.split(':')[1]} (same look as ${n.key}). ${SHEET_DESC}`);
  if (has('classes')) for (const c of Object.keys(C.CLASSES)) add(`sheet:${c}`, 2, `Player class "${(names.classes as Record<string, { name: string } | undefined>)[c]?.name ?? c}" for the open field (useSprites field). ${SHEET_DESC}`);
}

// ---------- 화면 아이콘 (SVG가 있다: 바꾸고 싶을 때만) ----------
for (const n of Object.keys(ICON_PATHS)) add(`icon:${n}`, 3, `UI icon "${n}", simple line/glyph icon, 24px grid, transparent background (SVG preferred)`);

process.stdout.write(JSON.stringify(out));
