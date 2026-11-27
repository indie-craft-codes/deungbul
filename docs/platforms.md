# 웹 전용 부분 분리 설계: 데스크톱(Steam)·모바일(앱 스토어) 대비

작성 2026-11-27. 조사·설계 문서다(처음 쓸 때는 저장소 코드를 고치지 않았다). **1단계(브라우저 직접 호출을 접점 뒤로)는 끝났다(2026-11-27, 가지 `feat/plat1`): 4절의 '1단계 결과'와 그 표가 1절의 줄마다 지금 상태다.**
표시: **[확인]** = 코드나 공식 문서에서 직접 봤다. **[추정]** = 경험·간접 근거로 그렇게 보지만 이 저장소나 기기에서 돌려 보지는 않았다.
읽은 곳: `C:\gamedev`(engine/, games/deungbul, games/sample, scripts/, docs/genre-features.md 5.2절·6절)와 `$TEMP/dg-work/web2`(가지 `feat/web2`, 읽기만).

---

## 0. 한 쪽 요약

- **웹 의존은 코드에서 52곳(같은 뜻끼리 묶어 표의 42줄)**. 대부분은 "WebView 안에서도 그대로 도는" 가벼운 것이고, 출시를 막는 큰 것은 다섯 갈래다: ① 서버 주소를 `location`·`server.json`·`trycloudflare` 임시 주소로 정하는 것, ② 신원 = `localStorage`의 토큰 하나, ③ 프로토콜 번호가 다르면 `location.reload()` 하나로만 푸는 것(앱은 새로고침으로 새 버전이 오지 않는다), ④ 게임 서버가 화면 파일(dist)까지 내보내는 한 몸 구조와 WebSocket `Origin` 검사 없음, ⑤ 입력·생명주기·호버가 브라우저 전제(`ev.key`, `pointer: coarse`, `title` 툴팁, `visibilitychange`만).
- **추천 래퍼**: 데스크톱은 **Electron**(Chromium을 묶어 세 OS에서 WebGL이 같다. Tauri의 WebView2 위에는 Steam 오버레이가 사실상 뜨지 않는데 Steam 결제 승인이 기본으로 오버레이에서 일어난다. 크기 손해는 Steam 배포에서 작다). 모바일은 **Capacitor 8**(지금의 Vite 빌드를 그대로 싣고, 결제·푸시·로그인·생명주기·Preferences 플러그인이 있다. 웹 감싸기만이면 Apple 4.2에 걸리므로 그 플러그인들이 곧 심사 근거). 근거는 2절.
- **설계의 줄기**: 클라이언트에 `engine/client/platform/`(web2 작업자가 만들 자리)을 두고 브라우저 API를 직접 부르는 곳을 모두 그 접점으로 돌린다. 기본 구현 `web`은 지금 동작과 같다. 서버는 정적 파일을 끌 수 있게 하고(`staticDir: null`), `Origin` 허용 목록과 **프로토콜 최소 지원 번호(min~max)** 를 둔다.
- **web2 진행 상황(11-27 08:02 기준, 기록)**: 이 설계를 쓸 때는 `feat/web2` 가지에 커밋이 없었고 `engine/client/platform/` 폴더도 없었다 [확인]. 그래서 아래 설계는 web2가 만들 접점의 **모양을 미리 맞추는 제안**으로 썼다(겹침 방지: 3.1의 '누가 무엇을'). **지금(2026-11-27 저녁)**: web2(묶음 2)가 접점 `engine/client/platform/`을 이 모양으로 만들어 합쳐졌고, 그 위에서 1단계가 끝났다.
- **단계의 상태 (2026-11-27)**: 1단계 — **끝**(`feat/plat1`, 4절 '1단계 결과'). 2단계 데스크톱 시제품 — **다음**. 3단계 모바일 시제품 — 그 뒤. 4단계 — **사용자 결정 대기**(비용·계약·정책).
- **설계와 다르게 된 것**: 버전 불일치의 닫힘 코드는 4004가 아니라 **4006**(4004는 묶음 1의 점검이 먼저 썼다). 아래 3.2·4절의 '4004'는 설계 때의 번호다.

---

## 1. 웹 의존 조사 (코드로 확인)

난이도: **하** = 접점 하나로 감싸면 끝(동작 그대로), **중** = 플랫폼마다 다른 구현이 필요, **상** = 설계 결정(서버·운영 포함)이 필요.
"WebView에서" 칸: Electron·Capacitor 안에서 손대지 않아도 도는가.

### 1.1 클라이언트 틀 (`engine/client`)

