// 그림 자리 (U3): 게임이 그림 파일을 열쇠로 등록하면 틀의 화면이 그 그림을 쓰고, 없으면 틀이 대신 그린다.
//   열쇠                 쓰이는 곳                                              없을 때 (대체)
//   'portrait:<캐릭터 id>' 카드 격자·카드 상세·뽑기 공개·편성 칸·전투 초상·홈의 대표   게임의 초상 함수 (charPortrait: 3D 모델을 그려 찍은 그림)
//   'bg:<장면>'           홈(로비)의 배경 (makeHome의 scene)                       css 그라디언트·무늬 (.hk-scene)
//   'bg:<장면>@portrait'  세로 화면의 배경 (있으면 'bg:<장면>'보다 먼저)               'bg:<장면>'
//   'bg:<장면>@landscape' 가로 화면의 배경                                          'bg:<장면>'
//   'banner:<id>'         홈의 이벤트 배너 카드 (HomeEvent의 id)                    색 두 개 + 큰 아이콘
//   'icon:<이름>'         화면 아이콘 (hud/uiicons.ts의 이름. svg·png)              코드로 그린 SVG
// 그림 파일은 게임의 public/art/ 아래에 두고, 표는 scripts/art-import.mjs가 만든다 (games/<게임>/client/artlist.ts). 게임은 시작할 때 registerArt(ART)를 부른다.
// 권장 크기: 초상 512×512, 배경 세로 1080×1920 · 가로 1920×1080, 배너 1200×500, 아이콘은 SVG (docs/making-a-game.md '그림 넣기').
// 이 파일은 화면 요소를 읽지 않는다 (시험이 node에서 부른다: engine/test/fx/client.test.ts).
import { setIconFiles } from './hud/uiicons';

/** 열쇠의 종류 */
export const ART_KINDS = ['portrait', 'bg', 'banner', 'icon'] as const;
export type ArtKind = (typeof ART_KINDS)[number];

const TABLE = new Map<string, string>();
/** 그림이 바뀌면 부를 것 (이미 그린 화면이 다시 그리게) */
const subs: (() => void)[] = [];

/** 열쇠가 맞는 모양인가: '<종류>:<id>' 또는 배경의 '<종류>:<id>@portrait|landscape' */
export const artKeyOk = (key: string): boolean => /^(portrait|banner|icon):[\w.-]+$|^bg:[\w.-]+(@(portrait|landscape))?$/.test(key);

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
/** 그 종류·id의 그림. 배경은 화면 방향(orient)의 것을 먼저 */
export function artPick(kind: ArtKind, id: string, orient?: 'portrait' | 'landscape'): string | undefined {
  if (kind === 'bg' && orient) { const o = TABLE.get(`bg:${id}@${orient}`); if (o) return o; }
  return TABLE.get(`${kind}:${id}`);
}
/** 캐릭터의 초상 그림 (등록된 것). 없으면 undefined: 부르는 쪽이 3D 초상으로 대신한다 */
export const portraitArt = (id: string): string | undefined => TABLE.get(`portrait:${id}`);
/** 등록된 열쇠들 (차례대로) */
export const artKeys = (): string[] => [...TABLE.keys()];
/** 그림이 바뀌면 (등록) */
export function onArt(fn: () => void): void { subs.push(fn); }

// 화면 아이콘: 'icon:<이름>'이 등록되어 있으면 그 그림
setIconFiles((name) => TABLE.get(`icon:${name}`));
