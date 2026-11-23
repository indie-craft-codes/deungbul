// 여러 모듈이 함께 쓰는 것: 월드 정의, 3D 화면, 작은 도우미.
import { NavGrid } from '../../shared/nav';
import { buildWorld } from '../../shared/world';
import { View } from './scene/view';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export const world = buildWorld();
/** 길찾기용 격자. 서버와 같은 월드에서 만들어서 같은 길을 찾는다 */
export const nav = new NavGrid(world.obstacles);
export const view = new View($<HTMLCanvasElement>('view'), world);
