// 그림 자리 (U3, 넓힘 art2): 게임이 그림 파일을 열쇠로 등록하면 틀의 화면이 그 그림을 쓰고, 없으면 틀이 대신 그린다(지금 그대로).
//   열쇠                     쓰이는 곳                                                      없을 때 (대체)
//   'portrait:<캐릭터 id>'    카드 격자·카드 상세·뽑기 공개·편성 칸·전투 초상·홈의 대표           게임의 초상 함수 (charPortrait: 3D 모델을 그려 찍은 그림)
//   'bg:<장면>'               큰 화면의 배경: 홈(makeHome의 scene), 메뉴의 탭(탭 id: gacha·heroes·squad·stages …),   css 그라디언트·무늬 / 창의 바탕색
//                            편성 확인 'squad', 결과 'result', 뽑기 연출 'summon', 직업 고르기 'classes', 게임의 화면(openScreen의 scene: 탑의 모험 'adventure')
//   'bg:<장면>@portrait'      세로 화면의 배경 (있으면 'bg:<장면>'보다 먼저) · '@landscape' 가로 화면
//   'banner:<id>'             홈의 이벤트 배너 카드 (HomeEvent의 id)                                색 두 개 + 큰 아이콘
//   'icon:<이름>'             화면 아이콘 (hud/uiicons.ts의 이름. svg·png·webp)                     코드로 그린 SVG
//   'cur:<재화 id>'           재화 줄·내 정보 창·단계 보상 칩·우편 (gold, second = 두 번째 재화, stamina, exp)         그림 시트의 칸 → 화면 아이콘(coin·shard·stamina)
//   'item:<아이템 id>'        가방·상점·대장간·장비·도감·단계 보상·우편 ('item:<id>@<손 모양>': 그 손의 직업만)  그림 시트의 칸 → 글자만
//   'skill:<기술 id>'         들판의 기술 단추                                                       기술 이름 글자
//   'enemy:<몬스터 id>'       도감의 몬스터 줄·단계 정보의 적 목록·(useSprites) 전투의 적 유닛            글자만 / 3D 모델
//   'unit:<영웅·몬스터 id>'   (useSprites를 켠 게임) 전투의 유닛 그림 판 (scene/sprites.ts)                 영웅 portrait·적 enemy → 3D 모델
//   'sheet:<id>'              (useSprites) 움직이는 스프라이트 시트: 영웅·몬스터·직업·변신 캐릭터 id. 4열×4행(대기·걷기·공격·맞음/쓰러짐)   unit·portrait·enemy 한 장 → 3D 모델
//                            탑 전투의 유닛, field를 켠 게임은 들판의 사람(직업·변신)과 몬스터도. 배치는 scene/sprites.ts의 SHEET_DEFAULT·setSheets
//   'bg:battle' 'bg:battle-<장 번호>' 단계 전투의 바닥·하늘 대신 화면 뒤 그림 (hud/battle.ts)               3D 바닥·하늘
//   'icon:goods-<id>' 'icon:ach-<id>' 'icon:daily-<id>' 'icon:mission-<종류>' 'icon:mail-<종류>' 'icon:buff-<기술 id>' 'icon:rarity-<등급 id>'  메뉴 줄·강화·카드의 등급 표  글자만
//   'frame:<등급 id>'         카드 격자·뽑기 카드의 등급 테두리 (영웅 등급 id: common·rare·legend)      css 등급 색 테두리
//   'fx:orb' 'fx:orb-<등급 id>' 뽑기 연출의 예고 빛 덩이                                              css 빛 덩이
//   'logo'                    접속(로딩) 화면의 제목                                                  게임 이름 글자
//   'splash' (@portrait·@landscape) 접속(로딩) 화면의 배경. 그 방향의 것 → 'splash' → 다른 방향의 것(가운데를 잘라 덮는다)        css 바탕
//   'appicon'                 원본 1024×1024 (art-import가 favicon·PWA·apple-touch·OG·데스크톱 아이콘을 만든다: 화면에서는 쓰지 않는다)
// 그림 파일은 게임의 public/art/ 아래에 두고, 표는 scripts/art-import.mjs가 만든다 (games/<게임>/client/artlist.ts). 게임은 시작할 때 registerArt(ART)를 부른다.
// 필요한 칸의 목록은 node scripts/art-list.mjs <게임> (권장 크기·투명 여부·영어 설명). docs/making-a-game.md '그림 넣기'.
// 이 파일은 화면 요소를 읽지 않는다 (시험이 node에서 부른다: engine/test/fx/client.test.ts). 화면에 입히는 일은 hud/artdom.ts.
import { setIconFiles } from './hud/uiicons';

