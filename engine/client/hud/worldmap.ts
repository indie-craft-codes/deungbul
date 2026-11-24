// 전체 지도: 내가 있는 지역(들판, 던전 …) 전체를 한 장에 그린다. 누른 곳으로 걸어간다. (단축키 N, 미니맵이나 '지도' 단추를 눌러도 열린다)
// 바탕과 표식은 미니맵과 같은 것을 쓴다(setMapPaint, addMarks). 게임은 이름(구역, 마을 …)을 addMapLabels로 더한다.
// 방향은 화면·미니맵과 같다: 오른쪽은 (+x, -z), 아래쪽은 (+x, +z). 그래서 네모난 지역이 마름모로 보인다.
import { AREAS, areaAt, clampPoint } from '../../shared/world';
import { moveTo } from '../actions';
import { $ } from '../app';
import { onSlow } from '../bus';
import { onLangChange } from '../i18n';
import { S } from '../state';
import { allLabels, allMarks, paintWith } from './minimap';

const ui = { panel: $('wmap'), canvas: $('wmapCanvas') as HTMLCanvasElement, btn: $('mapBtn') };
const COLOR = { out: '#0e2227', me: '#ffffff', ally: '#8fd8ff', ink: '#1c1405' };
/** 지역 둘레의 여백(px) */
const PAD = 14;

/** 지금 그리는 지역과 화면 좌표로 바꾸는 값. 열 때와 창의 크기가 바뀔 때 다시 구한다 */
let fit = { area: 0, k: 1, u0: 0, v0: 0, w: 0, h: 0 };

const areaOfMe = (): number => (S.me ? Math.max(0, areaAt(S.me.x, S.me.z)) : 0);
/** 월드 좌표 → 지도의 좌표(css px) */
const toMap = (x: number, z: number) => ({ x: PAD + (x - z - fit.u0) * fit.k, y: PAD + (x + z - fit.v0) * fit.k });
/** 지도의 좌표(css px) → 월드 좌표 */
const toWorld = (sx: number, sy: number) => { const u = (sx - PAD) / fit.k + fit.u0, v = (sy - PAD) / fit.k + fit.v0; return { x: (u + v) / 2, z: (v - u) / 2 }; };
const inside = (x: number, z: number, i: number): boolean => { const a = AREAS[i]; return !!a && x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1; };

