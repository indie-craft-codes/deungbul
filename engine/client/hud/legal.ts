// 약관·처리방침·동의와 내 데이터(내보내기·삭제)의 화면. 서버 쪽은 engine/server/net/web.ts, 내용 칸은 LEGAL·PRIVACY (engine/shared/defs/legal.ts).
// LEGAL을 적지 않은 게임: 링크도 고지도 없다 (지금과 같다). 내 데이터 칸은 어느 게임에나 설정 창에 있다.
// LEGAL을 적은 게임: 접속 화면 아래와 설정 창에 두 문서의 링크. 들어온 뒤 서버에 '동의한 버전'을 묻고, LEGAL.version과 다르면(처음이거나 버전이 올랐다) 고지·동의 창을 띄운다.
//   동의하기 전에는 창이 화면을 덮고 단축키를 막는다. 문서가 주소면 플랫폼으로 열고(platform().openUrl), i18n 키면 그 문장을 창 안에 보인다.
import { LEGAL, isLegalUrl } from '../../shared/defs';
import { $ } from '../app';
import { onMsg } from '../bus';
import { L, applyDom, onLangChange, t } from '../i18n';
import { send } from '../net';
import { platform } from '../platform';
import { S } from '../state';
import { renderMenu } from './menu';
import { button, el, row } from './menu/parts';

/** 지금 이 저장 키가 동의한 버전 (서버가 알려 준 것. 모르면 undefined) */
let agreed: string | null | undefined;
/** 삭제 요청의 상태 (서버가 알려 준 것): 지우는 시각(ms, 서버 시계), 유예 일수 */
let erase: { due: number | null; days: number } | null = null;
/** 삭제 단추를 한 번 눌렀다 (한 번 더 누르면 요청) */
let armed = 0;
let exportWait = false;

/** 문서 하나를 연다: 주소면 플랫폼으로, 아니면 창 안에 그 문장을 */
function openDoc(which: 'terms' | 'privacy'): void {
  if (!LEGAL) return;
  const v = LEGAL[which];
  if (isLegalUrl(v) && platform().has('link.external')) { void platform().openUrl(v); return; }
  const box = $('legalDoc'), body = $('legalDocBody');
  $('legalDocTitle').textContent = t(which === 'terms' ? 'legalTerms' : 'legalPrivacy');
  body.textContent = isLegalUrl(v) ? v : (L().ui as Readonly<Record<string, string>>)[v] ?? v;
  box.hidden = false;
  body.scrollTop = 0;
}
/** 두 문서의 링크 */
function links(): HTMLElement {
  const p = el('legalLinks');
  for (const which of ['terms', 'privacy'] as const) {
    const a = document.createElement('a');
    a.href = LEGAL && isLegalUrl(LEGAL[which]) ? LEGAL[which] : '#';
    a.textContent = t(which === 'terms' ? 'legalTerms' : 'legalPrivacy');
    a.addEventListener('click', (e) => { e.preventDefault(); openDoc(which); });
    p.append(a);
  }
  return p;
}

/** 동의 창을 보이거나 숨긴다 */
function ask(show: boolean): void {
  const box = $('legal');
  box.hidden = !show;
  if (!show || !LEGAL) return;
  $('legalText').textContent = agreed ? L().fmt.legalChanged(LEGAL.version) : t('legalAsk');
  const at = $('legalLinksAt');
  at.textContent = '';
  at.append(links());
  $('legalNeed').hidden = true;
}

