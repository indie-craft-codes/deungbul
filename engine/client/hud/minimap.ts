// 미니맵 (PC 전용): 나를 가운데에 두고 주변을 화면과 같은 방향으로 그린다.
// 등탑과 퀘스트 목적지는 범위 밖이어도 가장자리에 붙여 보여 줘서, 어느 쪽인지 항상 알 수 있다.
import { AREAS } from '../../shared/world';
import { $ } from '../app';
import { onSlow } from '../bus';
import { S } from '../state';

const canvas = $('minimap') as HTMLCanvasElement;
const SIZE = 150, HALF = SIZE / 2;
/** 가운데에서 가장자리까지 보이는 거리(m) */
const RANGE = 70;
const K = (HALF / RANGE) * Math.SQRT1_2;
const COLOR = { ground: '#3d6b45', out: '#0e2227', tower: '#f0bb55', dark: '#8a8f8c', shop: '#7fd68a', quest: '#ffe08a', foe: '#e0705f', other: '#eef3ee', ally: '#8fd8ff', me: '#ffffff' };

let ctx: CanvasRenderingContext2D | null = null;

/** 미니맵에 찍는 표식 하나. edge가 켜져 있으면 범위 밖이어도 가장자리에 붙어 방향을 알려 준다 */
export interface Mark { x: number; z: number; color: string; shape: 'dot' | 'square' | 'ring'; edge?: boolean }
const markers: (() => Mark[])[] = [];
/** 표식을 내는 함수를 등록한다. 그릴 때마다 불린다 */
export function addMarks(fn: () => Mark[]): void { markers.push(fn); }
/** 바탕을 칠하는 붓: 월드 좌표로 네모와 원을 칠한다 */
export interface MapBrush { quad(x0: number, z0: number, x1: number, z1: number, color: string): void; disc(x: number, z: number, r: number, color: string): void }
let paint = (b: MapBrush): void => { for (const a of AREAS) b.quad(a.x0, a.z0, a.x1, a.z1, COLOR.ground); };
/** 바탕(땅, 물 같은 지형)을 칠하는 함수를 등록한다. 맵은 게임마다 다르므로, 등록하지 않으면 지역마다 한 가지 색으로 칠한다 */
export function setMapPaint(fn: (b: MapBrush) => void): void { paint = fn; }
/** 표식에 쓰는 색 */
export const MARK = { lit: '#f0bb55', dark: '#8a8f8c', shop: '#7fd68a', quest: '#ffe08a', portal: '#b9a3ff' };

/** 월드 좌표를 미니맵 좌표로. 화면과 같은 방향이다: 오른쪽은 (+x, -z), 아래쪽은 (+x, +z) */
function at(x: number, z: number): { x: number; y: number; d: number } {
  const me = S.me!;
  const dx = x - me.x, dz = z - me.z;
  return { x: HALF + (dx - dz) * K, y: HALF + (dx + dz) * K, d: Math.hypot(dx, dz) };
}

/** 범위 밖이면 가장자리 안쪽으로 당긴다 */
function clamped(x: number, z: number): { x: number; y: number; far: boolean } {
  const p = at(x, z);
  const ox = p.x - HALF, oy = p.y - HALF, r = Math.hypot(ox, oy), max = HALF - 7;
  if (r <= max) return { x: p.x, y: p.y, far: false };
  return { x: HALF + (ox / r) * max, y: HALF + (oy / r) * max, far: true };
}

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  c.fillStyle = color;
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
}

function quad(c: CanvasRenderingContext2D, x0: number, z0: number, x1: number, z1: number, color: string): void {
  const a = at(x0, z0), b = at(x1, z0), d = at(x1, z1), e = at(x0, z1);
  c.fillStyle = color;
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath(); c.fill();
}

function draw(): void {
  const me = S.me;
  if (!ctx || !me || canvas.offsetParent === null) return; // 숨겨져 있으면(폰) 그리지 않는다
  const c = ctx;
  c.save();
  c.clearRect(0, 0, SIZE, SIZE);
  c.beginPath(); c.arc(HALF, HALF, HALF - 1, 0, Math.PI * 2); c.clip();
  c.fillStyle = COLOR.out; c.fillRect(0, 0, SIZE, SIZE);
  // 바탕: 땅과 물은 게임이 칠한다 (setMapPaint)
  paint({
    quad: (x0, z0, x1, z1, color) => quad(c, x0, z0, x1, z1, color),
    disc: (x, z, r, color) => { const p = at(x, z); dot(c, p.x, p.y, r * K * Math.SQRT2, color); },
  });

  // 주변의 몬스터와 사람
  const allies = new Set(S.party.map((m) => m.id));
  for (const r of S.others.values()) {
    if (r.gone || r.dying || allies.has(r.id)) continue;
    const p = at(r.x, r.z);
    if (r.kind === 'm') dot(c, p.x, p.y, 1.8, COLOR.foe);
    else if (r.kind === 'p') dot(c, p.x, p.y, 2.2, COLOR.other);
  }
  // 표식: 등탑, 상인, 퀘스트 목적지처럼 게임마다 다른 것은 밖에서 등록한다 (addMarks)
  for (const fn of markers) {
    for (const m of fn()) {
      const p = m.edge ? clamped(m.x, m.z) : { ...at(m.x, m.z), far: false };
      if (m.shape === 'square') {
        const s = p.far ? 3.5 : 4.5;
        c.fillStyle = m.color; c.fillRect(p.x - s, p.y - s, s * 2, s * 2);
        c.strokeStyle = '#1c1405'; c.lineWidth = 1; c.strokeRect(p.x - s, p.y - s, s * 2, s * 2);
      } else if (m.shape === 'ring') {
        c.strokeStyle = m.color; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, p.far ? 3.5 : 5, 0, Math.PI * 2); c.stroke();
      } else dot(c, p.x, p.y, 2.6, m.color);
    }
  }

  // 파티원: 서버가 알려 준 자리 (시야 밖이어도 보인다)
  for (const m of S.party) {
    if (m.id === me.id) continue;
    const p = clamped(m.x, m.z);
    dot(c, p.x, p.y, 3, COLOR.ally);
  }

  // 나
  dot(c, HALF, HALF, 3.6, '#1c1405');
  dot(c, HALF, HALF, 2.6, COLOR.me);
  c.restore();
}

export function initMinimap(): void {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = SIZE * ratio; canvas.height = SIZE * ratio;
  ctx = canvas.getContext('2d');
  ctx?.scale(ratio, ratio);
  onSlow(draw);
}
