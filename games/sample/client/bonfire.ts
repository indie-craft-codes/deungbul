// 모닥불 창과 화면 쪽 규칙: 서버의 server/bonfire.ts와 짝이다. 틀의 파일은 이 파일을 모른다 (진입점 ./main.ts의 목록만 안다).
// 창의 마크업은 틀의 빈 자리에 붙이고(mountBonfire), 나머지는 init 안에서 틀의 접점에 스스로 등록한다.
import { SHOPS } from '../shared/content';
import { BONFIRE } from '../shared/content/bonfire';
import type { MeState } from '../shared/sample';
import { $, addMapPlaces, addMarks, addMenuTab, MENU_GROUPS, setMenuGroups, setMenuTabs, addNotices, addPlace, type Mark, MARK, mountPanel, onKey, onMsg, onSlow, openClasses, rules, S, send } from '@engine/client';
import { L, t } from '@engine/client/i18n';
import './sample.css';

/** 이 게임의 화면 상태: 서버가 알려 준 온기(공유 상태)와 내가 넣은 장작(개인 상태). 틀의 상태(S)에는 이 칸이 없다 */
export const G = { heat: 0, fed: 0 };

/** 이 게임의 창을 틀의 빈 자리에 붙인다. startClient보다 먼저 부른다: 틀이 시작하면서 data-i18n 표시를 채운다 */
export function mountBonfire(): void {
  // 내 정보 창의 한 줄: 가진 장작
  mountPanel('meRows', `<div class="num" id="logsMini"></div>`);
  // 오른쪽 위에 쌓이는 창의 맨 위: 모닥불 창. 모닥불 가까이에서만 열린다
  mountPanel('rightTop', `
    <div class="panel" id="bonfire" hidden>
      <div class="row"><span class="ttitle" data-i18n="bonfire"></span><span class="num" id="heatText"></span></div>
      <div class="bar heat"><i id="heatBar"></i></div>
      <div class="note" id="heatNote"></div>
      <div class="note" id="logsText"></div>
      <div class="btns">
        <button type="button" id="feedOne" data-i18n="feedOne"></button>
        <button type="button" id="feedAll" data-i18n="feedAll"></button>
      </div>
      <button type="button" class="plain" id="classBtn" data-i18n="changeClass"></button>
    </div>`);
}

const near = (): boolean => !!S.me && Math.hypot(S.me.x - BONFIRE.x, S.me.z - BONFIRE.z) <= BONFIRE.reach;
/** 가진 장작: 틀의 아이템(log)이라 틀의 상태(S.me.items)에 들어 있다 */
const logs = (): number => S.me?.items.log ?? 0;

function feed(n: number): void { if (S.me) send({ t: 'feed', n }); }

export function initBonfire(): void {
  // 요소는 init 안에서 잡는다 (모듈이 읽히는 때에는 아직 창이 붙지 않았다)
  const ui = { panel: $('bonfire'), heat: $('heatText'), bar: $('heatBar'), note: $('heatNote'), logs: $('logsText'), mini: $('logsMini'), one: $<HTMLButtonElement>('feedOne'), all: $<HTMLButtonElement>('feedAll') };
  // 서버가 알려 주는 것: 공유 상태(world)의 내 칸, 개인 상태(me)의 내 칸
  onMsg('world', (m) => { G.heat = m.s.bonfire.heat; });
  onMsg('me', (m) => { if (m.k === 'fed') G.fed = m.s as MeState['fed']; });
  // 이 게임의 안내문을 어디에 띄울지: 가운데 알림과 흘러가는 알림 (적지 않으면 대화창에만 남는다)
  addNotices({ banner: { bonfireLit: 'good' }, feed: ['fed', 'noLogs', 'bonfireFar'] });
  // 화면 쪽 규칙: '처음 자리로'(H 키)가 모닥불 앞으로 간다
  rules.home = () => ({ x: BONFIRE.x, z: BONFIRE.z + 4 });
  // 좁은 화면에서는 가까운 창 하나만 남긴다: 이 창이 어디에서 열리는지 알린다
  addPlace('bonfire', [BONFIRE]);
  // 미니맵의 표식: 모닥불(불이 있으면 금빛)과 상인
  addMarks(() => [{ x: BONFIRE.x, z: BONFIRE.z, color: G.heat > 0 ? MARK.lit : MARK.dark, shape: 'square', edge: true }, ...SHOPS.map((s): Mark => ({ x: s.x, z: s.z, color: MARK.shop, shape: 'dot' }))]);
  // 전체 지도(N)의 장소: 모닥불. 상인과 사냥터는 틀이 내용에서 스스로 찍는다
  addMapPlaces(() => [{ x: BONFIRE.x, z: BONFIRE.z, name: t('bonfire'), kind: 'town', info: G.heat > 0 ? t('bonfireWarm') : t('bonfireCold') }]);

  ui.one.addEventListener('click', () => { feed(1); ui.one.blur(); });
  // 메뉴: 모닥불 탭을 장비 탭 뒤에 더하고 탭의 차례를 고른다. 거래소와 길드는 모듈을 고르지 않아(shared/content의 MODULES) 탭도 서버의 기능도 없다
  addMenuTab({
    id: 'camp', label: () => t('bonfire'), sig: () => [G.heat, G.fed, logs()],
    draw: (list) => {
      const loc = L();
      for (const text of [loc.fmt.heat(G.heat, BONFIRE.heatMax), t(G.heat > 0 ? 'bonfireWarm' : 'bonfireCold'), loc.fmt.logs(logs(), G.fed)]) {
        const row = document.createElement('div');
        row.className = 'note';
        row.textContent = text;
        list.append(row);
      }
    },
  }, 'gear');
  setMenuTabs(['gear', 'camp', 'morph', 'build', 'mail', 'daily', 'boards', 'autoset', 'codex']);
  // 탭 묶음 (U3): 틀의 기본 묶음에 모닥불을 '활동'의 맨 앞으로
  setMenuGroups(MENU_GROUPS.map((g) => (g.id === 'play' ? { ...g, tabs: ['camp', ...g.tabs] } : g)));

  ui.all.addEventListener('click', () => { feed(logs()); ui.all.blur(); });
  $('classBtn').addEventListener('click', openClasses);
  onKey('f', () => feed(1), () => t('feedKey')); // 이름: 설정 창의 단축키 목록에 보인다

  // 느린 주기(0.25초)마다 글자와 단추를 맞춘다
  onSlow(() => {
    const loc = L(), have = logs();
    ui.mini.textContent = loc.fmt.logsMini(have);
    ui.panel.hidden = !near();
    if (ui.panel.hidden) return;
    ui.heat.textContent = loc.fmt.heat(G.heat, BONFIRE.heatMax);
    ui.bar.style.transform = `scaleX(${G.heat / BONFIRE.heatMax})`;
    ui.note.textContent = t(G.heat > 0 ? 'bonfireWarm' : 'bonfireCold');
    ui.logs.textContent = loc.fmt.logs(have, G.fed);
    ui.one.disabled = ui.all.disabled = have < 1;
  });
}
