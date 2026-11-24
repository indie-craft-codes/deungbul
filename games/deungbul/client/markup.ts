// 이 게임(등불지기)의 창: 등탑 창(바치기, 주민, 오늘의 등탑지기, 직업 바꾸기), 퀘스트 창과 길잡이 화살표, 습격 알림,
// 내 정보에 덧붙는 표시(불씨, 휴식, 등탑 밝기, 기여, 다음 습격), '마을로' 단추.
// 틀의 index.html에는 이 창들이 없다: 틀의 빈 자리(hud/shell.ts의 mountPanel)에 여기서 붙인다. 모양은 deungbul.css에 있다.
// 글자는 틀의 마크업처럼 여기에 직접 쓰지 않는다: data-i18n 표시를 보고 i18n의 applyDom이 채운다.
// 붙은 뒤의 문서는 이 창들이 index.html에 있던 때와 요소의 차례, 사이의 공백까지 같다 (스타일의 ~ 선택자와 겹치는 순서가 차례에 기댄다).
// 줄 끝의 \n과 공백은 그 공백을 맞추는 것이라 화면에는 영향이 없다.
import { mountPanel } from '@engine/client/hud/shell';
import './deungbul.css';

/**
 * 이 게임의 창을 화면에 붙인다. 화면 코드가 요소를 잡기($('tower'), $('quest') 등) 전에 한 번 불려야 한다:
 * 여러 파일이 모듈이 읽히는 때에 요소를 잡아 두므로, 그 파일들이 모두 기대는 app.ts가 맨 먼저 부른다.
 */
export function mountMarkup(): void {
  // 내 정보: 체력 옆의 불씨, 골드 옆의 휴식 보너스, 그 아래 등탑 밝기와 기여, 다음 습격 시각
  mountPanel('meHp', `<span class="spark" id="sparks"></span>`);
  mountPanel('meGold', `<span class="num" id="rested"></span>`);
  mountPanel('meRows', `<div class="row"><span class="num" id="towerMini"></span><span class="num" id="contrib"></span></div>
      <div class="num" id="raidMini"></div>\n      `);

  // 오른쪽 위의 맨 위: 등탑 창. 등탑 가까이에서만 열린다
  mountPanel('rightTop', `
    <div class="panel" id="tower" hidden>
      <div class="row"><span class="ttitle" id="towerTitle"></span><span class="num" id="glowText"></span></div>
      <div class="bar glow"><i id="glowBar"></i></div>
      <div class="note" id="stageNote"></div>
      <div class="note" data-i18n="offerNote"></div>
      <div class="btns">
        <span class="blabel" data-i18n="offerVerb"></span>
        <button type="button" id="offerT1" data-i18n="count1"></button>
        <button type="button" id="offerT5" data-i18n="count5"></button>
        <button type="button" id="offerTAll" data-i18n="countAll"></button>
      </div>
      <div id="villageBox">
      <div class="row"><span class="ttitle" id="resName"></span><span class="num" id="resText"></span></div>
      <div class="bar res"><i id="resBar"></i></div>
      <div class="note" id="resNote"></div>
      <div class="btns" id="resBtns">
        <span class="blabel" data-i18n="helpVerb"></span>
        <button type="button" id="offerR1" data-i18n="count1"></button>
        <button type="button" id="offerR5" data-i18n="count5"></button>
        <button type="button" id="offerRAll" data-i18n="countAll"></button>
      </div>
      <div id="keepBox" hidden>
        <div class="row"><span class="ttitle" data-i18n="keepersToday"></span><span class="num" id="tierText"></span></div>
        <div class="note" id="keepList"></div>
      </div>
      </div>
      <button type="button" class="plain" id="classBtn" data-i18n="changeClass"></button>
    </div>\n`);

  // 오른쪽 위의 맨 아래: 퀘스트 창. 위의 창(등탑, 상점, 대장간)이 열리면 스타일이 줄여 보여 준다
  mountPanel('rightBottom', `<div class="panel" id="quest">
      <div class="row"><span class="ttitle" id="questTitle"></span><span class="num" id="questDist"></span></div>
      <div id="questStep"></div>
      <div class="num" id="questProg"></div>
      <div class="note" id="questGo"></div>
    </div>\n    `);
  // 퀘스트의 목적지가 화면 밖일 때 가장자리에 뜨는 화살표
  mountPanel('hud', `\n    <div id="goalArrow" hidden></div>`);

  // 가운데 위: 습격 알림 (곧 시작, 진행 중과 등탑의 체력)
  mountPanel('topmid', `
      <div class="panel" id="raid" hidden>
        <div class="rtext" id="raidText"></div>
        <div class="rhp">
          <div class="num" id="raidHp"></div>
          <div class="bar glow"><i id="raidBar"></i></div>
        </div>
      </div>`);

  // 단추 줄: 마을(첫 등탑)로 걸어가기
  mountPanel('actions', `\n        <button id="townBtn" type="button" data-i18n="toTown"></button>`);

  // ---------- 안개 균열 (hud/rift.ts) ----------
  // 오른쪽 위, 등탑 창 다음: 균열의 문 가까이에서만 열린다 (조건, 남은 횟수, 내 기록)
  mountPanel('rightTop', `
    <div class="panel" id="riftGate" hidden>
      <div class="row"><span class="ttitle" data-i18n="rift"></span><span class="num" id="rgRuns"></span></div>
      <div class="note warn" data-i18n="riftShared"></div>
      <div class="note" id="rgMates" hidden></div>
      <div class="note" id="rgInfo"></div>
      <div class="note" data-i18n="riftNoKillReward"></div>
      <div class="num" id="rgBest"></div>
      <button type="button" id="rgBtn" data-i18n="riftEnterBtn"></button>
    </div>\n`);
  // 가운데 위: 판 안의 표시 (남은 시간, 물결과 처치 수, 고른 강화)
  mountPanel('topmid', `
      <div class="panel" id="riftHud" hidden>
        <div class="row"><span id="rhClock"></span><span class="num" id="rhWave"></span><button type="button" class="plain" id="rhLeave"></button></div>
        <div class="num" id="rhText"></div>
        <div class="note" id="rhLives"></div>
        <div class="note" id="rhUps"></div>
      </div>`);
  // 화면에 떠 있는 것: 떼가 오는 방향의 화살표, 강화 고르기, 결과 창
  mountPanel('hud', `
    <div id="riftArrows" hidden></div>
    <div id="riftPick" hidden>
      <div class="rpHead"><span data-i18n="riftPickTitle"></span><span class="num" id="rpLeft"></span></div>
      <div class="bar"><i id="rpBar"></i></div>
      <div id="rpList"></div>
    </div>
    <div class="panel" id="riftEnd" hidden>
      <div class="ttitle" id="reTitle"></div>
      <div id="reResult"></div>
      <div class="note" id="reBest"></div>
      <div class="note" id="reUps"></div>
      <div id="reReward"></div>
      <div class="note" id="reMail" data-i18n="riftMailNote"></div>
      <button type="button" id="reBtn"></button>
    </div>`);
}
