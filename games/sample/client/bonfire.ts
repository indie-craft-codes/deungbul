// 모닥불 창과 화면 쪽 규칙: 서버의 server/bonfire.ts와 짝이다. 틀의 파일은 이 파일을 모른다 (진입점 ./main.ts의 목록만 안다).
// 창의 마크업은 틀의 빈 자리에 붙이고(mountBonfire), 나머지는 init 안에서 틀의 접점에 스스로 등록한다.
import { SHOPS } from '../shared/content';
import { BONFIRE } from '../shared/content/bonfire';
import type { MeState } from '../shared/sample';
import { $ } from '@engine/client/app';
import { onKey, onMsg, onSlow } from '@engine/client/bus';
import { openClasses } from '@engine/client/hud/classes';
import { MARK, addMarks, type Mark } from '@engine/client/hud/minimap';
import { addPlace } from '@engine/client/hud/near';
import { addNotices } from '@engine/client/hud/notify';
import { mountPanel } from '@engine/client/hud/shell';
import { L, t } from '@engine/client/i18n';
import { send } from '@engine/client/net';
import { rules } from '@engine/client/rules';
import { S } from '@engine/client/state';
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

  ui.one.addEventListener('click', () => { feed(1); ui.one.blur(); });
  ui.all.addEventListener('click', () => { feed(logs()); ui.all.blur(); });
  $('classBtn').addEventListener('click', openClasses);
  onKey('f', () => feed(1));

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
