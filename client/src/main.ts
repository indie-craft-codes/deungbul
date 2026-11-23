// 클라이언트 진입점: 모듈을 엮고, 서버 메시지를 나눠 주고, 매 프레임을 돌린다.
//   app       월드와 3D 화면            state     클라이언트가 아는 게임 상태
//   net       서버 연결                 entities  내 캐릭터 예측, 다른 엔티티 보간, 사건 연출
//   actions   플레이어가 할 수 있는 일     input     마우스, 터치, 키보드
//   hud/      패널, 대화창, 이름표         i18n/     언어
//   bus       모듈이 스스로 끼어드는 자리   modules   덧붙는 기능 모듈의 목록
import { dispatch, onMsg, runFrame, runSlow } from './bus';
import { initModules } from './modules';
import { steer } from './actions';
import { $, view } from './app';
import { applySnapshot, clearEntities, placeTags, relabel, renameEntity, setGear, spawnMe, spawnMerchant, syncNpcs, tagOf, updateEntities } from './entities';
import { shakeOffset, updateFx } from './fx';
import { initChat, logChat } from './hud/chat';
import { forgeSlow, renderForge } from './hud/forge';
import { notifySys } from './hud/notify';
import { initParty, renderParty, setParty, showInvite } from './hud/party';
import { classSlow, initClasses, renderClasses } from './hud/classes';
import { hideGate, hudFrame, hudSlow, initPanels, renderTexts, renderWorld, setMyName, showGate } from './hud/panels';
import { initQuest, questFrame, renderQuest } from './hud/quest';
import { initShop, renderShop, shopFrame, shopSlow } from './hud/shop';
import { speak, updateFloats } from './hud/tags';
import { applyDom, onLangChange, t } from './i18n';
import { axis, initInput } from './input';
import { connect, initNet, send } from './net';
import { isBlocked } from './social';
import { S } from './state';

// ---------- 서버 메시지: 바탕이 되는 처리. 덧붙는 기능은 각 모듈이 bus.onMsg로 스스로 등록한다 ----------
onMsg('welcome', (m) => { spawnMe(m.id, m.name, m.x, m.z); setMyName(m.name); hideGate(); });
onMsg('snap', (m, now) => applySnapshot(m, now));
onMsg('stat', (m) => {
  const me = S.me;
  if (!me) return;
  me.maxHp = m.maxHp; me.lv = m.lv; me.exp = m.exp; me.need = m.need; me.sparks = m.sparks; me.contrib = m.contrib;
  me.gold = m.gold; me.items = m.items; me.rested = m.rested; me.tier = m.tier;
  const classChanged = me.cls !== m.cls;
  if (me.weapon !== m.weapon || me.armor !== m.armor || classChanged) setGear(me.id, m.weapon, m.cls, m.armor);
  me.ready = true;
  if (classChanged) renderTexts(); // 기술 버튼의 이름이 직업을 따라 바뀐다
  renderShop(); renderForge();
  classSlow();
});
onMsg('quest', (m) => { S.quest = { c: m.c, s: m.s, n: m.n }; renderQuest(); });
onMsg('icd', (m, now) => { S.itemCdEnd = now + m.ms; S.itemCdLen = m.ms; });
onMsg('gear', (m) => setGear(m.id, m.weapon, m.cls, m.armor));
onMsg('world', (m, now) => { S.world = m.s; S.worldAt = now; syncNpcs(); renderWorld(); renderShop(); renderForge(); hudSlow(now); });
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

// ---------- 시작 ----------
applyDom();
initPanels();
initChat();
initShop();
initParty();
initModules();
// iOS 사파리는 확대 금지 설정을 무시한다: 두 손가락 확대와 두 번 눌러 확대를 직접 막는다
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
renderForge();
initQuest();
initClasses();
spawnMerchant();
initInput();
onLangChange(() => { relabel(); renderTexts(); renderQuest(); renderShop(); renderForge(); renderClasses(); renderParty(); });
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

initNet({
  message: (m) => dispatch(m, performance.now()),
  opening: () => { clearEntities(); setParty([]); showGate('connecting', false); },
  closed: (code) => { clearEntities(); lost(code); },
});

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
// 내 정보 창의 높이를 재 둔다: 좁은 화면에서 대상 창을 그 바로 아래에 두는 데 쓴다 (style.css의 --me-h)
new ResizeObserver(() => document.documentElement.style.setProperty('--me-h', `${$('me').offsetHeight}px`)).observe($('me'));
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => { resize(); setTimeout(resize, 300); });
resize();

// 이름을 묻지 않고 바로 들어간다. 처음이면 무작위 이름이 붙고, 이름은 화면에서 눌러 바꾼다.
// 개발 편의: 주소에 ?auto=이름 을 붙이면 처음 접속할 때 그 이름을 쓴다.
$('joinForm').addEventListener('submit', (ev) => { ev.preventDefault(); connect(); });
connect(new URLSearchParams(location.search).get('auto') ?? undefined);

setInterval(() => { if (S.me) send({ t: 'ping', c: performance.now() }); }, 2000);
setInterval(() => { const now = performance.now(); hudSlow(now); shopSlow(); forgeSlow(); classSlow(); runSlow(now); }, 250);

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
  hudFrame(now);
  questFrame(now);
  shopFrame(now);
  updateFloats(dt);
  updateFx(dt);
  runFrame(now, dt);
  view.render();
}
requestAnimationFrame(frame);
