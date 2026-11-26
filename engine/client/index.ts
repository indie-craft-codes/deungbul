// 틀의 화면 입구: 게임의 화면 진입점과 화면 모듈이 읽는 것. 여기 없는 것은 틀의 내부다 (입구의 목록은 engine/shared/index.ts).
// 문장(L, t, 언어 묶음)은 '@engine/client/i18n'에서 따로 읽는다: 도감과 시험이 three.js 없이 node와 정적 페이지에서 읽기 때문이다.
export { startClient, type ClientOptions } from './main';
export { onFrame, onKey, onMsg, onSlow } from './bus';
export { rules } from './rules';
export { $, view } from './app';
export { S, inDungeon } from './state';
export { send } from './net';
export { goToTown, moveTo } from './actions';
export { addNpc, setMerchant, setPlayerLook, type PlayerInfo, type PlayerLook } from './entities';
export { fitZoom, setCameraAim, type CameraAim } from './camera';
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
export { addMenuTab, MENU_TABS, openMenu, setMenuTabs, type EngineMenuTab, type MenuTab } from './hud/menu';
export { openClasses } from './hud/classes';
export { hudSlow } from './hud/me';
export type { Look, Mood } from './scene/view';
export { attachHand, cueAnim, defaultHumanoid, limb, makeBall, makeBlob, makeBox, makeHumanoid, mat, part, registerArmor, registerBlade, registerHand, registerMonsterModel, setHumanoidBody, setHumanoidDeco, type ArmorLook, type BladeLook, type HandBuilder, type HumanoidLook, type Model, type MonsterBuilder, type Rig } from './scene/models';
export { registerShot, type ShotLook } from './fx';
