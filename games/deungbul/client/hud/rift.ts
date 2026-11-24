// 안개 균열의 화면: 문 앞 창(조건, 남은 횟수, 내 기록), 판 안의 표시(남은 시간, 물결, 처치 수, 고른 강화),
// 강화 고르기(큰 단추 셋), 결과 창, 화면 밖에서 오는 떼의 방향 화살표. 서버의 games/deungbul/server/systems/rift.ts와 짝이다.
// 판 안에서는 떼가 화면을 채우므로 몬스터의 이름표를 줄이고(다친 것의 체력 막대만), 강화가 바꾼 이동 속도와 범위를 화면의 예측과 이펙트에 맞춘다.
import { PORTAL_REACH, RIFT, RIFT_ECON, RIFT_UPS, RIFT_UP_IDS, isMonsterId, isRiftUp, monsterDef, riftUp, riftUpNums, runKey, type RiftUpId } from '../../shared/defs';
import type { MeState } from '../../shared/deungbul';
import { AREAS, areaAt } from '../../shared/world';
import { $, view } from '@engine/client/app';
import { onFrame, onKey, onMsg, onSlow } from '@engine/client/bus';
import { burst } from '@engine/client/fx';
import { MARK, addMarks } from '@engine/client/hud/minimap';
import { makeTag, placeTag, setTagName, type Tag } from '@engine/client/hud/tags';
import { L, clock, onLangChange, t } from '@engine/client/i18n';
import { send } from '@engine/client/net';
import { rules } from '@engine/client/rules';
import { sfx } from '@engine/client/sound';
import { S } from '@engine/client/state';
import type { ServerMsg } from '@engine/shared/protocol';
import { G } from '../state';

type EndMsg = Extract<ServerMsg, { t: 'riftEnd' }>;

/** 판의 상태 (서버의 rift 메시지). at은 받은 시각: 남은 시간을 직접 센다 */
const R = {
  on: false, left: 0, at: 0, kills: 0, wave: 0, foes: 0, ups: {} as Record<string, number>, downs: 0, n: 0, over: false,
  /** 열려 있는 고르기: 고를 것들과 닫히는 시각 */
  pick: null as { opts: RiftUpId[]; until: number } | null,
  /** 보여 주고 있는 결과 */
  end: null as EndMsg | null,
};
/** 판 안에서 싸우는 중인가 (강화가 듣는 동안) */
const fighting = (): boolean => R.on && !R.over;
const lvOf = (id: RiftUpId): number => (fighting() ? R.ups[id] ?? 0 : 0);

let ui: Record<'gate' | 'rgRuns' | 'rgMates' | 'rgInfo' | 'rgBest' | 'hud' | 'rhClock' | 'rhWave' | 'rhText' | 'rhLives' | 'rhUps' | 'pick' | 'rpLeft' | 'rpBar' | 'rpList' | 'end' | 'reTitle' | 'reResult' | 'reBest' | 'reUps' | 'reReward' | 'reMail' | 'arrows', HTMLElement>;
let btn: Record<'rgBtn' | 'rhLeave' | 'reBtn', HTMLButtonElement>;
/** 나가기를 한 번 눌렀다: 이 시각 전에 한 번 더 누르면 나간다 */
let armedUntil = 0;
let gateTag: Tag;
/** 강화를 고르는 단축키 (PC) */
const PICK_KEYS = ['z', 'x', 'c'];

const upsText = (ups: Record<string, number>): string => {
  const loc = L();
  const list = RIFT_UP_IDS.filter((id) => (ups[id] ?? 0) > 0).map((id) => loc.fmt.riftUpLv(loc.riftUps[id].tag, ups[id]));
  return list.length ? list.join(' ') : loc.ui.riftNoUps;
};

