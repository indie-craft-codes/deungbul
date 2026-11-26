// 탭 숨김·백그라운드 (docs/genre-features.md 6절 '탭 전환'): 플랫폼의 생명주기(platform().lifecycle)를 듣고 틀이 할 일을 한다.
//   숨김: 서버에 알린다(다른 사람에게 자리 비움으로 보인다: 이름표가 흐려지고 '자리 비움'), 소리를 멈춘다(sound.ts), 게임 구간을 닫는다(포털의 gameplayStop)
//   돌아옴: 서버에 알린다, 숨긴 동안 밀린 연출(불티·번쩍임·떠오르는 숫자)을 버리고 지금 상태부터 그린다
// 연결은 그대로 둔다: 크롬은 숨긴 탭의 타이머를 1초(5분 넘으면 1분)에 한 번으로 줄이지만, 서버의 WebSocket ping에는 브라우저가 스스로 답하고
// 받은 메시지는 그대로 처리된다(스냅샷은 숨긴 동안에도 적용된다). 끊기면 보일 때까지 기다렸다 다시 붙는다(main.ts의 lost).
// 광고 가능 지점(판 끝, 다시 일어남)을 플랫폼 접점의 사건으로 알린다(platform/index.ts의 onBreakPoint). 광고를 띄울지는 게임·배포가 정한다.
import { onMsg, onSlow } from './bus';
import { dropFx } from './fx';
import { updateFloats } from './hud/tags';
import { tagOf } from './entities';
import { onLangChange, t } from './i18n';
import { send } from './net';
import { breakPoint, gameplayStart, gameplayStop, platform } from './platform';
import { S } from './state';

/** 자리 비움인 사람들 (엔티티 번호) */
const afk = new Set<number>();
/** 지금 자리 비움 표시를 단 이름표의 엔티티 */
const marked = new Set<number>();
let hiddenAt = 0;
const returns: ((ms: number) => void)[] = [];

/** 숨겼다가 돌아오면 부른다 (ms: 숨긴 시간). 게임이 '돌아왔을 때' 할 일(판의 상태를 다시 묻기 같은 것)을 단다 */
export function onReturn(fn: (ms: number) => void): void { returns.push(fn); }
/** 그 사람이 자리 비움인가 */
export const isAfk = (id: number): boolean => afk.has(id);

/** 이름표에 자리 비움 표시를 맞춘다 (이름표는 다시 만들어질 수 있어 느린 주기마다) */
function paint(): void {
  for (const id of [...marked]) if (!afk.has(id)) { const tag = tagOf(id); tag?.el.classList.remove('afk'); marked.delete(id); }
  for (const id of afk) {
    const tag = tagOf(id);
    if (!tag) continue;
    if (!tag.el.classList.contains('afk') || tag.el.dataset.afk !== t('afkTag')) { tag.el.classList.add('afk'); tag.el.dataset.afk = t('afkTag'); }
    marked.add(id);
  }
}

function hide(): void {
  hiddenAt = performance.now();
  if (S.me) send({ t: 'vis', on: false });
  gameplayStop();
}
function show(): void {
  const ms = hiddenAt ? performance.now() - hiddenAt : 0;
  hiddenAt = 0;
  if (S.me) send({ t: 'vis', on: true });
  // 밀린 연출을 버린다: 숨긴 동안에는 새 연출을 쌓지 않았고(fx.ts), 남은 것도 지금 끝낸다
  dropFx();
  updateFloats(60);
  for (const fn of returns) fn(ms);
}

/** 틀이 시작할 때 한 번 (main.ts) */
export function initLifecycle(): void {
  const life = platform().lifecycle;
  life.on('hide', hide);
  life.on('show', show);
  onMsg('welcome', () => {
    afk.clear();
    // 지금 상태를 알린다: 보이면 서버가 지금 자리 비움인 사람의 목록만 준다 (숨긴 채 다시 접속했으면 자리 비움으로)
    send({ t: 'vis', on: life.visible() });
  });
  onMsg('afk', (m) => { for (const id of m.ids) if (m.on) afk.add(id); else afk.delete(id); paint(); });
  onSlow(paint);
  onLangChange(() => { for (const id of marked) { const tag = tagOf(id); if (tag) tag.el.dataset.afk = t('afkTag'); } });
  // 게임 구간(포털): 들어와서 처음 입력할 때 연다 (Poki: gameplayStart는 첫 입력 때). 숨기면 닫고, 돌아와 다시 입력하면 연다
  const start = () => { if (S.me && life.visible()) gameplayStart(); };
  window.addEventListener('pointerdown', start, { passive: true });
  window.addEventListener('keydown', start);
  // 광고 가능 지점: 판이 끝남(rooms의 결과), 쓰러져 다시 일어남
  onMsg('sys', (m) => {
    if (m.k === 'roomResult') breakPoint('roundEnd');
    else if (m.k === 'died') breakPoint('respawn');
  });
}

/**
 * 재방문 캐시(서비스 워커)를 켠다: 게임의 진입점이 부른다. 기본은 끔 (부르지 않으면 지금과 같다).
 * 빌드가 서비스 워커 파일(sw.js)을 만들려면 그 게임의 deploy.json에 "offlineCache": true를 둔다 (scripts/budget.mjs가 빌드 뒤에 쓴다).
 * 화면(HTML)은 늘 서버에서 먼저 받고(못 받으면 캐시), 이름에 해시가 든 빌드 파일은 캐시에서, 모델·소리는 캐시에서 주고 뒤에서 새로 받는다
 */
export function enableOfflineCache(): void {
  if (import.meta.env.DEV) return; // 개발 서버에는 sw.js가 없다
  void platform().offlineCache('./sw.js');
}
