// 등탑 창(내가 있는 구역의 등탑: 밝기, 바치기, 주민의 귀환, 오늘의 등탑지기)과 내 정보 창에 덧붙는 이 게임의 줄(불씨, 휴식 보너스, 등탑 밝기, 기여).
// 틀의 내 정보 창(hud/me.ts)은 이 줄들을 모른다: 여기서 bus에 스스로 등록해 그린다 (느린 주기, 공유 상태를 받았을 때, 언어가 바뀔 때).
import { CONTRIB_TIERS, GLOW_BRIGHT, GLOW_BRIGHT_REGEN, GLOW_BRIGHT_SPEED, GLOW_MAX, RESIDENTS, TOWER_REACH } from '../../shared/defs';
import { TOWERS } from '../../shared/world';
import { $, addPlace, onMsg, onSlow, openClasses, S, send } from '@engine/client';
import { L, onLangChange } from '@engine/client/i18n';
import { G, GS, myZone, stage, zoneGlow } from '../state';

/** 화면의 요소들. initTower에서 잡는다 (이 게임의 창이 화면에 붙은 뒤다) */
let ui: Record<'sparks' | 'contrib' | 'tower' | 'towerMini', HTMLElement>;
/** 지금 그려 둔 구역. 구역을 넘어가면 등탑 창을 다시 그린다 (넘어간 것을 알리는 일은 zone.ts) */
let shownZone = -1;
export const shown = (): number => shownZone;

/** 등탑에 불씨를 바친다. 가진 것보다 많이 고르면 가진 만큼만 바친다. */
export function offer(to: 'tower' | 'resident', n: number): void {
  const me = S.me;
  if (me && me.sparks > 0) send({ t: 'offer', to, n: Math.min(n, me.sparks) });
}

export function initTower(): void {
  ui = { sparks: $('sparks'), contrib: $('contrib'), tower: $('tower'), towerMini: $('towerMini') };
  // 등탑에 불씨 바치기
  for (const [to, key] of [['tower', 'T'], ['resident', 'R']] as const) {
    $(`offer${key}1`).addEventListener('click', () => offer(to, 1));
    $(`offer${key}5`).addEventListener('click', () => offer(to, 5));
    $(`offer${key}All`).addEventListener('click', () => offer(to, Infinity));
  }
  // 직업 바꾸기 단추는 등탑 창 안에 있다. 여는 창은 틀의 것이다 (hud/classes.ts)
  $('classBtn').addEventListener('click', openClasses);
  // 좁은 화면에서 가까운 창 하나만 남길 때 등탑 창도 그 후보다 (hud/near.ts)
  addPlace('tower', TOWERS);

  renderWorld();
  towerSlow();
  onMsg('world', () => { renderWorld(); towerSlow(); });
  onSlow(towerSlow);
  onLangChange(() => { renderWorld(); towerSlow(); });
}

/** 공유 상태(등탑, 주민)가 바뀌었거나 다른 구역으로 넘어갔을 때 다시 그린다. 등탑 창은 내가 있는 구역의 등탑을 보여 준다. */
export function renderWorld(): void {
  const loc = L(), { residents } = GS.world.tower, zone = myZone(), glow = zoneGlow(), st = stage();
  shownZone = zone;
  ui.towerMini.textContent = glow > 0 ? loc.fmt.towerMini(st, glow) : `${loc.towers[TOWERS[zone].id] ?? loc.ui.tower}: ${loc.ui.towerOff}`;
  $('towerTitle').textContent = loc.towers[TOWERS[zone].id] ?? loc.ui.tower;
  $('glowText').textContent = glow > 0 ? loc.fmt.glow(st, glow, GLOW_MAX) : `${loc.ui.towerOff} · 0 / ${GLOW_MAX}`;
  $('glowBar').style.transform = `scaleX(${glow / GLOW_MAX})`;
  $('stageNote').textContent = glow > 0 ? loc.fmt.stageNote(st, GLOW_BRIGHT, Math.round((GLOW_BRIGHT_SPEED - 1) * 100), GLOW_BRIGHT_REGEN) : loc.ui.towerDark;
  $('villageBox').hidden = zone !== 0; // 주민과 등탑지기의 일은 첫불 마을 등탑에만 있다
  const next = RESIDENTS.findIndex((def, i) => residents[i] < def.need);
  $('resBtns').hidden = next < 0;
  if (next < 0) {
    $('resName').textContent = loc.ui.residents;
    $('resText').textContent = loc.ui.allReturned;
    $('resBar').style.transform = 'scaleX(1)';
    $('resNote').textContent = RESIDENTS.map((r) => loc.residents[r.id].bonus).join(' · ');
  } else {
    const def = RESIDENTS[next], text = loc.residents[def.id];
    $('resName').textContent = loc.fmt.nextResident(text.name);
    $('resText').textContent = `${residents[next]} / ${def.need}`;
    $('resBar').style.transform = `scaleX(${residents[next] / def.need})`;
    $('resNote').textContent = loc.fmt.whenBack(text.bonus);
  }
  // 오늘의 등탑지기: 등탑지기 할멈이 돌아온 뒤에만 보인다
  const halmeom = RESIDENTS.findIndex((r) => r.id === 'halmeom');
  const open = residents[halmeom] >= RESIDENTS[halmeom].need;
  $('keepBox').hidden = !open;
  if (open) {
    const list = GS.world.keepers;
    $('keepList').textContent = list.length ? list.map((k) => loc.fmt.keeper(k.name, k.n)).join(' · ') : loc.ui.keepersEmpty;
  }
}

/** 1초에 몇 번이면 되는 것: 내 정보 창의 이 게임 줄(불씨, 기여, 휴식 보너스, 기여 단계)과, 등탑 창을 열지 말지. */
export function towerSlow(): void {
  const loc = L(), me = S.me;
  if (!me) return;
  ui.sparks.textContent = loc.fmt.sparks(me.sparks);
  ui.contrib.textContent = loc.fmt.contrib(G.contrib);
  $('rested').textContent = G.rested > 0 ? loc.fmt.rested(G.rested) : '';
  $('tierText').textContent = loc.fmt.tier(G.tier, CONTRIB_TIERS[G.tier]?.need ?? null);
  // 등탑 가까이에 있을 때만 바치기 창을 연다
  const tower = TOWERS[myZone()];
  const near = Math.hypot(me.x - tower.x, me.z - tower.z) <= TOWER_REACH;
  ui.tower.hidden = !near;
  if (near) {
    const none = me.sparks < 1;
    for (const id of ['offerT1', 'offerT5', 'offerTAll']) $<HTMLButtonElement>(id).disabled = none;
    for (const id of ['offerR1', 'offerR5', 'offerRAll']) $<HTMLButtonElement>(id).disabled = none;
  }
}
