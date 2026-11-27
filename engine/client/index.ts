// 틀의 화면 입구: 게임의 화면 진입점과 화면 모듈이 읽는 것. 여기 없는 것은 틀의 내부다 (입구의 목록은 engine/shared/index.ts).
// 문장(L, t, 언어 묶음)은 '@engine/client/i18n'에서 따로 읽는다: 도감과 시험이 three.js 없이 node와 정적 페이지에서 읽기 때문이다.
export { startClient, type ClientOptions } from './main';
export { onFrame, onKey, onMsg, onSlow } from './bus';
export { rules } from './rules';
export { $, view } from './app';
export { S, inDungeon } from './state';
export { send } from './net';
export { goToTown, moveTo, setTapHandler } from './actions';
export { addNpc, onEffect, setMerchant, setPlayerLook, type PlayerInfo, type PlayerLook } from './entities';
export { cameraYaw, fitZoom, setCameraAim, setCameraYaw, type CameraAim } from './camera';
export { registerKind, type KindInfo, type KindLook } from './kinds';
export { anyModule, hasModule } from './mods';
export type { MerchantLook } from './entities';
export { addMsgSounds, enableVolume, playSound, setMusicPicker, sfx } from './sound';
export { registerHumanoidAsset, registerMonsterAsset, registerWeaponAsset } from './scene/gltf';
export { registerMusic, registerSound, setClipNames, DEFAULT_CLIPS, type AnimState, type ClipMap, type HumanoidAsset, type ModelAsset, type ModelFit, type WeaponAsset } from './assets';
export { mountPanel } from './hud/shell';
export { addPlace } from './hud/near';
export { addMapLabels, addMarks, setMapPaint, MARK, type MapLabel, type Mark, type MapBrush } from './hud/minimap';
export { addMapPlaces, closeWorldMap, stopTravel, toggleWorldMap, travelTo, worldMapOpen, type MapPlace, type PlaceKind } from './hud/worldmap';
export { addNotices, banner } from './hud/notify';
export { addIconSheet, addItemSheet, gearIcon, hasItemIcon, itemIcon } from './hud/icons';
export { addMenuTab, closeMenu, MENU_TABS, openMenu, setMenuTabs, type EngineMenuTab, type MenuTab } from './hud/menu';
// 메뉴 탭의 줄 만들기 (틀의 탭과 같은 모양·class: 한 줄 mrow, 단추 plain, 머리줄 baghead …). 게임의 탭(addMenuTab)이 쓴다
export { button as menuButton, chips as menuChips, el as menuEl, redraw as redrawMenu, row as menuRow, span as menuSpan } from './hud/menu/parts';
export { openClasses } from './hud/classes';
export { myTeam, myTeamScore, onTeamLook, setTeamBoardExtra, teamBoard } from './hud/teams';
export { myHeroes, mySquad, onGachaResult, setHeroModel, type HeroModelInfo } from './hud/collect';
export { rarityCss, rarityHex, tintRarity } from './hud/rarity';
export { liveBanners, type LiveBanner } from './hud/live';
export { onIdleBack } from './hud/idleback';
export { myKeys } from './hud/dungeon';
export { myHeroGear } from './hud/herogrow';
export { myStage } from './hud/stagebar';
export { stageRows, type StageRow } from './hud/collectcalc';
export { myRoom, myRoomTurn, onRoomChange, roomLeftMs, roomSeatName, roomSend, setRoomLook } from './hud/rooms';
export { hudSlow } from './hud/me';
export { charDefs, charPortrait, myMorph, onChars } from './hud/morph';
export { myMode, myModeSide, onModeChange, onModeSide, openModeHome, setModeHome, switchMode } from './hud/modes';
export type { Look, Mood } from './scene/view';
export { attachHand, cueAnim, defaultHumanoid, limb, makeBall, makeBlob, makeBox, makeHumanoid, mat, part, registerArmor, registerBlade, registerHand, registerMonsterModel, setHumanoidBody, setHumanoidDeco, type ArmorLook, type BladeLook, type HandBuilder, type HumanoidLook, type Model, type MonsterBuilder, type Rig } from './scene/models';
// 부품으로 된 겉모습 (engine/shared/defs/look.ts): 게임이 부품을 더 그린다
export { lookGeo, lookHumanoid, registerLookBody, registerLookHead, registerLookPart, registerLookPattern, type BodyBuilder, type BodyShape, type HeadBuilder, type HeadShape, type LookCtx, type LookMats, type PartBuilder } from './scene/look';
export { registerShot, type ShotLook } from './fx';
// 판(rooms 모듈)의 모양: 화면에서 myRoom()·onRoomChange가 주는 것, 시험에서 개인 상태 room·공유 상태 rooms를 읽을 때
export type { RoomDefView, RoomLobby, RoomPhase, RoomPrivacy, RoomRow, RoomSeatView, RoomStatsView, RoomTally, RoomView, RoomVoteView } from '../shared/defs/rooms';
// 웹 출시의 바탕: 설정 창의 게임 칸, 튜토리얼, 손님 진행 보호, 탭 숨김, 재방문 캐시, 오류 알리기, 나중 묶음
export { addSetting, settingValue, type SettingDef } from './hud/settings';
export { addTutorial, onTutorial, replayTutorial, type TutorialCond, type TutorialDef, type TutorialEvent, type TutorialStep } from './hud/tutorial';
export { remindGuestSave, setGuestReminder } from './hud/keepsafe';
export { enableOfflineCache, isAfk, onReturn } from './lifecycle';
export { reportError } from './errors';
export { preloadLater } from './assets';
// 플랫폼 접점 (engine/client/platform/): 데스크톱·모바일·포털 구현을 꽂는 자리, 광고 지점과 게임 구간, 인증
export { adBreak, auth, gameplayStart, gameplayStop, guestAuth, keyNameOf, memoryPlatform, onAd, onBreakPoint, platform, rewarded, setAuth, setPlatform, type AuthProvider, type Feature, type InputKind, type KeyLike, type LifeEvent, type MemoryPlatform, type Platform, type RawError } from './platform';
// 터치에서 title 툴팁을 길게 눌러 보는 도우미 (hud/tip.ts): 틀이 startClient에서 켠다. 게임이 만든 요소도 title만 달면 된다
export { showTip, hideTip } from './hud/tip';
// 확률과 재화의 투명성: 귀한 재화의 확인 단계 (CURRENCIES의 confirm을 적은 재화를 쓰는 게임의 단추를 감싼다)
export { confirmSpend, spendAsking } from './hud/confirm';
// 장르별 기본 화면 묶음 A: 화면 쌓기(뒤로·홈), 폰 HUD의 구역 배치, 재화 줄, 알림 점 (docs/making-a-game.md '화면 쌓기와 구역')
export { backScreen, clearScreens, closeScreen, dropScreen, homeScreen, onScreens, openScreen, screenOpen, screenStack, topScreen, trackPanel, type ScreenKind, type ScreenOpts } from './hud/screens';
export { layOf, myLay, onLay, placeIn, type Lay, type Zone } from './hud/layout';
export { currencyBar, type CurrencyChip, type CurrencyId } from './hud/currency';
export { bindDot, dotOf, dotParent, setDot } from './hud/dots';
// 장르별 기본 화면 묶음 B: 수집형 홈 키트, 단계 정보 창·편성 확인·결과 창 (docs/making-a-game.md '수집형 홈과 단계 화면')
export { makeHome, type HomeBanner, type HomeButton, type HomeKit, type HomeLead, type HomeOpts } from './hud/homekit';
export { closeStageResult, openCheck, openStageInfo, useStageScreens, type StageGrowPath, type StageScreenOpts } from './hud/stagepage';
