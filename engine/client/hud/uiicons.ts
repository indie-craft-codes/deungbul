// 화면 아이콘 (U3): 코드로 그린 SVG 아이콘 묶음. 24px 격자, 선 굵기 하나(1.8), 둥근 끝, 색은 글자 색(currentColor)을 따른다.
// 메뉴·홈(로비)의 단추, 재화, 상태(잠김·별·자동·배속 …), 빈 상태의 그림이 함께 쓴다: 이모지 아이콘(✉ ⚙ 🔒 …)은 기기마다 모양·색이 달라 이것으로 바꿨다.
// 게임이 그림 파일을 'icon:<이름>'으로 등록하면(engine/client/art.ts의 registerArt) 그 그림이 이긴다: uiIcon()이 먼저 등록부를 본다.
// 이 파일은 화면 요소를 읽지 않고 만들기만 한다(불릴 때). 표(ICON_PATHS)는 시험이 node에서 읽는다 (engine/test/fx/client.test.ts).

/** 아이콘마다 SVG 안의 모양 (path·circle·rect). 좌표는 0~24 */
export const ICON_PATHS = {
  // 길
  home: '<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  // 소식·활동
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/>',
  notice: '<path d="M4 10v4h3l8 4.5V5.5L7 10H4z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/><path d="M7.5 14.2 9 19h2.5"/>',
  event: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="2.5"/>',
  gift: '<rect x="4" y="9" width="16" height="11.5" rx="1"/><path d="M3 6h18v3H3zM12 6v14.5"/><path d="M12 6c-1.5-3-5-3-5-.8S10 6 12 6c1.5-3 5-3 5-.8S14 6 12 6"/>',
  mission: '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5V3h6v1.5"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  season: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="m12 11.5 1.1 2.2 2.4.4-1.8 1.7.4 2.4-2.1-1.1-2.1 1.1.4-2.4-1.8-1.7 2.4-.4z"/>',
  achieve: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6h-3a3 3 0 0 0 3 4M16.5 6h3a3 3 0 0 1-3 4"/><path d="M12 13.5V17M9 20.5h6M10 17h4l.8 3.5H9.2z"/>',
  rank: '<path d="M3.5 8 7.5 12 12 5l4.5 7 4-4-1.5 10h-14z"/><path d="M5 20.5h14"/>',
  // 사람·소셜
  profile: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  friends: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M15.5 14.2a5 5 0 0 1 6 4.8"/>',
  chat: '<path d="M4.5 5h15A1.5 1.5 0 0 1 21 6.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17h-1A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5z"/><path d="M7.5 9.5h9M7.5 12.8h6"/>',
  guild: '<path d="M6 3.5h12v15l-6-3.5-6 3.5z"/><path d="M9.5 8h5"/>',
  // 수집·성장
  heroes: '<rect x="5.5" y="3.5" width="13" height="17" rx="2"/><path d="m12 8 1.3 2.6 2.8.4-2 2 .5 2.8-2.6-1.4-2.6 1.4.5-2.8-2-2 2.8-.4z"/>',
  squad: '<circle cx="12" cy="8" r="3"/><path d="M6.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="5" cy="10" r="2.2"/><circle cx="19" cy="10" r="2.2"/><path d="M1.8 17.5a3.5 3.5 0 0 1 4-3M22.2 17.5a3.5 3.5 0 0 0-4-3"/>',
  gacha: '<circle cx="12" cy="10.5" r="6.5"/><path d="M7 20.5h10M8.6 16 7.5 20.5M15.4 16l1.1 4.5"/><path d="M12 7.5v6M9 10.5h6"/>',
  adventure: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  sword: '<path d="M19.5 4.5 9.5 14.5M19.5 4.5V8l-8 8M19.5 4.5H16l-8 8"/><path d="m6.5 13.5 4 4M8.5 15.5l-4 4"/>',
  codex: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H19v14H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M8.5 8h6M8.5 11.5h4"/>',
  odds: '<path d="M18.5 5.5 5.5 18.5"/><circle cx="7.5" cy="7.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
  growth: '<path d="M4 17.5 9.5 12l3.5 3.5 7-7"/><path d="M15 8.5h5v5"/>',
  morph: '<path d="M4 6c3-1.5 13-1.5 16 0 0 7-3 13-8 13S4 13 4 6z"/><path d="M8 10.5h2.5M13.5 10.5H16M9.5 15c1.5 1 3.5 1 5 0"/>',
  // 장비·가방
  bag: '<path d="M6 9a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v10.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5z"/><path d="M9.5 5V3.5h5V5"/><path d="M9 13.5h6v3H9z"/>',
  gear: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z"/><path d="M12 7.5v9M8 11.5h8"/>',
  enhance: '<path d="M12 20V8M7 12.5l5-5 5 5"/><path d="M5 4h14"/>',
  salvage: '<path d="M6.5 4h11L21 9l-9 11L3 9z"/><path d="m13 4-2 5 3 3-2.5 5"/>',
  exchange: '<path d="M4 8.5h14.5M15 5l3.5 3.5L15 12"/><path d="M20 15.5H5.5M9 12l-3.5 3.5L9 19"/>',
  shop: '<path d="M4 9.5 5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8h13v-8"/><path d="M10 20v-4.5h4V20"/>',
  // 상태
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/><path d="M12 14.5V17"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5v-3a4 4 0 0 1 7.6-1.7"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  auto: '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4"/>',
  speed: '<path d="M4 6.5v11l7.5-5.5zM12.5 6.5v11l7.5-5.5z"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  play: '<path d="M7.5 5v14l11.5-7z"/>',
  sweep: '<path d="M5 6.5 10.5 12 5 17.5M12.5 6.5 18 12l-5.5 5.5"/>',
  // 재화
  coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
  shard: '<path d="M12 3 19 10 12 21 5 10z"/><path d="M5 10h14M12 3v18"/>',
  stamina: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z"/>',
  // 곳·전환
  map: '<path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  tower: '<path d="M8 21V9l4-5.5L16 9v12"/><path d="M6 21h12M10.5 21v-4h3v4M10.5 11.5h3"/>',
  field: '<path d="M2.5 19.5 9 9l4 6.5 2.5-3.5 6 7.5z"/><circle cx="16.5" cy="6" r="2"/>',
  swap: '<path d="M5 9a7.5 7.5 0 0 1 13.6-2.5M19 15a7.5 7.5 0 0 1-13.6 2.5"/><path d="M19 3.5V7h-3.5M5 20.5V17h3.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.6"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M5.5 18.5l1.8-1.8M16.7 7.3l1.8-1.8"/>',
  device: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
} as const satisfies Record<string, string>;

