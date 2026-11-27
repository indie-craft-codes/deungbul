// 손님 진행 보호: 진행이 이 기기의 저장(브라우저의 토큰)에만 묶여 있으면(auth().deviceBound()), 브라우저 데이터를 지우면 캐릭터를 잃는다는 것을
// 한 번 알리고 기기 옮기기 코드(메뉴의 '기기' 탭)를 권한다. 사파리는 7일 동안 오지 않은 사이트의 저장을 지울 수 있다.
// 언제: 틀의 기본은 이 기기에서 30분을 논 뒤 한 번 (화면이 보이고 접속해 있던 시간). 게임은 setGuestReminder로 시간을 바꾸거나 끄고(0),
// 자기가 고른 순간(레벨 n, 첫 구매, 귀한 것을 얻음)에 remindGuestSave()를 부른다. 한 번 보였으면 다시 뜨지 않는다 (그 기기에서).
import { $ } from '../app';
import { onSlow } from '../bus';
import { applyDom } from '../i18n';
import { auth, platform } from '../platform';
import { S } from '../state';
import { openMenu } from './menu';

const SHOWN_KEY = 'keepSafe', PLAY_KEY = 'playSec';
let afterMin = 30;
/** 이번에 아직 저장하지 않은 노는 시간(초) */
let pending = 0;

/** 언제 알릴지 정한다: afterMin분을 논 뒤 (0이면 저절로는 알리지 않는다: remindGuestSave만) */
export function setGuestReminder(opts: { afterMin: number }): void { afterMin = Math.max(0, opts.afterMin); }

/** 지금 알린다 (게임이 고른 순간). 진행이 기기에 묶여 있지 않거나(계정·앱 저장소) 이미 보였으면 아무것도 하지 않는다 */
export function remindGuestSave(): void {
  const p = platform();
  if (!S.me || !auth().deviceBound() || p.storage.get(SHOWN_KEY)) return;
  if (!p.storage.set(SHOWN_KEY, String(Date.now()))) return; // 저장소를 못 쓰면(시크릿) 매번 뜨지 않게 아예 보이지 않는다
  $('keepSafe').hidden = false;
}

export function initKeepSafe(): void {
  document.body.insertAdjacentHTML('beforeend', `<div class="panel" id="keepSafe" hidden><div data-i18n="keepSafe"></div>
    <div class="btns"><button type="button" id="keepOpen" data-i18n="keepOpen"></button><button type="button" class="plain" id="keepLater" data-i18n="keepLater"></button></div></div>`);
  applyDom();
  $('keepOpen').addEventListener('click', () => { $('keepSafe').hidden = true; openMenu('device'); });
  $('keepLater').addEventListener('click', () => { $('keepSafe').hidden = true; });
  // 노는 시간을 센다 (보이고 접속해 있고 준비된 동안). 1분마다 저장한다
  let last = performance.now();
  onSlow((now) => {
    const dt = (now - last) / 1000;
    last = now;
    if (!afterMin || !S.me?.ready || !platform().lifecycle.visible() || dt > 2) return;
    pending += dt;
    if (pending < 60) return;
    const st = platform().storage, total = Number(st.get(PLAY_KEY) ?? 0) + pending;
    pending = 0;
    st.set(PLAY_KEY, String(Math.round(total)));
    if (total >= afterMin * 60) remindGuestSave();
  });
}
