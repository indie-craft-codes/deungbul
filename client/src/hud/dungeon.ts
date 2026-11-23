// 던전 창: 문 가까이에서는 들어가는 조건과 입장 단추를, 안에서는 남은 시간과 적의 수, 나가기 단추를 보여 준다.
import { DUNGEONS, DUNGEON_IDS, PORTAL_REACH, runKey, type DungeonId } from '../../../shared/defs';
import { $ } from '../app';
import { onFrame, onMsg, onSlow } from '../bus';
import { L, onLangChange } from '../i18n';
import { send } from '../net';
import { S } from '../state';
import { makeTag, placeTag, setTagName, type Tag } from './tags';

const ui = { panel: $('dungeon'), name: $('dgName'), runs: $('dgRuns'), info: $('dgInfo'), btn: $<HTMLButtonElement>('dgBtn') };
/** 문 가까이에 있을 때 그 던전 */
let near: DungeonId | null = null;
/** 나가기를 한 번 눌렀다: 이 시각 전에 한 번 더 누르면 나간다 */
let armedUntil = 0;
/** 문 위에 띄우는 이름표 */
const gates: { id: DungeonId; tag: Tag }[] = [];

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
    ui.btn.textContent = now < armedUntil ? loc.ui.dungeonLeaveConfirm : loc.ui.dungeonLeave;
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
    if (S.dungeon.id) {
      // 실수로 나가면 그날 횟수만 잃으므로 한 번 더 확인한다. 끝낸 뒤에는 바로 나간다
      const now = performance.now();
      if (S.dungeon.cleared || now < armedUntil) { armedUntil = 0; send({ t: 'dungeonLeave' }); }
      else { armedUntil = now + 4000; render(now); }
    }
    else if (near) send({ t: 'dungeon', id: near });
    ui.btn.blur();
  });
  onMsg('dungeon', (m, now) => { S.dungeon = { id: m.id, left: m.left, foes: m.foes, cleared: m.cleared, at: now }; render(now); });
  onSlow(render);
  // 문 위의 이름표: 나무 사이에서도 문을 알아볼 수 있게
  for (const id of DUNGEON_IDS) gates.push({ id, tag: makeTag(L().dungeons[id].name, 'npc', false) });
  onFrame((now) => { for (const g of gates) placeTag(g.tag, DUNGEONS[g.id].portal.x, 5.4, DUNGEONS[g.id].portal.z, now); });
  onLangChange(() => { for (const g of gates) setTagName(g.tag, L().dungeons[g.id].name); render(performance.now()); });
}
