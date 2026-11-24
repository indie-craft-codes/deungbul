// 클라이언트의 틀을 시작시키는 곳: 모듈을 엮고, 서버 메시지를 나눠 주고, 매 프레임을 돌린다.
// 진입점은 게임의 것이다 (이 게임은 game/main.ts): 지형의 겉모습과 자기 모듈의 목록을 들고 startClient를 부른다. 이 파일은 게임의 파일을 import하지 않는다.
//   app       월드와 3D 화면            state     클라이언트가 아는 게임 상태
//   net       서버 연결                 entities  내 캐릭터 예측, 다른 엔티티 보간, 사건 연출
//   actions   플레이어가 할 수 있는 일     input     마우스, 터치, 키보드
//   hud/      패널, 대화창, 이름표         i18n/     언어
//   bus       모듈이 스스로 끼어드는 자리   modules   덧붙는 기능 모듈의 목록
import { PROTOCOL } from '../../shared/protocol';
import { dispatch, onMsg, runFrame, runSlow } from './bus';
import { initModules } from './modules';
import { steer } from './actions';
import { $, startApp, view } from './app';
import { applySnapshot, clearEntities, placeTags, relabel, renameEntity, setGear, spawnMe, spawnMerchant, tagOf, updateEntities } from './entities';
import { shakeOffset, updateFx } from './fx';
import { initChat, logChat } from './hud/chat';
import { hideGate, initMe, renderTexts, setMyName, showGate } from './hud/me';
import { notifySys } from './hud/notify';
import { setParty, showInvite } from './hud/party';
import { speak, updateFloats } from './hud/tags';
import { applyDom, onLangChange, t } from './i18n';
import { axis, initInput } from './input';
import { connect, initNet, send } from './net';
import { isBlocked } from './social';
import type { Look } from './scene/view';
import { S } from './state';

// ---------- 서버 메시지: 바탕이 되는 처리. 덧붙는 기능은 각 모듈이 bus.onMsg로 스스로 등록한다 ----------
onMsg('welcome', (m) => { spawnMe(m.id, m.name, m.x, m.z); setMyName(m.name); hideGate(); });
onMsg('snap', (m, now) => applySnapshot(m, now));
onMsg('stat', (m) => {
  const me = S.me;
  if (!me) return;
  me.maxHp = m.maxHp; me.lv = m.lv; me.exp = m.exp; me.need = m.need; me.sparks = m.sparks;
  me.gold = m.gold; me.items = m.items;
  const classChanged = me.cls !== m.cls;
  if (me.weapon !== m.weapon || me.armor !== m.armor || classChanged) setGear(me.id, m.weapon, m.cls, m.armor);
  me.ready = true;
  if (classChanged) renderTexts(); // 기술 버튼의 이름이 직업을 따라 바뀐다
});
onMsg('icd', (m, now) => { S.itemCdEnd = now + m.ms; S.itemCdLen = m.ms; });
onMsg('gear', (m) => setGear(m.id, m.weapon, m.cls, m.armor));
onMsg('cd', (m, now) => { S.cdEnd[m.n] = now + m.ms; S.cdLen[m.n] = m.ms; });
onMsg('name', (m) => { renameEntity(m.id, m.name); if (S.me && m.id === S.me.id) setMyName(m.name); });
onMsg('chat', (m) => {
  if (isBlocked(m.name)) return;
  if (m.ch === 'g') { logChat(`${t('guildChatTag')} ${m.name}`, m.text, true); return; } // 길드 대화는 말풍선으로 띄우지 않는다
  logChat(m.name, m.text);
  const tag = tagOf(m.id);
  if (tag) speak(tag, m.text);
});
onMsg('sys', (m) => notifySys(m.k, m.a));
onMsg('party', (m) => setParty(m.m));
onMsg('pinv', (m) => showInvite(m.name, m.s));
onMsg('pong', (m, now) => { S.pingMs = Math.round(now - m.c); });
onMsg('full', () => showGate('full', true));

// 끊기면 스스로 다시 접속한다 (폰 화면이 꺼졌다 켜지거나 통신이 잠깐 끊긴 경우). 간격은 2초에서 시작해 15초까지 늘린다.
// 다른 곳에서 접속해 밀려났거나(4000) 서버가 가득 찼으면(1013) 혼자 다시 붙지 않는다.
let retryMs = 2000;
let retryTimer = 0;
function lost(code: number): void {
  if (code === 4000 || code === 1013) { showGate(code === 1013 ? 'full' : 'disconnected', true); return; }
  showGate('reconnecting', true);
  const again = () => {
    if (document.hidden) { document.addEventListener('visibilitychange', again, { once: true }); return; } // 화면이 꺼져 있으면 켜질 때까지 기다린다
    connect();
  };
  clearTimeout(retryTimer);
  retryTimer = window.setTimeout(again, retryMs);
  retryMs = Math.min(15000, retryMs * 2);
}
onMsg('welcome', () => { retryMs = 2000; clearTimeout(retryTimer); });

