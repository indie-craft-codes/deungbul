// 카메라가 어디를 얼마나 멀리서 비추는가. 각도는 고정이다(쿼터뷰): 비추는 곳과 배율만 바뀐다 (그리는 것은 scene/view.ts의 follow).
// 기본은 틀의 것: 접속 전에는 처음 자리(MAP.spawn) 둘레를 천천히 돌고, 접속한 뒤에는 내 캐릭터를 S.zoom 배율로 비춘다.
// 거리와 배율의 범위는 내용의 CAMERA(engine/shared/defaults.ts), 비추는 곳은 게임이 setCameraAim으로 정한다.
import { CAMERA } from '../shared/defs';
import { MAP } from '../shared/world';
import type { View } from './scene/view';
import { S } from './state';

/** 카메라가 비출 곳: 땅 위의 점(x, z)과, 주면 그 배율(주지 않으면 사람이 휠·두 손가락으로 고른 S.zoom) */
export interface CameraAim { x: number; z: number; zoom?: number }

let aimFn: ((me: { x: number; z: number } | null, now: number) => CameraAim | null) | null = null;

/**
 * 카메라가 비출 곳을 게임이 정한다 (화면 모듈의 init에서). 매 프레임 불린다: me는 내 캐릭터의 자리(접속 전이면 null).
 * null을 돌려주면 그 프레임은 틀의 기본(나, 접속 전에는 처음 자리를 도는 것)이다. 예:
 * - 공을 따라가기: (me) => ball && me ? { x: me.x + (ball.x - me.x) * 0.4, z: me.z + (ball.z - me.z) * 0.4 } : null
 * - 경기장 전체: () => ({ x: 0, z: 0, zoom: fitZoom(-24, -14, 24, 14) })
 * 다시 틀의 기본으로 돌리려면 setCameraAim(null)
 */
export function setCameraAim(fn: ((me: { x: number; z: number } | null, now: number) => CameraAim | null) | null): void { aimFn = fn; }

/** 지금의 배율 범위 안으로 (휠·두 손가락이 쓴다) */
export const clampZoom = (z: number): number => Math.min(CAMERA.zoomMax, Math.max(CAMERA.zoomMin, z));

let view: View | null = null;
/** 틀이 시작할 때 한 번 (main.ts) */
export function bindCameraView(v: View): void { view = v; }

/**
 * 네모(x0~x1, z0~z1)가 가운데에 놓였을 때 화면에 다 들어오는 가장 작은 배율 (margin: 가장자리에 남길 몫, 0.08이면 8%).
 * 화면의 크기·비율(폰 세로의 밀린 그리기 범위 포함)을 따른다: 화면이 바뀌면 다른 값이 나오므로 매 프레임 불러도 된다 (셈은 가볍다)
 */
export function fitZoom(x0: number, z0: number, x1: number, z1: number, margin = 0.08): number {
  return view ? view.fitZoom(x0, z0, x1, z1, CAMERA.dist, margin) : CAMERA.zoom;
}

/** 이번 프레임에 비출 곳 (main.ts의 frame이 부른다). shake: 화면 흔들림 */
export function cameraAim(now: number, shake: { x: number; z: number }): { x: number; z: number; dist: number } {
  const me = S.me;
  const aim = aimFn?.(me ? { x: me.x, z: me.z } : null, now) ?? null;
  if (aim) return { x: aim.x + shake.x, z: aim.z + shake.z, dist: CAMERA.dist * (aim.zoom ?? S.zoom) };
  if (me) return { x: me.x + shake.x, z: me.z + shake.z, dist: CAMERA.dist * S.zoom };
  return { x: MAP.spawn.x + Math.cos(now / 9000) * 6, z: MAP.spawn.z + Math.sin(now / 9000) * 6, dist: CAMERA.dist * CAMERA.gate };
}
