// 전체 지도: 내가 있는 지역(들판, 던전 …) 전체를 한 장에 그리고, 장소를 골라 자동으로 걸어가게 한다.
// 열기: N 키, 미니맵 누르기, '지도' 단추(폰 포함). 닫기: N, Esc, 닫기 단추.
//
// 무엇을 그리나
//   바탕     게임이 칠한다(setMapPaint: 땅, 물, 길, 건물). 나무와 바위는 틀이 월드(buildWorld)에서 찍는다.
//   장소     틀이 내용에서 스스로 모은다: 상점(SHOPS), 대장간(FORGES, 잠금), 던전의 문(DUNGEONS), 사냥터(CAMPS: 몬스터·경험치·골드), 우두머리.
//            게임은 자기 장소(마을, 목적지 …)를 addMapPlaces로 더한다. 장소마다 표식과 이름이 그려지고 목록에 실린다.
//   표식     미니맵의 표식(addMarks) 가운데 장소와 겹치지 않는 것 (던전 안의 우두머리 자리 같은 것)
//   이름     구역처럼 큰 이름 (addMapLabels)
//   지금     내 위치와 바라보는 쪽, 걸어가는 길과 목적지, 파티원, 눈에 보이는 몬스터와 사람
// 다루기   휠·+/−·두 손가락으로 확대, 끌어서 옮기기, '내 위치'. 빈 땅을 누르면 그곳으로 걷고, 장소를 누르면 정보 카드가 열린다.
// 자동화   카드나 목록의 '여기로 자동 이동'은 길을 찾아 걸어가고 도착하면 알린다. 사냥터의 '가서 자동 사냥'은 도착하면 자동 사냥을 켠다.
//          직접 움직이면 자동 이동은 그친다 (목적지가 바뀐 것을 보고 안다).
// 방향은 화면·미니맵과 같다: 오른쪽은 (+x, -z), 아래쪽은 (+x, +z).
import { CAMPS, DUNGEON_IDS, FORGES, MONSTERS, SHOPS, dungeonDef, type MonsterDef, type MonsterId } from '../../shared/defs';
import { AREAS, areaAt, clampPoint } from '../../shared/world';
import { autoWalk, moveTo } from '../actions';
import { toggleAuto } from '../auto';
import { $, world } from '../app';
import { onFrame, onSlow } from '../bus';
import { L, onLangChange, t } from '../i18n';
import { dungeonLabel } from '../i18n/names';
import { rules } from '../rules';
import { S } from '../state';
import { feed } from './notify';
import { allLabels, allMarks, cssVar, paintWith } from './minimap';

/** 장소의 갈래. 틀이 아는 것 여덟이고, 게임은 이 가운데 하나를 고른다 (목록의 묶음과 표식의 모양이 갈래를 따른다) */
export type PlaceKind = 'goal' | 'town' | 'shop' | 'forge' | 'dungeon' | 'hunt' | 'boss' | 'other';
/** 지도의 장소 하나: 표식과 이름이 그려지고, 목록에 실리고, 누르면 정보 카드가 열린다 */
export interface MapPlace {
  x: number; z: number;
  name: string;
  kind: PlaceKind;
  /** 카드에 적는 설명 한두 줄 */
  info?: string;
  /** 잠겨 있다 (회색으로 그리고 카드에 적는다). 그래도 걸어갈 수는 있다 */
  locked?: boolean;
  /** 도착하면 자동 사냥을 켜는 단추를 낸다 (사냥터) */
  hunt?: boolean;
}
const placers: (() => MapPlace[])[] = [];
/** 게임의 장소를 더한다 (마을, 목적지 …). 그릴 때마다 불리므로 지금 상태(밝기, 진행 단계)를 그대로 내면 된다 */
export function addMapPlaces(fn: () => MapPlace[]): void { placers.push(fn); }

const KINDS: readonly PlaceKind[] = ['goal', 'town', 'dungeon', 'boss', 'shop', 'forge', 'hunt', 'other'];
const KIND_KEY = { goal: 'kindGoal', town: 'kindTown', shop: 'kindShop', forge: 'kindForge', dungeon: 'kindDungeon', hunt: 'kindHunt', boss: 'kindBoss', other: 'kindOther' } as const;
const KIND_COLOR: Record<PlaceKind, string> = { goal: '#ffe08a', town: '#f0bb55', shop: '#7fd68a', forge: '#ff9a52', dungeon: '#b9a3ff', hunt: '#e88a72', boss: '#ff5a4e', other: '#d6dde0' };
/** 이름을 늘 적는 갈래 (나머지는 확대했을 때만: 작은 지도가 글자로 덮이지 않게) */
const ALWAYS_NAMED = new Set<PlaceKind>(['goal', 'town', 'dungeon', 'boss']);

