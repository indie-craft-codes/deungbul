// 화면의 뼈대: 틀의 창과 빈 자리의 마크업. 틀의 화면 코드(engine/client/)가 이 요소들을 id로 잡는다.
// 게임의 index.html에는 머리(제목, 아이콘, manifest)와 진입점(script)만 있고, body는 여기 것을 hud/shell.ts의 mountShell이 붙인다:
// 새 게임이 뼈대를 베끼지 않아도 되고, 틀의 id가 바뀌어도 게임의 파일은 그대로다.
// 글자는 여기에 직접 쓰지 않는다: data-i18n 표시를 보고 i18n의 applyDom이 현재 언어로 채운다.
// 여기에는 틀의 창과 빈 자리만 있다. 게임의 창은 게임의 마크업이 hud/shell.ts의 mountPanel로 붙인다. 붙는 자리의 기준이 되는 요소
// (#hpt, #gold, #status가 든 줄, #rightcol, #topmid, #autoBtn)의 id나 차례를 바꾸면 shell.ts의 SLOTS도 함께 본다.
// 요소의 차례와 사이의 공백까지 이 문자열 그대로 문서에 들어간다 (스타일의 ~ 선택자와 겹치는 순서가 차례에 기댄다). 이 파일은 아무것도 import하지 않는다.
// data-mod="모듈 …": 그 모듈 가운데 하나라도 고른 게임에만 있는 요소다 (engine/shared/modules.ts). 고르지 않았으면 붙일 때 빠진다(hud/shell.ts의 mountShell). 표시가 없는 요소는 핵심이다.
export const SKELETON = `
  <canvas id="view"></canvas>
  <div id="tags"></div>

  <div id="hud" hidden>
    <div class="panel" id="me">
      <div class="row"><button type="button" class="name" id="myName" data-i18n-title="renameTitle"></button><span class="num" id="lv" data-mod="growth classes"></span></div>
      <form id="renameForm" autocomplete="off" hidden>
        <input id="renameInput" type="text" maxlength="12" data-i18n-aria="renameLabel">
        <button type="submit" data-i18n="renameSubmit"></button>
      </form>
      <div class="bar hp" data-mod="combat"><i id="hpb"></i></div>
      <div class="bar xp" data-mod="growth"><i id="xpb"></i></div>
      <div id="buffs" hidden data-mod="combat"></div>
      <div class="row" data-mod="combat economy"><span class="num" id="hpt" data-mod="combat"></span><span class="coin" id="coin" hidden data-mod="economy"></span></div>
      <div class="row" data-mod="economy"><span class="gold" id="gold"></span></div>
      <div class="row">
        <span class="num" id="status"></span>
        <button type="button" class="plain" id="bagBtn" data-i18n="bag" data-mod="items"></button>
        <button type="button" class="plain" id="menuBtn" data-i18n="menu"></button>
        <select id="channel" data-i18n-aria="channel" hidden></select>
        <select id="lang" data-i18n-aria="language"></select>
      </div>
      <div id="party" hidden data-mod="party">
        <div class="row"><span class="ttitle" data-i18n="party"></span><button type="button" class="plain" id="partyLeave" data-i18n="partyLeave"></button></div>
        <div id="partyList"></div>
      </div>
    </div>

    <div id="rightcol">
    <div class="panel" id="shop" hidden data-mod="items">
      <div class="row"><span class="ttitle" data-i18n="shop"></span><span class="gold" id="shopGold"></span></div>
      <div id="shopList"></div>
    </div>

    <div class="panel" id="forge" hidden data-mod="items">
      <div class="row"><span class="ttitle" data-i18n="forge"></span><span class="gold" id="forgeGold"></span></div>
      <div id="forgeList"></div>
    </div>

    <div class="panel" id="dungeon" hidden data-mod="dungeon">
      <div class="row"><span class="ttitle" id="dgName"></span><span class="num" id="dgRuns"></span></div>
      <div class="note" id="dgMates" hidden></div>
      <div class="note" id="dgInfo"></div>
      <button type="button" id="dgBtn"></button>
    </div>

    </div>

    <div id="topmid">
      <div class="panel" id="tgt" hidden data-mod="combat">
        <div class="row"><span class="tname" id="tname"></span><span class="num" id="thp"></span></div>
        <div class="bar hp"><i id="tbar"></i></div>
      </div>
    </div>

    <div class="panel" id="chat">
      <div id="log"></div>
      <button type="button" class="plain" id="chatBtn" data-i18n="chatOpen"></button>
      <form id="chatForm" autocomplete="off">
        <input id="chatInput" type="text" maxlength="80" data-i18n-placeholder="chatPlaceholder" data-i18n-aria="chatLabel">
      </form>
    </div>
    <div id="mapBox"><canvas id="minimap" data-i18n-aria="minimap"></canvas><div class="note" id="mapLegend" data-i18n="mapLegend"></div></div>
    <div id="stick" role="application" data-i18n-aria="stickLabel"><div id="knob"></div></div>
    <div class="panel" id="pcard" hidden>
      <div class="pname" id="pcardName"></div>
      <button type="button" id="pcardInvite" data-i18n="partyInvite" data-mod="party"></button>
      <button type="button" class="plain" id="pcardGuild" data-i18n="guildInvite" hidden data-mod="guild"></button>
      <button type="button" class="plain" id="pcardBlock"></button>
      <button type="button" class="plain" id="pcardReport" data-i18n="report"></button>
    </div>
    <div class="panel" id="bag" hidden data-mod="items">
      <div class="row"><span class="ttitle" data-i18n="bag"></span><span class="gold" id="bagGold"></span></div>
      <div id="bagList"></div>
      <button type="button" class="plain" id="bagClose" data-i18n="close"></button>
    </div>
    <div class="panel" id="wmap" hidden>
      <!-- 전체 지도(hud/worldmap.ts): 머리, 지도와 그 위의 단추·카드, 장소 목록 -->
      <div class="row" id="wmapHead">
        <span class="ttitle" data-i18n="worldMap"></span><span class="note" id="wmapArea"></span>
        <button type="button" class="plain" id="wmapListBtn" aria-pressed="true" data-i18n="mapList"></button>
        <button type="button" class="plain" id="wmapClose" data-i18n="close"></button>
      </div>
      <div id="wmapBody">
        <div id="wmapStage">
          <canvas id="wmapCanvas" data-i18n-aria="worldMap"></canvas>
          <div id="wmapTools">
            <button type="button" id="wmapIn" data-i18n-aria="mapZoomIn">+</button>
            <button type="button" id="wmapOut" data-i18n-aria="mapZoomOut">−</button>
            <button type="button" id="wmapMe" data-i18n="mapMe"></button>
          </div>
          <div id="wmapTravel" hidden><span data-i18n="mapTraveling"></span> <b id="wmapTravelName"></b> <button type="button" class="plain" id="wmapStop" data-i18n="mapStop"></button></div>
          <div id="wmapTip" hidden></div>
          <div class="panel" id="wmapCard" hidden>
            <div class="ttitle" id="wmapCardName"></div>
            <div class="note" id="wmapCardKind"></div>
            <div id="wmapCardInfo"></div>
            <div class="note" id="wmapCardDist"></div>
            <div class="btns"><button type="button" id="wmapGo" data-i18n="mapGo"></button><button type="button" id="wmapHunt" data-i18n="mapHunt"></button></div>
          </div>
        </div>
        <div id="wmapList"></div>
      </div>
      <div class="note" data-i18n="worldMapHint"></div>
    </div>
    <div class="panel" id="menu" hidden>
      <!-- 창의 머리: 소리 단추와 닫기 단추는 어느 탭에서나 같은 자리에 있다 -->
      <div class="row" id="menuHead">
        <span class="ttitle" data-i18n="menu"></span><span class="gold" id="menuGold" data-mod="economy"></span>
        <button type="button" class="plain" id="soundBtn"></button>
        <button type="button" class="plain" id="menuClose" data-i18n="close"></button>
      </div>
      <div id="menuTabs"></div>
      <div id="menuList"></div>
    </div>
    <div class="panel" id="invite" hidden data-mod="party">
      <div id="inviteText"></div>
      <div class="btns">
        <button type="button" id="inviteYes" data-i18n="partyAccept"></button>
        <button type="button" class="plain" id="inviteNo" data-i18n="partyDecline"></button>
      </div>
    </div>
    <div class="banner" id="banner" hidden><div id="bannerText"></div><div id="bannerSub"></div></div>
    <div id="bottom">
      <div id="feed"></div>
      <div id="hint" data-i18n="hint"></div>
      <div id="actRow">
        <button id="autoBtn" type="button" aria-pressed="false" data-i18n="auto" data-mod="away"></button>
        <button id="tabBtn" type="button" data-i18n="attackNearest" data-mod="combat"></button>
        <button id="mapBtn" type="button" aria-pressed="false" data-i18n="worldMap"></button>
      </div>
      <div id="skills" data-mod="combat items"></div>
    </div>
  </div>

  <div id="classPick" hidden data-mod="classes">
    <div class="card">
      <p data-i18n="intro"></p>
      <h2 data-i18n="chooseClass"></h2>
      <div id="classList"></div>
      <p class="note" data-i18n="classHint"></p>
      <button type="button" class="plain" id="claimOpen" data-i18n="deviceUseLink" hidden></button>
      <form class="mfield" id="claimForm" autocomplete="off" hidden>
        <input id="claimInput" type="text" maxlength="12" autocapitalize="characters" spellcheck="false" data-i18n-placeholder="deviceUseHint" data-i18n-aria="deviceUseHead">
        <button type="submit" data-i18n="deviceUse"></button>
      </form>
      <p class="note" id="claimMsg" hidden></p>
      <button type="button" class="plain" id="classClose" data-i18n="close"></button>
    </div>
  </div>

  <div id="flash"></div>

  <div id="gate" data-kind="wait">
    <form class="card" id="joinForm" autocomplete="off" aria-live="polite">
      <h1 data-i18n="title"></h1>
      <i id="gateIcon" aria-hidden="true"></i>
      <p id="gateMsg" data-i18n="connecting"></p>
      <p id="gateSub" class="note" hidden></p>
      <div id="gateBar"><progress id="gateProg" max="1" value="0"></progress></div>
      <p id="gateTip" class="note" hidden></p>
      <button type="submit" id="joinBtn" data-i18n="reconnect" hidden></button>
      <button type="button" id="gateReload" class="btn-secondary" data-i18n="reload" hidden></button>
    </form>
  </div>


`;
