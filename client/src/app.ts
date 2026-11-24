// 여러 모듈이 함께 쓰는 것: 월드 정의, 3D 화면, 작은 도우미.
import { NavGrid } from '../../shared/nav';
import { buildWorld } from '../../shared/world';
import { ground, leaf } from './deungbul/paint';
import { mountMarkup } from './game/markup';
import { buildScenery } from './scene/scenery';
import { View } from './scene/view';

// 이 게임의 창을 틀의 빈 자리에 붙인다 (틀의 index.html에는 틀의 창만 있다). 화면 코드보다 먼저여야 한다:
// 요소를 잡는 파일은 모두 아래의 $를 여기서 가져가므로 이 파일이 그 파일들보다 먼저 읽히고, 그때 창이 이미 붙어 있다
mountMarkup();

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export const world = buildWorld();
/** 길찾기용 격자. 서버와 같은 월드에서 만들어서 같은 길을 찾는다 */
export const nav = new NavGrid(world.obstacles);
// 화면의 틀에 이 게임의 지형을 넘긴다: 땅과 잎의 색, 건물. 넘기지 않으면 기본 색의 빈 들판이 그려진다
export const view = new View($<HTMLCanvasElement>('view'), world, { ground, leaf, scenery: buildScenery });
