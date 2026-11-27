// 기능의 점진 공개 (튜토리얼 키트, 묶음 D: docs/screens.md 5·9.2의 16, 쓰는 법은 docs/making-a-game.md 27절).
// 게임이 기능마다 열림 조건(레벨·깬 단계·튜토리얼의 단계: 하나라도 맞으면 열림)을 적으면 —
//   메뉴의 탭: 열리기 전에는 숨기거나(hide) 🔒와 '언제 열리는지'(lock) (menu.ts의 setTabGate)
//   홈의 단추 등 게임의 단추: featureLock(id)(잠김의 까닭)·featureHidden(id)으로 묻는다 (homekit의 dock.locked·hidden)
//   열리는 순간: 새 기능 카드 한 번(hud/reward.ts의 addUnlock, U2의 '새 기능' 카드)과 [가 보기] → 그 탭으로
// 쓰지 않으면 아무것도 바뀌지 않는다 (모든 탭이 처음부터 보인다: 예전과 같다).
import { STAGES, stageIndex } from '../../shared/defs';
import { L, t } from '../i18n';
import { S } from '../state';
import { openMenu, setTabGate } from './menu';
import { addUnlock } from './reward';
import { myStage } from './stagebar';
import { tutReached } from './tutorial';

/** 열림 조건: 적은 것 가운데 하나라도 맞으면 열린다. 아무것도 적지 않으면 늘 열림 */
export interface UnlockWhen {
  /** 레벨 이상 */
  lv?: number;
  /** 이 단계를 깼다 (가장 멀리 깬 단계가 이 단계 이상) */
  stage?: string;
  /** 튜토리얼의 이 단계에 이르렀다 ('튜토리얼 id:단계 id'. 다 보았거나 건너뛰었으면 참) */
  tut?: string;
}
/** 점진 공개할 기능 하나 */
export interface FeatureDef {
  id: string;
  /** 이름 (새 기능 카드의 큰 줄) */
  name: () => string;
  when: UnlockWhen;
  /** 이 기능의 메뉴 탭 (열리기 전에 감추거나 잠근다) */
  tab?: string;
  /** 'hide' 숨김(기본) 또는 'lock' 🔒와 까닭 */
  style?: 'hide' | 'lock';
  /** 열리는 순간의 카드를 띄우지 않는다 (덜 중요한 것: 함께 열리는 탭) */
  quiet?: boolean;
  /** 카드의 [가 보기] (없으면 그 탭을 연다) */
  go?: () => void;
}

const feats = new Map<string, FeatureDef>();
const bestIdx = (): number => stageIndex(myStage()?.best ?? '');
/** 조건이 맞는가 */
export function whenMet(w: UnlockWhen): boolean {
  const keys = Object.keys(w).filter((k) => (w as Record<string, unknown>)[k] !== undefined);
  if (!keys.length) return true;
  if (w.lv !== undefined && (S.me?.lv ?? 0) >= w.lv) return true;
  if (w.stage !== undefined && stageIndex(w.stage) >= 0 && bestIdx() >= stageIndex(w.stage)) return true;
  if (w.tut !== undefined) { const [id, step] = w.tut.split(':'); if (tutReached(id, step ?? '')) return true; }
  return false;
}
/** 잠겼을 때 '언제 열리는지' (단계가 있으면 단계, 없으면 레벨, 튜토리얼뿐이면 '안내를 따라가면') */
export function whenHint(w: UnlockWhen): string {
  if (w.stage !== undefined && STAGES[stageIndex(w.stage)]) return L().fmt.unlockStage(w.stage);
  if (w.lv !== undefined) return L().fmt.unlockLv(w.lv);
  return t('tkLockedTut');
}
/** 그 기능이 열렸는가 (등록하지 않은 id는 열림) */
export const featureOpen = (id: string): boolean => { const f = feats.get(id); return !f || whenMet(f.when); };
/** 잠겼으면 그 까닭, 열렸으면 빈 글 (홈의 dock.locked에) */
export const featureLock = (id: string): string => { const f = feats.get(id); return f && !whenMet(f.when) ? whenHint(f.when) : ''; };
/** 숨길 것인가 (잠겼고 style이 hide) */
export const featureHidden = (id: string): boolean => { const f = feats.get(id); return !!f && (f.style ?? 'hide') === 'hide' && !whenMet(f.when); };

/**
 * 기능의 점진 공개를 켠다 (게임의 화면 모듈의 init에서 한 번). 메뉴의 탭은 등록한 tab마다 감추거나 잠그고, 열리는 순간 새 기능 카드를 띄운다.
 * 예 (메아리 계약): useUnlocks([{ id: 'gacha', tab: 'gacha', name: () => t('tabGacha'), when: { stage: '1-2', tut: 'pact:pull' } }, …])
 */
export function useUnlocks(list: readonly FeatureDef[]): void {
  for (const f of list) {
    feats.set(f.id, f);
    if (!f.quiet) addUnlock({ id: 'feat.' + f.id, name: f.name, open: () => whenMet(f.when), hint: () => whenHint(f.when), go: { label: () => t('celGo'), onClick: f.go ?? (() => { if (f.tab) openMenu(f.tab); }) } });
  }
  const byTab = new Map<string, FeatureDef>();
  for (const f of feats.values()) if (f.tab) byTab.set(f.tab, f);
  setTabGate((tab) => {
    const f = byTab.get(tab);
    if (!f || whenMet(f.when)) return null;
    return (f.style ?? 'hide') === 'hide' ? { hide: true, why: '' } : { hide: false, why: whenHint(f.when) };
  });
}