const ui = {
  panel: $('wmap'), canvas: $('wmapCanvas') as HTMLCanvasElement, btn: $('mapBtn'), stage: $('wmapStage'), list: $('wmapList'), listBtn: $('wmapListBtn'),
  area: $('wmapArea'), tip: $('wmapTip'), card: $('wmapCard'), cardName: $('wmapCardName'), cardKind: $('wmapCardKind'), cardInfo: $('wmapCardInfo'), cardDist: $('wmapCardDist'),
  go: $('wmapGo') as HTMLButtonElement, hunt: $('wmapHunt') as HTMLButtonElement, travel: $('wmapTravel'), travelName: $('wmapTravelName'),
};
const COLOR = { out: '#0e2227', me: '#ffffff', ally: '#8fd8ff', ink: '#1c1405', foe: '#e0705f', other: '#eef3ee', tree: 'rgba(16, 40, 24, .55)', rock: 'rgba(150, 160, 160, .7)', route: '#ffe08a' };

// ---------- 보기: 지역, 배율, 가운데 ----------
/** u = x - z, v = x + z (화면의 가로·세로 방향). 보기는 가운데(cu, cv)와 배율 k(px / m)로 정해진다 */
const view = { area: -1, k: 1, fitK: 1, cu: 0, cv: 0, w: 0, h: 0 };
const ZOOM_MAX = 8;
const areaOfMe = (): number => (S.me ? Math.max(0, areaAt(S.me.x, S.me.z)) : 0);
const toMap = (x: number, z: number) => ({ x: view.w / 2 + (x - z - view.cu) * view.k, y: view.h / 2 + (x + z - view.cv) * view.k });
const toWorld = (sx: number, sy: number) => { const u = (sx - view.w / 2) / view.k + view.cu, v = (sy - view.h / 2) / view.k + view.cv; return { x: (u + v) / 2, z: (v - u) / 2 }; };
const inside = (x: number, z: number, i = view.area): boolean => { const a = AREAS[i]; return !!a && x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1; };
const bounds = (i: number) => {
  const a = AREAS[i], us = [a.x0 - a.z0, a.x0 - a.z1, a.x1 - a.z0, a.x1 - a.z1], vs = [a.x0 + a.z0, a.x0 + a.z1, a.x1 + a.z0, a.x1 + a.z1];
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
};
/** 지도가 지역 밖으로 너무 나가지 않게 가운데를 잡는다 */
function clampView(): void {
  const b = bounds(view.area), hu = view.w / 2 / view.k, hv = view.h / 2 / view.k;
  view.cu = (b.u1 - b.u0) / 2 <= hu ? (b.u0 + b.u1) / 2 : Math.min(b.u1 - hu, Math.max(b.u0 + hu, view.cu));
  view.cv = (b.v1 - b.v0) / 2 <= hv ? (b.v0 + b.v1) / 2 : Math.min(b.v1 - hv, Math.max(b.v0 + hv, view.cv));
}
/** 캔버스의 크기를 창에 맞추고, 지역이 바뀌었으면 지역 전체가 보이게 한다 */
function measure(resetView: boolean): void {
  const i = areaOfMe(), b = bounds(i);
  const listW = ui.list.hidden || narrow() ? 0 : ui.list.offsetWidth + 10;
  const w = Math.max(220, Math.min(980, window.innerWidth * 0.96 - 28) - listW), h = Math.max(200, window.innerHeight * 0.94 - 92);
  view.w = Math.round(w); view.h = Math.round(h);
  view.fitK = Math.min(view.w / (b.u1 - b.u0), view.h / (b.v1 - b.v0)) * 0.96;
  if (resetView || view.area !== i) { view.area = i; view.k = view.fitK; view.cu = (b.u0 + b.u1) / 2; view.cv = (b.v0 + b.v1) / 2; }
  view.k = Math.min(view.fitK * ZOOM_MAX, Math.max(view.fitK, view.k));
  clampView();
  const ratio = Math.min(2, window.devicePixelRatio || 1), c = ui.canvas;
  c.style.width = `${view.w}px`; c.style.height = `${view.h}px`;
  c.width = Math.round(view.w * ratio); c.height = Math.round(view.h * ratio);
  c.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
  ui.area.textContent = areaName(i);
}
const narrow = (): boolean => window.innerWidth < 760;
/** 지역의 이름: 그 지역 안의 큰 이름(구역 이름)이 하나뿐이면 그것, 아니면 비운다 */
function areaName(i: number): string {
  const big = allLabels().filter((l) => l.big && inside(l.x, l.z, i));
  return big.length === 1 ? big[0].text : '';
}
/** (sx, sy)를 붙박은 채 배율을 바꾼다 */
function zoomAt(f: number, sx = view.w / 2, sy = view.h / 2): void {
  const before = toWorld(sx, sy);
  view.k = Math.min(view.fitK * ZOOM_MAX, Math.max(view.fitK, view.k * f));
  const after = toWorld(sx, sy);
  view.cu += before.x - before.z - (after.x - after.z); view.cv += before.x + before.z - (after.x + after.z);
  clampView(); draw();
}
function centerOnMe(): void {
  const me = S.me;
  if (!me) return;
  if (view.k < view.fitK * 2.2) view.k = view.fitK * 2.5;
  view.cu = me.x - me.z; view.cv = me.x + me.z; clampView(); draw();
}

