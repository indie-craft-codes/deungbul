// 플랫폼 접점의 모양: 화면의 틀이 브라우저·앱·포털에 기대는 일을 이 접점으로만 부른다 (설계: docs/platforms.md 3.1).
// 구현은 같은 폴더의 web.ts(기본, 지금 동작 그대로)와 memory.ts(node의 시험). 데스크톱(Electron/Tauri)·모바일(Capacitor)·포털 구현은 나중에 같은 모양으로 더한다.
// 규칙: 동기/비동기를 칸마다 정한다. 비동기는 실패해도 throw하지 않고 결과 값(false, null)으로 알린다. 없을 수 있는 기능은 has(기능)으로 먼저 묻는다.
// 플랫폼 분리 1단계(docs/platforms.md 4절)부터 틀과 게임의 화면 코드는 브라우저(저장소, 주소, 생명주기, 새 창, 클립보드 …)를 이 접점으로만 부른다 (engine/test/boundary.test.ts 8절이 지킨다).
// 이 파일은 아무것도 import하지 않는다 (타입만).

/** 플랫폼이 가질 수도 없을 수도 있는 기능. has()로 묻고, false면 그 단추를 그리지 않는다 */
export type Feature =
  | 'storage.durable' // 저장이 OS·브라우저에 의해 지워지지 않는다 (앱 저장소). 웹은 false: 손님 진행 보호 안내가 이것을 본다
  | 'lifecycle.pause' // 진짜 일시정지/재개 사건이 있다 (모바일 앱)
  | 'display.fullscreen' | 'display.orientation' | 'display.safeArea'
  | 'link.external' // 바깥 주소를 열 수 있다 (포털은 막는다: 약관 링크를 창 안의 글로 대신한다)
  | 'share' | 'clipboard' | 'files.save'
  | 'offline.cache' // 재방문 캐시(웹: 서비스 워커)
  | 'errors' // 처리되지 않은 오류를 받아 볼 수 있다
  | 'ads' | 'ads.rewarded' | 'invite'
  // 아래는 플랫폼 분리 1단계에서 더한 칸 (웹 기본 구현은 input.*와 app.update 말고는 false)
  | 'input.touch' | 'input.keyboard' | 'input.gamepad' // 그 입력 장치가 이 기기에 있다 (주 입력 장치는 input.primary())
  | 'notify.local' | 'notify.push' // 기기 알림 (예약 알림, 푸시)
  | 'purchase' // 플랫폼 결제 (Steam Wallet, App Store, Play)
  | 'achievements' // 플랫폼 업적 (Steam)
  | 'cloudSave' // 플랫폼 클라우드 저장
  | 'app.update'; // 업데이트를 열 수 있다 (웹: 새로고침, 앱: 스토어·런처)

/** 주 입력 장치: mouse 마우스·키보드, touch 터치 화면, gamepad 게임패드 */
export type InputKind = 'mouse' | 'touch' | 'gamepad';

/** 키 사건에서 이름을 만드는 데 쓰는 칸 (KeyboardEvent의 부분: 시험은 이 모양의 객체를 넘긴다) */
export interface KeyLike { readonly code?: string; readonly key?: string }

/** 생명주기 사건: hide 숨김(탭 전환, 앱 뒤로), show 다시 보임, pause·resume 앱이 멈춤·재개(모바일), quit 닫히는 중 */
export type LifeEvent = 'hide' | 'show' | 'pause' | 'resume' | 'quit';

/** 처리되지 않은 오류 한 건 (오류 수집: engine/client/errors.ts) */
export interface RawError {
  /** error 처리되지 않은 오류, rejection 처리되지 않은 Promise 거절, webgl 그리기 장치 잃음, report 게임이 알린 것 */
  kind: 'error' | 'rejection' | 'webgl' | 'report';
  msg: string;
  stack?: string;
  /** 오류가 난 파일:줄 (있으면) */
  at?: string;
}

export interface Platform {
  readonly id: 'web' | 'desktop' | 'mobile' | 'crazygames' | 'poki' | 'test' | (string & {});
  /** 동기. 화면이 단추를 보일지 정한다 */
  has(f: Feature): boolean;

