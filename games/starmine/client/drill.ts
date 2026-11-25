// 채굴기 창과 화면 쪽 규칙: 서버의 server/drill.ts와 짝이다. 틀의 파일은 이 파일을 모른다 (진입점 ./main.ts의 목록만 안다).
// 방치형이라 채굴기 창은 어디서나 늘 떠 있고, 캐릭터는 처음부터 자동 사냥을 한다.
import { CAMPS, SHOPS } from '../shared/content';
import { DRILL, ENGRAVE } from '../shared/content/drill';
import type { MeState } from '../shared/starmine';
import { $, addMapLabels, addMapPlaces, addMarks, addNotices, type Mark, MARK, mountPanel, onKey, onMsg, onSlow, rules, S, send, setMenuTabs } from '@engine/client';
import { L, t } from '@engine/client/i18n';
import './starmine.css';

/** 서버가 알려 준 채굴기 (개인 상태). 틀의 상태(S)에는 이 칸이 없다 */
export const G: { drill: MeState['drill'] } = { drill: { lv: 0, stash: 0, rate: 0, cap: 0, engrave: 0 } };

/** 이 게임의 창을 틀의 빈 자리에 붙인다. startClient보다 먼저 부른다 */
export function mountDrill(): void {
  mountPanel('rightTop', `
    <div class="panel" id="drill">
      <div class="row"><span class="ttitle" data-i18n="drill"></span><span class="num" id="drillLv"></span></div>
      <div class="note" id="drillRate"></div>
      <div class="bar stash"><i id="drillBar"></i></div>
      <div class="row"><span class="note" id="drillStash"></span></div>
      <div class="btns">
        <button type="button" id="drillTake" data-i18n="drillTake"></button>
        <button type="button" id="drillUp"></button>
      </div>
      <div class="note" id="engraveNote"></div>
      <button type="button" class="plain" id="engraveBtn"></button>
    </div>`);
}

/** 사냥터 가운데 가장 먼 곳(골렘이 사는 곳): 지도의 큰 이름 */
const deep = CAMPS.reduce((a, c) => (Math.hypot(c.x, c.z) > Math.hypot(a.x, a.z) ? c : a));

export function initDrill(): void {
  const ui = {
    lv: $('drillLv'), rate: $('drillRate'), bar: $('drillBar'), stash: $('drillStash'),
    take: $<HTMLButtonElement>('drillTake'), up: $<HTMLButtonElement>('drillUp'),
    note: $('engraveNote'), engrave: $<HTMLButtonElement>('engraveBtn'),
  };
  onMsg('me', (m) => { if (m.k === 'drill') G.drill = m.s as MeState['drill']; });
  // 방치형: 접속하면 자동 사냥을 켜고 시작한다 (직업을 고르면 바로 사냥한다)
  rules.autoAtStart = () => true;
  addNotices({ banner: { drillAway: 'good' }, feed: ['drillUp', 'drillPoor', 'drillMax', 'drillTook', 'drillEmpty', 'engraveUp', 'engravePoor', 'engraveMax'] });
  rules.home = () => ({ x: DRILL.x, z: DRILL.z + 4 });
  // 미니맵과 전체 지도: 광산 입구(채굴기)와 상인, 깊은 광맥의 이름. 사냥터와 상점은 틀이 스스로 찍는다
  addMarks(() => [{ x: DRILL.x, z: DRILL.z, color: G.drill.lv > 0 ? MARK.lit : MARK.dark, shape: 'square', edge: true }, ...SHOPS.map((s): Mark => ({ x: s.x, z: s.z, color: MARK.shop, shape: 'dot' }))]);
  addMapPlaces(() => [{ x: DRILL.x, z: DRILL.z + 3, name: t('mine'), kind: 'town', info: t('mineInfo') }]);
  addMapLabels(() => [{ x: deep.x, z: deep.z - 9, text: t('deepVein'), big: true }]);
  // 이 작은 게임에 맞지 않는 거래소와 길드 탭은 감춘다 (서버의 기능은 그대로다)
  setMenuTabs(['gear', 'build', 'daily', 'mail', 'rank']);

  const take = () => send({ t: 'drillTake' });
  ui.take.addEventListener('click', () => { take(); ui.take.blur(); });
  ui.up.addEventListener('click', () => { send({ t: 'drillUp' }); ui.up.blur(); });
  ui.engrave.addEventListener('click', () => { send({ t: 'engrave' }); ui.engrave.blur(); });
  onKey('g', take);

  onSlow(() => {
    const loc = L(), d = G.drill, me = S.me;
    ui.lv.textContent = loc.fmt.drillLv(d.lv);
    ui.rate.textContent = d.lv > 0 ? loc.fmt.drillRate(d.rate) : t('drillNone');
    ui.bar.style.transform = `scaleX(${d.cap > 0 ? d.stash / d.cap : 0})`;
    ui.stash.textContent = loc.fmt.drillStash(d.stash, d.cap);
    ui.stash.classList.toggle('full', d.cap > 0 && d.stash >= d.cap);
    ui.take.disabled = d.stash < 1;
    const maxed = d.lv >= DRILL.maxLv, cost = DRILL.cost(d.lv);
    ui.up.textContent = maxed ? t('drillMaxed') : d.lv === 0 ? loc.fmt.drillBuild(cost) : loc.fmt.drillUpBtn(cost, DRILL.rate(d.lv + 1));
    ui.up.disabled = maxed || !me || me.gold < cost;
    ui.note.textContent = loc.fmt.engraveNote(Math.round(d.engrave * ENGRAVE.per * 100));
    const eMax = d.engrave >= ENGRAVE.maxLv, eCost = ENGRAVE.cost(d.engrave);
    ui.engrave.textContent = eMax ? t('engraveMaxed') : loc.fmt.engraveBtn(d.engrave, eCost);
    ui.engrave.disabled = eMax || !me || me.sparks < eCost;
  });
}