/** 열쇠의 종류 ('<종류>:<id>'). 브랜드 열쇠(logo·splash·appicon)는 id가 없다 */
export const ART_KINDS = ['portrait', 'unit', 'sheet', 'bg', 'banner', 'icon', 'cur', 'item', 'skill', 'enemy', 'frame', 'fx'] as const;
export type ArtKind = (typeof ART_KINDS)[number];
/** id가 없는 브랜드 열쇠 */
export const ART_BRAND = ['logo', 'splash', 'appicon'] as const;

const TABLE = new Map<string, string>();
/** 그림이 바뀌면 부를 것 (이미 그린 화면이 다시 그리게) */
const subs: (() => void)[] = [];

const KEY_RE = /^(portrait|unit|sheet|banner|icon|cur|skill|enemy|frame|fx):[\w.-]+$|^item:[\w.-]+(@[\w-]+)?$|^bg:[\w.-]+(@(portrait|landscape))?$|^(logo|appicon)$|^splash(@(portrait|landscape))?$/;
/** 열쇠가 맞는 모양인가: '<종류>:<id>', 배경의 '@portrait|landscape', 아이템의 '@<손 모양>', 브랜드 열쇠 */
export const artKeyOk = (key: string): boolean => KEY_RE.test(key);

/**
 * 그림을 등록한다. table은 열쇠 → 파일 주소 (base를 앞에 붙인다: 'art/'). 같은 열쇠를 다시 등록하면 뒤의 것이 이긴다.
 * 맞지 않는 열쇠는 건너뛰고 그 목록을 돌려준다 (화면에는 콘솔 경고)
 */
export function registerArt(table: Readonly<Record<string, string>>, base = ''): string[] {
  const bad: string[] = [];
  for (const [k, v] of Object.entries(table)) {
    if (!artKeyOk(k) || !v) { bad.push(k); continue; }
    TABLE.set(k, /^(https?:|data:|\/)/.test(v) ? v : base + v);
  }
  if (bad.length && typeof console !== 'undefined') console.warn(`[art] 모르는 열쇠를 건너뜀: ${bad.join(', ')}`);
  for (const f of subs) f();
  return bad;
}
/** 등록을 모두 지운다 (시험) */
export function clearArt(): void { TABLE.clear(); }
/** 그 열쇠의 그림 주소 (없으면 undefined) */
export const artUrl = (key: string): string | undefined => TABLE.get(key);
/** 등록된 그림이 하나라도 있는가 (없으면 화면은 아무것도 하지 않는다) */
export const hasArt = (): boolean => TABLE.size > 0;
/** 그 종류·id의 그림. 배경은 화면 방향(orient)의 것을 먼저 */
export function artPick(kind: ArtKind, id: string, orient?: 'portrait' | 'landscape'): string | undefined {
  if (kind === 'bg' && orient) { const o = TABLE.get(`bg:${id}@${orient}`); if (o) return o; }
  return TABLE.get(`${kind}:${id}`);
}
/** 접속 화면의 배경: 그 방향의 것 → 'splash' → 다른 방향의 것 (세로 화면에 가로 그림뿐이면 그것의 가운데를 잘라 쓴다: css의 cover) */
export const splashArt = (orient?: 'portrait' | 'landscape'): string | undefined =>
  (orient && TABLE.get(`splash@${orient}`)) || TABLE.get('splash') || (orient ? TABLE.get(`splash@${orient === 'portrait' ? 'landscape' : 'portrait'}`) : undefined);
/** 캐릭터의 초상 그림 (등록된 것). 없으면 undefined: 부르는 쪽이 3D 초상으로 대신한다 */
export const portraitArt = (id: string): string | undefined => TABLE.get(`portrait:${id}`);
/**
 * 그림 시트의 열쇠(hud/icons.ts: 아이템 id, 'cur:gold', 'cur:second', 'slot:<칸>', 'ui:<이름>')에 맞는 그림 파일.
 * 'cur:<재화>'는 그대로, 'slot:<칸>'은 'item:slot-<칸>', 'ui:<이름>'은 'icon:<이름>', 나머지는 'item:<id>'(손 모양의 것을 먼저)
 */
export function sheetKeyArt(key: string, hand?: string): string | undefined {
  if (!TABLE.size) return undefined;
  if (key.startsWith('cur:')) return TABLE.get(key);
  if (key.startsWith('slot:')) return TABLE.get(`item:slot-${key.slice(5)}`);
  if (key.startsWith('ui:')) return TABLE.get(`icon:${key.slice(3)}`);
  return (hand && TABLE.get(`item:${key}@${hand}`)) || TABLE.get(`item:${key}`);
}
/** 등록된 열쇠들 (차례대로) */
export const artKeys = (): string[] => [...TABLE.keys()];
/** 그림이 바뀌면 (등록) */
export function onArt(fn: () => void): void { subs.push(fn); }

// 화면 아이콘: 'icon:<이름>'이 등록되어 있으면 그 그림
setIconFiles((name) => TABLE.get(`icon:${name}`));