// ---------- 장소 ----------
/** 틀이 내용에서 모으는 장소: 상점, 대장간, 던전의 문, 사냥터와 우두머리 */
function enginePlaces(): MapPlace[] {
  const loc = L(), out: MapPlace[] = [];
  for (const s of SHOPS) out.push({ x: s.x, z: s.z, name: loc.ui.shop, kind: 'shop' });
  for (const f of FORGES) {
    const locked = !!f.needs && !rules.unlocked(f.needs);
    out.push({ x: f.x, z: f.z, name: loc.ui.forge, kind: 'forge', locked, info: locked ? rules.lockHint(f.needs!) || t('mapLocked') : '' });
  }
  for (const id of DUNGEON_IDS) {
    const d = dungeonDef(id), label = dungeonLabel(loc, id);
    out.push({ x: d.portal.x, z: d.portal.z, name: label.name, kind: 'dungeon', info: label.info });
  }
  for (const c of CAMPS) {
    const counts = new Map<string, number>();
    for (const ty of c.types) counts.set(ty, (counts.get(ty) ?? 0) + 1);
    const table: Readonly<Record<string, MonsterDef | undefined>> = MONSTERS;
    const types = [...counts.keys()], defs = c.types.map((ty) => table[ty]).filter((d): d is MonsterDef => !!d);
    if (!defs.length) continue;
    const boss = defs.some((d) => d.boss), name = (ty: string) => loc.monsters[ty as MonsterId] ?? ty;
    const exp = Math.round(defs.reduce((s, d) => s + d.exp, 0) / defs.length), gold = Math.round(defs.reduce((s, d) => s + (d.gold[0] + d.gold[1]) / 2, 0) / defs.length);
    out.push({
      x: c.x, z: c.z, kind: boss ? 'boss' : 'hunt', hunt: true,
      name: types.map(name).join(' · '),
      // 우두머리는 혼자서는 버겁다고 먼저 알린다 ('가서 자동 사냥'으로 혼자 갔다가 금방 쓰러지던 것: 플레이어 재검토)
      info: (boss ? t('mapBossWarn') + ' ' : '') + loc.fmt.mapHuntInfo(types.map((ty) => loc.fmt.mapMobs(name(ty), counts.get(ty)!)).join(', '), exp, gold),
    });
  }
  return out;
}
/** 지금 지역의 장소 모두 (틀의 것 + 게임의 것) */
const places = (): MapPlace[] => named([...placers.flatMap((fn) => fn()), ...enginePlaces()].filter((p) => p.name && inside(p.x, p.z)));
/**
 * 이름이 같은 장소(상인 둘 …)는 가장 가까운 큰 이름(구역)을 덧붙여 가른다: '길 상인 · 잿빛 숲'.
 * 큰 이름으로도 갈리지 않으면 그대로 둔다 (거리로 가를 수 있다). 플레이어 재검토: 목록의 '길 상인' 둘을 가를 수 없었다
 */