// ---------- 문 앞 창 ----------
function renderGate(): void {
  const me = S.me, loc = L();
  const near = !!me && !R.on && Math.hypot(me.x - RIFT.portal.x, me.z - RIFT.portal.z) <= PORTAL_REACH;
  ui.gate.hidden = !near;
  if (!near || !me) return;
  // 횟수는 던전과 함께 쓴다: 일일 진행의 같은 칸을 읽는다
  const used = S.meta.daily.prog[runKey(RIFT_ECON.sharesRunsWith)] ?? 0, low = me.lv < RIFT.minLv, none = used >= RIFT.perDay;
  ui.rgRuns.textContent = loc.fmt.riftRuns(Math.max(0, RIFT.perDay - used), RIFT.perDay);
  ui.rgInfo.textContent = low ? loc.fmt.riftNeedLv(RIFT.minLv) : none ? loc.msg.riftNoRuns() : loc.ui.riftInfo;
  const b = G.rift;
  ui.rgBest.textContent = b.s > 0 || b.k > 0 ? loc.fmt.riftBest(clock(b.s), b.k, b.clears) + (b.dayS > 0 || b.dayK > 0 ? `\n${loc.fmt.riftToday(clock(b.dayS), b.dayK)}` : '') : loc.fmt.riftNoBest();
  // 파티원이 이미 안에 있으면 알려 준다: 파티 목록의 자리가 전장 안이면 안에 있는 것이다
  const inside = S.party.filter((m) => m.id !== me.id && AREAS[areaAt(m.x, m.z)]?.id === RIFT.area.id).map((m) => m.name);
  ui.rgMates.hidden = !inside.length;
  if (inside.length) ui.rgMates.textContent = loc.fmt.riftMateIn(inside.join(', '));
  btn.rgBtn.disabled = low || none;
}

// ---------- 판 안의 표시 ----------
function renderHud(now: number): void {
  const loc = L();
  ui.hud.hidden = !R.on;
  document.body.classList.toggle('rift-on', R.on);
  if (!R.on) return;
  const left = Math.ceil(Math.max(0, R.left - (now - R.at) / 1000));
  ui.rhClock.textContent = clock(left);
  ui.hud.classList.toggle('late', !R.over && left <= 60);
  ui.rhWave.textContent = loc.fmt.riftWave(R.wave, RIFT.waves.length);
  ui.rhText.textContent = loc.fmt.riftCount(R.kills, R.foes);
  ui.rhLives.textContent = R.over ? '' : loc.fmt.riftLives(Math.max(0, RIFT.revives - R.downs));
  ui.rhLives.classList.toggle('last', R.downs >= RIFT.revives);
  ui.rhUps.textContent = upsText(R.ups);
  btn.rhLeave.textContent = now < armedUntil ? t('riftLeaveConfirm') : t('riftLeave');
}

// ---------- 강화 고르기 ----------
function renderPick(): void {
  const loc = L(), p = R.pick;
  ui.pick.hidden = !p;
  ui.rpList.textContent = '';
  if (!p) return;
  p.opts.forEach((id, i) => {
    const lv = (R.ups[id] ?? 0) + 1, def = RIFT_UPS[id], names = loc.riftUps[id];
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'rpOpt';
    const key = document.createElement('span'); key.className = 'k'; key.textContent = PICK_KEYS[i]?.toUpperCase() ?? '';
    const name = document.createElement('b'); name.textContent = names.name;
    const step = document.createElement('i'); step.textContent = loc.fmt.riftPickLv(lv, def.max);
    const info = document.createElement('span'); info.className = 'd'; info.textContent = names.info(riftUpNums(id, lv));
    b.append(key, name, step, info);
    b.addEventListener('click', () => choose(i));
    ui.rpList.append(b);
  });
}
function choose(i: number): void {
  if (!R.pick || i < 0 || i >= R.pick.opts.length) return;
  send({ t: 'rift', a: 'pick', n: i });
  // 서버의 답을 기다리지 않고 닫는다: 누른 것이 바로 느껴져야 한다 (서버가 닫는 메시지를 다시 보낸다)
  R.pick = null;
  renderPick();
}