| # | 파일:줄 | 무엇 | 용도 | WebView에서 | 난이도 |
|---|---|---|---|---|---|
| 1 | `net.ts:14-22` | `location.protocol/host/hostname`, `import.meta.env.DEV/VITE_SERVER_URL/VITE_DEV_PORT` | WebSocket 주소 만들기. 빌드본은 "화면을 준 곳 = 서버" | **안 됨**: 앱은 `file://`·`app://`·`capacitor://localhost`·`https://localhost`에서 열리므로 `location.host`가 서버가 아니다 | **상** |
| 2 | `net.ts:28-37` | `fetch('./server.json')` | 정적 호스팅(GitHub Pages)에서 서버 주소를 파일로 받기 | 앱 번들 안의 파일을 읽게 되므로 주소를 바꾸려면 앱 업데이트가 필요 | 중 |
| 3 | `net.ts:39-69` | `localStorage` `'token'`(+`crypto.getRandomValues`) | **신원 전부**. 서버는 토큰 해시로 저장 키를 찾는다(`server.ts:309-314`) | 돈다. 다만 iOS WKWebView의 저장소는 OS가 지울 수 있다는 보고가 있다(2절) | **상** |
| 4 | `net.ts:82` | `new WebSocket(to)` | 연결 | 돈다 | 하 |
| 5 | `main.ts:76-90` | `document.hidden` + `visibilitychange` | 끊긴 뒤 화면이 숨겨져 있으면 보일 때까지 재접속을 미룬다 | 돈다. 모바일 앱은 OS의 일시정지·재개가 더 정확(Capacitor `App` `pause/resume`) | 중 |
| 6 | `main.ts:93-101, 196` | `PROTOCOL` 같음 비교 → `outdated()` → 단추가 `location.reload()` | 서버만 새 버전일 때 새로고침 권함 | **안 됨**: 앱은 새로고침해도 묶인 옛 화면이 다시 뜬다 → 끝없이 '새로고침' | **상** |
| 7 | `main.ts:105-112` | `navigator.standalone`, `screen.width/height`, `matchMedia('(orientation: landscape)')`, `innerWidth/innerHeight` | iOS 홈 화면 PWA의 가로 높이 버그 우회, 화면 크기 | 돈다(standalone 분기는 앱에서 안 탄다) | 하 |
| 8 | `main.ts:165-166` | `gesturestart/…`, `dblclick` preventDefault | iOS 사파리의 확대 막기 | 돈다(앱은 viewport 설정으로도 막힌다) | 하 |
| 9 | `main.ts:184-186` | `ResizeObserver`, `resize`, `orientationchange` | HUD 배치, 렌더러 크기 | 돈다 | 하 |
| 10 | `main.ts:191-192` | `URLSearchParams(location.search).get('auto')`, `location.reload()` | 개발용 자동 이름, 새로고침 | 앱엔 주소창이 없다(개발용이라 무해) | 하 |
| 11 | `i18n/index.ts:22-28` | `localStorage 'lang'`, `?lang=`, `navigator.language` | 언어 감지 | 돈다. `navigator.language`는 WebView에서 OS 언어를 돌려준다 [추정]. Steam은 Steam 클라이언트 언어(`GetCurrentGameLanguage`)를 우선해야 한다 | 하 |
| 12 | `i18n/index.ts:52` | `isTouch = matchMedia('(pointer: coarse)')` | `[[PC|터치]]` 문장 고르기, 조작 안내 | 돈다. 그러나 Steam Deck(터치+패드), 터치 노트북, 패드 사용자가 잘못 분류된다. CrazyGames는 "터치 감지로 모바일 판단 금지"(genre-features 6절) | 중 |
| 13 | `i18n/index.ts:71-74` | `document.documentElement.lang`, `document.title` | 문서 언어·제목 | 무해(창 제목은 래퍼가 따로) | 하 |
| 14 | `sound.ts:79` | `AudioContext ?? webkitAudioContext` | 효과음 합성·재생 | 돈다 | 하 |
| 15 | `sound.ts:300-304` | 첫 `pointerdown`/`keydown`에서 소리 깨우기 | 자동 재생 잠금 대응 | 돈다. Electron은 `autoplayPolicy: 'no-user-gesture-required'`로 잠금 자체를 끌 수 있다. 모바일은 통화·백그라운드 뒤 'interrupted' 복구가 필요 | 중 |
| 16 | `sound.ts:41`, `sound.ts:222` | `fetch(url)`, `new Audio(url)` + `createMediaElementSource` | 소리 파일, 배경음 스트리밍 | Electron을 `file://`로 열면 `fetch`·모듈 스크립트·미디어 소스가 막히거나 CORS로 소리가 0이 된다 [추정] → 사용자 정의 프로토콜(`app://`, `stream`·`corsEnabled` 권한) 필요 | 중 |
| 17 | `sound.ts:274, 289-295` | `localStorage` `'sound'`, 음량 | 설정 저장 | 돈다 | 하 |
| 18 | `social.ts:6,15` | `localStorage` 차단 목록 | 대화 차단 | 돈다(기기에만 있음 = 크로스 플랫폼에서 따라가지 않음) | 하 |
| 19 | `input.ts:36-58` | 캔버스 `pointerdown/move/up/cancel`, `wheel` | 탭 이동, 확대 | 돈다 | 하 |
| 20 | `input.ts:70-80` | 가상 조이스틱(DOM) `setPointerCapture` | 터치 이동 | 돈다 | 하 |
| 21 | `input.ts:83-93`, `bus.ts:39-46` | `window` `keydown/keyup/blur`, **`ev.key`** 소문자 비교 | 단축키, WASD | 돈다. 단, `ev.key`는 자판 배열·한글 입력 상태에 따라 값이 바뀐다(한글 상태에서 W가 'ㅈ' 또는 'Process') [추정]. 게임패드 입력 없음 | 중 |
| 22 | `scene/view.ts:49-52` | `WebGLRenderer({antialias})`, `devicePixelRatio` 상한 2, 그림자 2048 PCF | 3D 화면 | 돈다. 모바일 WebView에서 열·배터리·메모리 부담. **`webglcontextlost` 처리 없음** (grep 0건) | 중 |
| 23 | `hud/morph.ts:54` | 두 번째 `WebGLRenderer(preserveDrawingBuffer)` | 변신 미리보기 | 돈다. 모바일은 컨텍스트 수 제한·메모리 [추정] | 하 |
| 24 | `hud/minimap.ts:122`, `hud/worldmap.ts:84-96, 428-471, 503` | `devicePixelRatio`, `innerWidth`, 포인터·핀치·`wheel`, `pointerleave` 호버 툴팁 | 미니맵·세계 지도 | 돈다. 호버 툴팁은 터치에서 안 보인다(탭 대체는 있음) | 하 |
| 25 | `hud/channel.ts:13`, `hud/notify.ts:61`, `hud/party.ts:63-64` | `matchMedia(max-width…)`, `innerWidth/innerHeight` | 좁은 화면 배치 | 돈다 | 하 |
| 26 | `fx.ts:53` | `prefers-reduced-motion` | 흔들림 줄이기 | 돈다(OS 설정을 따른다) | 하 |
| 27 | `hud/bag.ts:88,105`, `hud/buffs.ts:21`, `hud/me.ts:108`, `hud/menu/gear.ts:143,210`, `hud/menu/market.ts:43`, `hud/skeleton.ts`(data-i18n-title), `i18n/index.ts:81` | **`title` 속성 툴팁** | 아이템 이름, 기술 설명, 잠금 안내 | **터치에서 안 보인다**(데스크톱에서는 OS 툴팁이라 게임 화면과 어울리지 않는다) | 중 |
| 28 | `style.css` (`:hover` 4곳, 등불지기 css 2곳), `@media (pointer: coarse)` 10여 곳 | 호버 강조, 터치용 크기 | 버튼 반응·배치 | 돈다. 호버 4곳은 장식뿐 [확인: 기능은 클릭에 있음] | 하 |
| 29 | `style.css:32, 50-312` | `user-select:none`, `touch-action:none`, `env(safe-area-inset-*)` 30여 곳, `viewport-fit=cover`(index.html) | 선택 막기, 노치 대응 | **이미 대응** [확인]. Android 15+의 edge-to-edge에서도 `env()`가 값을 주는지 기기 확인 필요 [추정] | 하 |
| 30 | `hud/shell.ts`, `hud/skeleton.ts`, `hud/*` (`innerHTML` 9파일) | DOM·CSS로 만든 HUD 전체 | 모든 창 | 돈다(3.3) | 유지 |
| 31 | `hud/device.ts:24-90` | 기기 옮기기 코드, `.devcode{user-select:all}` | 손님 진행을 다른 기기로 | 돈다. **복사 단추 없음**(클립보드 API 미사용 [확인]) → 모바일에서 길게 눌러 고르기 | 하 |
| 32 | `hud/menu/parts.ts:65,91`, `hud/chat.ts:48`, `hud/device.ts:39,78` | `<input>`+`keydown stopPropagation`, `<select>` | 글 입력 | 돈다. 모바일 가상 키보드가 화면을 밀어 올리는 동작은 플랫폼마다 다름(Capacitor `Keyboard` 설정) | 하 |
| 33 | `preload.ts`, `scene/gltf.ts:21-35`, `assets.ts` | `GLTFLoader.loadAsync(상대 URL)`, 동적 `import()` | 모델·조각 읽기 | `file://`에서는 막힘(16과 같은 이유) → `app://` 또는 Capacitor의 로컬 서버 | 하 |

### 1.2 게임 클라이언트 (`games/*/client`)와 페이지

| # | 파일:줄 | 무엇 | 용도 | WebView에서 | 난이도 |
|---|---|---|---|---|---|
| 34 | `games/deungbul/client/hud/guidelink.ts:11-19` | `<a target="_blank" href="./guide.html?lang=..">` | 도감을 새 창으로 | Electron은 새 BrowserWindow를 띄우거나(처리기 없으면) 막힌다. Capacitor는 `_blank`를 처리하지 않거나 바깥 브라우저로 넘긴다 [추정]. CrazyGames는 외부 링크 금지 | 중 |
| 35 | `games/deungbul/client/guide/main.ts:17-21, 70, 124-134` | `?lang=`, `localStorage`, `navigator.language`, `history.replaceState`, `location.hash` | 도감 페이지(따로 선 페이지) | 앱 안에서 같은 창 안 '도감 화면'으로 열면 돈다 | 하 |
| 36 | `games/deungbul/client/index.html` | `apple-mobile-web-app-*`, `manifest`, `theme-color`, `viewport-fit=cover`, `user-scalable=no` | 홈 화면 PWA | 무해(앱에서 무시) | 하 |
| 37 | `games/deungbul/client/public/manifest.webmanifest` | `display: standalone`, `orientation: any` | PWA | 앱은 자체 설정(AndroidManifest·Info.plist)이 대신 | 하 |
| 38 | `games/*/vite.config.ts` | `base: './'`, `outDir` 하나(dist / dist-sample), `__BUILD_TIME__`, `VITE_DEV_PORT` | 빌드 | 상대 경로라 앱 번들에 유리 [확인]. 빌드 대상(web/desktop/mobile) 구분 없음 | 중 |

### 1.3 서버 (`engine/server`)