function named(ps: MapPlace[]): MapPlace[] {
  const count = new Map<string, number>();
  for (const p of ps) count.set(p.name, (count.get(p.name) ?? 0) + 1);
  if (![...count.values()].some((n) => n > 1)) return ps;
  const zones = allLabels().filter((l) => l.big);
  if (!zones.length) return ps;
  return ps.map((p) => {
    if ((count.get(p.name) ?? 0) < 2) return p;
    const z = zones.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
    return { ...p, name: `${p.name} · ${z.text}` };
  });
}

// ---------- 자동 이동 ----------
/** 자동으로 가는 중인 곳. 도착하면 알리고(hunt면 자동 사냥을 켠다), 목적지가 바뀌면(직접 움직이면) 그친다 */
let travel: { x: number; z: number; name: string; hunt: boolean; retry: number } | null = null;
/** 장소로 자동 이동한다. hunt면 도착해서 자동 사냥을 켠다 */
export function travelTo(p: Pick<MapPlace, 'x' | 'z' | 'name'>, hunt = false): void {
  if (!S.me) return;
  const to = clampPoint(p.x, p.z);
  if (S.auto) toggleAuto(); // 사냥하던 중이면 끄고 간다 (가는 길에 몬스터를 쫓지 않게)
  moveTo(to.x, to.z);
  travel = { x: to.x, z: to.z, name: p.name, hunt, retry: 0 };
  feed(L().fmt.mapTravel(p.name));
  showTravel();
}
export function stopTravel(): void { travel = null; showTravel(); }
function showTravel(): void {
  ui.travel.hidden = !travel;
  ui.travelName.textContent = travel?.name ?? '';
  ui.btn.classList.toggle('on', !!travel);
}
function travelTick(): void {
  const me = S.me;
  if (!travel || !me) return;
  // 목적지가 바뀌었다: 직접 움직였거나 다른 것을 눌렀다
  if (me.moving && Math.hypot(me.tx - travel.x, me.tz - travel.z) > 1.5) { stopTravel(); return; }
  const left = Math.hypot(me.x - travel.x, me.z - travel.z);
  if (left < 2.5 || (!me.moving && left < 8)) {
    const done = travel;
    travel = null; showTravel();
    feed(L().fmt.mapArrived(done.name, done.hunt));
    if (done.hunt && !S.auto) toggleAuto();
    return;
  }
  // 멈췄는데 아직 멀다 (막혔거나 서버가 되돌렸다): 한 번 더 걷게 한다
  if (!me.moving) { if (++travel.retry > 8) stopTravel(); else autoWalk(travel.x, travel.z); } // 여러 번 다시 걸어도 닿지 않으면 그만둔다
}

