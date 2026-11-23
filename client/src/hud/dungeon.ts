// 던전 창: 문 가까이에서는 들어가는 조건과 입장 단추를, 안에서는 남은 시간과 적의 수, 나가기 단추를 보여 준다.
import { DUNGEONS, DUNGEON_IDS, PORTAL_REACH, runKey, type DungeonId } from '../../../shared/defs';
import { $ } from '../app';
import { onMsg, onSlow } from '../bus';
import { L, onLangChange } from '../i18n';
import { send } from '../net';
import { S } from '../state';

const ui = { panel: $('dungeon'), name: $('dgName'), runs: $('dgRuns'), info: $('dgInfo'), btn: $<HTMLButtonElement>('dgBtn') };
/** 문 가까이에 있을 때 그 던전 */
let near: DungeonId | null = null;

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function render(now: number): void {
  const me = S.me, loc = L(), d = S.dungeon;
  if (!me) { ui.panel.hidden = true; return; }
  if (d.id) {
    // 안에 있다: 서버가 알려 준 시각부터 직접 센다
    const left = Math.max(0, d.left - (now - d.at) / 1000);
    ui.panel.hidden = false;
    ui.name.textContent = loc.dungeons[d.id as DungeonId]?.name ?? d.id;
    ui.runs.textContent = clock(left);
    ui.info.textContent = d.cleared ? loc.fmt.dungeonExit(Math.ceil(left)) : loc.fmt.dungeonFoes(d.foes);
    ui.btn.textContent = loc.ui.dungeonLeave;
    ui.btn.disabled = false;
    return;
  }
  near = DUNGEON_IDS.find((id) => Math.hypot(me.x - DUNGEONS[id].portal.x, me.z - DUNGEONS[id].portal.z) <= PORTAL_REACH) ?? null;
  ui.panel.hidden = !near;
  if (!near) return;
  const def = DUNGEONS[near], used = S.meta.daily.prog[runKey(near)] ?? 0;
  ui.name.textContent = loc.dungeons[near].name;
  ui.runs.textContent = loc.fmt.dungeonRuns(def.perDay - used, def.perDay);
  const low = me.lv < def.minLv, none = used >= def.perDay;
  ui.info.textContent = low ? loc.fmt.dungeonNeedLv(def.minLv) : none ? loc.ui.dungeonNoRuns : loc.fmt.dungeonInfo(Math.round(def.timeS / 60), loc.dungeons[near].info);
  ui.btn.textContent = loc.ui.dungeonEnter;
  ui.btn.disabled = low || none;
}

export function initDungeon(): void {
  ui.btn.addEventListener('click', () => {
    if (S.dungeon.id) send({ t: 'dungeonLeave' });
    else if (near) send({ t: 'dungeon', id: near });
    ui.btn.blur();
  });
  onMsg('dungeon', (m, now) => { S.dungeon = { id: m.id, left: m.left, foes: m.foes, cleared: m.cleared, at: now }; render(now); });
  onSlow(render);
  onLangChange(() => render(performance.now()));
}
