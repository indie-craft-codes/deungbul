// 이 게임의 튜토리얼과 설정 칸 (틀의 addTutorial, addSetting: engine/client/hud/tutorial.ts, settings.ts. 튜토리얼 키트: hud/unlocks.ts).
// 튜토리얼은 직업을 고른 뒤에 한 번 뜬다 (docs/screens.md 5절·9.4의 16): 탑 — 이름 짓기 → 1-1 → 결과 창 설명 → 1-2 → 첫 뽑기 → 첫 편성 확인 → 게임 바꾸기 →
// 울림골 — 걷기 → 공격 → 변신 → 자동 사냥. 메뉴의 설정 탭에서 다시 볼 수 있다.
// 기능의 점진 공개: 처음에는 '다음 도전'과 우편·설정만, 깬 단계와 튜토리얼에 따라 모험·뽑기·메아리·편성·울림골·임무가 차례로 열린다 (열리는 순간 '새 기능' 카드 → 그 탭으로).
// 조건은 '하나라도 맞으면'이라 튜토리얼을 건너뛰었거나 다른 기기에서 온 사람은 깬 단계로 열린다.
import { addSetting, addTutorial, menuTab, myMode, myStage, onTutorial, S, setGuestReminder, switchMode, useUnlocks } from '@engine/client';
import { MODE } from '../shared/content/pact';
import { t } from '@engine/client/i18n';
import { uiText } from '@engine/client/i18n/names';

const inTower = (): boolean => myMode()?.id === MODE.tower;
const inVale = (): boolean => myMode()?.id === MODE.vale;
/** 탑의 지금 화면 (client/tower.ts가 body[data-tower]에 적는다). 다른 창(메뉴·단계 창)이 떠 있으면 '' */
const view = (): string => (document.body.dataset.screen && !document.body.dataset.screen.startsWith('tower') ? '' : document.body.dataset.tower ?? '');
const shown = (id: string): boolean => { const e = document.getElementById(id); return !!e && !e.hidden; };
/** 결과 창을 한 번 보고 닫았는가 (결과 창 설명 단계) */
let resultSeen = false;
const best = (): string => myStage()?.best ?? '';

export function initTutorial(): void {
  addTutorial({
    id: 'pact',
    label: () => t('tutPact'),
    start: () => !!S.me && S.me.cls !== '',
    steps: [
      // 게임 A: 계약의 탑 (처음 온 사람은 여기서 시작한다)
      // 단계마다 맞는 모드·화면에서만 카드를 보인다 (when): 전투 중에는 뽑기 안내를, 탑에서는 울림골 안내를 띄우지 않는다
      { id: 'name', kind: 'name', text: 'tutName', when: () => inTower() && view() === 'home' },
      { id: 'stage', text: 'tutStage', target: 'towerHome-go', when: () => inTower() && view() === 'home', until: { cmd: 'stage' } },
      // 결과 창 설명: 결과 창이 떠 있는 동안 보이고, 결과 창이 닫히면 끝난다 (자동 진행이 다음 단계로 닫아도)
      { id: 'result', text: 'tutResult', target: 'stResult', when: () => shown('stResult'), until: { test: () => { if (shown('stResult')) resultSeen = true; return resultSeen && !shown('stResult'); } } },
      { id: 'stage2', text: 'tutStage2', target: () => (view() === 'home' ? 'towerHome-go' : ''), when: () => inTower() && !shown('stResult'), until: { test: () => best() !== '' && best() !== '1-1' } },
      { id: 'pull', text: 'tutPull', target: 'towerHome-gacha', when: () => inTower() && view() === 'home', until: { cmd: 'gacha' } },
      // 첫 편성: 새 메아리는 저절로 편성에 든다 (SQUAD_RULES.autoFill). 편성 탭을 열어 보면 끝
      { id: 'squad', text: 'tutSquad', target: 'towerHome-squad', when: () => inTower() && (view() === 'home' || menuTab() === 'squad'), until: { test: () => menuTab() === 'squad' } },
      { id: 'switch', text: 'tutSwitch', target: () => (view() === 'home' ? 'towerHome-vale' : 'modeBtn'), when: inTower, until: { cmd: 'mode' } },
      // 게임 B: 울림골
      { id: 'move', text: 'tutMove', when: inVale, until: { cmd: 'move' } },
      { id: 'attack', text: 'tutAttack', when: inVale, until: { cmd: 'attack' } },
      { id: 'morph', text: 'tutMorph', when: inVale, until: { cmd: 'morph' } },
      { id: 'auto', text: 'tutAuto', when: inVale, until: { cmd: 'auto' } },
    ],
  });
  // 기능의 점진 공개 (튜토리얼 키트). 홈의 아래 띠는 🔒와 '언제 열리는지'(tower.ts가 featureLock으로), 메뉴의 탭은 숨긴다
  useUnlocks([
    { id: 'adv', name: () => t('towerAdventure'), when: { stage: '1-1' }, tab: 'stages', quiet: true },
    { id: 'gacha', name: () => t('towerPull'), when: { stage: '1-2', tut: 'pact:pull' }, tab: 'gacha' },
    { id: 'odds', name: () => t('tabOdds'), when: { stage: '1-2', tut: 'pact:pull' }, tab: 'odds', quiet: true },
    { id: 'heroes', name: () => t('towerEchoes'), when: { stage: '1-2', tut: 'pact:pull' }, tab: 'heroes', quiet: true },
    { id: 'squad', name: () => t('towerSquad'), when: { stage: '1-3', tut: 'pact:squad' }, tab: 'squad' },
    { id: 'vale', name: () => uiText.get('modeVale'), when: { stage: '1-3', tut: 'pact:switch' }, go: () => switchMode(MODE.vale) },
    // 임무·이벤트·시즌·업적·도감·상점은 1-4를 깨거나 계약자 레벨 6에 (처음 10분은 탑의 흐름에 집중: docs/screens.md 5절의 15~30분)
    { id: 'daily', name: () => t('tabDaily'), when: { stage: '1-4', lv: 6 }, tab: 'daily' },
    ...(['event', 'season', 'achieve', 'codex', 'goods'] as const).map((tab) => ({ id: tab, name: () => tab, when: { stage: '1-4', lv: 6 }, tab, quiet: true })),
  ]);
  onTutorial((ev, id, step, i) => console.debug(`[tutorial] ${ev} ${id} ${step} ${i}`));
  // 이 게임의 설정 칸: 이름표 보이기 (사람·메아리·석상의 이름표를 한꺼번에)
  addSetting({ id: 'tags', label: () => t('setEchoTags'), kind: 'toggle', value: true, on: (v) => document.body.classList.toggle('noTags', !v) });
  // 손님 진행 보호: 뽑은 메아리를 잃지 않게 25분을 논 뒤에 알린다
  setGuestReminder({ afterMin: 25 });
}
