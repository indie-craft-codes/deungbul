// 우물 지키기 창과 화면 쪽 규칙: 서버의 server/waves.ts와 짝이다. 틀의 파일은 이 파일을 모른다 (진입점 ./main.ts의 목록만 안다).
import { SHOPS } from '../shared/content';
import { WAVE, WELL } from '../shared/content/waves';
import type { MeState, WavePhase } from '../shared/bastion';
import { $, addMapPlaces, addMarks, addMenuTab, addNotices, type Mark, MARK, mountPanel, onMsg, onSlow, openClasses, rules, S, send, setMenuTabs } from '@engine/client';
import { L, t } from '@engine/client/i18n';
import './bastion.css';

/** 이 게임의 화면 상태: 서버가 알려 준 물결과 우물(공유 상태), 내가 막아 낸 물결(개인 상태) */
export const G = { phase: 'idle' as WavePhase, wave: 1, left: 0, foes: 0, hp: WAVE.gateHp, maxHp: WAVE.gateHp, held: 0 };

/** 창을 틀의 빈 자리에 붙인다. startClient보다 먼저 부른다 */
export function mountWaves(): void {
  // 가운데 위: 다음 물결까지의 초읽기 (늘 보인다)
  mountPanel('topmid', `<div id="waveClock" class="waveclock"></div>`);
  // 오른쪽 위의 맨 위: 우물 창 (늘 보인다. 단추는 우물 곁에서만 누를 수 있다)
  mountPanel('rightTop', `
    <div class="panel" id="wellPanel">
      <div class="row"><span class="ttitle" data-i18n="well"></span><span class="num" id="wellHp"></span></div>
      <div class="bar wellhp"><i id="wellBar"></i></div>
      <div class="note" id="wellPhase"></div>
      <div class="note" id="wellNote"></div>
      <div class="btns">
        <button type="button" id="repairOne"></button>
        <button type="button" id="restoreBtn"></button>
      </div>
      <button type="button" class="plain" id="classBtn" data-i18n="changeClass"></button>
    </div>`);
}

const near = (): boolean => !!S.me && Math.hypot(S.me.x - WELL.x, S.me.z - WELL.z) <= WELL.reach;

export function initWaves(): void {
  const ui = { clock: $('waveClock'), hp: $('wellHp'), bar: $('wellBar'), phase: $('wellPhase'), note: $('wellNote'), repair: $<HTMLButtonElement>('repairOne'), restore: $<HTMLButtonElement>('restoreBtn'), cls: $<HTMLButtonElement>('classBtn') };
  onMsg('world', (m) => { Object.assign(G, m.s.defense); });
  onMsg('me', (m) => { if (m.k === 'held') G.held = m.s as MeState['held']; });
  addNotices({
    banner: { waveStart: 'bad', waveLost: 'bad', waveWon: 'good', gateRestored: 'good', waveSoon: 'bad' },
    feed: ['waveReward', 'repaired', 'repairFar', 'repairBusy', 'repairFull', 'repairPoor', 'gateBroken'],
  });
  rules.home = () => ({ x: WELL.x, z: WELL.z + 4 });
  // 미니맵: 우물(내구가 있으면 금빛, 무너졌으면 어둡게)과 상인
  addMarks(() => [{ x: WELL.x, z: WELL.z, color: G.phase === 'broken' ? MARK.dark : MARK.lit, shape: 'square', edge: true }, ...SHOPS.map((s): Mark => ({ x: s.x, z: s.z, color: MARK.shop, shape: 'dot' }))]);
  // 전체 지도의 장소: 우물
  addMapPlaces(() => [{ x: WELL.x, z: WELL.z, name: t('well'), kind: 'town', info: L().fmt.wellInfo(G.hp, G.maxHp, G.wave) }]);
  addMenuTab({
    id: 'defense', label: () => t('well'), sig: () => [G.wave, G.held, G.hp],
    draw: (list) => {
      const loc = L();
      for (const text of [loc.fmt.wellHp(G.hp, G.maxHp), loc.fmt.held(G.held), loc.fmt.nextWave(G.wave), t('wellHelp')]) {
        const row = document.createElement('div');
        row.className = 'note';
        row.textContent = text;
        list.append(row);
      }
    },
  }, 'gear');
  setMenuTabs(['gear', 'defense', 'build', 'mail', 'daily', 'rank']);

  ui.repair.addEventListener('click', () => { send({ t: 'repair', n: 1 }); ui.repair.blur(); });
  ui.restore.addEventListener('click', () => { send({ t: 'restore' }); ui.restore.blur(); });
  ui.cls.addEventListener('click', openClasses);

  onSlow(() => {
    const loc = L(), here = near(), gold = S.me?.gold ?? 0;
    const mmss = loc.fmt.mmss(G.left);
    ui.clock.textContent = G.phase === 'active' ? loc.fmt.clockActive(G.wave, G.foes, mmss)
      : G.phase === 'broken' ? loc.fmt.clockBroken(mmss) : loc.fmt.clockNext(G.wave, mmss);
    ui.clock.dataset.phase = G.phase;
    ui.hp.textContent = loc.fmt.wellHp(G.hp, G.maxHp);
    ui.bar.style.transform = `scaleX(${G.maxHp ? G.hp / G.maxHp : 0})`;
    ui.bar.parentElement!.dataset.low = String(G.hp < G.maxHp * 0.3);
    ui.phase.textContent = G.phase === 'active' ? loc.fmt.phaseActive(G.wave, G.foes) : G.phase === 'broken' ? t('phaseBroken') : loc.fmt.phaseIdle(G.wave);
    ui.note.textContent = here ? '' : t('wellFar');
    ui.note.hidden = here;
    ui.repair.textContent = loc.fmt.repairBtn(WAVE.repairGold, WAVE.repairHp);
    ui.restore.textContent = loc.fmt.restoreBtn(WAVE.restoreGold);
    ui.repair.hidden = G.phase === 'broken';
    ui.restore.hidden = G.phase !== 'broken';
    ui.repair.disabled = !here || G.phase === 'active' || G.hp >= G.maxHp || gold < WAVE.repairGold;
    ui.restore.disabled = !here || gold < WAVE.restoreGold;
    ui.cls.hidden = !here;
  });
}
