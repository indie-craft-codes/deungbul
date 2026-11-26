// 던전 창: 문 가까이에서는 들어가는 조건과 입장 단추를, 안에서는 남은 시간과 적의 수, 나가기 단추를 보여 준다.
import { DUNGEON_IDS, PORTAL_REACH, dungeonDef, hasDungeonKeys, runKey, type DungeonId, type KeysMe } from '../../shared/defs';
import { $ } from '../app';
import { onFrame, onMsg, onSlow } from '../bus';
import { AREAS, areaAt } from '../../shared/world';
import { L, forInput, onLangChange, t } from '../i18n';
import { dungeonLabel } from '../i18n/names';
import { send } from '../net';
import { S } from '../state';
import { keyView } from './collectcalc';
import { addNotices, banner } from './notify';
import { makeTag, placeTag, setTagName, type Tag } from './tags';

const ui = { panel: $('dungeon'), name: $('dgName'), runs: $('dgRuns'), info: $('dgInfo'), mates: $('dgMates'), btn: $<HTMLButtonElement>('dgBtn') };
/** 문 가까이에 있을 때 그 던전 */
let near: DungeonId | null = null;
/** 나가기를 한 번 눌렀다: 이 시각 전에 한 번 더 누르면 나간다 */
let armedUntil = 0;
/** 문 위에 띄우는 이름표 */
const gates: { id: DungeonId; tag: Tag }[] = [];
/** 열쇠를 쓰는 던전이 있는 게임: 서버가 보낸 내 열쇠 (개인 상태 'keys')와 열쇠 줄 (하루 횟수만 쓰는 게임에는 없다) */
let keys: KeysMe | null = null;
let keyRow: { box: HTMLElement; text: HTMLElement; buy: HTMLButtonElement } | null = null;

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function render(now: number): void {
  const me = S.me, loc = L(), d = S.dungeon;
  if (!me) { ui.panel.hidden = true; return; }
  if (d.id) {
    // 안에 있다: 서버가 알려 준 시각부터 직접 센다
    // 시계와 문장이 같은 수를 보이게 초를 한 번만 올림해서 둘 다에 쓴다 (예전에는 시계는 내림, 문장은 올림이라 1초 어긋났다)
    const left = Math.ceil(Math.max(0, d.left - (now - d.at) / 1000));
    ui.panel.hidden = false;
    ui.mates.hidden = true;
    if (keyRow) keyRow.box.hidden = true;
    ui.name.textContent = dungeonLabel(loc, d.id).name;
    ui.runs.textContent = clock(left);
    ui.info.textContent = d.cleared ? loc.fmt.dungeonExit(left) : loc.fmt.dungeonFoes(d.foes);
    ui.btn.textContent = now < armedUntil ? t('dungeonLeaveConfirm') : t('dungeonLeave');
    ui.btn.disabled = false;
    return;
  }
  near = DUNGEON_IDS.find((id) => Math.hypot(me.x - dungeonDef(id).portal.x, me.z - dungeonDef(id).portal.z) <= PORTAL_REACH) ?? null;
  ui.panel.hidden = !near;
  if (!near) return;
  const def = dungeonDef(near);
  if (def.key) { renderKeys(near); return; }
  if (keyRow) keyRow.box.hidden = true;
  const used = S.meta.daily.prog[runKey(near)] ?? 0;
  ui.name.textContent = dungeonLabel(loc, near).name;
  ui.runs.textContent = loc.fmt.dungeonRuns(def.perDay - used, def.perDay);
  const low = me.lv < def.minLv, none = used >= def.perDay;
  ui.info.textContent = low ? loc.fmt.dungeonNeedLv(def.minLv) : none ? loc.ui.dungeonNoRuns : loc.fmt.dungeonInfo(Math.round(def.timeS / 60), dungeonLabel(loc, near).info);
  // 파티원이 이미 안에 있으면 알려 준다: 파티 목록의 자리가 이 던전의 지역 안이면 안에 있는 것이다
  const inside = S.party.filter((m) => m.id !== me.id && AREAS[areaAt(m.x, m.z)]?.id === near).map((m) => m.name);
  ui.mates.hidden = !inside.length;
  if (inside.length) ui.mates.textContent = loc.fmt.dungeonMateIn(inside.join(', '));
  ui.btn.textContent = loc.ui.dungeonEnter;
  ui.btn.disabled = low || none;
}

/** 열쇠를 쓰는 던전의 문 앞: 가진 열쇠와 상한, 채워지는 규칙, 사기 단추 */
function renderKeys(id: DungeonId): void {
  const me = S.me!, loc = L(), def = dungeonDef(id), k = keyView(def, id, keys)!;
  ui.name.textContent = dungeonLabel(loc, id).name;
  ui.runs.textContent = loc.fmt.dungeonKeys(k.n, k.cap);
  const low = me.lv < def.minLv, none = k.n <= 0;
  ui.info.textContent = low ? loc.fmt.dungeonNeedLv(def.minLv) : `${loc.fmt.dungeonKeyInfo(k.refill, k.cap)} ${loc.fmt.dungeonInfo(Math.round(def.timeS / 60), dungeonLabel(loc, id).info)}`;
  ui.mates.hidden = true;
  ui.btn.textContent = loc.ui.dungeonEnter;
  ui.btn.disabled = low || none;
  if (keyRow) {
    keyRow.box.hidden = !k.buy;
    if (k.buy) {
      keyRow.text.textContent = loc.fmt.dungeonKeyPrice(k.buy.cost, k.buy.cur, k.buy.left);
      keyRow.buy.textContent = t('dungeonKeyBuy');
      keyRow.buy.disabled = k.buy.left <= 0 || (k.buy.cur === 'gold' ? me.gold : me.sparks) < k.buy.cost;
    }
  }
}

export function initDungeon(): void {
  if (hasDungeonKeys()) {
    // 열쇠 줄: 입장 단추 위에 (하루 횟수만 쓰는 게임의 창에는 붙지 않는다)
    const box = document.createElement('div'), text = document.createElement('span'), buy = document.createElement('button');
    box.id = 'dgKeys'; box.hidden = true; buy.type = 'button'; buy.className = 'plain';
    box.append(text, buy);
    ui.btn.before(box);
    keyRow = { box, text, buy };
    buy.addEventListener('click', () => { if (near) send({ t: 'dungeonKey', id: near }); buy.blur(); });
    onMsg('me', (m) => { if (m.k === 'keys') { keys = m.s as KeysMe; render(performance.now()); } });
    addNotices({ feed: ['dungeonNoKeys', 'dungeonKeyBought', 'dungeonKeyLimit'] });
  }
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
  // 파티원이 던전에 들어갔다는 소식은 놓치면 따로 떨어지므로 가운데에도 띄운다 (대화창에는 notifySys가 남긴다)
  onMsg('sys', (m) => { if (m.k === 'dungeonMate') banner(forInput(L().msg.dungeonMate(m.a ?? [])), '', '', () => !!S.dungeon.id); }); // 그사이 나도 들어갔으면 띄우지 않는다
  // 문 위의 이름표: 나무 사이에서도 문을 알아볼 수 있게
  for (const id of DUNGEON_IDS) gates.push({ id, tag: makeTag(dungeonLabel(L(), id).name, 'npc', false) });
  onFrame((now) => { for (const g of gates) placeTag(g.tag, dungeonDef(g.id).portal.x, 5.4, dungeonDef(g.id).portal.z, now); });
  onLangChange(() => { for (const g of gates) setTagName(g.tag, dungeonLabel(L(), g.id).name); render(performance.now()); });
}
