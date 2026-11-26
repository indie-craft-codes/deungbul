// 입력 장치: 마우스, 터치(탭, 핀치), 가상 조이스틱, 키보드. 장치의 신호를 actions의 행동으로 바꾼다.
import { bindKey, onFrame, runKey } from './bus';
import { closeWorldMap, worldMapOpen } from './hud/worldmap';
import { goToTown } from './actions';
import { skillQueueTick, stop, tapAt } from './actions';
import { hasModule } from './mods';
import { $, clamp, view } from './app';
import { blurChat, focusChat } from './hud/chat';
import { S } from './state';

const keys = new Set<string>();
const joy = { x: 0, y: 0 };

/** 글자를 입력하는 중인가 (그동안은 단축키와 방향키를 받지 않는다) */
export const typing = (): boolean => document.activeElement instanceof HTMLInputElement;

/** 지금의 방향 입력. 화면 기준으로 x는 오른쪽, z는 아래쪽이 양수다. */
export function axis(): { x: number; z: number } {
  let x = joy.x, z = joy.y;
  if (!typing()) {
    const has = (...k: string[]) => k.some((v) => keys.has(v));
    x += (has('d', 'arrowright') ? 1 : 0) - (has('a', 'arrowleft') ? 1 : 0);
    z += (has('s', 'arrowdown') ? 1 : 0) - (has('w', 'arrowup') ? 1 : 0);
  }
  return { x, z };
}

function initPointer(canvas: HTMLCanvasElement): void {
  // 터치: 한 손가락 탭은 이동/공격, 두 손가락은 핀치 줌
  const touches = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  let pinch: { d: number; z: number } | null = null, noTap = false;
  const pinchDist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };

  canvas.addEventListener('pointerdown', (ev) => {
    blurChat();
    if (ev.pointerType !== 'touch') { tapAt(ev.clientX, ev.clientY, false); return; }
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY });
    if (touches.size >= 2) { noTap = true; pinch = { d: pinchDist(), z: S.zoom }; }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const p = touches.get(ev.pointerId);
    if (!p) return;
    p.x = ev.clientX; p.y = ev.clientY;
    if (pinch && touches.size >= 2) S.zoom = clamp((pinch.z * pinch.d) / pinchDist(), 0.6, 1.15);
  });
  const end = (ev: PointerEvent) => {
    const p = touches.get(ev.pointerId);
    if (!p) return;
    touches.delete(ev.pointerId);
    if (ev.type === 'pointerup' && !noTap && Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy) < 14) tapAt(ev.clientX, ev.clientY, true);
    if (touches.size < 2) pinch = null;
    if (touches.size === 0) noTap = false;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); S.zoom = clamp(S.zoom + (ev.deltaY > 0 ? 0.08 : -0.08), 0.6, 1.15); }, { passive: false });
}

function initJoystick(): void {
  const stick = $('stick'), knob = $('knob');
  let id: number | null = null;
  const move = (ev: PointerEvent) => {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let dx = ev.clientX - (r.left + R), dy = ev.clientY - (r.top + R);
    const d = Math.hypot(dx, dy), m = Math.min(d, R);
    if (d > 0) { dx = (dx / d) * m; dy = (dy / d) * m; }
    joy.x = dx / R; joy.y = dy / R;
    knob.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    id = null; joy.x = 0; joy.y = 0; knob.style.transform = '';
  };
  stick.addEventListener('pointerdown', (ev) => { id = ev.pointerId; try { stick.setPointerCapture(ev.pointerId); } catch { /* 무시 */ } move(ev); ev.preventDefault(); });
  stick.addEventListener('pointermove', (ev) => { if (ev.pointerId === id) move(ev); });
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
}

function initKeyboard(): void {
  window.addEventListener('keydown', (ev) => {
    if (typing()) { if (ev.key === 'Escape') (document.activeElement as HTMLElement).blur(); return; }
    if (!S.me) return;
    if (ev.key === 'Enter') { ev.preventDefault(); focusChat(); return; }
    if (ev.key === 'Escape') { if (worldMapOpen()) closeWorldMap(); else stop(); return; }
    // 틀의 모듈이 단 키(bus.bindKey: 숫자·Tab은 전투, Q·B는 아이템, R은 자동 사냥, M·N·H는 핵심)와 게임의 키(bus.onKey)
    if (runKey(ev.key)) { if (ev.key === 'Tab') ev.preventDefault(); return; }
    keys.add(ev.key.toLowerCase());
  });
  window.addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
}

export function initInput(): void {
  if (hasModule('combat')) onFrame(skillQueueTick); // 사거리 밖이라 다가가며 기다리는 기술
  bindKey('h', goToTown); // 집(rules.home, 없으면 처음 서는 곳)으로 걸어간다: 핵심
  initPointer(view.renderer.domElement);
  initJoystick();
  initKeyboard();
}