export type IconName = keyof typeof ICON_PATHS;
/** 그 이름의 아이콘이 있는가 */
export const isIconName = (s: string): s is IconName => Object.hasOwn(ICON_PATHS, s);

/** SVG 글 한 벌 (innerHTML로 넣는다). 크기는 css(.uic: 1.25em)가 정한다 */
export const iconSvg = (name: IconName): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;

/** 그림 파일로 덮어쓴 아이콘을 찾는 길 (art.ts가 건다: 'icon:<이름>'이 등록되어 있으면 그 주소) */
let fileOf: (name: string) => string | undefined = () => undefined;
export function setIconFiles(fn: (name: string) => string | undefined): void { fileOf = fn; }

/**
 * 아이콘 요소 하나 (<i class="uic">). 게임이 'icon:<이름>' 그림을 등록했으면 그 그림, 아니면 위의 SVG.
 * 모르는 이름이면 그 글자를 그대로 보인다 (게임이 글자 하나를 아이콘으로 쓰던 곳이 깨지지 않게)
 */
export function uiIcon(name: string, cls = ''): HTMLElement {
  const el = document.createElement('i');
  el.className = cls ? `uic ${cls}` : 'uic';
  el.setAttribute('aria-hidden', 'true');
  const file = fileOf(name);
  // 그림 아이콘은 'uic-art': 그린 그림은 작으면 뭉개져서 css가 그 칸만 키운다 (메뉴 묶음 탭·홈의 독·옆 단추·재화 줄), 잠김은 회색으로
  if (file) { const img = document.createElement('img'); img.src = file; img.alt = ''; el.append(img); el.classList.add('uic-art'); }
  else if (isIconName(name)) el.innerHTML = iconSvg(name);
  else { el.textContent = name; el.classList.add('uic-text'); }
  return el;
}