/** 지역 하나가 창에 꽉 차게 배율을 구하고 캔버스의 크기를 맞춘다 */
function measure(): void {
  const i = areaOfMe(), a = AREAS[i];
  const us = [a.x0 - a.z0, a.x0 - a.z1, a.x1 - a.z0, a.x1 - a.z1], vs = [a.x0 + a.z0, a.x0 + a.z1, a.x1 + a.z0, a.x1 + a.z1];
  const u0 = Math.min(...us), v0 = Math.min(...vs), du = Math.max(...us) - u0, dv = Math.max(...vs) - v0;
  // 창 안에 들어갈 만큼: 폰에서는 화면 거의 전부, PC에서는 너무 크지 않게
  const maxW = Math.min(900, window.innerWidth * 0.96 - 24) - PAD * 2, maxH = window.innerHeight * 0.94 - 84 - PAD * 2;
  const k = Math.max(0.2, Math.min(maxW / du, maxH / dv));
  fit = { area: i, k, u0, v0, w: Math.round(du * k + PAD * 2), h: Math.round(dv * k + PAD * 2) };
  const ratio = Math.min(2, window.devicePixelRatio || 1), c = ui.canvas;
  c.style.width = `${fit.w}px`; c.style.height = `${fit.h}px`;
  c.width = Math.round(fit.w * ratio); c.height = Math.round(fit.h * ratio);
  c.getContext('2d')?.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.fillStyle = color;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

function draw(): void {
  const me = S.me, c = ui.canvas.getContext('2d');
  if (!c || !me || ui.panel.hidden) return;
  if (areaOfMe() !== fit.area) measure(); // 던전에 들어가거나 나오면 그 지역으로 바꾼다
  const a = AREAS[fit.area], font = getComputedStyle(document.body).fontFamily;
  c.clearRect(0, 0, fit.w, fit.h);
  // 지역의 테두리 안만 칠한다
  const corners = [toMap(a.x0, a.z0), toMap(a.x1, a.z0), toMap(a.x1, a.z1), toMap(a.x0, a.z1)];
  c.save();
  c.beginPath(); corners.forEach((p, n) => (n ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath();
  c.fillStyle = COLOR.out; c.fill();
  c.clip();
  paintWith({
    quad: (x0, z0, x1, z1, color) => {
      const q = [toMap(x0, z0), toMap(x1, z0), toMap(x1, z1), toMap(x0, z1)];
      c.fillStyle = color; c.beginPath(); q.forEach((p, n) => (n ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill();
    },
    disc: (x, z, r, color) => { const p = toMap(x, z); dot(c, p.x, p.y, r * fit.k * Math.SQRT2, color); },
  });
  c.restore();

  // 표식 (등탑, 상인, 퀘스트 목적지, 던전 입구 …): 이 지역 안의 것만
  for (const m of allMarks()) {
    if (!inside(m.x, m.z, fit.area)) continue;
    const p = toMap(m.x, m.z);
    if (m.shape === 'square') { c.fillStyle = m.color; c.fillRect(p.x - 5, p.y - 5, 10, 10); c.strokeStyle = COLOR.ink; c.lineWidth = 1; c.strokeRect(p.x - 5, p.y - 5, 10, 10); }
    else if (m.shape === 'ring') { c.strokeStyle = m.color; c.lineWidth = 2.5; c.beginPath(); c.arc(p.x, p.y, 6.5, 0, Math.PI * 2); c.stroke(); }
    else { dot(c, p.x, p.y, 4, COLOR.ink); dot(c, p.x, p.y, 3, m.color); }
  }
  // 이름: 구역처럼 큰 이름과 마을·던전 같은 작은 이름
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  // 지도가 작으면(폰) 글자도 줄인다: 작은 이름은 지도의 크기에 맞추되 9px보다 작게는 하지 않는다
  const small = fit.w >= 420 ? 12 : Math.max(9, Math.round(fit.w / 35)), big = small + 3;
  for (const l of allLabels()) {
    if (!inside(l.x, l.z, fit.area)) continue;
    const p = toMap(l.x, l.z);
    c.font = `${l.big ? 700 : 600} ${l.big ? big : small}px ${font}`;
    c.strokeStyle = 'rgba(14, 34, 39, .85)'; c.lineWidth = 3.5; c.strokeText(l.text, p.x, p.y);
    c.fillStyle = l.big ? '#f3ead2' : '#e6efe8'; c.fillText(l.text, p.x, p.y);
  }
  // 파티원과 나
  for (const m of S.party) if (m.id !== me.id && inside(m.x, m.z, fit.area)) { const p = toMap(m.x, m.z); dot(c, p.x, p.y, 4.5, COLOR.ink); dot(c, p.x, p.y, 3.5, COLOR.ally); }
  const p = toMap(me.x, me.z);
  c.strokeStyle = 'rgba(255, 255, 255, .55)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, 9 + (performance.now() / 160) % 5, 0, Math.PI * 2); c.stroke();
  dot(c, p.x, p.y, 5.2, COLOR.ink); dot(c, p.x, p.y, 4, COLOR.me);
  // 걸어가는 중이면 목적지
  if (me.moving && inside(me.tx, me.tz, fit.area)) { const t = toMap(me.tx, me.tz); c.strokeStyle = '#ffe08a'; c.lineWidth = 2; c.beginPath(); c.moveTo(t.x - 4, t.y - 4); c.lineTo(t.x + 4, t.y + 4); c.moveTo(t.x + 4, t.y - 4); c.lineTo(t.x - 4, t.y + 4); c.stroke(); }
}

export const worldMapOpen = (): boolean => !ui.panel.hidden;
export function closeWorldMap(): void { ui.panel.hidden = true; ui.btn.setAttribute('aria-pressed', 'false'); }
export function toggleWorldMap(): void {
  if (!S.me) return;
  if (worldMapOpen()) { closeWorldMap(); return; }
  ui.panel.hidden = false; ui.btn.setAttribute('aria-pressed', 'true');
  measure(); draw();
}

export function initWorldMap(): void {
  ui.btn.addEventListener('click', (e) => { toggleWorldMap(); (e.currentTarget as HTMLElement).blur(); });
  $('minimap').addEventListener('click', toggleWorldMap);
  $('wmapClose').addEventListener('click', closeWorldMap);
  // 누른 곳으로 걸어간다 (이 지역 안이면). 길은 화면의 길찾기가 찾는다
  ui.canvas.addEventListener('click', (ev) => {
    const r = ui.canvas.getBoundingClientRect(), w = toWorld(ev.clientX - r.left, ev.clientY - r.top);
    if (!inside(w.x, w.z, fit.area)) return;
    const to = clampPoint(w.x, w.z);
    moveTo(to.x, to.z);
    closeWorldMap();
  });
  onSlow(draw);
  window.addEventListener('resize', () => { if (worldMapOpen()) { measure(); draw(); } });
  onLangChange(draw);
}