// ---------- 결과 창 ----------
function renderEnd(): void {
  const loc = L(), e = R.end;
  ui.end.hidden = !e;
  if (!e) return;
  ui.end.classList.toggle('done', e.done);
  ui.reTitle.textContent = (e.done ? loc.ui.riftDoneTitle : R.downs > RIFT.revives ? loc.ui.riftOverTitle : loc.ui.riftQuitTitle) + (e.newBest ? ` · ${loc.ui.riftNewBest}` : '');
  ui.reResult.textContent = loc.fmt.riftResult(clock(e.timeS), e.kills);
  ui.reBest.textContent = `${loc.fmt.riftToday(clock(e.best.dayS), e.best.dayK)}\n${loc.fmt.riftBest(clock(e.best.s), e.best.k, e.best.clears)}`;
  ui.reUps.textContent = upsText(e.ups);
  const r = e.reward, any = r.gold + r.exp + r.sparks + r.bonus > 0 || r.gear;
  ui.reReward.textContent = any ? loc.fmt.riftReward(r.gold, r.exp, r.sparks, r.gear, r.bonus) : loc.ui.riftNoReward;
  ui.reMail.hidden = !any;
  btn.reBtn.textContent = R.on ? t('riftLeave') : t('riftClose');
}

// ---------- 화면 밖에서 오는 떼의 방향 ----------
const ARROWS = 8;
const arrowEls: HTMLElement[] = [];
/** 화면 밖에 있는 적을 여덟 방향으로 나눠, 적이 있는 방향의 가장자리에 화살표를 띄운다. 가까운 떼일수록 진하다 */
function renderArrows(): void {
  const me = S.me, show = fighting() && !!me;
  ui.arrows.hidden = !show;
  if (!show || !me) return;
  const w = view.width, h = view.height;
  const near = new Array<number>(ARROWS).fill(Infinity);
  for (const r of S.others.values()) {
    if (r.kind !== 'm' || r.dying > 0 || r.gone) continue;
    const p = view.project(r.x, r.h * 0.5, r.z);
    if (p && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h) continue; // 화면 안에 보인다
    // 화면의 방향: 오른쪽은 (+x, −z), 아래쪽은 (+x, +z) (미니맵과 같은 방향)
    const dx = r.x - me.x, dz = r.z - me.z, a = Math.atan2(dx + dz, dx - dz);
    const k = ((Math.round(a / (Math.PI * 2 / ARROWS)) % ARROWS) + ARROWS) % ARROWS;
    near[k] = Math.min(near[k], Math.hypot(dx, dz));
  }
  // 화살표가 놓이는 테두리: 가장자리에서 조금 안쪽. 위쪽은 내 정보와 판의 표시를, 아래쪽은 단추를 비킨다
  const rx = w / 2 - 22, ry = h / 2 - 22;
  for (let k = 0; k < ARROWS; k++) {
    const el = arrowEls[k], d = near[k];
    el.hidden = d === Infinity;
    if (el.hidden) continue;
    const a = k * (Math.PI * 2 / ARROWS), c = Math.cos(a), s = Math.sin(a), m = Math.min(rx / Math.max(1e-6, Math.abs(c)), ry / Math.max(1e-6, Math.abs(s)));
    el.style.transform = `translate(${(w / 2 + c * m).toFixed(0)}px,${(h / 2 + s * m).toFixed(0)}px) rotate(${(a + Math.PI / 2).toFixed(3)}rad)`;
    el.style.opacity = String(Math.max(0.35, Math.min(1, 1.5 - d / 20)));
  }
}

function leaveClicked(): void {
  const now = performance.now();
  // 싸우는 중에 실수로 나가면 그날 횟수만 잃으므로 한 번 더 확인한다
  if (R.over || now < armedUntil) { armedUntil = 0; send({ t: 'rift', a: 'leave' }); }
  else { armedUntil = now + 4000; renderHud(now); }
}

