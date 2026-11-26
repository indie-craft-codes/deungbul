// 플랫폼 접점의 모양: 화면의 틀이 브라우저·앱·포털에 기대는 일을 이 접점으로만 부른다 (설계: docs/platforms.md 3.1).
// 구현은 같은 폴더의 web.ts(기본, 지금 동작 그대로)와 memory.ts(node의 시험). 데스크톱(Electron/Tauri)·모바일(Capacitor)·포털 구현은 나중에 같은 모양으로 더한다.
// 규칙: 동기/비동기를 칸마다 정한다. 비동기는 실패해도 throw하지 않고 결과 값(false, null)으로 알린다. 없을 수 있는 기능은 has(기능)으로 먼저 묻는다.
// 지금 이 접점을 쓰는 곳은 묶음 2(웹 출시의 바탕)가 새로 쓰거나 고친 코드뿐이다. 나머지 옛 호출(언어·소리 저장, 도감 링크 …)을 옮기는 것은 다음 작업이다.
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
  | 'ads' | 'ads.rewarded' | 'invite';

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
    /** 소리를 깨워도 되는 때(웹: 첫 입력, 데스크톱: 곧바로, 모바일: 첫 입력과 재개 때마다) */
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
  };

  /** 링크·공유·클립보드·파일 */
  openUrl(url: string, how?: 'external' | 'inApp'): Promise<boolean>;
  share(d: { text: string; url?: string }): Promise<boolean>;
  copy(text: string): Promise<boolean>;
  /** 파일로 내려받기·저장 (내 데이터 내보내기) */
  saveFile(name: string, data: Blob | string, mime: string): Promise<boolean>;

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
  };
}