// ---------- 설정 창의 칸 (hud/settings.ts가 그린다) ----------
/** 약관 칸: LEGAL을 적은 게임만 */
export function legalRows(list: HTMLElement): void {
  if (!LEGAL) return;
  list.append(el('baghead', t('legalHead')), links());
  if (agreed) list.append(el('note', L().fmt.legalAgreed(agreed)));
}
/** 내 데이터 칸: 내려받기, 삭제 요청·거두기 */
export function myDataRows(list: HTMLElement): void {
  list.append(el('baghead', t('myDataHead')), el('note', L().fmt.myDataInfo(erase?.days ?? 7)));
  const ex = button(t('myDataExport'), () => { exportWait = true; send({ t: 'mydata', a: 'export' }); renderMenu(); setTimeout(() => { exportWait = false; renderMenu(); }, 3000); }, exportWait);
  list.append(row(t('myDataExportHead'), '', [ex]));
  if (erase?.due) {
    const days = Math.max(0, Math.ceil((erase.due - Date.now()) / 86_400_000));
    list.append(row(t('myDataErasing'), L().fmt.myDataDue(days), [button(t('myDataCancel'), () => send({ t: 'mydata', a: 'cancel' }))]));
  } else {
    const sure = armed > performance.now();
    const b = button(t(sure ? 'myDataEraseSure' : 'myDataErase'), () => {
      if (armed > performance.now()) { armed = 0; send({ t: 'mydata', a: 'erase' }); }
      else { armed = performance.now() + 5000; setTimeout(() => renderMenu(), 5100); }
      renderMenu();
    });
    if (sure) b.classList.add('bad');
    list.append(row(t('myDataEraseHead'), '', [b]));
  }
}
/** 설정 창을 다시 그릴지 가르는 값 */
export const myDataSig = (): unknown => [agreed, erase, armed > performance.now(), exportWait];

export function initLegal(): void {
  // 창들: 동의 창과 문서 보기 (body의 맨 뒤에: 다른 창 위에 그려진다)
  document.body.insertAdjacentHTML('beforeend', `
  <div id="legal" class="modal" hidden><div class="card">
    <h2 data-i18n="legalHead"></h2><p id="legalText"></p><div id="legalLinksAt"></div>
    <p class="note bad" id="legalNeed" data-i18n="legalNeed" hidden></p>
    <div class="btns"><button type="button" id="legalAgree" data-i18n="legalAgree"></button><button type="button" class="plain" id="legalNo" data-i18n="legalNo"></button></div>
  </div></div>
  <div id="legalDoc" class="modal" hidden><div class="card">
    <h2 id="legalDocTitle"></h2><div id="legalDocBody"></div>
    <button type="button" class="plain" id="legalDocClose" data-i18n="close"></button>
  </div></div>`);
  applyDom();
  $('legalDocClose').addEventListener('click', () => { $('legalDoc').hidden = true; });
  // 내 데이터
  onMsg('mydata', (m) => {
    if (m.a === 'state') { erase = { due: m.due, days: m.days }; renderMenu(); return; }
    const day = new Date().toISOString().slice(0, 10);
    void platform().saveFile(`mydata-${day}.json`, JSON.stringify(m.data, null, 2), 'application/json');
  });
  onMsg('welcome', () => { erase = null; agreed = undefined; send({ t: 'mydata', a: 'status' }); if (LEGAL) send({ t: 'consent', a: 'ask' }); });
  if (!LEGAL) return;
  // 접속 화면 아래의 링크
  const gate = $('joinForm');
  const put = () => { gate.querySelector('.legalLinks')?.remove(); gate.append(links()); };
  put();
  onLangChange(() => { put(); if (!$('legal').hidden) ask(true); });
  $('legalAgree').addEventListener('click', () => { send({ t: 'consent', a: 'agree', v: LEGAL!.version }); platform().storage.set('legal', LEGAL!.version); });
  $('legalNo').addEventListener('click', () => { $('legalNeed').hidden = false; });
  onMsg('consent', (m) => {
    // 손님(저장 키 없음)은 서버가 적지 않는다: 이 기기에 적어 둔 버전을 본다
    const local = platform().storage.get('legal');
    agreed = m.v ?? local;
    // 이 기기에서 동의했는데 서버에는 없다(손님이던 때, 기록이 생기기 전): 다시 알려 저장 키에 적게 한다
    if (!m.v && local === LEGAL!.version) send({ t: 'consent', a: 'agree', v: local });
    ask(agreed !== LEGAL!.version && !!S.me);
    renderMenu();
  });
  // 동의 창이 떠 있는 동안에는 단축키·이동 키가 게임에 가지 않는다 (창 안의 단추는 그대로 눌린다)
  window.addEventListener('keydown', (e) => { if (!$('legal').hidden) e.stopImmediatePropagation(); }, { capture: true });
}