// ---------- 그리기 ----------
let selected: MapPlace | null = null;
let hover: MapPlace | null = null;

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.fillStyle = color;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}
/** 장소의 표식: 갈래마다 모양이 다르다 */
function icon(c: CanvasRenderingContext2D, p: MapPlace, x: number, y: number, hot: boolean): void {
  const col = p.locked ? '#8a8f8c' : KIND_COLOR[p.kind], s = hot ? 1.35 : 1;
  c.lineWidth = 1.5; c.strokeStyle = COLOR.ink; c.fillStyle = col;
  c.beginPath();
  switch (p.kind) {
    case 'town': c.rect(x - 6 * s, y - 6 * s, 12 * s, 12 * s); break;
    case 'shop': c.arc(x, y, 5.5 * s, 0, Math.PI * 2); break;
    case 'forge': c.moveTo(x, y - 7 * s); c.lineTo(x + 7 * s, y); c.lineTo(x, y + 7 * s); c.lineTo(x - 7 * s, y); c.closePath(); break;
    case 'hunt': c.moveTo(x, y - 7 * s); c.lineTo(x + 6.5 * s, y + 5 * s); c.lineTo(x - 6.5 * s, y + 5 * s); c.closePath(); break;
    case 'boss': c.arc(x, y, 8 * s, 0, Math.PI * 2); break;
    default: c.arc(x, y, 6 * s, 0, Math.PI * 2);
  }
  if (p.kind === 'dungeon' || p.kind === 'goal') { c.lineWidth = 3.5 * s; c.strokeStyle = COLOR.ink; c.stroke(); c.lineWidth = 2.2 * s; c.strokeStyle = col; c.stroke(); }
  else { c.fill(); c.stroke(); }
  if (p.kind === 'boss') { dot(c, x, y, 3 * s, COLOR.ink); }
  if (p.kind === 'goal') { c.fillStyle = col; c.font = `700 ${Math.round(10 * s)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', x, y + 0.5); }
}

function draw(): void {
  const me = S.me, c = ui.canvas.getContext('2d');
  if (!c || !me || ui.panel.hidden) return;
  if (areaOfMe() !== view.area) { measure(true); selected = null; showCard(); renderList(); } // 던전에 들어가거나 나오면 그 지역으로
  const a = AREAS[view.area], font = getComputedStyle(document.body).fontFamily, k = view.k;
  c.clearRect(0, 0, view.w, view.h);
  // 지역 밖의 바탕과 글자 테두리는 게임의 창 색(--ink)을 따른다
  const inkRgb = cssVar('--ink-rgb', '14, 34, 39');
  c.fillStyle = cssVar('--ink', COLOR.out); c.fillRect(0, 0, view.w, view.h);
  // 지역 안만 칠한다
  const corners = [toMap(a.x0, a.z0), toMap(a.x1, a.z0), toMap(a.x1, a.z1), toMap(a.x0, a.z1)];
  c.save();
  c.beginPath(); corners.forEach((p, n) => (n ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.clip();
  paintWith({
    quad: (x0, z0, x1, z1, color) => {
      const q = [toMap(x0, z0), toMap(x1, z0), toMap(x1, z1), toMap(x0, z1)];
      c.fillStyle = color; c.beginPath(); q.forEach((p, n) => (n ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill();
    },
    disc: (x, z, r, color) => { const p = toMap(x, z); dot(c, p.x, p.y, r * k * Math.SQRT2, color); },
  });
  // 나무와 바위: 확대할수록 크게
  const tr = Math.max(0.8, k * 1.1);
  for (const d of world.trees) { if (!inside(d.x, d.z)) continue; const p = toMap(d.x, d.z); dot(c, p.x, p.y, tr * d.s, COLOR.tree); }
  for (const d of world.rocks) { if (!inside(d.x, d.z)) continue; const p = toMap(d.x, d.z); dot(c, p.x, p.y, Math.max(0.8, k * 0.8) * d.s, COLOR.rock); }
  c.restore();
  // 지역의 테두리
  c.strokeStyle = 'rgba(240, 187, 85, .35)'; c.lineWidth = 1.5;
  c.beginPath(); corners.forEach((p, n) => (n ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.stroke();

  // 걸어가는 길: 남은 길목을 잇고, 목적지에 ✕
  if (me.moving) {
    c.strokeStyle = COLOR.route; c.lineWidth = 2; c.setLineDash([5, 5]);
    c.beginPath();
    const p0 = toMap(me.x, me.z); c.moveTo(p0.x, p0.y);
    for (const w of me.path ?? [{ x: me.tx, z: me.tz }]) { const p = toMap(w.x, w.z); c.lineTo(p.x, p.y); }
    c.stroke(); c.setLineDash([]);
    const tq = toMap(me.tx, me.tz);
    c.lineWidth = 2.5; c.beginPath(); c.moveTo(tq.x - 5, tq.y - 5); c.lineTo(tq.x + 5, tq.y + 5); c.moveTo(tq.x + 5, tq.y - 5); c.lineTo(tq.x - 5, tq.y + 5); c.stroke();
  }

  // 미니맵의 표식 가운데 장소와 겹치지 않는 것 (던전 안의 우두머리 자리 같은 것)
  const ps = places();
  for (const m of allMarks()) {
    if (!inside(m.x, m.z) || ps.some((p) => Math.hypot(p.x - m.x, p.z - m.z) < 3)) continue;
    const p = toMap(m.x, m.z);
    if (m.shape === 'square') { c.fillStyle = m.color; c.fillRect(p.x - 5, p.y - 5, 10, 10); c.strokeStyle = COLOR.ink; c.lineWidth = 1; c.strokeRect(p.x - 5, p.y - 5, 10, 10); }
    else if (m.shape === 'ring') { c.strokeStyle = m.color; c.lineWidth = 2.5; c.beginPath(); c.arc(p.x, p.y, 6.5, 0, Math.PI * 2); c.stroke(); }
    else { dot(c, p.x, p.y, 4, COLOR.ink); dot(c, p.x, p.y, 3, m.color); }
  }
  // 눈에 보이는 몬스터와 사람 (내 둘레의 것만 서버가 보낸다)
  const allies = new Set(S.party.map((m) => m.id));
  for (const r of S.others.values()) {
    if (r.gone || r.dying || allies.has(r.id) || !inside(r.x, r.z)) continue;
    const p = toMap(r.x, r.z);
    if (r.kind === 'm') dot(c, p.x, p.y, 2.4, COLOR.foe);
    else if (r.kind === 'p') dot(c, p.x, p.y, 2.8, COLOR.other);
  }
  // 장소의 표식
  for (const p of ps) { const q = toMap(p.x, p.z); icon(c, p, q.x, q.y, p === selected || p === hover); }

  // 이름: 큰 이름(구역) → 장소의 이름. 겹치면 뒤의 것을 건너뛴다
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  const small = view.w >= 520 ? 12 : Math.max(10, Math.round(view.w / 42)), big = small + 4;
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const put = (text: string, x0: number, y: number, size: number, weight: number, fill: string): void => {
    c.font = `${weight} ${size}px ${font}`;
    const tw = c.measureText(text).width + 6;
    // 지도의 가장자리에서 잘리지 않게 안쪽으로 당긴다
    const x = Math.min(view.w - tw / 2 - 2, Math.max(tw / 2 + 2, x0));
    const w = tw, box = { x0: x - w / 2, y0: y - size / 2 - 2, x1: x + w / 2, y1: y + size / 2 + 2 };
    if (taken.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) return;
    taken.push(box);
    c.strokeStyle = `rgba(${inkRgb}, .88)`; c.lineWidth = 3.5; c.strokeText(text, x, y);
    c.fillStyle = fill; c.fillText(text, x, y);
  };
  const zoomed = k >= view.fitK * 1.8;
  const order = [...ps].sort((p, q) => (p === selected ? -1 : q === selected ? 1 : KINDS.indexOf(p.kind) - KINDS.indexOf(q.kind)));
  for (const p of order) {
    if (!zoomed && !ALWAYS_NAMED.has(p.kind) && p !== selected && p !== hover) continue;
    const q = toMap(p.x, p.z);
    put(p.name, q.x, q.y + 15, small, 600, p.locked ? '#a9b0ad' : '#eef3ee');
  }
  for (const l of allLabels()) {
    if (!inside(l.x, l.z)) continue;
    const q = toMap(l.x, l.z);
    put(l.text, q.x, q.y, l.big ? big : small, l.big ? 700 : 600, l.big ? '#f3ead2' : '#e6efe8');
  }

  // 파티원과 나 (맨 위)
  for (const m of S.party) if (m.id !== me.id && inside(m.x, m.z)) { const p = toMap(m.x, m.z); dot(c, p.x, p.y, 5, COLOR.ink); dot(c, p.x, p.y, 3.8, COLOR.ally); put(m.name, p.x, p.y - 12, small - 1, 600, COLOR.ally); }
  const p = toMap(me.x, me.z);
  c.strokeStyle = 'rgba(255, 255, 255, .55)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, 10 + (performance.now() / 160) % 6, 0, Math.PI * 2); c.stroke();
  // 바라보는 쪽: face는 화면의 방향과 같은 각(atan2(dx, dz))이다
  const fx = Math.sin(me.face), fz = Math.cos(me.face), fu = fx - fz, fv = fx + fz, fl = Math.hypot(fu, fv) || 1;
  c.fillStyle = COLOR.me; c.strokeStyle = COLOR.ink; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(p.x + (fu / fl) * 11, p.y + (fv / fl) * 11); c.lineTo(p.x + (-fv / fl) * 5, p.y + (fu / fl) * 5); c.lineTo(p.x - (-fv / fl) * 5, p.y - (fu / fl) * 5); c.closePath(); c.fill(); c.stroke();
  dot(c, p.x, p.y, 5.2, COLOR.ink); dot(c, p.x, p.y, 4, COLOR.me);

  // 축척: 화면에서 80px쯤 되는 둥근 거리
  const meters = [5, 10, 20, 25, 50, 100, 200].find((m) => m * k * Math.SQRT2 >= 60) ?? 200, len = meters * k * Math.SQRT2;
  c.strokeStyle = '#eef3ee'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(12, view.h - 14); c.lineTo(12 + len, view.h - 14); c.moveTo(12, view.h - 18); c.lineTo(12, view.h - 10); c.moveTo(12 + len, view.h - 18); c.lineTo(12 + len, view.h - 10); c.stroke();
  c.font = `600 11px ${font}`; c.textAlign = 'left'; c.fillStyle = '#eef3ee'; c.fillText(`${meters}m`, 16 + len, view.h - 14);
}

// ---------- 카드와 목록 ----------
const distText = (p: { x: number; z: number }): string => {
  const me = S.me;
  if (!me) return '';
  const d = Math.hypot(p.x - me.x, p.z - me.z);
  return L().fmt.mapDist(d, d / Math.max(0.1, rules.speed()));
};
function showCard(): void {
  ui.card.hidden = !selected;
  if (!selected) return;
  const p = selected;
  ui.cardName.textContent = p.name;
  ui.cardKind.textContent = t(KIND_KEY[p.kind]);
  ui.cardInfo.textContent = p.info ?? '';
  ui.cardInfo.hidden = !p.info;
  ui.cardDist.textContent = distText(p);
  ui.hunt.hidden = !p.hunt;
}
function select(p: MapPlace | null): void { selected = p; showCard(); draw(); }

/** 목록에 적힌 장소들의 거리 칸. 느린 주기에는 거리만 고쳐 쓴다 (줄을 새로 만들면 누르던 단추가 사라진다) */
let rows: { p: MapPlace; d: HTMLElement }[] = [];
let listSig = '';
function refreshList(): void {
  const sig = places().map((p) => `${p.kind}:${p.name}:${p.locked ? 1 : 0}`).join('|') + L().ui.mapList;
  if (sig !== listSig) { renderList(); return; }
  for (const r of rows) r.d.textContent = distText(r.p);
}
function renderList(): void {
  const ps = places(), me = S.me;
  listSig = ps.map((p) => `${p.kind}:${p.name}:${p.locked ? 1 : 0}`).join('|') + L().ui.mapList;
  rows = [];
  ui.list.replaceChildren();
  if (!ps.length) { const n = document.createElement('div'); n.className = 'note'; n.textContent = t('mapNone'); ui.list.append(n); return; }
  const far = (p: MapPlace) => (me ? Math.hypot(p.x - me.x, p.z - me.z) : 0);
  for (const kind of KINDS) {
    const group = ps.filter((p) => p.kind === kind).sort((p, q) => far(p) - far(q));
    if (!group.length) continue;
    const head = document.createElement('div');
    head.className = 'wmkind'; head.textContent = t(KIND_KEY[kind]);
    head.style.setProperty('--kc', KIND_COLOR[kind]);
    ui.list.append(head);
    for (const p of group) {
      const row = document.createElement('div');
      row.className = 'wmrow' + (p.locked ? ' locked' : '');
      const what = document.createElement('button');
      what.type = 'button'; what.className = 'plain wmname';
      what.textContent = p.name;
      const d = document.createElement('span'); d.className = 'note'; d.textContent = distText(p);
      what.append(document.createElement('br'), d);
      rows.push({ p, d });
      what.addEventListener('click', () => { focusOn(p); select(p); });
      const go = document.createElement('button');
      go.type = 'button'; go.className = 'wmgo'; go.textContent = p.hunt ? t('mapHunt') : t('mapGo');
      go.addEventListener('click', () => { travelTo(p, !!p.hunt); closeWorldMap(); });
      row.append(what, go);
      ui.list.append(row);
    }
  }
}
/** 그 장소가 보이게 옮긴다 (배율은 조금 키운다) */
function focusOn(p: MapPlace): void {
  if (view.k < view.fitK * 2) view.k = view.fitK * 2.2;
  view.cu = p.x - p.z; view.cv = p.x + p.z; clampView();
}

// ---------- 누르기, 끌기, 확대 ----------
function placeAt(sx: number, sy: number): MapPlace | null {
  let best: MapPlace | null = null, bd = 14;
  for (const p of places()) { const q = toMap(p.x, p.z), d = Math.hypot(q.x - sx, q.y - sy); if (d < bd) { bd = d; best = p; } }
  return best;
}
function initPointer(): void {
  const c = ui.canvas, pts = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number } | null = null, moved = false, pinch = 0;
  const local = (ev: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  c.addEventListener('pointerdown', (ev) => {
    try { c.setPointerCapture(ev.pointerId); } catch { /* 무시 */ }
    pts.set(ev.pointerId, local(ev));
    if (pts.size === 1) { downAt = local(ev); moved = false; }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); moved = true; }
  });
  c.addEventListener('pointermove', (ev) => {
    const at = local(ev), prev = pts.get(ev.pointerId);
    if (!prev) { // 누르지 않고 움직인다 (PC): 장소 위면 이름을 띄운다
      const p = placeAt(at.x, at.y);
      if (p !== hover) { hover = p; c.style.cursor = p ? 'pointer' : 'crosshair'; draw(); }
      ui.tip.hidden = !p;
      if (p) { ui.tip.textContent = `${p.name} · ${t(KIND_KEY[p.kind])}`; ui.tip.style.left = `${at.x + 14}px`; ui.tip.style.top = `${at.y + 10}px`; }
      return;
    }
    pts.set(ev.pointerId, at);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && d > 0) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d; return;
    }
    if (downAt && !moved && Math.hypot(at.x - downAt.x, at.y - downAt.y) > 6) moved = true;
    if (moved) { view.cu -= (at.x - prev.x) / view.k; view.cv -= (at.y - prev.y) / view.k; clampView(); draw(); }
  });
  const up = (ev: PointerEvent) => {
    const had = pts.delete(ev.pointerId);
    if (!had || pts.size > 0) return;
    pinch = 0;
    if (moved || !downAt) { downAt = null; return; }
    const at = local(ev), p = placeAt(at.x, at.y);
    downAt = null;
    if (p) { select(p); return; }
    // 빈 땅: 그곳으로 걷는다 (자동 이동은 그친다)
    const w = toWorld(at.x, at.y);
    if (!inside(w.x, w.z)) { select(null); return; }
    stopTravel();
    const to = clampPoint(w.x, w.z);
    moveTo(to.x, to.z);
    select(null);
  };
  c.addEventListener('pointerup', up);
  c.addEventListener('pointercancel', (ev) => { pts.delete(ev.pointerId); pinch = 0; downAt = null; });
  c.addEventListener('pointerleave', () => { if (hover) { hover = null; ui.tip.hidden = true; draw(); } });
  c.addEventListener('wheel', (ev) => { ev.preventDefault(); const r = c.getBoundingClientRect(); zoomAt(ev.deltaY < 0 ? 1.25 : 0.8, ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });
}

// ---------- 열고 닫기 ----------
export const worldMapOpen = (): boolean => !ui.panel.hidden;
export function closeWorldMap(): void { ui.panel.hidden = true; ui.btn.setAttribute('aria-pressed', 'false'); ui.tip.hidden = true; hover = null; }
export function toggleWorldMap(): void {
  if (!S.me) return;
  if (worldMapOpen()) { closeWorldMap(); return; }
  ui.panel.hidden = false; ui.btn.setAttribute('aria-pressed', 'true');
  if (narrow()) ui.list.hidden = true;
  ui.listBtn.setAttribute('aria-pressed', String(!ui.list.hidden));
  measure(view.area !== areaOfMe());
  renderList(); showCard(); draw();
}

export function initWorldMap(): void {
  ui.btn.addEventListener('click', (e) => { toggleWorldMap(); (e.currentTarget as HTMLElement).blur(); });
  $('minimap').addEventListener('click', toggleWorldMap);
  $('wmapClose').addEventListener('click', closeWorldMap);
  $('wmapIn').addEventListener('click', () => zoomAt(1.4));
  $('wmapOut').addEventListener('click', () => zoomAt(1 / 1.4));
  $('wmapMe').addEventListener('click', centerOnMe);
  $('wmapStop').addEventListener('click', () => { stopTravel(); if (S.me?.moving) moveTo(S.me.x, S.me.z); });
  ui.listBtn.addEventListener('click', () => { ui.list.hidden = !ui.list.hidden; ui.listBtn.setAttribute('aria-pressed', String(!ui.list.hidden)); measure(false); renderList(); draw(); });
  ui.go.addEventListener('click', () => { if (selected) { travelTo(selected); closeWorldMap(); } });
  ui.hunt.addEventListener('click', () => { if (selected) { travelTo(selected, true); closeWorldMap(); } });
  initPointer();
  // 열려 있는 동안은 매 프레임 (내 위치가 부드럽게 움직이게), 목록과 카드의 거리는 느린 주기로
  onFrame(() => { if (worldMapOpen()) draw(); });
  onSlow(() => { travelTick(); if (worldMapOpen()) { if (selected) ui.cardDist.textContent = distText(selected); if (!ui.list.hidden) refreshList(); } });
  window.addEventListener('resize', () => { if (worldMapOpen()) { measure(false); draw(); } });
  onLangChange(() => { if (worldMapOpen()) { measure(false); renderList(); showCard(); draw(); } });
}
