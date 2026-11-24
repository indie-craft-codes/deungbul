// 여러 모듈이 함께 쓰는 것: 월드 정의, 3D 화면, 작은 도우미.
import { NavGrid } from '../../shared/nav';
import { buildWorld } from '../../shared/world';
import { View, type Look } from './scene/view';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export const world = buildWorld();
/** 길찾기용 격자. 서버와 같은 월드에서 만들어서 같은 길을 찾는다 */
export const nav = new NavGrid(world.obstacles);
/** 3D 화면. startApp이 만든다 (startClient의 맨 처음): 모듈이 읽히는 때에는 아직 없으므로, init이나 그 뒤에 불리는 함수 안에서만 쓴다 */
export let view: View;
/** 화면을 만든다. 지형의 겉모습(땅과 잎의 색, 건물)은 게임이 넘긴다. 넘기지 않으면 기본 색의 빈 들판이 그려진다 */
export function startApp(look?: Look): void { view = new View($<HTMLCanvasElement>('view'), world, look); }