| # | 파일:줄 | 무엇 | 용도 | 앱에서 | 난이도 |
|---|---|---|---|---|---|
| 39 | `net/server.ts:198-210`, `net/static.ts` | 게임 서버가 같은 포트에서 `dist/`를 내보냄(캐시 머리말·압축 없음), 관리자 `POST /admin`, `/healthz` 같은 처리기 | 한 프로세스로 화면+게임 | 앱은 화면을 묶어 가므로 서버는 WS만 있으면 된다. `staticDir`를 끌 방법이 없다(기본값이 저장소의 dist) | 중 |
| 40 | `net/server.ts:212, 499-503` | `new WebSocketServer({server})` — **`verifyClient`·`Origin` 검사 없음**, IP는 로컬 프록시일 때만 `cf-connecting-ip` | 연결 받기 | 지금은 어떤 출처든 붙는다(앱도 붙음). 토큰이 쿠키가 아니라 CSWSH 위험은 낮지만, 계정·결제가 들어오면 허용 목록이 필요 | 중 |
| 41 | `net/server.ts:332,349`, `shared/protocol.ts:15` | `welcome.v = PROTOCOL(3)`, 클라이언트는 **같음**만 허용 | 버전 맞춤 | 앱 업데이트는 며칠~몇 주 늦게 퍼진다 → 서버 배포 순간 앱 사용자 전원이 막힌다 | **상** |
| 42 | `scripts/pilot.mjs:5-51`, `scripts/publish.sh`, `games/deungbul/deploy.json` `pages` | cloudflared **빠른 터널(실행마다 주소가 바뀜)** + GitHub Pages + `server.json` | 시험 공개 | 앱은 고정 도메인(wss://…)이 필요. 지금 방식은 웹 전용 | 중 |

**합계**: 표 42줄, 줄마다 1~10곳이 묶여 있어 코드 위치로 52곳(`title` 툴팁 같은 반복은 1곳으로 셈) [확인: 위 grep 결과로 셌다].

**없는 것(앞으로 Platform이 맡을 빈칸)** [확인: grep 0건]: 클립보드, 파일 내려받기, 전체 화면 API(`requestFullscreen`), 화면 방향 고정(`screen.orientation.lock`), 공유·초대(`navigator.share`), 진동, 알림·푸시, 서비스 워커, `window.onerror`/`unhandledrejection` 오류 수집, `beforeunload`, 게임패드(`navigator.getGamepads`), 결제, 외부 로그인, 광고.

### 1.4 큰 것 상위 15 (출시를 막거나 구조를 바꾸는 순)

1. **#41+#6 프로토콜 같음 비교 + `location.reload()`** — 앱 배포의 첫 사고 지점.
2. **#1 서버 주소를 `location`에서 만듦** — 앱에서는 바로 접속 실패.
3. **#42 임시 터널 주소** — 앱에 박을 고정 주소가 없음.
4. **#3 신원 = localStorage 토큰** — iOS 저장소 삭제·앱 삭제 시 캐릭터를 잃음. 플랫폼 로그인(Steam·Apple·Google)으로 묶을 자리가 없음.
5. **#39 화면+게임 한 몸 서버** — 서버를 화면 없이 띄울 설정이 없음.
6. **#40 Origin 검사 없음** — 앱 출처(`capacitor://localhost` 등)를 포함한 허용 목록 필요.
7. **#16·#33 상대 URL `fetch`·`import()`** — Electron `file://`에서 깨짐(사용자 정의 프로토콜로 해결).
8. **#21 `ev.key` 단축키, 게임패드 없음** — Steam(특히 Deck) 출시 요건에 닿음.
9. **#12 `isTouch` = `pointer: coarse`** — 입력 장치를 Platform이 알려야 함.
10. **#27 `title` 툴팁** — 터치·패드에서 정보가 안 보임.
11. **#5 생명주기 = `visibilitychange`만** — 모바일 백그라운드에서 소켓 정지·재개, 소리 중단을 앱 사건으로.
12. **#22 렌더러 고정 품질·컨텍스트 손실 처리 없음** — 모바일 WebView 발열·탭 전환 뒤 검은 화면.
13. **#34 도감 `target=_blank`** — 앱·포털에서 링크 열기 규칙이 다름.
14. **#15 소리 잠금·중단 복구** — 모바일 통화·알림 뒤 소리 꺼짐.
15. **#38 빌드 출력이 웹 하나** — `build:desktop`/`build:mobile` 구분과 환경 값 주입이 없음.

---

## 2. 목표 플랫폼별 요구

(웹 조사 결과로 채움: 2.1 데스크톱, 2.2 모바일, 2.3 공통. 아래 표시는 출처를 단 항목만 [확인].)

표시: [확인] 공식 문서·공식 발표, [2차] 언론·포럼·이슈, [추정] 원문 미열람·일반 지식. (웹 조사 2026-11-27)

### 2.1 데스크톱: Electron vs Tauri v2

| 항목 | Electron | Tauri v2 | 우리 게임에 주는 뜻 |
|---|---|---|---|
| 크기 | 설치본 80~300MB(실측 예 201MB, 244MiB) [2차] | 수~수십 MB(실측 예 12MB, 8.6MiB) [2차] | Steam 배포에서는 크기 차이가 작은 문제. 자산이 커질수록 상대 차이도 줄어든다 [추정] |
| 렌더러 | Chromium 고정 → 세 OS에서 같은 WebGL | Windows WebView2(Chromium), macOS WKWebView, Linux WebKitGTK | Linux WebKitGTK는 NVIDIA에서 빈 창·느린 WebGL 경로, GPU 이름을 "Apple GPU"로 보고해 품질 판단 불가 [확인]. macOS WKWebView에서만 끊긴다는 Babylon 보고 [2차]. **Three.js는 Electron이 안전** |
| 자동 업데이트 | electron-updater [추정] | tauri-plugin-updater, 서명 의무 [확인] | Steam판은 Steam이 업데이트하므로 끈다 [추정]. 직접 내려받기 판에만 |
| Steam 오버레이 | `steamworks.js`의 `electronEnableSteamOverlay()` + `--in-process-gpu`(+`--disable-direct-composition`), GPU에 따라 겹침·안 뜸 보고 [2차] | **WebView2 위에는 사실상 안 뜬다** [2차] | Steam 결제 승인은 기본이 오버레이 → **Tauri는 Steam판에 불리**. 오버레이가 불안하면 결제는 `usersession=web`(브라우저 승인)으로 우회 가능 [확인] |
| Steam 인증 | 클라이언트 `GetAuthTicketForWebApi` → 16진 티켓을 서버로 → 서버가 `ISteamUserAuth/AuthenticateUserTicket`(퍼블리셔 키, 서버에서만) [확인] | 같음(steamworks-rs) [추정] | 3.2의 auth 어댑터 `steam` |
| 클라우드 저장 | Steam Auto-Cloud: 코드 없이 경로 지정 [확인] | 같음 | 진행은 서버 DB. 설정 파일 정도만 [추정] |
| Steam 안 결제 | 게임 안 구매는 **마이크로트랜잭션 API로 Steam Wallet만** [확인] | 같음 | Steam판에서 웹 결제·외부 결제 링크 불가. `InitTxn`→승인→`FinalizeTxn`, 환불은 `GetReport` 하루 1회 [확인] |
| 게임패드 | Gamepad API(Chromium) + Steam Input. Steam Input 흉내 모드는 마우스·패드 동시 입력 게임에서 문제 많음 [확인]. Electron 27+에서 Steam Input 켜면 패드 안 됨 단일 보고 [2차] | WebView2는 Gamepad API 지원 [추정] | 2단계 시제품에서 Steam Input 켬/끔 둘 다 시험 |
| 창·해상도 | BrowserWindow 크기·전체 화면 자유 | 같음 | Platform `display.fullscreen` |
| 서버 주소 | 빌드 값 + 원격 설정 | 같음 | 3.2 |
| 코드 서명 | Windows: Azure Artifact Signing은 **개인은 미국·캐나다 거주자만**(조직은 미·캐·EU·영) → 한국 개인은 CA의 OV 인증서 구매 [확인]. macOS: Apple Developer Program 연 99달러 + 공증 [확인/추정] | 같음 | Steam 안에서는 서명 없이도 실행은 되지만 백신 오탐·SmartScreen 경고 위험 [추정] |
| Steam Direct | 앱당 100달러, 조정 총수익 1,000달러 넘으면 돌려받음 [확인] | | 4단계 결정 |

**추천: Electron** — 까닭: (1) Chromium 고정으로 Three.js·WebGL 동작이 웹 시험과 같다(Linux·macOS의 WebKit 변수가 없음), (2) Steam 오버레이·결제 승인 경로가 Electron에서만 실용적, (3) `steamworks.js` 사례가 가장 많다. 크기 손해는 Steam 배포에서 작다. Tauri는 "Steam 없이 작은 설치본"이 목표가 될 때 다시 본다.

### 2.2 모바일: Capacitor vs 직접 WebView vs 이식

| 방식 | 장점 | 단점 |
|---|---|---|
| **Capacitor 8**(2025-12 출시, iOS 15+, Android minSdk 24·target 36) [확인/2차] | 지금 Vite 빌드를 그대로 `webDir`로. 결제·푸시·로그인·App 생명주기·Preferences·Keyboard·StatusBar·ScreenOrientation 플러그인 | 플러그인 의존, WebView 성능 한계 |
| 직접 WebView(Android `WebView`/iOS `WKWebView`) | 의존 최소 | 결제·푸시·로그인 다리를 전부 직접 [추정] |
| React Native / 게임 엔진 이식 | 네이티브 성능 | Three.js·DOM HUD 다시 쓰기 [추정] → 지금은 아님 |

**추천: Capacitor** — 지금 코드를 그대로 싣고, 스토어 심사에 필요한 네이티브 기능(인앱 결제·푸시·로그인·계정 삭제)을 플러그인으로 더할 수 있다.

**스토어·정책 요건**

| 주제 | 내용 | 출처 표시 |
|---|---|---|
| Apple 4.2 최소 기능 | "repackaged website"를 넘어야 함 → 웹 감싸기만이면 거절 위험. 푸시·인앱 결제·네이티브 로그인·오프라인 자원 번들이 근거가 된다 [추정] | [확인] 원문 |
| Apple 3.1.1 | 게임 화폐·아이템은 인앱 결제 의무 | [확인] |
| Apple 3.1.1(a) 미국 | 미국 스토어는 외부 구매 버튼·링크 허용(권한 불요), 다른 나라는 금지. 외부 링크 수수료는 2025-12 항소심이 "합리적 수수료" 허용 → 2026-04 이후 1심이 요율 결정 중, **11월 현재 확정 여부 미확인** | [확인]/[2차] |
| EU DMA | 2026-10-01부터 스토어 밖 배포 5% CTC, 스토어 IAP 26%(대부분 15%) | [확인] 애플 발표 |
| 한국 | Apple: 한국 전용 바이너리에서 KCP·이니시스·토스·NICE(수수료 26%는 2022 자료) / Google: 대체 결제 시 수수료 4%p 인하 | [확인]/[2차] |
| Google Play 결제 | 디지털 상품은 Play 결제 의무(대체 결제·외부 링크 프로그램 예외). 미국은 2025-10-29부터 외부 링크·대체 결제 허용, **2026-10-01부터 거래 보고·수수료 시작**. 2026-06-30부터 미국·EEA·영국은 서비스 수수료(연 첫 100만 달러 10%) + Play 결제 수수료 5% 분리 | [확인] |
| 계정 삭제 | Apple 5.1.1(v): 계정 생성 가능하면 앱 안 삭제. Google: **앱 밖 웹 링크**로도 계정·데이터 삭제 요청 가능해야 함(Data safety에 링크) | [확인] |
| Apple 4.8 로그인 | 제3자·소셜 로그인을 주 계정에 쓰면 "동등한 선택지"(이름·이메일만 수집, 이메일 가리기, 동의 없는 추적 없음) 함께 제공. Sign in with Apple을 이름으로 지목하진 않음. **자체 계정·손님만이면 면제** | [확인] |
| Play Games Services v2 | 켤 때 자동 로그인 시도 → 실패 시 수동 버튼. **PGS를 주 계정 체계로 쓰면 안 됨** | [확인] |
| 백그라운드 WebSocket | iOS는 정지되면 네트워크 불가, `beginBackgroundTask`로 약 30초 정리 시간만. 앞으로 올 때 재접속, 그 사이 알림은 푸시 | [2차] 애플 포럼 |
| 푸시 | `@capacitor/push-notifications`로 FCM·APNs | [추정] |
| 저장소 | Capacitor 문서: "Mobile OSs may periodically clear data set in window.localStorage" → **토큰은 Preferences(UserDefaults/SharedPreferences) 또는 보안 저장소로**. 앱 삭제 시 함께 지워짐 | [확인] |
| 백업 | iCloud·Android Auto Backup이 앱 데이터를 기본 포함 [추정] → 토큰이 다른 기기로 복원될 수 있음: 서버의 "밀어내기(4000)"가 이미 한 토큰 한 연결을 보장 [확인: server.ts:316-319] |
| 안전 영역·방향 | `viewport-fit=cover`+`env(safe-area-inset-*)`(이미 있음), 방향은 Info.plist/AndroidManifest 또는 `@capacitor/screen-orientation` | [추정] |
| WebView 성능 | Android System WebView = Chrome 엔진, iOS WKWebView = Safari 엔진(WebGL이 Safari보다 느리다는 보고), iOS 26 WebGPU 기본 켜짐(26.0.x 캔버스 깜박임 버그) | [추정]/[확인] |
| 등급·라벨 | Google은 IARC 설문, Apple은 자체 연령 설문. App Privacy·Data safety 필수 | [추정] |
| 계정 비용 | Apple 연 99달러, Google 1회 25달러(선불카드 불가) | [확인] |
| 대상 API | 2026-08-31부터 신규·업데이트는 API 36(Android 16) 대상, 기존 앱은 35 이상 | [확인] |
| 새 개인 개발자 | 2023-11-13 이후 개인 계정은 **12명 이상 14일 연속 비공개 테스트** 뒤 정식 출시 신청. 조직 계정 면제(D-U-N-S 필요) [2차] | [확인] |

### 2.3 공통

- **플랫폼 로그인**: Steam(세션 티켓 → 서버 검증), Apple(4.8 조건부 의무), Google(PGS는 보조 신원, 주 계정 금지), 포털(CrazyGames는 외부 로그인 금지·포털 계정 자동 로그인 필수). → 서버에 **우리 계정(저장 키)** 을 두고 플랫폼 신원 여러 개를 묶는 구조가 모든 규정과 맞는다 [추정: 규정들의 교집합].
- **결제·영수증 서버 검증**:
  - Apple: App Store Server API `Get Transaction Info` → `signedTransactionInfo`(JWS), App Store Server Library의 `verifyAndDecodeTransaction` 권장 [확인].
  - Google: `purchases.productsv2.getproductpurchasev2`로 구매·acknowledge 상태 조회, 서비스 계정 필요 [확인].
  - Steam: `InitTxn` → 승인 → `FinalizeTxn` 성공 뒤 지급, 실패·시간 초과는 `QueryTxn`/`GetReport`, 환불 회수는 `GetReport` 하루 1회, 시험은 `ISteamMicroTxnSandbox` [확인].
  - 포털: CrazyGames는 초대받은 경우만 Xsolla로, Poki는 **결제 불가** [확인].
- **크로스 저장**: 진행이 서버 DB에 있으므로 이미 구조상 가능 [확인]. 막는 것은 신원 묶기(3.2-6)뿐. 
- **크로스 플레이**: 같은 서버·같은 프로토콜이면 됨. 다만 **크로스 구매**(Apple에서 산 화폐를 Steam에서 쓰기)는 각 스토어 규정 해석이 필요 [추정: 원문 미확인 → 4단계 결정].
- **버전 호환**: 앱은 심사(1~3일 [추정]) + 사용자 업데이트 지연 → 3.2-4의 `PROTOCOL_MIN` 호환 기간이 필수.
- **포털 요약**: CrazyGames — SDK 필수(정식 출시), 광고는 SDK로만·광고 차단기에서도 동작, 외부 로그인 금지, 첫 받기 50MB·전체 250MB [확인]. Poki — Poki SDK 광고만, 외부 링크는 `PokiSDK.openExternalLink`, 외부 요청 기본 차단, 결제 불가 [확인]. 결제·외부 서버를 쓰는 MMO와 Poki는 잘 맞지 않는다 [추정].

**확인하지 못한 것**: 애플 미국 외부 링크 수수료 확정 여부, 구글 미국 외부 링크 수수료 요율, 애플 한국 26%의 2026년 현재 값, Tauri 이슈 #6196 본문, Steam macOS판 공증 의무 원문, IARC·안전 영역 공식 원문, 각 래퍼에서 WebSocket `Origin` 머리말의 정확한 값.

---

## 3. 분리 설계

### 3.1 클라이언트 `Platform` 접점

**자리**: `engine/client/platform/` (web2 작업자가 받은 지시와 같은 자리).

```
engine/client/platform/
  index.ts      Platform 형(type)과 현재 구현을 고르는 곳: platform(), setPlatform(p), has(feature)
  web.ts        기본 구현 = 지금 동작 그대로 (localStorage, location, visibilitychange …)
  memory.ts     시험용(node): 저장소는 Map, 생명주기는 수동
  (나중) desktop.ts   Electron preload가 노출한 window.lampkeeper.* 를 부른다
  (나중) mobile.ts    Capacitor 플러그인을 부른다 (동적 import: 웹 번들에 안 들어가게)
  (나중) portal-crazygames.ts / portal-poki.ts   포털 SDK
```

**고르는 법**: 게임 진입점이 `startClient({ platform })`에 넘기거나, 빌드 대상 값(`import.meta.env.VITE_TARGET`)으로 `index.ts`가 고른다. 주지 않으면 `web`. **기본 = 지금 동작**이므로 황금 실행과 화면이 같다.

**누가 무엇을(겹침 방지)**: web2 작업자는 묶음 2(설정 창·탭 숨김·오류 수집·약관·데이터 삭제·튜토리얼·`AuthProvider`·`Platform`의 포털용 칸)를 만든다. 이 문서의 칸 중 **storage, lifecycle, errors, auth(guest), ads(gameplayStart/adBreak/rewarded), invite**는 web2의 칸과 같은 이름·모양을 쓰자고 제안하고, 나머지(server, input, display, links, clipboard, files, notify, purchase, achievements, cloud, app)는 web2가 끝난 뒤 같은 파일에 더한다.

**모양** (동기/비동기를 칸마다 정함. 모든 비동기는 실패해도 throw하지 않고 결과 값으로 알림):

```ts
export type Feature =
  | 'storage.durable'   // 저장이 OS에 의해 지워지지 않는다 (앱 저장소)
  | 'lifecycle.pause'   // 진짜 일시정지/재개 사건이 있다 (모바일 앱)
  | 'input.gamepad' | 'input.touch' | 'input.keyboard'
  | 'display.fullscreen' | 'display.orientation' | 'display.safeArea'
  | 'link.external' | 'share' | 'clipboard' | 'files.save'
  | 'notify.local' | 'notify.push'
  | 'auth.steam' | 'auth.apple' | 'auth.google' | 'auth.portal'
  | 'purchase' | 'achievements' | 'cloudSave' | 'ads' | 'ads.rewarded'
  | 'app.update';      // 스토어/런처로 업데이트를 열 수 있다

export interface Platform {
  readonly id: 'web' | 'desktop' | 'mobile' | 'crazygames' | 'poki' | 'test';
  has(f: Feature): boolean;                       // 동기. 화면이 단추를 보일지 정한다

  /** 키-값 저장. 동기 읽기가 필요하므로(언어·소리는 첫 그림 전에 읽는다) 시작 때 한 번 비동기로 채우고 이후는 메모리+뒤쪽 쓰기 */
  storage: {
    ready(): Promise<void>;                       // 앱: Preferences/파일에서 읽어 메모리에 채움. web: 즉시
    get(key: string): string | null;              // 동기
    set(key: string, v: string): void;            // 동기(뒤에서 영구화)
    remove(key: string): void;
    /** 비밀 값(기기 토큰, 로그인 토큰): 앱은 Keychain/Keystore, web은 localStorage */
    secret: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<boolean>; remove(k: string): Promise<void> };
  };

  /** 생명주기. web: visibilitychange·pagehide, 앱: App pause/resume, Electron: blur/focus/minimize */
  lifecycle: {
    visible(): boolean;
    on(ev: 'hide' | 'show' | 'pause' | 'resume' | 'quit', fn: () => void): () => void;
  };

  /** 입력 장치. isTouch(i18n)와 조작 안내가 여기를 묻는다. 패드는 매 프레임 읽기 */
  input: {
    primary(): 'mouse' | 'touch' | 'gamepad';     // 마지막으로 쓴 장치 (사건으로 바뀜)
    onChange(fn: (k: 'mouse' | 'touch' | 'gamepad') => void): void;
    gamepad(): { x: number; z: number; buttons: readonly boolean[] } | null; // web도 Gamepad API로 구현 가능
    keyName(ev: KeyboardEvent): string;           // ev.code 기준 이름 (자판·한글 상태와 무관)
  };

  audio: {
    /** 소리를 깨워도 되는 때를 알린다. web: 첫 입력, Electron: 즉시, 모바일: 첫 입력 + 재개 때 다시 */
    onUnlock(fn: () => void): void;
    onInterrupt(fn: (on: boolean) => void): void; // 통화·광고 중 음소거
  };

  display: {
    fullscreen: { can(): boolean; is(): boolean; set(on: boolean): Promise<boolean> };
    orientation: { lock(o: 'landscape' | 'portrait' | 'any'): Promise<boolean> };
    safeArea(): { top: number; right: number; bottom: number; left: number }; // web: CSS env()로 충분하면 0을 돌려도 됨
    pixelRatioCap(): number;                      // 품질 단계: web 2, 모바일 기본 1.5 [추정 값]
  };

  /** 링크·공유·클립보드·파일 */
  openUrl(url: string, how?: 'external' | 'inApp'): Promise<boolean>;      // 도감·약관·스토어 페이지
  share(d: { text: string; url?: string }): Promise<boolean>;             // 초대 코드
  copy(text: string): Promise<boolean>;                                   // 기기 옮기기 코드
  saveFile(name: string, data: Blob | string, mime: string): Promise<boolean>; // 내 데이터 내보내기(묶음 2 g21)

  notify: {
    permission(): Promise<'granted' | 'denied' | 'prompt'>;
    register(): Promise<{ token: string; kind: 'fcm' | 'apns' | 'webpush' } | null>; // 서버에 등록
    local(at: number, title: string, body: string): Promise<boolean>;     // "자리 비움 사냥 끝" 같은 것
  };

  /** 인증: 플랫폼이 준 증명을 서버로 보낸다. 서버가 검증하고 저장 키에 묶는다 */
  auth: {
    providers(): readonly ('guest' | 'steam' | 'apple' | 'google' | 'portal')[];
    proof(p: 'steam' | 'apple' | 'google' | 'portal'): Promise<{ kind: string; ticket: string } | null>; // Steam 세션 티켓, Apple identityToken, Google 서버 인증 코드, 포털 JWT
  };

  /** 결제: 화면은 상품 id만 안다. 영수증은 서버가 검증하고 아이템은 서버가 준다 */
  purchase: {
    products(ids: readonly string[]): Promise<{ id: string; price: string }[]>; // 현지화된 가격 문자열
    buy(id: string): Promise<{ kind: 'steam' | 'apple' | 'google' | 'portal'; receipt: string } | { cancelled: true } | { error: string }>;
    onPending(fn: (receipt: { kind: string; receipt: string }) => void): void;  // 앱 재시작 뒤 끝나지 않은 거래
  };

  achievements: { unlock(id: string): Promise<boolean> };     // Steam 업적. 서버가 확정한 사건만
  cloud: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<boolean> }; // 진행은 서버 DB라 설정 정도만

  ads: {                                                      // web2의 포털 칸과 같게
    gameplayStart(): void; gameplayStop(): void;
    adBreak(where: string): Promise<void>;
    rewarded(why: string): Promise<boolean>;
  };
  invite(room: { code: string; size?: number }): void;

  errors: { report(e: { msg: string; stack?: string; where: string }): void }; // web2의 오류 수집과 같은 끝점

  /** 서버 주소와 앱 버전 */
  server(): Promise<string>;                                 // 3.2
  app: {
    version(): string;                                       // 빌드의 앱 버전 (package.json + 빌드 번호)
    build(): number;                                         // 단조 증가하는 빌드 번호 (스토어 versionCode와 같게)
    /** 서버가 "이 버전은 너무 오래됨"이라고 할 때: web은 reload, 앱은 스토어/Steam 페이지 열기 */
    requireUpdate(storeUrl?: string): void;
  };
}
```

**지금 코드에서 바꿀 곳(1절 번호와 연결)**:

| 칸 | 지금 부르는 곳 | web 구현 |
|---|---|---|
| storage | #3 `net.ts`, #11·#13 `i18n`, #17 `sound.ts`, #18 `social.ts`, #35 도감 | `localStorage` + try/catch (지금과 같은 키 이름 `token`·`lang`·`sound`·음량 키·차단 키 — **키 이름을 바꾸지 않는다**: 기존 사용자의 진행 유지) |
| lifecycle | #5 `main.ts:82` | `document.hidden`·`visibilitychange` |
| input | #12 `isTouch`, #21 `input.ts`·`bus.ts` | `pointer: coarse` + 마지막 포인터 종류. `keyName`은 1단계에서는 `ev.key.toLowerCase()`(동작 같게), 2단계에서 `ev.code` 기반으로 바꾸고 표(keys.ts)를 맞춘다 |
| audio | #15 `sound.ts:300` | 첫 `pointerdown`/`keydown` |
| display | #7·#9 `main.ts`, #22 `view.ts` | 지금 값(DPR 상한 2) |
| openUrl | #34 도감 링크 | `<a target=_blank>` 동작 그대로(`window.open`) |
| copy | #31 기기 코드 | `navigator.clipboard.writeText`(없으면 false → 지금처럼 고르기) |
| server | #1·#2 `net.ts` | 지금의 `url()`+`server.json` 그대로 |
| app.requireUpdate | #6 `main.ts:191` | `location.reload()` |
| errors | (없음, web2가 만듦) | web2의 끝점 |

**규칙**: `engine/client` 안에서 `localStorage`·`location`·`navigator`·`window.open`·`document.addEventListener('visibilitychange')`를 **platform/ 밖에서 쓰지 않는다**. `engine/test/boundary.test.ts`(이미 있는 경계 시험)에 금지 낱말 검사를 더하면 다시 새지 않는다.

### 3.2 서버 쪽

1. **정적 파일과 게임 서버 분리** — `runServer`/`startServer` 옵션 `staticDir: string | null`. `null`이면 `serveStatic`을 만들지 않고 404만(관리자·`/healthz`·`/metrics`는 그대로). 배포는 세 가지를 다 지원: (a) 지금처럼 한 몸(웹 시험), (b) 화면은 CDN/GitHub Pages/포털, 서버는 WS 전용, (c) 앱(화면은 앱 안).
2. **서버 주소 결정 순서(클라이언트 `platform.server()`)** — ① 빌드 때 박은 `VITE_SERVER_URL`(앱 기본값) → ② 원격 설정 파일 `https://<고정 도메인>/server.json`(앱도 읽음: 서버를 옮겨도 앱 업데이트 없이) → ③ 같은 출처(웹 한 몸). 앱의 ②는 **고정 도메인**이어야 하므로 cloudflared **이름 있는 터널** 또는 실제 도메인이 필요(사용자 결정 4단계).
3. **Origin 검사** — `WebSocketServer({ verifyClient })`로 허용 목록: 웹 도메인들, `capacitor://localhost`(iOS), `https://localhost`(Android Capacitor 기본), Electron의 `app://lampkeeper`(사용자 정의 프로토콜을 쓸 때) [추정: 정확한 Origin 문자열은 2단계 시제품에서 실제 머리말로 확인], 개발용 `http://localhost:*`. **Origin 없음**(네이티브·부하 도구·시험)도 허용하되 설정으로 끌 수 있게. 보안의 본체는 Origin이 아니라 토큰·인증이다(Origin은 남의 웹 페이지가 사용자의 브라우저로 붙는 것만 막는다).
4. **프로토콜 버전 협상과 호환 기간** —
   - `join`에 `v`(클라이언트 프로토콜 번호)와 `app`(플랫폼·앱 빌드 번호)을 싣는다. 서버는 `PROTOCOL_MIN..PROTOCOL`을 받는다.
   - 범위 밖이면 `welcome` 대신 `{ t: 'update', min, store? }`를 보내고 닫는다(새 닫힘 코드 4004). 화면은 `platform.app.requireUpdate(store)`.
   - 범위 안의 옛 클라이언트에는 **서버가 옛 모양으로 보낸다**: 메시지 모양을 바꾸는 변경은 "칸을 더하기만"을 원칙으로 하고(protocol.ts의 주석이 이미 그렇게 말한다), 어쩔 수 없이 바꾸면 `send` 앞에 버전별 변환기(`downgrade[v](msg)`)를 둔다.
   - 호환 기간(제안): 웹 0일(새로고침), 데스크톱(Steam) 2~3일(Steam은 실행 때 자동 업데이트), 모바일 **최소 2~4주** 이후 강제(스토어 심사 1~3일 + 사용자 업데이트 지연) [추정: 업계 관행 값. 2절 근거 확인].
   - 기존 `welcome.v` 같음 비교는 web에서만 유지(지금 동작).
5. **플랫폼별 영수증 검증 접점** — `engine/server`에 `purchase` 핵심 시스템 후보: `verify(kind, receipt) → { productId, txId, ok }`를 `steam|apple|google|portal` 어댑터로. 같은 `txId`는 한 번만 지급(저장소에 거래 표). 지급은 `ledger`(이미 있는 경제 기록)로. 환불 통지(Apple Server Notifications v2, Google RTDN, Steam의 환불 조회)로 회수 규칙은 경제 결정에 맡긴다.
6. **인증 접점** — 서버 `auth` 어댑터: Steam(`ISteamUserAuth/AuthenticateUserTicket` 웹 API), Apple(identityToken JWT를 Apple 공개 키로 검증), Google(PGS 서버 인증 코드 교환), 포털(JWT). 결과는 **외부 신원 → 저장 키** 표에 묶는다. 손님 토큰 캐릭터를 처음 로그인할 때 그 신원에 붙인다(기기 옮기기 handoff와 같은 길). 계정 삭제(앱 스토어 의무)는 web2의 데이터 삭제와 같은 끝점.

### 3.3 HUD가 DOM인 것

**그대로 써도 된다** [확인/추정 표시]:
- Electron은 Chromium 그대로이고, Capacitor도 시스템 WebView라서 DOM·CSS HUD가 웹과 똑같이 그려진다 [확인: 래퍼의 성격]. 다시 만들 필요 없다.
- 장점: i18n(`data-i18n`)·접근성(aria)·글 입력(IME)·스크롤이 공짜, 웹과 한 벌. 큰 변경 없이 세 플랫폼.
- 단점: 창이 많을 때 레이아웃 비용(모바일 저가 기기), 게임패드로 DOM 버튼을 고르는 '초점 이동'을 따로 만들어야 함, Steam 오버레이·OS 툴팁과의 어울림, 텍스트가 많은 창의 그리기 비용 [추정].

**앞으로 피할 것(규칙으로)**:
1. **호버 전제 금지**: 정보를 `title`·`:hover`·`pointerleave`로만 보이지 않는다. 길게 누르기/탭으로 여는 공용 툴팁(`hud/tip.ts` 후보)으로 #27을 옮긴다.
2. **누름 영역 최소 44×44 CSS px**(Apple HIG 권장) — 지금 `@media (pointer: coarse)`의 패딩으로 일부 키움. 모든 단추를 검사하는 시험(화면 찍기 도구로 크기 측정)을 둔다.
3. **브라우저 전용 API 직접 호출 금지**(3.1 규칙): `alert/confirm/prompt`(지금 0건 [확인]), `window.open`, 새 탭 전제, `location.*`.
4. **패드로 다룰 수 있게**: 창마다 초점 순서(`tabindex`), 확인/취소 키 고정(Enter/Esc = A/B).
5. **글자 크기 배율**(묶음 2 설정 창)과 **안전 영역**은 CSS 변수로만.
6. **외부 링크 숨기기**: `platform.has('link.external')`가 false(포털·일부 앱)면 링크 단추를 그리지 않는다.

### 3.4 빌드

| 명령(제안) | 출력 | 내용 |
|---|---|---|
| `build:web` (= 지금 `build`) | `dist/`, `dist-sample/` | 지금과 같다(바이트 같게). `VITE_TARGET=web` |
| `build:desktop` | `build/desktop/<게임>/app/` (화면) + `desktop/` 래퍼 프로젝트 → `out/` | 같은 Vite 빌드 + `VITE_TARGET=desktop`, `VITE_SERVER_URL=wss://고정주소`. 도감은 같은 폴더(앱 안 창). 래퍼는 저장소 뿌리의 `apps/desktop/`(Electron main·preload) |
| `build:mobile` | `build/mobile/<게임>/www/` → `apps/mobile/`(Capacitor `android/`, `ios/`) | 같은 빌드 + `VITE_TARGET=mobile`. `npx cap sync`가 www를 복사 |

- **환경 값**: `VITE_TARGET`(web|desktop|mobile|crazygames|poki), `VITE_SERVER_URL`, `VITE_CONFIG_URL`(원격 server.json), `VITE_APP_BUILD`(빌드 번호), `VITE_STORE_URL`. 이 값으로 `platform/index.ts`가 구현을 고르고, 쓰지 않는 구현은 **동적 import**로 번들에서 빠진다(웹 바이트 유지).
- **자원 묶기**: 앱은 오프라인 번들(모델·소리 전부 앱 안). 지금 등불지기 `dist/` 1.5MB, 예제 1.4MB [확인: genre-features 6절의 11-27 측정]라 묶어도 작다. 서버 연결은 온라인 필수(MMO)이므로 "오프라인"은 화면 자원만.
- **게임별**: `games/<게임>/deploy.json`에 `desktop: { appId, name, steamAppId? }`, `mobile: { appId: 'com.….lampkeeper', orientation }` 칸 후보. 없으면 그 대상으로 빌드하지 않는다(지금의 `pages`와 같은 방식).

---

## 4. 단계별 실행 계획

### 1단계 — 지금 할 수 있는 것 (비용 0, 웹 동작 그대로) — 상태: 끝 (아래 '1단계 결과')

| 작업 | 크기 | 위험 | 검증 |
|---|---|---|---|
| `engine/client/platform/{index,web,memory}.ts` 만들기(3.1 모양, web=지금 동작) — **web2가 만든 접점 위에** 칸을 더함 | 중(파일 3, ~300줄) | web2와 같은 파일 충돌 → web2 합친 뒤 시작 | 형 검사, 경계 시험 |
| 1절 #1·#2·#3·#5·#6·#11·#12·#15·#17·#18·#31·#34를 platform 호출로 옮김(키 이름 그대로) | 중(파일 ~10) | 저장 키 이름이 바뀌면 기존 손님 진행 손실 | 키 이름 목록을 시험으로 고정. 옛 localStorage를 채운 브라우저로 접속해 같은 캐릭터 |
| 경계 시험: platform/ 밖에서 `localStorage|location\.|navigator\.|window\.open` 금지 | 작음 | 없음 | 시험 자체 |
| 서버 `staticDir: null` 허용 | 작음 | 없음 | 서버를 화면 없이 띄워 WS 접속 시험 |
| 서버 `verifyClient` 자리(기본 = 모두 허용, 설정으로 목록) | 작음 | 잘못 켜면 웹이 못 붙음 → 기본 끔 | 시험에 Origin 머리말을 바꿔 붙여 봄 |
| 프로토콜 `PROTOCOL_MIN`·`join.v`·`update` 메시지·닫힘 4004 (웹은 지금처럼 reload) | 중 | 프로토콜 변경 자체가 PROTOCOL을 올림 | 옛 번호 클라이언트를 흉내 낸 시험 |
| `title` 툴팁 → 공용 툴팁(탭/길게 누르기) | 중 | 화면이 달라짐(1단계의 "같게" 밖) → 따로 묶음으로 | 화면 찍기(데스크톱·폰 크기) |
| **검증 기준**: 황금 실행(`web2-tools/golden.sh`와 같은 방식) 같음, 서버와 주고받는 메시지 바이트 같음(녹화 비교), 화면 찍기 같음, 빌드 크기 차이 ±1% 이내 | | | |

### 1단계 결과 (2026-11-27, 가지 `feat/plat1`): 끝

- **접점에 더한 칸**(`engine/client/platform/types.ts`): `input`(`primary`·`onChange`·`gamepad`·`keyName`), `notify`·`purchase`·`achievements`·`cloud`(웹 기본은 `has()`가 false인 빈 구현), `display.viewport`, `app.param`·`setParam`·`anchor`·`language`. 기능 이름 `input.touch`·`input.keyboard`·`input.gamepad`·`notify.local`·`notify.push`·`purchase`·`achievements`·`cloudSave`·`app.update`. 키 이름은 `platform/keyname.ts`(`ev.code` 기준, 이름의 모양은 지금 키 표와 같게. 단축키는 아직 `ev.key`: 2단계).
- **웹의 주 입력 장치**: 처음에는 `(pointer: coarse)`로 짐작하고(예전 `isTouch`와 같은 값: 첫 화면이 같다) 그 뒤로는 실제로 쓴 장치를 따른다(손가락·펜 → touch, 패드 → gamepad, 마우스·키보드 → mouse는 정밀한 포인터가 있는 기기에서만). 바뀌면 `[[PC|터치]]` 문장을 다시 고른다.
- **버전**: `protocolFits(내 번호, 서버 번호, min?)`(`engine/shared/protocol.ts`). 서버 `protocolMin`(기본 = `PROTOCOL`: 같은 번호만, 예전과 같다. 낮추면 `welcome.min`을 싣는다), 앱·데스크톱만 `join.v`를 싣고(웹은 싣지 않는다: 바이트가 같다) 범위 밖이면 `{ t: 'update', min, max, store? }` + 닫힘 **4006**(4004는 이미 점검이 쓴다). 화면은 `platform().app.requireUpdate(store)`: 웹은 예전 안내·새로고침, 앱은 '업데이트' 안내(`staleApp`·`updateApp`).
- **서버**: `staticDir: null`(`STATIC=0`), `origins: { list, allowNone }`(`ORIGINS`, `ORIGIN_NONE=0`. 기본 검사 안 함), `protocolMin`(`PROTOCOL_MIN`), `storeUrl`(`STORE_URL`). 출처 맞추기는 `engine/server/net/origin.ts`(포트 자리 `*`).
- **툴팁 #27**: `title`은 그대로 두고, 터치에서 길게(0.45초) 누르면 말풍선으로 띄우는 틀 공통 도우미(`engine/client/hud/tip.ts`). 데스크톱은 브라우저 툴팁 그대로.
- **경계 시험**: `engine/test/boundary.test.ts` 8절. `engine/client/platform/` 밖의 화면 코드(틀과 `games/*/client`)에서 `localStorage`·`sessionStorage`·`location.`·`navigator.`·`window.open`·`'_blank'`·`document.visibilityState/hidden`·`visibilitychange`·`pagehide`·`history.*`·전체 화면 API·`devicePixelRatio`·`screen.*`·`createObjectURL`·`(pointer: coarse)`·`serviceWorker`를 찾으면 실패. 알고 남긴 곳은 `social.ts`의 `localStorage` 하나(묶음 3이 지움).
- **검증**: 황금 실행(등불지기 sim·예제) 바이트까지 같다, 저장 키 이름 그대로(`token`·`lang`·`sound`·`soundMix`·`settings`·`legal`·`tut:*`·`keepSafe`·`playSec`·`blocked`: 시험이 소스로 고정), 바탕에서 만든 캐릭터를 같은 브라우저 저장으로 가지에서 이어받음, 화면 찍기(등불지기·예제 × PC·폰 × 한국어·영어) 비교, 빌드 크기 +0.6%(등불지기 첫 묶음 978.9 → 984.6KB), 예제 +0.6%.

**1절 표의 줄마다 지금 상태** (✓ 접점 뒤, ◐ 일부, – 그대로 둠: 까닭)

| # | 상태 | 어떻게 / 까닭 |
|---|---|---|
| 1·2·3 | ✓ (묶음 2) | `platform().server()`(빌드의 `VITE_SERVER_URL`로 덮어쓰기 → `server.json` → 같은 출처), 토큰은 `auth()`의 `storage.secret('token')` |
| 4 | – | `new WebSocket`: 세 플랫폼에서 같다 |
| 5 | ✓ | 재접속의 숨김 기다리기(`main.ts`, 그 뒤에 생긴 `hud/ops.ts`도) → `lifecycle.visible()`·`on('show')` |
| 6·41 | ✓ | `protocolFits` + `app.requireUpdate`, 서버 `protocolMin`·`join.v`·`update`·4006 |
| 7 | ✓ | `display.viewport()`(홈 화면 아이폰의 크기 우회 포함) |
| 8·9 | – | DOM 사건(확대 막기, 크기 바뀜): WebView에서 같다 |
| 10 | ✓ | `?auto=` → `app.param('auto')`, 새로고침 → `app.requireUpdate()` |
| 11 | ✓ | `storage.get/set('lang')`, `app.param('lang')`, `app.language()` |
| 12 | ✓ | `isTouch()` = `input.primary() === 'touch'` |
| 13 | – | `documentElement.lang`, `document.title`: 무해(창 제목은 래퍼가 따로) |
| 14 | – | WebAudio: 세 플랫폼에서 같다 |
| 15 | ✓ | `audio.onUnlock`(웹: 입력마다, 예전과 같은 사건·차례) |
| 16·33 | – | 상대 주소의 `fetch`·`Audio`·`GLTFLoader`: 코드가 아니라 래퍼가 푼다(Electron 사용자 정의 프로토콜 `app://`, 2단계) |
| 17 | ✓ (묶음 2) | `storage('sound')`, `storage('soundMix')` |
| 18 | – | 차단 목록 `localStorage('blocked')`: 묶음 3(친구·서버 쪽 차단)이 서버로 옮기며 지운다. 경계 시험의 알고 남긴 목록에 있다 |
| 19·20·32 | – | 포인터·조이스틱·글 입력의 DOM 사건: 같다 |
| 21 | ◐ | `input.keyName(ev)`(ev.code 기준)을 만들었다. 단축키는 아직 `ev.key`(동작 그대로가 1단계의 조건): 2단계에서 바꾼다 |
| 22 | ◐ | 그리기 배율 → `display.pixelRatio()`·`pixelRatioCap()`. 컨텍스트 손실 복구·품질 단계는 3단계 |
| 23 | – | 변신 미리보기의 두 번째 렌더러: 같다(모바일 메모리는 3단계에서 잰다) |
| 24 | ◐ | 미니맵·세계 지도의 배율 → `display`. 호버 툴팁은 탭 대체가 이미 있다 |
| 25·26·28·29·30 | – | 너비 `matchMedia`, '동작 줄이기', CSS 호버·`pointer: coarse`, 안전 영역, DOM HUD: WebView에서 같다 |
| 27 | ✓ | 길게 눌러 보는 툴팁 `hud/tip.ts` (title은 그대로) |
| 31 | ◐ | `copy` 칸은 있다. 기기 옮기기 창에 복사 단추를 더하면 화면이 달라져 1단계(화면 같게)에서는 두지 않았다 |
| 34 | ✓ | 도감 링크 → `openUrl`(Ctrl·가운데 단추는 브라우저 그대로), `link.external`이 없으면 단추를 두지 않는다 |
| 35 | ✓ | 도감 페이지의 언어·주소·`#자리` → `app.param`·`setParam`·`anchor`·`language`, `storage('lang')` (입구 `@engine/client/platform`) |
| 36·37 | – | PWA 메타·매니페스트: 앱에서 무시된다 |
| 38 | – | 빌드 대상 구분(`build:desktop`·`build:mobile`): 2단계 |
| 39 | ✓ | `staticDir: null` |
| 40 | ✓ | `origins` 허용 목록(기본 끔) |
| 42 | – | 빠른 터널 주소: 고정 도메인은 4단계의 사용자 결정 |

셈: 표 42줄 가운데 접점 뒤로 간 것 17줄(이번 13줄 + 묶음 2의 4줄), 일부 4줄, 그대로 21줄(WebView에서 같은 DOM·WebAudio·CSS 16줄, 래퍼·빌드·운영 단계의 것 4줄, 묶음 3의 차단 1줄). 코드 위치로는 이번에 옮긴 곳이 25곳(main.ts 5, i18n 5, 도감 페이지 5, 소리 1, 배율 3, 도감 링크 1, 툴팁 1, 서버 3, 그리고 설계 뒤에 생긴 `hud/ops.ts` 1)이고, 설계의 52곳으로 치면 이번 24곳 + 묶음 2의 4곳 = 약 28곳이다(설계의 52곳을 어떻게 셌는지는 남아 있지 않아 같은 방식으로 다시 센 추정이다).

### 2단계 — 데스크톱 시제품 (비용 0: 서명 없이, Steam 없이) — 상태: 다음

| 작업 | 크기 | 위험 | 검증 |
|---|---|---|---|
| `apps/desktop/`: Electron main(사용자 정의 프로토콜 `app://`로 dist-sample 제공, `autoplayPolicy`, 창 크기·전체 화면 F11, 외부 링크는 `shell.openExternal`), preload(`contextBridge`로 storage·openUrl·copy·saveFile·version만) | 중(~250줄) | `file://` 대신 프로토콜 처리 누락 시 소리·모델 깨짐 | sample을 띄워 로컬 서버(3002)에 접속, 소리·모델·저장·재시작 후 같은 캐릭터 |
| `platform/desktop.ts` | 작음 | | |
| 게임패드: Gamepad API로 이동·기술(웹에도 이득) | 중 | 패드로 DOM 창 다루기는 미완으로 남음 | Xbox 패드로 sample 사냥 |
| `ev.code` 기반 키(한글 입력 상태 문제) | 작음 | 키 표(keys.ts) 갱신 | 한글 입력 켠 채 WASD |
| (선택) Tauri로 같은 시제품을 만들어 WebView2 성능 비교 | 중 | 시간 | 같은 장면 FPS 비교 |
| (선택) `steamworks.js`를 App ID 480(Spacewar 시험용)으로 붙여 오버레이·업적 동작만 확인 | 작음 | 480은 시험용이라 남의 앱 이름으로 뜸 | 오버레이 Shift+Tab, 시험 업적 |

### 3단계 — 모바일 시제품 (로컬 빌드, 스토어 등록 없이) — 상태: 2단계 뒤

| 작업 | 크기 | 위험 | 검증 |
|---|---|---|---|
| `apps/mobile/` Capacitor: `webDir` = 빌드 출력, Android 먼저(Android Studio, 무료, USB 설치). iOS는 Mac+Xcode 필요(무료 Apple ID로 기기 설치 7일 제한) [추정: 2절 확인] | 중 | iOS는 Mac이 없으면 불가 | 실제 폰에서 sample 접속 |
| `platform/mobile.ts`: Preferences/Secure 저장, App `pause/resume`, Keyboard, StatusBar, ScreenOrientation, Share, Clipboard | 중 | 플러그인 버전 맞춤 | 백그라운드 30초·5분 뒤 돌아와 재접속·자리 비움 사냥 이어짐 |
| 소켓: `pause`에서 먼저 닫고(서버는 away로 넘김) `resume`에서 즉시 재접속 | 작음 | | 위와 같음 |
| 품질 단계: DPR 상한·그림자 크기·`webglcontextlost` 복구 | 중 | 화면이 웹과 달라짐 → 모바일 대상에서만 기본값 다르게 | 중저가 Android에서 FPS·발열 10분 |
| 서버 Origin 목록에 앱 출처 추가 확인 | 작음 | | 실제 Origin 머리말 기록 |

### 4단계 — 사용자 결정이 필요한 것 (비용·계약·정책) — 상태: 결정 대기

| 결정 | 비용·조건(2절 출처) | 막히는 것 |
|---|---|---|
| 고정 서버 도메인(+이름 있는 터널 또는 서버 호스팅) | 도메인 연 1~2만 원대 [추정], 서버 비용 별도 | 앱 배포 전부 |
| Steam Direct 앱 등록 | 앱당 100달러(조정 총수익 1,000달러 넘으면 환급) [확인] | Steam 출시, Steam 로그인·결제·업적 |
| 코드 서명(Windows·macOS) | Windows: 한국 개인은 Azure Artifact Signing 불가 → CA OV 인증서(연 수십만 원대 [추정]) 또는 조직 등록. macOS: Apple 99달러에 포함 [확인] | 설치 경고, macOS 실행 |
| Apple Developer Program | 연 99달러 [확인] | iOS 기기 배포·TestFlight·스토어 |
| Google Play 개발자 계정 | 1회 25달러 [확인]. 개인 계정은 **12명·14일 비공개 테스트**를 거쳐야 정식 출시 [확인] → 시험자 모집 계획 또는 조직 계정(D-U-N-S) | Play 출시 |
| 플랫폼 결제를 쓸지·수수료 감수·외부 결제 링크 쓸지 | Steam은 Wallet 의무, Apple·Google은 IAP 의무(미국·한국·EU 예외 각각 다름), Poki는 결제 불가 [확인] | 유료 상품 전부 |
| 플랫폼 로그인(Steam/Apple/Google)과 계정 묶기·계정 삭제 화면 | Apple 4.8(소셜 로그인 쓰면 동등 선택지), 5.1.1(v) 앱 안 삭제, Google은 앱 밖 웹 삭제 링크도 [확인] | 앱 심사 |
| iOS 개발 환경 | Mac + Xcode 필요 [추정] | iOS 시제품·출시 |
| 등급(IARC)·개인정보 라벨·처리방침 URL | 무료, 작성 시간 | 스토어 제출 |
| 크로스 저장·크로스 플레이 허용 범위(특히 Apple 결제로 산 것을 Steam에서 쓰게 할지) | 정책 | 결제 설계 |
| 포털(CrazyGames/Poki) 출시 여부 | 무료(수익 배분) | 포털 접점 |

---

## 5. 출처

(2절의 출처와 함께 아래에 모은다.)

- 코드: 1절 표의 파일·줄(`C:\gamedev`, 2026-11-27 읽음).
- 데스크톱
  - Tauri Linux 그래픽: https://v2.tauri.app/develop/debug/linux-graphics/
  - Tauri updater: https://v2.tauri.app/plugin/updater/
  - 크기 비교: https://dev.to/gethopp/tauri-vs-electron-performance-bundle-size-and-the-real-trade-offs-1el4 , https://betterstack.com/community/guides/scaling-nodejs/tauri-vs-electron-vs-deno-vs-electrobun/
  - WKWebView 성능 보고: https://forum.babylonjs.com/t/performance-between-safari-and-wkwebview-tauri/60811 , https://groups.google.com/g/angleproject/c/fzOgBCPtpnU
  - WebGPU 현황: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
  - steamworks.js와 오버레이: https://github.com/ceifa/steamworks.js , https://github.com/ceifa/steamworks.js/issues/102 , https://construct.net/en/blogs/ashleys-blog-2/trying-show-steam-overlay-1861
  - WebView2와 오버레이: https://github.com/MicrosoftEdge/WebView2Feedback/discussions/4019
  - Steam 인증: https://partner.steamgames.com/doc/webapi/ISteamUserAuth
  - Steam Cloud: https://partner.steamgames.com/doc/features/cloud
  - Steam 결제: https://partner.steamgames.com/doc/features/microtransactions , https://partner.steamgames.com/doc/webapi/ISteamMicroTxn , https://gamingonlinux.com/2018/03/albion-online-developer-explains-why-existing-owners-wont-see-a-steam-key
  - Steam Input: https://partner.steamgames.com/doc/features/steam_controller/steam_input_gamepad_emulation_bestpractices , https://phaser.discourse.group/t/steam-electron-and-steam-input-issue/15161
  - Steam Direct: https://partner.steamgames.com/doc/gettingstarted/appfee
  - 코드 서명: https://learn.microsoft.com/azure/artifact-signing/quickstart , https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options
  - Apple Developer Program: https://developer.apple.com/programs/whats-included/
- 모바일
  - Capacitor 8: https://ionic.io/blog/announcing-capacitor-8 , https://capacitorjs.com/docs/updating/8-0
  - Capacitor Preferences(localStorage 삭제 경고): https://capacitorjs.com/docs/apis/preferences
  - 백그라운드: https://developer.apple.com/forums/thread/716118 , https://capawesome.io/docs/sdks/capacitor/background-task/
  - iOS WebGPU·버그: https://developer.apple.com/forums/thread/770862 , https://bugs.webkit.org/show_bug.cgi?id=299237
  - App Store 심사 가이드라인(4.2, 3.1.1, 3.1.1(a), 4.8, 5.1.1(v)): https://developer.apple.com/app-store/review/guidelines/
  - 미국 외부 결제 판결: https://www.macrumors.com/2025/12/11/apple-app-store-fees-external-payment-links/ , https://www.macrumors.com/2026/04/29/epic-games-wins-reversal-app-store-fee-battle/
  - EU DMA: https://www.apple.com/newsroom/2026/08/apple-announces-changes-for-apps-in-the-european-union/
  - 한국 대체 결제: https://developer.apple.com/support/storekit-external-entitlement-kr , https://support.google.com/googleplay/android-developer/answer/13821247
  - Google Play 결제: https://support.google.com/googleplay/android-developer/answer/9858738 , https://support.google.com/googleplay/android-developer/answer/15582165 , https://android-developers.googleblog.com/2026/06/play-expanded-billing.html
  - Google 계정 삭제: https://support.google.com/googleplay/android-developer/answer/13327111
  - PGS 로그인: https://developer.android.com/games/pgs/signin
  - Google 계정 비용: https://support.google.com/googleplay/android-developer/answer/6112435
  - 대상 API: https://developer.android.com/google/play/requirements/target-sdk
  - 비공개 테스트: https://support.google.com/googleplay/android-developer/answer/14151465
- 공통
  - Apple 영수증: https://developer.apple.com/documentation/appstoreserverapi/simplifying-your-implementation-by-using-the-app-store-server-library
  - Google 영수증: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.productsv2
  - CrazyGames: https://docs.crazygames.com/requirements/intro/
  - Poki: https://developers.poki.com/guide/requirements-quality
- 저장소 문서: `docs/genre-features.md` 5.2절(묶음 2: Platform·AuthProvider 후보), 6절(포털 요건·탭 전환·로딩 크기).
