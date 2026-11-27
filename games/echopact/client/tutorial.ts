// 이 게임의 튜토리얼과 설정 칸 (틀의 addTutorial, addSetting: engine/client/hud/tutorial.ts, settings.ts).
// 튜토리얼은 직업을 고른 뒤에 한 번 뜬다: 탑(단계 → 뽑기) → 게임 바꾸기 → 울림골(걷기 → 공격 → 변신 → 자동 사냥). 메뉴의 설정 탭에서 다시 볼 수 있다.
import { addSetting, addTutorial, onTutorial, S, setGuestReminder } from '@engine/client';
import { t } from '@engine/client/i18n';

export function initTutorial(): void {
  addTutorial({
    id: 'pact',
    label: () => t('tutPact'),
    start: () => !!S.me && S.me.cls !== '',
    steps: [
      // 게임 A: 계약의 탑 (처음 온 사람은 여기서 시작한다)
      { id: 'stage', text: 'tutStage', until: { cmd: 'stage' } },
      { id: 'pull', text: 'tutPull', until: { cmd: 'gacha' } },
      { id: 'switch', text: 'tutSwitch', target: 'modeBtn', until: { cmd: 'mode' } },
      // 게임 B: 울림골
      { id: 'move', text: 'tutMove', until: { cmd: 'move' } },
      { id: 'attack', text: 'tutAttack', until: { cmd: 'attack' } },
      { id: 'morph', text: 'tutMorph', until: { cmd: 'morph' } },
      { id: 'auto', text: 'tutAuto', until: { cmd: 'auto' } },
    ],
  });
  onTutorial((ev, id, step, i) => console.debug(`[tutorial] ${ev} ${id} ${step} ${i}`));
  // 이 게임의 설정 칸: 이름표 보이기 (사람·메아리·석상의 이름표를 한꺼번에)
  addSetting({ id: 'tags', label: () => t('setEchoTags'), kind: 'toggle', value: true, on: (v) => document.body.classList.toggle('noTags', !v) });
  // 손님 진행 보호: 뽑은 메아리를 잃지 않게 25분을 논 뒤에 알린다
  setGuestReminder({ afterMin: 25 });
}