  /** 키-값 저장. 읽기는 동기(언어·소리·설정은 첫 그림 전에 읽는다): 앱은 시작 때 ready()로 한 번 채우고 그 뒤는 메모리 + 뒤에서 영구화 */
  storage: {
    ready(): Promise<void>;
    get(key: string): string | null;
    /** 동기(뒤에서 영구화). 저장소를 못 쓰면 false (시크릿 모드: 이번 세션에만) */
    set(key: string, v: string): boolean;
    remove(key: string): void;
    /** 비밀 값(기기 토큰, 로그인 토큰): 앱은 Keychain/Keystore, 웹은 localStorage */
    secret: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<boolean>; remove(k: string): Promise<void> };
  };

  /** 생명주기. 웹: visibilitychange·pagehide, 앱: pause/resume, 데스크톱: 최소화·복원. 돌려준 함수로 그만 듣는다 */
  lifecycle: {
    visible(): boolean;
    on(ev: LifeEvent, fn: () => void): () => void;
  };

  audio: {
    /**
     * 소리를 깨워도 되는 때마다 부른다 (웹: 사용자 입력(pointerdown·keydown)마다: 자동 재생 정책은 입력 안에서만 소리 장치를 깨우게 하고, 멈춘 장치도 그때 다시 깨운다.
     * 데스크톱: 곧바로 한 번, 모바일: 첫 입력과 재개 때마다). 부르는 쪽은 여러 번 불려도 되게 만든다
     */
    onUnlock(fn: () => void): void;
    /** 바깥 까닭(광고, 전화)으로 소리를 멈춰야 할 때 on=true, 풀릴 때 false */
    onInterrupt(fn: (on: boolean) => void): void;
  };

  display: {
    fullscreen: { can(): boolean; is(): boolean; set(on: boolean): Promise<boolean> };
    orientation: { lock(o: 'landscape' | 'portrait' | 'any'): Promise<boolean> };
    /** 안전 영역(px). 웹은 CSS env()로 맞추므로 0 */
    safeArea(): { top: number; right: number; bottom: number; left: number };
    /** 이 플랫폼의 그리기 배율(DPR) 상한의 기본값 (설정 창이 더 낮출 수 있다) */
    pixelRatioCap(): number;
    /** 기기의 그리기 배율 (웹: devicePixelRatio) */
    pixelRatio(): number;
    /** 게임 화면의 크기(CSS px). 웹: 창의 안쪽 크기 (홈 화면에 추가한 아이폰의 가로 화면은 기기 화면 크기: 높이를 작게 알려 주는 버그) */
    viewport(): { w: number; h: number };
  };

  /**
   * 입력 장치. 화면의 [[PC|터치]] 문장과 조작 안내가 primary()를 묻는다.
   * 웹: 처음에는 '(pointer: coarse)'로 짐작하고, 그 뒤로는 실제로 쓴 장치(포인터의 종류, 키보드, 패드)를 따른다 (터치 노트북·패드에서 한 번 짐작으로 굳지 않게)
   */
  input: {
    primary(): InputKind;
    /** 주 입력 장치가 바뀌면 (돌려준 함수로 그만 듣는다) */
    onChange(fn: (k: InputKind) => void): () => void;
    /** 첫 게임패드의 왼쪽 막대와 단추. 없으면 null (매 프레임 읽는다) */
    gamepad(): { x: number; z: number; buttons: readonly boolean[] } | null;
    /**
     * 키의 이름: ev.code(자판의 자리) 기준이라 자판 배열·한글 입력 상태와 무관하다 (KeyW → 'w', Digit1 → '1', Space → ' ', Escape → 'escape').
     * 이름의 모양은 지금 단축키 표(keys.ts)의 ev.key.toLowerCase()와 같게 맞췄다. 1단계에서는 제공만 하고 단축키는 아직 ev.key를 쓴다(동작 그대로)
     */
    keyName(ev: KeyLike): string;
  };

  /** 링크·공유·클립보드·파일 */
  openUrl(url: string, how?: 'external' | 'inApp'): Promise<boolean>;
  share(d: { text: string; url?: string }): Promise<boolean>;
  copy(text: string): Promise<boolean>;
  /** 파일로 내려받기·저장 (내 데이터 내보내기) */
  saveFile(name: string, data: Blob | string, mime: string): Promise<boolean>;

  /** 기기 알림 (웹 기본: 없음. permission은 'denied', 나머지는 null·false) */
  notify: {
    permission(): Promise<'granted' | 'denied' | 'prompt'>;
    /** 푸시를 받을 증표를 만든다 (서버에 등록한다). 못 하면 null */
    register(): Promise<{ token: string; kind: 'fcm' | 'apns' | 'webpush' } | null>;
    /** at(ms, 벽시계)에 알림 하나를 예약한다 ('자리 비움 사냥 끝' 같은 것) */
    local(at: number, title: string, body: string): Promise<boolean>;
  };

  /** 플랫폼 결제: 화면은 상품 id만 안다. 영수증은 서버가 검증하고 아이템은 서버가 준다 (웹 기본: 없음) */
  purchase: {
    /** 현지화된 가격 문자열 */
    products(ids: readonly string[]): Promise<{ id: string; price: string }[]>;
    buy(id: string): Promise<{ kind: 'steam' | 'apple' | 'google' | 'portal'; receipt: string } | { cancelled: true } | { error: string }>;
    /** 앱을 다시 켠 뒤에 끝나지 않은 거래 */
    onPending(fn: (receipt: { kind: string; receipt: string }) => void): void;
  };

  /** 플랫폼 업적 (Steam). 서버가 확정한 사건만 연다 (웹 기본: 없음) */
  achievements: { unlock(id: string): Promise<boolean> };

  /** 플랫폼 클라우드 저장: 진행은 서버 DB라 설정 정도만 (웹 기본: 없음) */
  cloud: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<boolean> };

  /** 오류: listen은 처리되지 않은 오류를 받아 보고(웹: window.onerror·unhandledrejection), report는 오류 묶음을 서버 끝점에 보낸다(닫히는 중에도 가게) */
  errors: {
    listen(fn: (e: RawError) => void): void;
    report(url: string, body: string): void;
  };

  /** 재방문 캐시를 켠다 (웹: 서비스 워커 등록). 안 되면 false */
  offlineCache(scriptUrl: string): Promise<boolean>;

  /** 인증: 플랫폼이 준 증명 (지금은 손님뿐: providers()가 ['guest']. 증명은 ./auth.ts의 AuthProvider가 서버에 싣는다) */
  auth: {
    providers(): readonly ('guest' | 'steam' | 'apple' | 'google' | 'portal')[];
    proof(p: 'steam' | 'apple' | 'google' | 'portal'): Promise<{ kind: string; ticket: string } | null>;
  };

  /** 포털 광고·게임 구간. 기본 구현은 아무것도 하지 않는다 (광고 차단기가 있어도 진행된다) */
  ads: {
    gameplayStart(): void;
    gameplayStop(): void;
    /** 전면 광고를 띄워도 되는 자리(where: 'roundEnd', 'respawn' …). 끝나면(못 띄웠어도) 풀린다 */
    adBreak(where: string): Promise<void>;
    /** 보상형 광고: 끝까지 봤으면 true. 실패·없음이면 false (보상 없음) */
    rewarded(why: string): Promise<boolean>;
  };
  /** 포털의 초대 단추에 방을 알린다 (방 코드·자리 수) */
  invite(room: { code: string; size?: number }): void;

  /**
   * 화면 쌓기의 '뒤로' (engine/client/hud/screens.ts가 쓴다). 웹: 폰 브라우저의 뒤로 가기·안드로이드 뒤로 몸짓이 게임 페이지를 떠나지 않고 맨 위의 창을 닫게 한다.
   * 화면 쌓기에 닫을 것이 있는 동안만 자리 하나를 잡아 둔다(arm). 닫을 것이 없으면 거둔다(disarm): 그때의 뒤로 가기는 플랫폼의 기본(웹: 페이지를 떠남)이다.
   * 앱은 하드웨어 뒤로 키를 onBack으로, 데스크톱·포털은 아무것도 하지 않아도 된다(onBack이 불리지 않을 뿐)
   */
  nav: {
    /** 뒤로 가기를 받을 자리를 잡는다 (이미 잡았으면 그대로) */
    arm(): void;
    /** 잡은 자리를 거둔다 (뒤로 가기를 받지 않는다). 거두며 생기는 사건은 onBack으로 알리지 않는다 */
    disarm(): void;
    /** 사람이 뒤로 갔다: 잡은 자리는 이때 없어진다 (닫을 것이 남았으면 부른 쪽이 다시 arm) */
    onBack(fn: () => void): () => void;
  };

  /** 접속할 게임 서버의 주소 (웹: 빌드의 VITE_SERVER_URL → 옆의 server.json → 같은 출처) */
  server(): Promise<string>;
  app: {
    /** 빌드 표시 (웹: 진입 스크립트의 파일 이름. 오류 묶음에 붙는다) */
    version(): string;
    build(): number;
    /** 지금 페이지 (웹: 주소의 경로만. 앱: 빈 문자열). 오류 묶음의 '어디서' */
    page(): string;
    /** 서버가 '이 화면은 오래됐다'고 할 때: 웹은 새로고침, 앱은 스토어 페이지 */
    requireUpdate(storeUrl?: string): void;
    /** 시작할 때 받은 값 (웹: 주소의 ?이름=값. 앱: 실행 인자나 없음 → null) */
    param(name: string): string | null;
    /** 그 값을 바꿔 둔다 (웹: 주소를 바꾸되 새로 읽지 않는다. 새로 고치거나 주소를 건네도 같게 열린다). 앱은 아무것도 하지 않아도 된다 */
    setParam(name: string, value: string): void;
    /** 시작할 때 받은 자리 표시 (웹: 주소의 #뒤, 풀어 쓴 것). 없으면 빈 문자열 */
    anchor(): string;
    /** 기기·OS·브라우저의 언어 코드 ('ko-KR', 'en'). 모르면 빈 문자열 (Steam은 Steam 클라이언트의 언어를 줄 자리) */
    language(): string;
  };
}
