// 이 게임(등불지기)의 말을 틀에 등록한다: 언어 묶음과, 이 게임이 더한 안내문(games/deungbul/shared/deungbul.ts의 MsgMap)을 어디에 어떤 소리로 알릴지.
// 틀의 파일(i18n/index.ts, hud/notify.ts, sound.ts)은 틀의 안내문만 알고 이 게임의 것은 여기서 받는다.
import { addMsgSounds, addNotices, sfx } from '@engine/client';
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
      // 1·2장의 마지막 단계가 그 주민을 되돌리는 보태기라 장을 마치면 주민은 돌아와 있다. 예전의 '아직 돌아오지 못했습니다' 덧붙임은
      // 등탑 상태가 오기 전에 셈해져 거꾸로 보였다(플레이어 재검토 5): 덧붙이지 않는다
      questDone: 'good',
      residentBack: 'good', towerLit: 'good', stageChanged: '',
    },
    // 흘러가는 알림: 방금 한 일의 결과와 거절 사유
    feed: ['offered', 'questStep', 'raidReward', 'tierUp', 'rested', 'offerFar', 'noSparks', 'towerFull', 'noResident'],
  });
  addMsgSounds({ questDone: sfx.fanfare, raidWon: sfx.fanfare, residentBack: sfx.fanfare, raidStart: sfx.bad, raidLost: sfx.bad });
}