// 서버의 프로토콜 번호가 이 화면의 것과 다르다(서버만 새 버전이고 화면은 옛 빌드가 남았다): 게임을 진행하지 않고 새로고침을 권한다.
// 번호를 보내지 않는 옛 서버에는 지금처럼 그냥 접속한다. 한번 어긋난 것을 안 뒤로는 메시지를 처리하지 않고 다시 접속하지도 않는다.
let stale = false;
function outdated(): void {
  stale = true;
  showGate('stale', true);
  const btn = $('joinBtn');
  btn.setAttribute('data-i18n', 'reload'); // 언어를 바꿔도 따라 바뀌게 한다
  btn.textContent = t('reload');
}

/**
 * 화면 크기. 홈 화면에 추가해 연 아이폰은 가로로 돌리면 페이지 높이를 실제보다 작게 알려 줘서
 * 아래가 비므로, 그때는 기기 화면 크기를 직접 쓴다.
 */
function appSize(): { w: number; h: number } {
  if ((navigator as { standalone?: boolean }).standalone === true) {
    const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height);
    return window.matchMedia('(orientation: landscape)').matches ? { w: long, h: short } : { w: short, h: long };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}
function resize(): void {
  const { w, h } = appSize();
  document.documentElement.style.setProperty('--app-w', `${w}px`);
  document.documentElement.style.setProperty('--app-h', `${h}px`);
  view.resize(w, h);
}

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const a = axis();
  steer(a.x, a.z, now);
  updateEntities(dt, now);

  // 카메라: 접속 전에는 마을을 천천히 둘러본다
  if (S.me) { const sh = shakeOffset(); view.follow(S.me.x + sh.x, S.me.z + sh.z, S.zoom); }
  else view.follow(Math.cos(now / 9000) * 6, 3 + Math.sin(now / 9000) * 6, 1.05);

  placeTags(now);
  runFrame(now, dt); // 내 정보 창의 막대, 물약 대기 표시, 게임의 모듈 (등록한 차례대로)
  updateFloats(dt);
  updateFx(dt);
  view.render();
}

// ---------- 시작 ----------
export interface ClientOptions {
  /** 지형의 겉모습: 땅과 잎의 색, 건물 (scene/view.ts의 Look). 주지 않으면 기본 색의 빈 들판 */
  look?: Look;
  /** 게임의 모듈들 (init 함수). 적은 차례대로, 틀의 덧붙는 모듈(modules.ts)보다 먼저 불린다: 틀의 화면 코드(상점, 대장간, 상인)가 게임이 채운 규칙(rules)을 읽는다 */
  modules?: (() => void)[];
}

/**
 * 클라이언트를 시작한다. 게임의 진입점이 한 번 부른다. 게임의 것을 아무것도 주지 않으면 틀만으로 뜬다 (기본 지형, 기본 규칙).
 * 같은 메시지·같은 주기 안에서 처리기는 등록한 차례대로 불리므로, 아래의 init 차례가 곧 그리는 차례다: 내 정보 창 → 게임의 모듈 → 틀의 덧붙는 모듈.
 */
export function startClient(opts: ClientOptions = {}): void {
  startApp(opts.look);
  applyDom();
  onLangChange(relabel);
  initMe();
  initChat();
  for (const init of opts.modules ?? []) init();
  initModules();
  // iOS 사파리는 확대 금지 설정을 무시한다: 두 손가락 확대와 두 번 눌러 확대를 직접 막는다
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  spawnMerchant();
  initInput();

  initNet({
    message: (m) => {
      if (stale) return;
      if (m.t === 'welcome' && m.v !== undefined && m.v !== PROTOCOL) { outdated(); return; }
      dispatch(m, performance.now());
    },
    opening: () => { clearEntities(); setParty([]); showGate('connecting', false); },
    closed: (code) => { clearEntities(); if (!stale) lost(code); },
  });

  // 내 정보 창의 높이를 재 둔다: 좁은 화면에서 대상 창을 그 바로 아래에 두는 데 쓴다 (style.css의 --me-h)
  new ResizeObserver(() => document.documentElement.style.setProperty('--me-h', `${$('me').offsetHeight}px`)).observe($('me'));
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 300); });
  resize();

  // 이름을 묻지 않고 바로 들어간다. 처음이면 무작위 이름이 붙고, 이름은 화면에서 눌러 바꾼다.
  // 개발 편의: 주소에 ?auto=이름 을 붙이면 처음 접속할 때 그 이름을 쓴다.
  $('joinForm').addEventListener('submit', (ev) => { ev.preventDefault(); if (stale) location.reload(); else connect(); });
  connect(new URLSearchParams(location.search).get('auto') ?? undefined);

  setInterval(() => { if (S.me) send({ t: 'ping', c: performance.now() }); }, 2000);
  setInterval(() => runSlow(performance.now()), 250);
  requestAnimationFrame(frame);
}
