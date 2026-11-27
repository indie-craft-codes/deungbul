// 이 게임의 튜토리얼과 설정 칸 (틀의 addTutorial, addSetting: engine/client/hud/tutorial.ts, settings.ts).
// 튜토리얼은 직업을 고른 뒤에 한 번 뜬다: 걷기 → 공격 → 메뉴 → 모닥불. 다 보거나 건너뛰면 이 기기에서는 다시 뜨지 않고, 메뉴의 설정 탭에서 다시 볼 수 있다.
import { addSetting, addTutorial, enableOfflineCache, onTutorial, preloadLater, S, setGuestReminder } from '@engine/client';
import { t } from '@engine/client/i18n';

export function initTutorial(): void {
  addTutorial({
    id: 'basics',
    label: () => t('tutBasics'),
    start: () => !!S.me && S.me.cls !== '',
    steps: [
      { id: 'move', text: 'tutMove', until: { cmd: 'move' } },
      { id: 'attack', text: 'tutAttack', until: { cmd: 'attack' } },
      { id: 'menu', text: 'tutMenu', target: 'menuBtn', until: { key: 'm', test: () => !document.getElementById('menu')?.hidden } },
      { id: 'fire', text: 'tutFire', target: 'bonfire' },
    ],
  });
  // 분석을 받는 곳이 생기면 여기에 잇는다 (지금은 콘솔에만)
  onTutorial((ev, id, step, i) => console.debug(`[tutorial] ${ev} ${id} ${step} ${i}`));
  // 이 게임의 설정 칸: 이름표 보이기
  addSetting({ id: 'tags', label: () => t('setTags'), kind: 'toggle', value: true, on: (v) => document.body.classList.toggle('noTags', !v) });
  // 배경음(모닥불 소리)은 흘려 받고, 줍는 소리는 첫 장면에 기다리지 않는다 (자원 로딩 예산)
  preloadLater('./sounds/pickup.wav');
  // 재방문 캐시 (빌드가 sw.js를 쓰게 deploy.json에 offlineCache: true)
  enableOfflineCache();
  // 손님 진행 보호: 이 게임은 20분을 논 뒤에 알린다
  setGuestReminder({ afterMin: 20 });
}