export function initRift(): void {
  const el = <K extends string>(ids: Record<K, string>) => Object.fromEntries(Object.entries<string>(ids).map(([k, id]) => [k, $(id)])) as Record<K, HTMLElement>;
  ui = el({
    gate: 'riftGate', rgRuns: 'rgRuns', rgMates: 'rgMates', rgInfo: 'rgInfo', rgBest: 'rgBest', hud: 'riftHud', rhClock: 'rhClock', rhWave: 'rhWave', rhText: 'rhText', rhLives: 'rhLives', rhUps: 'rhUps',
    pick: 'riftPick', rpLeft: 'rpLeft', rpBar: 'rpBar', rpList: 'rpList', end: 'riftEnd', reTitle: 'reTitle', reResult: 'reResult', reBest: 'reBest', reUps: 'reUps', reReward: 'reReward', reMail: 'reMail', arrows: 'riftArrows',
  });
  btn = { rgBtn: $<HTMLButtonElement>('rgBtn'), rhLeave: $<HTMLButtonElement>('rhLeave'), reBtn: $<HTMLButtonElement>('reBtn') };
  for (let k = 0; k < ARROWS; k++) { const a = document.createElement('i'); a.hidden = true; ui.arrows.append(a); arrowEls.push(a); }

  btn.rgBtn.addEventListener('click', () => { send({ t: 'rift', a: 'enter' }); btn.rgBtn.blur(); });
  btn.rhLeave.addEventListener('click', () => { leaveClicked(); btn.rhLeave.blur(); });
  btn.reBtn.addEventListener('click', () => {
    if (R.on) send({ t: 'rift', a: 'leave' });
    R.end = null; renderEnd();
    btn.reBtn.blur();
  });
  PICK_KEYS.forEach((key, i) => onKey(key, () => choose(i)));

  // ---------- 서버가 알려 주는 것 ----------
  onMsg('rift', (m, now) => {
    const was = R.on;
    Object.assign(R, { on: m.on, left: m.left, at: now, kills: m.kills, wave: m.wave, foes: m.foes, ups: m.ups, downs: m.on ? m.downs : R.downs, n: m.n, over: m.over });
    if (!m.on) { R.pick = null; armedUntil = 0; renderPick(); }
    if (was !== m.on) { renderGate(); renderEnd(); }
    renderHud(now);
  });
  onMsg('riftPick', (m, now) => {
    const opts = m.opts.filter(isRiftUp);
    R.pick = opts.length ? { opts, until: now + m.s * 1000 } : null;
    if (R.pick) sfx.fanfare();
    renderPick();
  });
  onMsg('riftEnd', (m) => { R.end = m; R.over = true; if (m.done) sfx.fanfare(); renderEnd(); });
  // 누군가의 안개 고리: 그 사람 둘레로 고리가 퍼진다
  onMsg('riftFx', (m) => {
    const me = S.me, at = me && m.id === me.id ? me : S.others.get(m.id);
    if (at) burst(at.x, at.z, m.r, 0xbfe9ff, 0.5);
  });
  onMsg('me', (m) => { if (m.k === 'rift') { G.rift = m.s as MeState['rift']; renderGate(); } });
  // 다시 접속하면 판은 이미 끝나 있다 (끊기면 서버가 판을 끝내고 문 앞으로 내보낸다)
  onMsg('welcome', (_m, now) => { Object.assign(R, { on: false, over: false, ups: {}, pick: null, downs: 0 }); renderPick(); renderHud(now); });

  // ---------- 틀의 화면 코드가 묻는 규칙: 판 안에서만 달라진다 ----------
  // 이동 속도는 서버(g.rules.speed를 균열이 감싼 것)와 같은 식이어야 예측이 어긋나지 않는다
  const speed = rules.speed;
  rules.speed = () => speed() * riftUp.swift(lvOf('swift'));
  rules.area = () => riftUp.reach(lvOf('reach'));
  // 떼의 이름표: 우두머리와 다친 것의 체력 막대만 보인다 (이름은 스타일이 지운다: deungbul.css의 .rift-on)
  rules.showTag = (e) => !R.on || e.kind !== 'm' || e.hp < e.maxHp || (isMonsterId(e.type) && !!monsterDef(e.type).boss);

  // 문 위의 이름표와 미니맵의 표식
  gateTag = makeTag(L().ui.rift, 'npc', false);
  onFrame((now) => {
    placeTag(gateTag, RIFT.portal.x, 5.4, RIFT.portal.z, now);
    if (R.pick) {
      const left = Math.max(0, R.pick.until - now);
      ui.rpLeft.textContent = L().fmt.riftPickLeft(Math.ceil(left / 1000));
      ui.rpBar.style.transform = `scaleX(${Math.min(1, left / (RIFT.pickTimeoutS * 1000))})`;
    }
  });
  addMarks(() => [{ x: RIFT.portal.x, z: RIFT.portal.z, color: MARK.portal, shape: 'ring' }]);

  onSlow((now) => { renderGate(); renderHud(now); renderArrows(); });
  onLangChange(() => { setTagName(gateTag, L().ui.rift); const now = performance.now(); renderGate(); renderHud(now); renderPick(); renderEnd(); });
  renderHud(performance.now());
}
