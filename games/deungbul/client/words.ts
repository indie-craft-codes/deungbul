// 이 게임(등불지기)의 말을 틀에 등록한다: 언어 묶음과, 이 게임이 더한 안내문(games/deungbul/shared/deungbul.ts의 MsgMap)을 어디에 어떤 소리로 알릴지.
// 틀의 파일(i18n/index.ts, hud/notify.ts, sound.ts)은 틀의 안내문만 알고 이 게임의 것은 여기서 받는다.
import { addMsgSounds, addNotices, rules, sfx } from '@engine/client';
import { setLocales } from '@engine/client/i18n';
import { LOCALES } from './i18n';

// 언어 묶음은 init이 아니라 이 모듈이 읽히는 때에 등록한다: 진입점(main.ts)이 initModules()보다 먼저 applyDom()과 initPanels()로 문장을 읽는데,
// 그때 이 게임의 문장(등탑, 퀘스트 등의 키)이 이미 있어야 한다. 모듈의 본문은 진입점의 본문보다 먼저 돈다 (진입점 main.ts가 deungbul.ts를 import한다).
setLocales(LOCALES);

export function initWords(): void {
  addNotices({
    // 가운데 알림: 놓치면 안 되는 일
    banner: {
      raidSoon: 'bad', raidElsewhere: 'bad', raidStart: 'bad', raidWon: 'good', raidLost: 'bad',
      // 장을 마쳤는데 그 장의 이름으로 된 잠금이 아직 안 풀렸으면(주민이 돌아오지 않았으면), 어떻게 푸는지 덧붙인다
      questDone: { tone: 'good', sub: (a) => rules.lockHint(String(a[0])) },
      residentBack: 'good', towerLit: 'good', stageChanged: '',
    },
    // 흘러가는 알림: 방금 한 일의 결과와 거절 사유
    feed: ['offered', 'questStep', 'raidReward', 'tierUp', 'offerFar', 'noSparks', 'towerFull', 'noResident'],
  });
  addMsgSounds({ questDone: sfx.fanfare, raidWon: sfx.fanfare, residentBack: sfx.fanfare, raidStart: sfx.bad, raidLost: sfx.bad });
}
