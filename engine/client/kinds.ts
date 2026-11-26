// 게임이 등록한 엔티티 종류의 모습 (서버의 g.defineKind와 같은 id): 구조물, 떨어진 물건, 공, 탈것 같은 것.
// 플레이어('p')와 몬스터('m')는 틀이 그린다. 그 밖의 종류는 여기 등록한 모습으로 그리고, 등록하지 않은 종류는 작은 회색 상자다 (entities.ts).
// 이 파일은 표만 갖는다 (three.js를 읽지 않는다): 미니맵·전체 지도도 여기서 점의 색을 읽는다.
import type { Model } from './scene/models';

/** 화면이 아는 그 엔티티: 서버가 놓을 때 준 id, 종류 안의 type, 이름 */
export interface KindInfo { id: number; type: string; name: string }

export interface KindLook {
  /** 모델을 만든다. Model은 { root: THREE.Group } (engine/client의 part, mat, makeBlob로 만들거나 three.js로 직접) */
  model: (e: KindInfo) => Model;
  /** 서버가 실어 보낸 값(KindDef.sync가 돌려준 수들)이 처음 오거나 바뀌었을 때: 모델의 색·크기·켜짐을 맞춘다 */
  update?: (model: Model, vals: readonly number[], e: KindInfo) => void;
  /**
   * 이름표에 쓸 글자. 없으면 이름표를 달지 않는다. 놓일 때(vals는 빈 배열), 실려 온 값(KindDef.sync)이 바뀔 때, 언어가 바뀔 때 다시 부른다:
   * 바뀌는 값(크기, 남은 수)을 이름표에 쓸 수 있다
   */
  label?: (e: KindInfo, vals: readonly number[]) => string;
  /** 위치를 보간하지 않고 받은 자리에 바로 둔다 (순간 이동하는 것). 기본은 사람·몬스터처럼 부드럽게 잇는다 */
  snap?: boolean;
  /** 틀의 움직임(걸을 때 통통 튀기, 맞을 때 번쩍임, 쓰러질 때 줄어들기)을 쓴다. 기본은 자리와 방향만 맞춘다 */
  animate?: boolean;
  /** 이름표의 높이(m). 기본 1.5 */
  h?: number;
  /** 미니맵과 전체 지도에 찍을 점의 색 (css 색). 없으면 찍지 않는다 */
  dot?: string;
  /** 이름표 아래에 체력 막대를 단다 (전투 모듈의 체력 칸: 사람 편에서 싸우는 종류 같은 것). 기본은 달지 않는다 */
  hp?: boolean;
  /** 이 종류가 때리면 날아가는 것의 모양 (registerShot의 id: 틀에는 arrow, bolt). 없으면 붙어서 친다 */
  shot?: (e: KindInfo) => string | undefined;
}

const KINDS = new Map<string, KindLook>();

/** 게임의 엔티티 종류의 모습을 등록한다 (게임의 화면 모듈의 init에서). 같은 id를 다시 등록하면 새 것이 이긴다 */
export function registerKind(id: string, look: KindLook): void { KINDS.set(id, look); }
/** 등록한 모습 (없으면 undefined) */
export const kindLook = (id: string): KindLook | undefined => KINDS.get(id);
